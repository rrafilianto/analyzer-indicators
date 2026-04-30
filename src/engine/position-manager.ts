import type { Candle, Signal, PositionSide, ExitReason, MarketStructure } from "./types";
import type { TradingEngine } from "./trading-engine";
import { PaperTradingEngine } from "./paper-trading-engine";
import { canTrade } from "./risk-manager";
import {
  getOpenPosition,
  closePosition,
  recordTrade,
  createPosition,
} from "../lib/supabase";
import { getLongStopLoss, getShortStopLoss } from "./market-structure";
import { formatError } from "../lib/error-format";
import type { Logger } from "../lib/logger";

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
  engine: TradingEngine = new PaperTradingEngine(),
  logger?: Logger,
  indicatorName?: string
): Promise<boolean> {
  try {
    // Validate candles data
    if (!candles || candles.length === 0) {
      console.warn(`[PositionManager] No candles data for ${indicatorId}, skipping`);
      return false;
    }

    // Risk check
    const riskCheck = await canTrade(indicatorId);
    if (!riskCheck.canTrade) {
      console.log(`[PositionManager] ${indicatorId} blocked by risk: ${riskCheck.reason}`);
      // ZOMBIE PREVENTION: We must still monitor existing open positions to enforce SL/TP triggers
      // before blocking normal execution.
      return await checkOpenPosition(indicatorId, candles, engine, marketStructure, logger, indicatorName);
    }

    if (signal === "NEUTRAL") {
      // Check existing position for TP/SL
      return await checkOpenPosition(indicatorId, candles, engine, marketStructure, logger, indicatorName);
    }

    const openPosition = await getOpenPosition(indicatorId);

    if (!openPosition) {
      // No position → try to open new
      await openNewPosition(indicatorId, signal, candles, marketStructure, engine, logger, indicatorName);
      return false;
    } else {
      // Has open position → check for reverse, TP, SL
      return await handleOpenPosition(
        indicatorId,
        signal,
        openPosition,
        candles,
        marketStructure,
        engine,
        logger,
        indicatorName
      );
    }
  } catch (error) {
    console.error(`[PositionManager] Error processing signal for ${indicatorId}:`, formatError(error, "position-manager"));
    return false;
  }
}

/**
 * Check if an open position should be closed (TP/SL hit).
 */
async function checkOpenPosition(
  indicatorId: string,
  candles: Candle[],
  engine: TradingEngine,
  marketStructure: MarketStructure,
  logger?: Logger,
  indicatorName?: string
): Promise<boolean> {
  const position = await getOpenPosition(indicatorId);
  if (!position) return false;

  const lastCandle = candles[candles.length - 1]!;
  const high = lastCandle.high;
  const low = lastCandle.low;
  const positionSide: PositionSide = position.side as PositionSide;
  const slippageBps = 0.0005;

  // Check SL first (pessimistic approach)
  const isSlHit = 
    (positionSide === "long" && low <= position.stop_loss) ||
    (positionSide === "short" && high >= position.stop_loss);

  if (isSlHit) {
    const slExecutionPrice = positionSide === "long"
      ? position.stop_loss * (1 - slippageBps)
      : position.stop_loss * (1 + slippageBps);
    await closePositionWithTrade(position, slExecutionPrice, "sl", engine, logger, indicatorName);
    return true;
  }

  // Check TP hit
  const isTpHit =
    (positionSide === "long" && high >= position.take_profit) ||
    (positionSide === "short" && low <= position.take_profit);

  if (isTpHit) {
    await closePositionWithTrade(position, position.take_profit, "tp", engine, logger, indicatorName);
    return true;
  }

  // Update SL if market structure improved (trailing SL)
  await updateTrailingStopLoss(position, marketStructure);
  return false;
}

async function handleOpenPosition(
  indicatorId: string,
  signal: Signal,
  position: PositionRecord,
  candles: Candle[],
  marketStructure: MarketStructure,
  engine: TradingEngine,
  logger?: Logger,
  indicatorName?: string
): Promise<boolean> {
  const lastCandle = candles[candles.length - 1]!;
  const currentPrice = lastCandle.close;
  const high = lastCandle.high;
  const low = lastCandle.low;
  const positionSide: PositionSide = position.side as PositionSide;
  const signalSide: PositionSide = signal === "LONG" ? "long" : "short";

  // Slippage settings (0.05%)
  const slippageBps = 0.0005;

  // 1. Check SL First (Pessimistic approach: if both TP & SL hit in same candle, assume SL hit first)
  const isSlHit = 
    (positionSide === "long" && low <= position.stop_loss) ||
    (positionSide === "short" && high >= position.stop_loss);

  if (isSlHit) {
    // Stop-Market Order: Executes at SL price with slippage
    const slExecutionPrice = positionSide === "long"
      ? position.stop_loss * (1 - slippageBps)
      : position.stop_loss * (1 + slippageBps);
      
    await closePositionWithTrade(position, slExecutionPrice, "sl", engine, logger, indicatorName);
    return true;
  }

  // 2. Check TP
  const isTpHit =
    (positionSide === "long" && high >= position.take_profit) ||
    (positionSide === "short" && low <= position.take_profit);

  if (isTpHit) {
    // Limit Order: Executes EXACTLY at TP price (no slippage)
    await closePositionWithTrade(position, position.take_profit, "tp", engine, logger, indicatorName);
    return true;
  }

  // 3. Reverse signal: close old + open new
  if (signal !== "NEUTRAL" && positionSide !== signalSide) {
    console.log(
      `[PositionManager] Reverse signal for ${indicatorId}: ${positionSide} → ${signalSide}`
    );
    // Market Order at candle close, with slippage
    const reverseExecutionPrice = positionSide === "long"
      ? currentPrice * (1 - slippageBps)
      : currentPrice * (1 + slippageBps);

    await closePositionWithTrade(position, reverseExecutionPrice, "reverse", engine, logger, indicatorName);

    // Small delay to ensure position is closed
    await openNewPosition(indicatorId, signal, candles, marketStructure, engine, logger, indicatorName);
    return true;
  }

  // Same direction → hold (update trailing SL if applicable)
  await updateTrailingStopLoss(position, marketStructure);
  return false;
}

