import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabase";

// ==========================================
// Execution Logs API
//
// GET: Fetch recent structured logs, filterable by requestId, level, indicator
// ==========================================

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");
    const level = searchParams.get("level");
    const indicator = searchParams.get("indicator");
    const limit = parseInt(searchParams.get("limit") ?? "100");

    const db = getSupabase();
    let query = db
      .from("execution_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (requestId) query = query.eq("request_id", requestId);
    if (level) query = query.eq("level", level);
    if (indicator) query = query.eq("indicator_name", indicator);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      logs: (data || []).map((row) => ({
        id: row.id,
        requestId: row.request_id,
        level: row.level,
        indicator: row.indicator_name,
        message: row.message,
        context: row.context,
        timestamp: row.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
