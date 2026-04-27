import type {
  TradingEngine,
  OpenPositionParams,
  ClosePositionParams,
  UpdateBalanceParams,
} from "./trading-engine";
import type { PositionSide } from "./types";
import {
  createPosition,
  closePosition,
  recordTrade,
  updateAccount,
  getAccount,
} from "../lib/supabase";

/**
 * Paper Trading Engine
 *
 * Implements TradingEngine for paper trading simulation.
 * Tracks virtual balance/equity and records trades to Supabase.
 */
export class PaperTradingEngine implements TradingEngine {
  /**
   * Calculate realized PnL.
   *
   * `size` is a dollar amount (e.g. $5). At 5x leverage the notional is $25.
   * BTC quantity = notional / entryPrice.
   *
   * Long:  PnL = (Exit - Entry) / Entry × Size × Leverage
   * Short: PnL = (Entry - Exit) / Entry × Size × Leverage
   *
   * Example (Long, entry $75,602, exit $75,268, $5 × 5x):
   *   PnL = (75268 - 75602) / 75602 × 5 × 5 = -0.00443 × 25 ≈ -$0.11
   */
  calculatePnL(
    side: PositionSide,
    entryPrice: number,
    exitPrice: number,
    size: number,
    leverage: number,
    tradingFee: number
  ): number {
    if (!entryPrice || entryPrice <= 0) return 0;

    const priceDiff = side === "long"
      ? exitPrice - entryPrice
      : entryPrice - exitPrice;

    // Percentage return × notional value
    const grossPnl = (priceDiff / entryPrice) * size * leverage;
    
    // Trading fee is typically charged on the notional value of both entry and exit.
    // For simplicity, we apply (tradingFee / 100) * (entryNotional + exitNotional).
    const notionalEntry = size * leverage;
    const notionalExit = notionalEntry + grossPnl;
    const feeAmount = (notionalEntry + notionalExit) * (tradingFee / 100);

    return grossPnl - feeAmount;
  }

  async openPosition(params: OpenPositionParams): Promise<void> {
    await createPosition({
      indicator_id: params.indicatorId,
      side: params.side,
      entry_price: params.entryPrice,
      stop_loss: params.stopLoss,
      take_profit: params.takeProfit,
      size: params.size,
      leverage: params.leverage,
    });

    console.log(
      `[PaperTrading] Opened ${params.side} position for ${params.indicatorId} @ ${params.entryPrice}`
    );
  }

  async closePosition(params: ClosePositionParams): Promise<void> {
    await closePosition(params.positionId);

    console.log(
      `[PaperTrading] Closed position ${params.positionId} @ ${params.exitPrice} (${params.exitReason})`
    );
  }

  async updateBalance(params: UpdateBalanceParams): Promise<void> {
    const account = await getAccount(params.indicatorId);

    const newBalance = account.balance + params.pnl;
    const newDailyLoss = params.pnl < 0 ? account.daily_loss + Math.abs(params.pnl) : account.daily_loss;

    // Equity = balance (simplified; open position equity tracked separately)
    await updateAccount(params.indicatorId, {
      balance: newBalance,
      equity: newBalance,
      daily_loss: newDailyLoss,
    });

    console.log(
      `[PaperTrading] Updated balance for ${params.indicatorId}: ${account.balance} → ${newBalance} (PnL: ${params.pnl})`
    );
  }

  dispose(): void {
    // No-op for stateless serverless engine
  }
}
