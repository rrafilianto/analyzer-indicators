import type { PositionSide, ExitReason } from "./types";

// ==========================================
// Trading Engine Interface
//
// Abstract contract for trading engine implementations.
// - PaperTradingEngine (current)
// - LiveTradingEngine (future)
// ==========================================

export interface OpenPositionParams {
  indicatorId: string;
  side: PositionSide;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  leverage: number;
}

export interface ClosePositionParams {
  positionId: string;
  exitPrice: number;
  exitReason: ExitReason;
  exitedAt: Date;
}

export interface UpdateBalanceParams {
  indicatorId: string;
  pnl: number;
}

export interface TradingEngine {
  /**
   * Open a new position.
   */
  openPosition(params: OpenPositionParams): Promise<void>;

  /**
   * Close an existing position and record the trade.
   */
  closePosition(params: ClosePositionParams): Promise<void>;

  /**
   * Update balance after a trade is closed.
   */
  updateBalance(params: UpdateBalanceParams): Promise<void>;

  /**
   * Calculate realized PnL for a closed position.
   */
  calculatePnL(
    side: PositionSide,
    entryPrice: number,
    exitPrice: number,
    size: number,
    leverage: number
  ): number;

  /**
   * Clean up / disconnect.
   */
  dispose(): void;
}
