import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../../lib/supabase";
import { formatError } from "../../../../../lib/error-format";
import { syncIndicatorEquity } from "../../../../../engine/equity";

// ==========================================
// Indicator Detail API
//
// Returns detailed data for a single indicator:
// - Indicator info + account + metrics
// - Trade history
// - Open position
// - Recent candles (for current price)
// ==========================================

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const db = getSupabase();
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 1),
      100
    );
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    // Fetch indicator with account and metrics
    const { data: indicator, error: indicatorError } = await db
      .from("indicators")
      .select(`
        *,
        accounts!inner(balance, equity, daily_loss, is_halted),
        performance_metrics!inner(total_trades, winrate, profit_factor, max_drawdown, score, updated_at)
      `)
      .eq("name", name)
      .single();

    if (indicatorError) throw indicatorError;

    // Fetch open position (handle PGRST116 = no rows returned)
    const { data: openPosition, error: posError } = await db
      .from("positions")
      .select("*")
      .eq("indicator_id", indicator.id)
      .eq("status", "open")
      .single();

    if (posError && posError.code !== "PGRST116") {
      console.error("[IndicatorDetail] Position fetch error:", posError);
    }

    // Fetch trade history (paginated, newest first)
    const { data: trades, error: tradesError } = await db
      .from("multi_trades")
      .select(`
        *,
        positions!inner(indicator_id, side, entry_price)
      `)
      .eq("positions.indicator_id", indicator.id)
      .order("exited_at", { ascending: false })
      .range(offset, offset + limit);

    if (tradesError) {
      console.error("[IndicatorDetail] Trades fetch error:", tradesError);
    }

    // Fetch all trades for realized PnL summary and equity history
    let realizedTrades: any[] = [];
    let hasMoreRealized = true;
    let realizedOffset = 0;
    const PAGE_SIZE = 1000;

    while (hasMoreRealized) {
      const { data, error } = await db
        .from("multi_trades")
        .select(`
          pnl,
          exited_at,
          positions!inner(indicator_id)
        `)
        .eq("positions.indicator_id", indicator.id)
        .order("exited_at", { ascending: true })
        .range(realizedOffset, realizedOffset + PAGE_SIZE - 1);

      if (error) {
        console.error("[IndicatorDetail] Realized PnL fetch error:", error);
        break;
      }

      if (data && data.length > 0) {
        realizedTrades = realizedTrades.concat(data);
        realizedOffset += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMoreRealized = false;
      } else {
        hasMoreRealized = false;
      }
    }

    // Fetch recent candles for current price
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=5m&limit=1`
    );
    const candles = await res.json();
    const currentPrice = candles?.[0]?.[4] ? parseFloat(candles[0][4]) : null;
    let liveEquity = indicator.accounts?.equity ?? 0;
    if (currentPrice && Number.isFinite(currentPrice)) {
      liveEquity = await syncIndicatorEquity(indicator.id, currentPrice);
    }

    // Supabase join returns object (not array) for foreign key relations
    const allTradeRows = trades || [];
    const hasMoreTrades = allTradeRows.length > limit;
    const tradePageRows = hasMoreTrades ? allTradeRows.slice(0, limit) : allTradeRows;

    const tradeList = tradePageRows.map((t: any) => ({
      id: t.id,
      pnl: t.pnl,
      rMultiple: t.r_multiple,
      duration: t.duration,
      exitReason: t.exit_reason,
      exitedAt: t.exited_at,
      side: t.positions?.side ?? "unknown",
      entryPrice: t.positions?.entry_price ?? 0,
    }));
    const realizedPnlRaw = (realizedTrades || []).reduce(
      (sum: number, row: { pnl: number }) => sum + row.pnl,
      0
    );
    const realizedPnl = Math.round(realizedPnlRaw * 100) / 100;
    const balance = indicator.accounts?.balance ?? 0;
    const unrealizedPnl = Math.round((liveEquity - balance) * 100) / 100;
    
    const initialBalance = Math.max(1, balance - realizedPnl);
    const roi = ((liveEquity - initialBalance) / initialBalance) * 100;

    function buildEquityHistory(
      tradeItems: { pnl: number; exited_at: string }[],
      initBal: number
    ): { date: string; equity: number }[] {
      const history: { date: string; equity: number }[] = [];
      let running = initBal;

      if (tradeItems.length > 0) {
        history.push({ date: tradeItems[0].exited_at, equity: initBal });
      }

      for (const trade of tradeItems) {
        running += trade.pnl;
        history.push({ date: trade.exited_at, equity: Math.round(running * 100) / 100 });
      }

      return history;
    }

    const equityHistory = buildEquityHistory(realizedTrades || [], initialBalance);

    return NextResponse.json({
      indicator: {
        id: indicator.id,
        name: indicator.name,
        config: indicator.config,
        isActive: indicator.is_active,
        balance,
        equity: liveEquity,
        dailyLoss: indicator.accounts?.daily_loss ?? 0,
        isHalted: indicator.accounts?.is_halted ?? false,
        totalTrades: indicator.performance_metrics?.total_trades ?? 0,
        winrate: indicator.performance_metrics?.winrate ?? 0,
        profitFactor: indicator.performance_metrics?.profit_factor ?? 0,
        maxDrawdown: indicator.performance_metrics?.max_drawdown ?? 0,
        score: indicator.performance_metrics?.score ?? 0,
        metricsUpdatedAt: indicator.performance_metrics?.updated_at,
        pnlRealized: Math.round(realizedPnl * 100) / 100,
        pnlUnrealized: Math.round(unrealizedPnl * 100) / 100,
        roi,
        equityHistory,
      },
      openPosition: openPosition ?? null,
      trades: tradeList,
      hasMoreTrades,
      currentPrice,
    });
  } catch (error) {
    console.error("[IndicatorDetail] Error:", formatError(error, "indicator-detail"));
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
