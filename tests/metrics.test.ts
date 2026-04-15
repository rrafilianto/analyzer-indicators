import { describe, it, expect } from 'vitest';

// ==========================================
// Metrics Calculation Tests
//
// We re-implement the pure functions from metrics.ts here to test
// them without Supabase dependency.
// ==========================================

interface TradeRow {
  pnl: number;
}

function calculateTradeMetrics(trades: TradeRow[]): {
  winrate: number;
  profitFactor: number;
  maxDrawdown: number;
} {
  let wins = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;
  let runningPnL = 0;

  for (const trade of trades) {
    const pnl = trade.pnl;
    runningPnL += pnl;

    if (pnl > 0) {
      wins++;
      totalProfit += pnl;
    } else {
      totalLoss += Math.abs(pnl);
    }

    if (runningPnL > peakEquity) {
      peakEquity = runningPnL;
    }

    const drawdown =
      peakEquity > 0 ? (peakEquity - runningPnL) / peakEquity : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const winrate = trades.length > 0 ? wins / trades.length : 0;
  const profitFactor =
    totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 10 : 0;
  const cappedProfitFactor = profitFactor === Infinity ? 10 : profitFactor;

  return { winrate, profitFactor: cappedProfitFactor, maxDrawdown };
}

function calculateScore(
  winrate: number,
  profitFactor: number,
  maxDrawdown: number,
): number {
  const normalizedPF = Math.min(profitFactor, 5) / 5;
  const drawdownComponent = 1 - maxDrawdown;

  const score = winrate * 0.4 + normalizedPF * 0.3 + drawdownComponent * 0.3;

  return Math.max(0, Math.min(1, score));
}

// ==========================================
// Winrate Tests
// ==========================================

describe('calculateTradeMetrics — winrate', () => {
  it('100% winrate: all wins', () => {
    const trades = [{ pnl: 1 }, { pnl: 2 }, { pnl: 0.5 }];
    const { winrate } = calculateTradeMetrics(trades);
    expect(winrate).toBe(1);
  });

  it('0% winrate: all losses', () => {
    const trades = [{ pnl: -1 }, { pnl: -2 }];
    const { winrate } = calculateTradeMetrics(trades);
    expect(winrate).toBe(0);
  });

  it('50% winrate', () => {
    const trades = [{ pnl: 1 }, { pnl: -1 }];
    const { winrate } = calculateTradeMetrics(trades);
    expect(winrate).toBe(0.5);
  });

  it('0 trades → 0 winrate', () => {
    const { winrate } = calculateTradeMetrics([]);
    expect(winrate).toBe(0);
  });

  it('break-even trade (pnl = 0) counts as loss', () => {
    const trades = [{ pnl: 1 }, { pnl: 0 }];
    const { winrate } = calculateTradeMetrics(trades);
    expect(winrate).toBe(0.5);
  });
});

// ==========================================
// Profit Factor Tests
// ==========================================

describe('calculateTradeMetrics — profitFactor', () => {
  it('PF = totalProfit / totalLoss', () => {
    const trades = [{ pnl: 3 }, { pnl: -1 }];
    const { profitFactor } = calculateTradeMetrics(trades);
    expect(profitFactor).toBe(3);
  });

  it('PF capped at 10 when no losses', () => {
    const trades = [{ pnl: 1 }, { pnl: 2 }];
    const { profitFactor } = calculateTradeMetrics(trades);
    expect(profitFactor).toBe(10);
  });

  it('PF = 0 when no profits and no losses', () => {
    const trades: TradeRow[] = [];
    const { profitFactor } = calculateTradeMetrics(trades);
    expect(profitFactor).toBe(0);
  });

  it('PF = 0 when all trades are losses', () => {
    const trades = [{ pnl: -1 }, { pnl: -2 }];
    const { profitFactor } = calculateTradeMetrics(trades);
    expect(profitFactor).toBe(0);
  });

  it('PF = 1 when profit equals loss', () => {
    const trades = [{ pnl: 2 }, { pnl: -2 }];
    const { profitFactor } = calculateTradeMetrics(trades);
    expect(profitFactor).toBe(1);
  });
});

// ==========================================
// Max Drawdown Tests
// ==========================================

describe('calculateTradeMetrics — maxDrawdown', () => {
  it('no drawdown when all profits', () => {
    const trades = [{ pnl: 1 }, { pnl: 2 }];
    const { maxDrawdown } = calculateTradeMetrics(trades);
    expect(maxDrawdown).toBe(0);
  });

  it('100% drawdown: win then lose everything', () => {
    const trades = [{ pnl: 1 }, { pnl: -1 }];
    const { maxDrawdown } = calculateTradeMetrics(trades);
    expect(maxDrawdown).toBe(1);
  });

  it('50% drawdown', () => {
    const trades = [{ pnl: 2 }, { pnl: -1 }];
    const { maxDrawdown } = calculateTradeMetrics(trades);
    expect(maxDrawdown).toBe(0.5);
  });

  it('drawdown correctly recovers', () => {
    // Peak = 3, trough = 1 → DD = 2/3 = 0.666
    const trades = [{ pnl: 3 }, { pnl: -2 }, { pnl: 2 }];
    const { maxDrawdown } = calculateTradeMetrics(trades);
    expect(maxDrawdown).toBeCloseTo(0.6667, 3);
  });

  it('no drawdown when all losses (peak never above 0)', () => {
    // Running PnL goes -1, -3. Peak = 0 (initial), never goes positive.
    // The drawdown formula uses peakEquity > 0, so drawdown stays 0.
    const trades = [{ pnl: -1 }, { pnl: -2 }];
    const { maxDrawdown } = calculateTradeMetrics(trades);
    expect(maxDrawdown).toBe(0);
  });
});

// ==========================================
// Score Tests
// ==========================================

describe('calculateScore', () => {
  it('perfect score: 100% WR, max PF, 0% DD → 1.0', () => {
    const score = calculateScore(1.0, 10, 0);
    expect(score).toBe(1.0);
  });

  it('worst score: 0% WR, 0 PF, 100% DD → 0.0', () => {
    const score = calculateScore(0, 0, 1);
    expect(score).toBe(0);
  });

  it('middling: 50% WR, PF=1, DD=20%', () => {
    // 0.5 × 0.4 + (1/5) × 0.3 + 0.8 × 0.3
    // = 0.20 + 0.06 + 0.24 = 0.50
    const score = calculateScore(0.5, 1, 0.2);
    expect(score).toBeCloseTo(0.5, 4);
  });

  it('PF capped at 5 for scoring normalization', () => {
    const score1 = calculateScore(0.5, 5, 0);
    const score2 = calculateScore(0.5, 10, 0);
    expect(score1).toBe(score2); // Both should normalize PF to 1.0
  });

  it('score is clamped to [0, 1]', () => {
    // These extreme inputs shouldn't break the formula
    const score = calculateScore(1, 100, -1); // impossible DD < 0
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
