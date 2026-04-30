// ==========================================
// Market Data
// ==========================================

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ==========================================
// Signals
// ==========================================

export type Signal = "LONG" | "SHORT" | "NEUTRAL";

export interface IndicatorResult {
  signal: Signal;
  metadata?: Record<string, unknown>;
}

// ==========================================
// Indicator Config
// ==========================================

export interface IndicatorConfig {
  id: string;
  name: IndicatorName;
  config: Record<string, unknown>;
  isActive: boolean;
}

export type IndicatorName =
  | "ema_crossover"
  | "ema_crossover_v2"
  | "macd"
  | "macd_v2"
  | "supertrend"
  | "supertrend_v2"
  | "rsi_70_30"
  | "rsi_70_30_adx"
  | "rsi_70_30_v2"
  | "rsi_70_30_v2_adx"
  | "rsi_50_cross"
  | "rsi_50_cross_adx"
  | "bollinger"
  | "bollinger_adx"
  | "bollinger_v2"
  | "bollinger_v2_adx"
  | "donchian"
  | "vwap"
  | "vwap_cross";

// ==========================================
// Position
// ==========================================

export type PositionSide = "long" | "short";
export type PositionStatus = "open" | "closed";
export type ExitReason = "tp" | "sl" | "reverse";

export interface Position {
  id: string;
  indicatorId: string;
  side: PositionSide;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  leverage: number;
  status: PositionStatus;
  openedAt: string;
  closedAt?: string;
}

// ==========================================
// Trade
// ==========================================

export interface Trade {
  id: string;
  positionId: string;
  pnl: number;
  rMultiple: number | null;
  duration: number | null; // minutes
  exitReason: ExitReason;
  exitedAt: string;
}

// ==========================================
// Account
// ==========================================

export interface Account {
  id: string;
  indicatorId: string;
  balance: number;
  equity: number;
  dailyLoss: number;
  isHalted: boolean;
}

// ==========================================
// Performance Metrics
// ==========================================

export interface PerformanceMetrics {
  indicatorId: string;
  totalTrades: number;
  winrate: number;
  profitFactor: number;
  maxDrawdown: number;
  score: number;
  updatedAt: string;
}

// ==========================================
// Market Structure
// ==========================================

export interface SwingPoint {
  price: number;
  timestamp: number;
  type: "high" | "low";
}

export interface MarketStructure {
  higherLows: SwingPoint[];
  lowerHighs: SwingPoint[];
  lastConfirmedHL: SwingPoint | null;
  lastConfirmedLH: SwingPoint | null;
}

// ==========================================
// System Config
// ==========================================

export interface SystemConfig {
  maxDailyLoss: number;
  killSwitch: boolean;
  defaultBalance: number;
  positionSize: number;
  leverage: number;
}
