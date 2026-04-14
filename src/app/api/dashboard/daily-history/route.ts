import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabase";
import { formatError } from "../../../../lib/error-format";

// ==========================================
// Daily Loss History API
//
// GET: Fetch daily loss history, filterable by indicator and date range
// ==========================================

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const indicatorId = searchParams.get("indicatorId");
    const indicatorName = searchParams.get("indicatorName");
    const days = parseInt(searchParams.get("days") ?? "30");

    const db = getSupabase();
    let query = db
      .from("daily_loss_history")
      .select(`
        *,
        indicators(name)
      `)
      .order("date", { ascending: false })
      .limit(days * 6); // max ~6 records per day (6 indicators)

    if (indicatorId) query = query.eq("indicator_id", indicatorId);
    if (indicatorName) query = query.eq("indicators.name", indicatorName);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      history: (data || []).map((row: any) => ({
        id: row.id,
        indicatorId: row.indicator_id,
        indicatorName: row.indicators?.name ?? "unknown",
        date: row.date,
        dailyLoss: row.daily_loss,
        dailyPnl: row.daily_pnl,
        balanceBefore: row.balance_before,
        balanceAfter: row.balance_after,
        equityBefore: row.equity_before,
      })),
    });
  } catch (error) {
    console.error("[DailyHistoryAPI] Error:", formatError(error, "daily-history"));
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
