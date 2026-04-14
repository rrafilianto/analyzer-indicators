import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../../lib/supabase";

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
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const db = getSupabase();

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

    // Fetch trade history (last 50, newest first)
    const { data: trades, error: tradesError } = await db
      .from("multi_trades")
      .select(`
        *,
        positions!inner(indicator_id, side, entry_price)
      `)
      .eq("positions.indicator_id", indicator.id)
      .order("exited_at", { ascending: false })
      .limit(50);

    if (tradesError) {
      console.error("[IndicatorDetail] Trades fetch error:", tradesError);
    }

    // Fetch recent candles for current price
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=5m&limit=1`
    );
    const candles = await res.json();
    const currentPrice = candles?.[0]?.[4] ? parseFloat(candles[0][4]) : null;

    // Supabase join returns object (not array) for foreign key relations
    const tradeList = (trades || []).map((t: any) => ({
      id: t.id,
      pnl: t.pnl,
      rMultiple: t.r_multiple,
      duration: t.duration,
      exitReason: t.exit_reason,
      exitedAt: t.exited_at,
      side: t.positions?.side ?? "unknown",
      entryPrice: t.positions?.entry_price ?? 0,
    }));

    return NextResponse.json({
      indicator: {
        id: indicator.id,
        name: indicator.name,
        config: indicator.config,
        isActive: indicator.is_active,
        balance: indicator.accounts?.balance ?? 0,
        equity: indicator.accounts?.equity ?? 0,
        dailyLoss: indicator.accounts?.daily_loss ?? 0,
        isHalted: indicator.accounts?.is_halted ?? false,
        totalTrades: indicator.performance_metrics?.total_trades ?? 0,
        winrate: indicator.performance_metrics?.winrate ?? 0,
        profitFactor: indicator.performance_metrics?.profit_factor ?? 0,
        maxDrawdown: indicator.performance_metrics?.max_drawdown ?? 0,
        score: indicator.performance_metrics?.score ?? 0,
        metricsUpdatedAt: indicator.performance_metrics?.updated_at,
      },
      openPosition: openPosition ?? null,
      trades: tradeList,
      currentPrice,
    });
  } catch (error) {
    console.error("[IndicatorDetail] Full error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
