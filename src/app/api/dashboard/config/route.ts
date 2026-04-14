import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabase";

// ==========================================
// Dashboard Config API
//
// POST: Update risk config, kill switch, toggle indicators
// ==========================================

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const db = getSupabase();

    switch (action) {
      case "toggle_kill_switch": {
        const { enabled } = body;
        await db
          .from("system_config")
          .update({ value: { enabled }, updated_at: new Date().toISOString() })
          .eq("key", "kill_switch");
        return NextResponse.json({ status: "success", killSwitch: enabled });
      }

      case "update_max_daily_loss": {
        const { value } = body;
        await db
          .from("system_config")
          .update({ value: { value }, updated_at: new Date().toISOString() })
          .eq("key", "max_daily_loss");
        return NextResponse.json({ status: "success", maxDailyLoss: value });
      }

      case "update_position_size": {
        const { value } = body;
        await db
          .from("system_config")
          .update({ value: { value }, updated_at: new Date().toISOString() })
          .eq("key", "position_size");
        return NextResponse.json({ status: "success", positionSize: value });
      }

      case "update_leverage": {
        const { value } = body;
        await db
          .from("system_config")
          .update({ value: { value }, updated_at: new Date().toISOString() })
          .eq("key", "leverage");
        return NextResponse.json({ status: "success", leverage: value });
      }

      case "toggle_indicator": {
        const { indicatorId, isActive } = body;
        await db
          .from("indicators")
          .update({ is_active: isActive, updated_at: new Date().toISOString() })
          .eq("id", indicatorId);
        return NextResponse.json({ status: "success", isActive });
      }

      case "reset_daily_loss": {
        await db.from("accounts").update({ daily_loss: 0 });
        return NextResponse.json({ status: "success" });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
