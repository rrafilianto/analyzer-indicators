import { NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabase";
import { formatError } from "../../../../lib/error-format";

// ==========================================
// Dashboard Overview API
//
// Returns all data needed for the overview page:
// - All indicators with accounts, metrics, open positions
// - Kill switch status
// - System config
// ==========================================

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabase();

    // Fetch all indicators with accounts and metrics
    const { data: indicators, error: indicatorsError } = await db
      .from("indicators")
      .select(`
        *,
        accounts!inner(balance, equity, daily_loss, is_halted),
        performance_metrics!inner(total_trades, winrate, profit_factor, max_drawdown, score)
      `)
      .order("name");

    if (indicatorsError) throw indicatorsError;

    // Fetch open positions for all indicators
    const { data: openPositions } = await db
      .from("positions")
      .select("*")
      .eq("status", "open");

    // Fetch all trades for equity history
    const { data: allTrades } = await db
      .from("multi_trades")
      .select(`
        pnl,
        exited_at,
        positions!inner(indicator_id)
      `)
      .order("exited_at", { ascending: true });

    // Fetch system config
    const { data: configRows } = await db
      .from("system_config")
      .select("key, value");

    // Build response
    const configMap = new Map<string, any>();
    configRows?.forEach((row) => configMap.set(row.key, row.value));

    const positionMap = new Map<string, any>();
    openPositions?.forEach((pos) => {
      positionMap.set(pos.indicator_id, pos);
    });

    // Build equity history per indicator
    const indicatorIdToName = new Map<string, string>();
    indicators?.forEach((ind: any) => indicatorIdToName.set(ind.id, ind.name));

    const tradesByIndicator = new Map<string, { pnl: number; exited_at: string }[]>();
    (allTrades || []).forEach((t: any) => {
      const indicatorId = t.positions?.indicator_id;
      if (!indicatorId) return;
      if (!tradesByIndicator.has(indicatorId)) {
        tradesByIndicator.set(indicatorId, []);
      }
      tradesByIndicator.get(indicatorId)!.push({
        pnl: t.pnl,
        exited_at: t.exited_at,
      });
    });

    function buildEquityHistory(
      trades: { pnl: number; exited_at: string }[],
      initialBalance: number
    ): { date: string; equity: number }[] {
      const history: { date: string; equity: number }[] = [];
      let running = initialBalance;

      // Starting point
      if (trades.length > 0) {
        history.push({ date: trades[0].exited_at, equity: initialBalance });
      }

      for (const trade of trades) {
        running += trade.pnl;
        history.push({ date: trade.exited_at, equity: Math.round(running * 100) / 100 });
      }

      return history;
    }

    const indicatorsList = (indicators || []).map((ind: any) => ({
      id: ind.id,
      name: ind.name,
      config: ind.config,
      isActive: ind.is_active,
      balance: ind.accounts?.balance ?? 0,
      equity: ind.accounts?.equity ?? 0,
      dailyLoss: ind.accounts?.daily_loss ?? 0,
      isHalted: ind.accounts?.is_halted ?? false,
      totalTrades: ind.performance_metrics?.total_trades ?? 0,
      winrate: ind.performance_metrics?.winrate ?? 0,
      profitFactor: ind.performance_metrics?.profit_factor ?? 0,
      maxDrawdown: ind.performance_metrics?.max_drawdown ?? 0,
      score: ind.performance_metrics?.score ?? 0,
      openPosition: positionMap.get(ind.id) ?? null,
      equityHistory: buildEquityHistory(
        tradesByIndicator.get(ind.id) ?? [],
        ind.accounts?.balance ?? 1000
      ),
    }));

    return NextResponse.json({
      indicators: indicatorsList,
      killSwitch: (configMap.get("kill_switch") as { enabled?: boolean })?.enabled ?? false,
      maxDailyLoss: (configMap.get("max_daily_loss") as { value?: number })?.value ?? 100,
      positionSize: (configMap.get("position_size") as { value?: number })?.value ?? 5,
      leverage: (configMap.get("leverage") as { value?: number })?.value ?? 5,
    });
  } catch (error) {
    console.error("[OverviewAPI] Error:", formatError(error, "overview"));
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
