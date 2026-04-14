import { getSupabase } from "../lib/supabase";
import { formatError } from "../lib/error-format";

// ==========================================
// Risk Manager
//
// Two-layer risk control:
// 1. Per-indicator: account halt check
// 2. Global: max daily loss + kill switch
// ==========================================

interface RiskStatus {
  canTrade: boolean;
  reason: string | null;
}

/**
 * Check if a specific indicator's account is allowed to trade.
 * Returns false if the account is halted.
 */
export async function checkIndicatorRisk(indicatorId: string): Promise<RiskStatus> {
  const { data: account, error } = await getSupabase()
    .from("accounts")
    .select("is_halted")
    .eq("indicator_id", indicatorId)
    .single();

  if (error) {
    return { canTrade: false, reason: `Failed to fetch account: ${error.message}` };
  }

  if (account.is_halted) {
    return { canTrade: false, reason: "Account is halted" };
  }

  return { canTrade: true, reason: null };
}

/**
 * Check global risk: kill switch + max daily loss.
 * Returns false if all trading must stop.
 */
export async function checkGlobalRisk(): Promise<RiskStatus> {
  // Check kill switch
  const { data: killSwitchConfig } = await getSupabase()
    .from("system_config")
    .select("value")
    .eq("key", "kill_switch")
    .single();

  if (killSwitchConfig && (killSwitchConfig.value as { enabled?: boolean }).enabled) {
    return { canTrade: false, reason: "Kill switch is active" };
  }

  // Check max daily loss
  const { data: maxDailyLossConfig } = await getSupabase()
    .from("system_config")
    .select("value")
    .eq("key", "max_daily_loss")
    .single();

  if (maxDailyLossConfig) {
    const maxLoss = (maxDailyLossConfig.value as { value: number }).value;

    // Check if ANY account has hit the daily loss limit
    const { data: accounts } = await getSupabase()
      .from("accounts")
      .select("indicator_id, daily_loss");

    if (accounts) {
      for (const account of accounts) {
        if (account.daily_loss >= maxLoss) {
          return {
            canTrade: false,
            reason: `Max daily loss reached (${account.daily_loss.toFixed(2)} >= ${maxLoss})`,
          };
        }
      }
    }
  }

  return { canTrade: true, reason: null };
}

/**
 * Check if trading is allowed (both indicator + global checks).
 */
export async function canTrade(indicatorId: string): Promise<RiskStatus> {
  const indicatorCheck = await checkIndicatorRisk(indicatorId);
  if (!indicatorCheck.canTrade) {
    return indicatorCheck;
  }

  const globalCheck = await checkGlobalRisk();
  if (!globalCheck.canTrade) {
    return { canTrade: false, reason: `Global: ${globalCheck.reason}` };
  }

  return { canTrade: true, reason: null };
}

/**
 * Reset daily loss counters for all accounts.
 * Before resetting, snapshots daily_loss_history for each indicator.
 * Also updates the reset tracker.
 */
export async function resetDailyLoss(): Promise<void> {
  const db = getSupabase();
  const todayUTC = new Date().toISOString().split("T")[0]!; // YYYY-MM-DD

  // Fetch all accounts for snapshot
  const { data: accounts, error: fetchError } = await db
    .from("accounts")
    .select("*");

  if (fetchError) {
    console.error("[RiskManager] Failed to fetch accounts for snapshot:", fetchError);
    throw fetchError;
  }

  // Snapshot each account before reset
  const snapshots = (accounts || []).map((acc) => ({
    indicator_id: acc.indicator_id,
    date: todayUTC,
    daily_loss: acc.daily_loss,
    daily_pnl: acc.equity - acc.balance, // Net change during the day
    balance_before: acc.balance,
    balance_after: acc.balance, // Balance doesn't change on reset
    equity_before: acc.equity,
    trade_count: 0, // Will be updated separately if needed
  }));

  if (snapshots.length > 0) {
    const { error: insertError } = await db
      .from("daily_loss_history")
      .upsert(snapshots, { onConflict: "indicator_id,date" });

    if (insertError) {
      console.error("[RiskManager] Failed to insert daily loss history:", insertError);
    }
  }

  // Now reset daily_loss to 0 (Supabase requires WHERE clause — use always-true condition)
  const { error: resetError } = await db
    .from("accounts")
    .update({ daily_loss: 0 })
    .gte("daily_loss", 0);

  if (resetError) {
    console.error("[RiskManager] Failed to reset daily loss:", resetError);
    throw resetError;
  }

  // Update tracker
  const { error: trackError } = await db
    .from("reset_tracker")
    .update({ last_reset_at: new Date().toISOString() })
    .eq("key", "daily_loss_reset");

  if (trackError) {
    console.error("[RiskManager] Failed to update reset tracker:", trackError);
  }

  console.log(`[RiskManager] Daily loss reset — ${snapshots.length} indicators snapshotted`);
}

/**
 * Check if daily loss should be auto-reset (UTC midnight crossed since last reset).
 * Returns true if reset was performed.
 */
export async function autoResetDailyLoss(): Promise<boolean> {
  const db = getSupabase();

  // Get last reset time
  const { data: tracker } = await db
    .from("reset_tracker")
    .select("last_reset_at")
    .eq("key", "daily_loss_reset")
    .single();

  if (!tracker) {
    // No tracker yet — do initial reset
    await resetDailyLoss();
    return true;
  }

  const lastReset = new Date(tracker.last_reset_at);
  const now = new Date();

  // Compare UTC dates
  const lastResetUTC = new Date(Date.UTC(
    lastReset.getUTCFullYear(),
    lastReset.getUTCMonth(),
    lastReset.getUTCDate()
  ));
  const todayUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  // If last reset was before today UTC, reset now
  if (lastResetUTC < todayUTC) {
    await resetDailyLoss();
    return true;
  }

  return false;
}

/**
 * Halt an indicator's account (e.g., after max daily loss hit for that indicator).
 */
export async function haltAccount(indicatorId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("accounts")
    .update({ is_halted: true })
    .eq("indicator_id", indicatorId);

  if (error) {
    console.error(`[RiskManager] Failed to halt account ${indicatorId}:`, error);
    throw new Error(formatError(error, "risk-manager"));
  }

  console.log(`[RiskManager] Account ${indicatorId} halted`);
}

/**
 * Toggle kill switch.
 */
export async function setKillSwitch(enabled: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from("system_config")
    .update({ value: { enabled } })
    .eq("key", "kill_switch");

  if (error) {
    console.error("[RiskManager] Failed to update kill switch:", error);
    throw new Error(formatError(error, "risk-manager"));
  }

  console.log(`[RiskManager] Kill switch ${enabled ? "enabled" : "disabled"}`);
}

/**
 * Get system configuration.
 */
export async function getSystemConfig(): Promise<{
  maxDailyLoss: number;
  killSwitch: boolean;
  defaultBalance: number;
  positionSize: number;
  leverage: number;
}> {
  const { data: rows } = await getSupabase()
    .from("system_config")
    .select("key, value");

  const configMap = new Map<string, any>();
  rows?.forEach((row) => configMap.set(row.key, row.value));

  return {
    maxDailyLoss: (configMap.get("max_daily_loss") as { value: number })?.value ?? 100,
    killSwitch: (configMap.get("kill_switch") as { enabled: boolean })?.enabled ?? false,
    defaultBalance: (configMap.get("default_balance") as { value: number })?.value ?? 1000,
    positionSize: (configMap.get("position_size") as { value: number })?.value ?? 5,
    leverage: (configMap.get("leverage") as { value: number })?.value ?? 5,
  };
}