/**
 * Open a new position based on signal.
 */
async function openNewPosition(
  indicatorId: string,
  signal: Signal,
  candles: Candle[],
  marketStructure: MarketStructure,
  engine: TradingEngine,
  logger?: Logger,
  indicatorName?: string
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

  // CRITICAL VALIDATION: SL must be on the correct side of entry price!
  // LONG: SL must be BELOW entry. SHORT: SL must be ABOVE entry.
  // Market structure can return nonsensical values during volatile conditions.
  if (stopLoss !== null) {
    if (positionSide === "long" && stopLoss >= currentPrice) {
      console.warn(`[PositionManager] Market structure SL ($${stopLoss}) is ABOVE entry ($${currentPrice}) for LONG — discarding`);
      stopLoss = null;
    } else if (positionSide === "short" && stopLoss <= currentPrice) {
      console.warn(`[PositionManager] Market structure SL ($${stopLoss}) is BELOW entry ($${currentPrice}) for SHORT — discarding`);
      stopLoss = null;
    }
  }

  // Fallback: if no valid SL, use percentage-based SL (0.5%)
  if (!stopLoss) {
    const atrFallback = currentPrice * 0.005; // 0.5% fallback
    stopLoss = positionSide === "long"
      ? currentPrice - atrFallback
      : currentPrice + atrFallback;
    console.log(`[PositionManager] Using fallback SL: ${stopLoss}`);
  }

  // Calculate TP with RR 1:2
  const risk = Math.abs(currentPrice - stopLoss);
  const takeProfit = positionSide === "long"
    ? currentPrice + RISK_REWARD_RATIO * risk
    : currentPrice - RISK_REWARD_RATIO * risk;

  // Get config
  const { positionSize, leverage } = await getSystemConfigValues();

  // Get account to check balance
  const { getAccount } = await import("../lib/supabase");
  const account = await getAccount(indicatorId);
  
  if (account.balance < positionSize) {
    console.warn(`[PositionManager] Insufficient balance for ${indicatorId}: $${account.balance.toFixed(2)} < $${positionSize}. Cannot open position.`);
    if (logger) {
      logger.warn(`Insufficient balance: $${account.balance.toFixed(2)} (requires $${positionSize})`, undefined, indicatorName);
    }
    return;
  }

  await engine.openPosition({
    indicatorId,
    side: positionSide,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    size: positionSize,
    leverage,
  });

  if (logger) {
    logger.info(
      `Opened ${positionSide.toUpperCase()} position @ $${currentPrice.toFixed(2)}`,
      { side: positionSide, entryPrice: currentPrice, stopLoss, takeProfit, persist: true },
      indicatorName
    );
  }
}

/**
 * Close a position and record the trade.
 */
async function closePositionWithTrade(
  position: PositionRecord,
  exitPrice: number,
  exitReason: ExitReason,
  engine: TradingEngine,
  logger?: Logger,
  indicatorName?: string
): Promise<void> {
  const positionSide: PositionSide = position.side as PositionSide;
  const exitedAt = new Date();

  const { getSupabase } = await import("../lib/supabase");
  const { data: feeRow } = await getSupabase()
    .from("system_config")
    .select("value")
    .eq("key", "trading_fee")
    .single();
  const tradingFee = (feeRow?.value as { value: number })?.value ?? 0.04;

  // Calculate PnL
  const pnl = engine.calculatePnL(
    positionSide,
    position.entry_price,
    exitPrice,
    position.size,
    position.leverage,
    tradingFee
  );

  // Calculate R multiple
  // Dollar risk = (price risk / entry) × notional
  const risk = Math.abs(position.entry_price - position.stop_loss);
  const dollarRisk = position.entry_price > 0
    ? (risk / position.entry_price) * position.size * position.leverage
    : 0;
  const rMultiple = dollarRisk > 0 ? pnl / dollarRisk : 0;

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

  if (logger) {
    logger.info(
      `Closed ${position.side.toUpperCase()} position via ${exitReason.toUpperCase()} (PnL: $${pnl.toFixed(2)})`,
      { exitReason, exitPrice, pnl, rMultiple, duration, persist: true },
      indicatorName
    );
  }
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
    // Only move SL up (never down for longs), but NEVER above entry price
    if (hl && hl > position.stop_loss && hl < position.entry_price) {
      newSL = hl;
    }
  } else {
    const lh = getShortStopLoss(marketStructure);
    // Only move SL down (never up for shorts), but NEVER below entry price
    if (lh && lh < position.stop_loss && lh > position.entry_price) {
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
