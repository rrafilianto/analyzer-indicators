import type { Candle, Signal, PositionSide, ExitReason, MarketStructure } from "./types";
import type { TradingEngine } from "./trading-engine";
import { PaperTradingEngine } from "./paper-trading-engine";
import { canTrade } from "./risk-manager";
import {
  getOpenPosition,
  getAccount,
  closePosition,
  recordTrade,
  createPosition,
  updateAccount,
  getSupabase,
} from "../lib/supabase";
import { getLongStopLoss, getShortStopLoss } from "./market-structure";
import { formatError } from "../lib/error-format";
import { notifyPositionOpened, notifyPositionClosed } from "../lib/telegram";

// ==========================================
// Position Manager
//
// Handles position lifecycle:
// - Entry (new signal, no existing position)
// - Exit (TP hit, SL hit, reverse signal)
// - Reverse (close old → open new)
// - No stacking guard
// ==========================================

const RISK_REWARD_RATIO = 2;

interface PositionRecord {
  id: string;
  indicator_id: string;
  side: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  size: number;
  leverage: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

/**
 * Process a signal for a given indicator.
 *
 * Flow:
 * 1. Check if trading is allowed (risk check)
 * 2. If NEUTRAL → do nothing
 * 3. If no open position → open new
 * 4. If open position exists:
 *    a. Check if TP/SL hit
 *    b. If reverse signal → close old + open new
 *    c. If same direction → hold
 */
export async function processSignal(
  indicatorId: string,
  signal: Signal,
  candles: Candle[],
  marketStructure: MarketStructure,
  engine: TradingEngine = new PaperTradingEngine()
): Promise<void> {
  try {
    // Validate candles data
    if (!candles || candles.length === 0) {
      console.warn(`[PositionManager] No candles data for ${indicatorId}, skipping`);
      return;
    }

    // Risk check
    const riskCheck = await canTrade(indicatorId);
    if (!riskCheck.canTrade) {
      console.log(`[PositionManager] ${indicatorId} blocked by risk: ${riskCheck.reason}`);
      return;
    }

    if (signal === "NEUTRAL") {
      // Check existing position for TP/SL
      await checkOpenPosition(indicatorId, candles, engine, marketStructure);
      return;
    }

    const openPosition = await getOpenPosition(indicatorId);

    if (!openPosition) {
      // No position → try to open new
      await openNewPosition(indicatorId, signal, candles, marketStructure, engine);
    } else {
      // Has open position → check for reverse, TP, SL
      await handleOpenPosition(
        indicatorId,
        signal,
        openPosition,
        candles,
        marketStructure,
        engine
      );
    }
  } catch (error) {
    console.error(`[PositionManager] Error processing signal for ${indicatorId}:`, formatError(error, "position-manager"));
  }
}

/**
 * Check if an open position should be closed (TP/SL hit).
 */
async function checkOpenPosition(
  indicatorId: string,
  candles: Candle[],
  engine: TradingEngine,
  marketStructure: MarketStructure
): Promise<void> {
  const position = await getOpenPosition(indicatorId);
  if (!position) return;

  const currentPrice = candles[candles.length - 1]!.close;

  // Check TP hit
  if (
    (position.side === "long" && currentPrice >= position.take_profit) ||
    (position.side === "short" && currentPrice <= position.take_profit)
  ) {
    await closePositionWithTrade(position, currentPrice, "tp", engine);
    return;
  }

  // Check SL hit
  if (
    (position.side === "long" && currentPrice <= position.stop_loss) ||
    (position.side === "short" && currentPrice >= position.stop_loss)
  ) {
    await closePositionWithTrade(position, currentPrice, "sl", engine);
    return;
  }

  // Update SL if market structure improved (trailing SL)
  await updateTrailingStopLoss(position, marketStructure);
}

/**
 * Handle an open position when a new signal appears.
 */
async function handleOpenPosition(
  indicatorId: string,
  signal: Signal,
  position: PositionRecord,
  candles: Candle[],
  marketStructure: MarketStructure,
  engine: TradingEngine
): Promise<void> {
  const currentPrice = candles[candles.length - 1]!.close;
  const positionSide: PositionSide = position.side as PositionSide;
  const signalSide: PositionSide = signal === "LONG" ? "long" : "short";

  // Check TP/SL first
  if (
    (positionSide === "long" && currentPrice >= position.take_profit) ||
    (positionSide === "short" && currentPrice <= position.take_profit)
  ) {
    await closePositionWithTrade(position, currentPrice, "tp", engine);
    return;
  }

  if (
    (positionSide === "long" && currentPrice <= position.stop_loss) ||
    (positionSide === "short" && currentPrice >= position.stop_loss)
  ) {
    await closePositionWithTrade(position, currentPrice, "sl", engine);
    return;
  }

  // Reverse signal: close old + open new
  if (positionSide !== signalSide) {
    console.log(
      `[PositionManager] Reverse signal for ${indicatorId}: ${positionSide} → ${signalSide}`
    );
    await closePositionWithTrade(position, currentPrice, "reverse", engine);

    // Small delay to ensure position is closed
    await openNewPosition(indicatorId, signal, candles, marketStructure, engine);
  }

  // Same direction → hold (update trailing SL if applicable)
  await updateTrailingStopLoss(position, marketStructure);
}

/**
 * Open a new position based on signal.
 */
async function openNewPosition(
  indicatorId: string,
  signal: Signal,
  candles: Candle[],
  marketStructure: MarketStructure,
  engine: TradingEngine
): Promise<void> {
  const currentPrice = candles[candles.length - 1]!.close;

  // Validate currentPrice
  if (!currentPrice || !isFinite(currentPrice) || currentPrice <= 0) {
    console.error(`[PositionManager] Invalid currentPrice for ${indicatorId}: ${currentPrice}. Cannot open position.`);
    return;
  }

  const positionSide: PositionSide = signal === "LONG" ? "long" : "short";

  // Get SL from market structure
  let stopLoss: number | null = null;
  if (positionSide === "long") {
    stopLoss = getLongStopLoss(marketStructure);
  } else {
    stopLoss = getShortStopLoss(marketStructure);
  }

  // Fallback: if no market structure SL, use ATR-based SL
  if (!stopLoss) {
    const atrFallback = currentPrice * 0.005; // 0.5% fallback
    stopLoss = positionSide === "long"
      ? currentPrice - atrFallback
      : currentPrice + atrFallback;
    console.log(`[PositionManager] No market structure SL, using fallback: ${stopLoss}`);
  }

  // Calculate TP with RR 1:2
  const risk = Math.abs(currentPrice - stopLoss);
  const takeProfit = positionSide === "long"
    ? currentPrice + RISK_REWARD_RATIO * risk
    : currentPrice - RISK_REWARD_RATIO * risk;

  // Get config
  const { positionSize, leverage } = await getSystemConfigValues();

  await engine.openPosition({
    indicatorId,
    side: positionSide,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    size: positionSize,
    leverage,
  });

  // Send Telegram notification
  const indicatorName = await getIndicatorName(indicatorId);
  await notifyPositionOpened({
    indicatorName,
    side: positionSide,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    size: positionSize,
    leverage,
    openedAt: new Date(),
  }).catch((err) => console.error("[Telegram] notifyPositionOpened failed:", err));
}

/**
 * Close a position and record the trade.
 */
async function closePositionWithTrade(
  position: PositionRecord,
  exitPrice: number,
  exitReason: ExitReason,
  engine: TradingEngine
): Promise<void> {
  const positionSide: PositionSide = position.side as PositionSide;
  const exitedAt = new Date();

  // Calculate PnL
  const pnl = engine.calculatePnL(
    positionSide,
    position.entry_price,
    exitPrice,
    position.size,
    position.leverage
  );

  // Calculate R multiple
  const risk = Math.abs(position.entry_price - position.stop_loss);
  const rMultiple = risk > 0 ? pnl / (position.size * position.leverage * risk) : 0;

  // Calculate duration in minutes
  const duration = Math.floor(
    (exitedAt.getTime() - new Date(position.opened_at).getTime()) / (1000 * 60)
  );

  // Close position in DB
  await closePosition(position.id);

  // Record trade
  await recordTrade({
    position_id: position.id,
    pnl,
    r_multiple: Math.round(rMultiple * 10000) / 10000,
    duration,
    exit_reason: exitReason,
  });

  // Update balance
  await engine.updateBalance({
    indicatorId: position.indicator_id,
    pnl,
  });

  console.log(
    `[PositionManager] Closed ${position.id}: ${exitReason} | PnL: ${pnl.toFixed(2)} | R: ${rMultiple.toFixed(2)}`
  );

  // Send Telegram notification
  const indicatorName = await getIndicatorName(position.indicator_id);
  const account = await getAccount(position.indicator_id).catch(() => null);
  const newBalance = account?.balance ?? 0;

  await notifyPositionClosed({
    indicatorName,
    side: positionSide,
    entryPrice: position.entry_price,
    exitPrice,
    stopLoss: position.stop_loss,
    takeProfit: position.take_profit,
    size: position.size,
    leverage: position.leverage,
    pnl,
    rMultiple: Math.round(rMultiple * 10000) / 10000,
    duration,
    exitReason,
    exitedAt,
    newBalance,
  }).catch((err) => console.error("[Telegram] notifyPositionClosed failed:", err));
}

/**
 * Update trailing stop loss if market structure improved.
 * For longs: raise SL to new higher Higher Low
 * For shorts: lower SL to new lower Lower High
 */
async function updateTrailingStopLoss(
  position: PositionRecord,
  marketStructure: MarketStructure
): Promise<void> {
  const positionSide: PositionSide = position.side as PositionSide;
  let newSL: number | null = null;

  if (positionSide === "long") {
    const hl = getLongStopLoss(marketStructure);
    // Only move SL up (never down for longs)
    if (hl && hl > position.stop_loss) {
      newSL = hl;
    }
  } else {
    const lh = getShortStopLoss(marketStructure);
    // Only move SL down (never up for shorts)
    if (lh && lh < position.stop_loss) {
      newSL = lh;
    }
  }

  if (newSL) {
    const { getSupabase } = await import("../lib/supabase");
    await getSupabase()
      .from("positions")
      .update({ stop_loss: newSL })
      .eq("id", position.id);

    console.log(`[PositionManager] Trailing SL updated for ${position.id}: ${position.stop_loss} → ${newSL}`);
  }
}

/**
 * Get the indicator name by ID.
 */
async function getIndicatorName(indicatorId: string): Promise<string> {
  const { getSupabase } = await import("../lib/supabase");
  const { data } = await getSupabase()
    .from("indicators")
    .select("name")
    .eq("id", indicatorId)
    .single();
  return data?.name ?? indicatorId;
}

/**
 * Get system config values needed for position sizing.
 */
async function getSystemConfigValues(): Promise<{
  positionSize: number;
  leverage: number;
}> {
  const { getSupabase } = await import("../lib/supabase");

  const { data: positionSizeRow } = await getSupabase()
    .from("system_config")
    .select("value")
    .eq("key", "position_size")
    .single();

  const { data: leverageRow } = await getSupabase()
    .from("system_config")
    .select("value")
    .eq("key", "leverage")
    .single();

  return {
    positionSize: (positionSizeRow?.value as { value: number })?.value ?? 5,
    leverage: (leverageRow?.value as { value: number })?.value ?? 5,
  };
}
