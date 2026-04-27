import { getSupabase } from '../lib/supabase';
import { formatError } from '../lib/error-format';

// ==========================================
// Metrics Calculator
//
// Calculates performance metrics per indicator:
// - Total trades
// - Winrate
// - Profit factor
// - Max drawdown
// - Score (weighted formula)
// ==========================================

interface TradeRow {
  id: string;
  position_id: string;
  pnl: number;
  r_multiple: number | null;
  duration: number | null;
  exit_reason: string;
  exited_at: string;
}

/**
 * Recalculate all metrics for a specific indicator.
 * Called after each trade is closed.
 */
export async function recalculateMetrics(indicatorId: string): Promise<void> {
  // Fetch all trades for this indicator (via positions) with pagination
  let trades: any[] = [];
  let hasMore = true;
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (hasMore) {
    const { data, error } = await getSupabase()
      .from('multi_trades')
      .select(`*, positions!inner (indicator_id)`)
      .eq('positions.indicator_id', indicatorId)
      .order('exited_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`[Metrics] Error fetching trades for ${indicatorId}:`, error);
      break;
    }

    if (data && data.length > 0) {
      trades = trades.concat(data);
      offset += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  if (!trades || trades.length === 0) {
    // No trades yet — reset metrics
    await upsertMetrics(indicatorId, {
      total_trades: 0,
      winrate: 0,
      profit_factor: 0,
      max_drawdown: 0,
      score: 0,
    });
    return;
  }

  const tradeList = trades as unknown as TradeRow[];
  const totalPnL = tradeList.reduce((sum, t) => sum + t.pnl, 0);

  // Reconstruct initial equity from current account balance:
  // initial_equity ~= current_balance - cumulative_pnl
  // This keeps drawdown anchored to account equity, not raw running PnL.
  const { data: account } = await getSupabase()
    .from("accounts")
    .select("balance")
    .eq("indicator_id", indicatorId)
    .single();

  const currentBalance = Number(account?.balance ?? 0);
  const reconstructedInitialEquity = Math.max(1, currentBalance - totalPnL);

  const totalTrades = tradeList.length;
  const { winrate, profitFactor, maxDrawdown } =
    calculateTradeMetrics(tradeList, reconstructedInitialEquity);
  const score = calculateScore(winrate, profitFactor, maxDrawdown);

  // NUMERIC(5,4) in Postgres: max absolute value is 9.9999.
  // We must clamp every value before upserting to avoid numeric field overflow.
  const MAX = 9.9999;
  const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v));

  await upsertMetrics(indicatorId, {
    total_trades: totalTrades,
    winrate: clamp(Math.round(winrate * 10000) / 10000),
    profit_factor: clamp(Math.round(profitFactor * 10000) / 10000),
    max_drawdown: clamp(Math.round(maxDrawdown * 10000) / 10000),
    score: clamp(Math.round(score * 10000) / 10000),
  });

  console.log(
    `[Metrics] ${indicatorId}: trades=${totalTrades}, wr=${(winrate * 100).toFixed(1)}%, pf=${profitFactor.toFixed(2)}, dd=${(maxDrawdown * 100).toFixed(1)}%, score=${score.toFixed(3)}`,
  );
}

/**
 * Calculate winrate, profit factor, and max drawdown from a list of trades.
 */
function calculateTradeMetrics(trades: TradeRow[], initialEquity: number): {
  winrate: number;
  profitFactor: number;
  maxDrawdown: number;
} {
  let wins = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let peakEquity = initialEquity;
  let maxDrawdown = 0;
  let runningEquity = initialEquity;

  for (const trade of trades) {
    const pnl = trade.pnl;
    runningEquity += pnl;

    if (pnl > 0) {
      wins++;
      totalProfit += pnl;
    } else {
      totalLoss += Math.abs(pnl);
    }

    // Track peak and drawdown
    if (runningEquity > peakEquity) {
      peakEquity = runningEquity;
    }

    const drawdownRaw =
      peakEquity > 0 ? (peakEquity - runningEquity) / peakEquity : 0;
    const drawdown = Math.min(1, Math.max(0, drawdownRaw));
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const winrate = trades.length > 0 ? wins / trades.length : 0;
  const profitFactor =
    totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  // Cap profit factor at a reasonable number for scoring
  const cappedProfitFactor = profitFactor === Infinity ? 10 : profitFactor;

  return { winrate, profitFactor: cappedProfitFactor, maxDrawdown };
}

/**
 * Calculate composite score.
 *
 * Score = (Winrate × 0.4) + (Profit Factor × 0.3) + ((1 - Drawdown%) × 0.3)
 *
 * Normalized so each component is 0-1 scale:
 * - Winrate is already 0-1
 * - Profit Factor: cap at 5, divide by 5 → 0-1
 * - (1 - Drawdown%) is already 0-1
 */
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

/**
 * Upsert metrics into the database.
 */
async function upsertMetrics(
  indicatorId: string,
  metrics: {
    total_trades: number;
    winrate: number;
    profit_factor: number;
    max_drawdown: number;
    score: number;
  },
): Promise<void> {
  const { error } = await getSupabase()
    .from('performance_metrics')
    .upsert(
      {
        indicator_id: indicatorId,
        ...metrics,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'indicator_id' },
    );

  if (error) {
    console.error(
      `[Metrics] Failed to upsert metrics for ${indicatorId}:`,
      formatError(error, 'metrics'),
    );
    throw error;
  }
}

/**
 * Fetch all performance metrics (for dashboard overview).
 */
export async function getAllMetrics(): Promise<
  Array<{
    indicator_id: string;
    indicator_name: string;
    total_trades: number;
    winrate: number;
    profit_factor: number;
    max_drawdown: number;
    score: number;
    updated_at: string;
  }>
> {
  const { data, error } = await getSupabase()
    .from('performance_metrics')
    .select(
      `
      *,
      indicators!inner(name)
    `,
    )
    .order('score', { ascending: false });

  if (error) {
    console.error(
      '[Metrics] Failed to fetch all metrics:',
      formatError(error, 'metrics'),
    );
    return [];
  }

  return (data as any[]).map((row) => ({
    indicator_id: row.indicator_id,
    indicator_name: (row.indicators as { name: string }).name,
    total_trades: row.total_trades,
    winrate: row.winrate,
    profit_factor: row.profit_factor,
    max_drawdown: row.max_drawdown,
    score: row.score,
    updated_at: row.updated_at,
  }));
}
