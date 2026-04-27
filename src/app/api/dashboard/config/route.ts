import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabase";
import { formatError } from "../../../../lib/error-format";
import { resetDailyLoss } from "../../../../engine/risk-manager";

// ==========================================
// Dashboard Config API
//
// POST: Update risk config, kill switch, toggle indicators
// ==========================================

export const dynamic = "force-dynamic";

function assertValidNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field}: must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`Invalid ${field}: must be >= 0`);
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const db = getSupabase();

    switch (action) {
      case "toggle_kill_switch": {
        const { enabled } = body;
        if (typeof enabled !== "boolean") {
          throw new Error("Invalid enabled: must be boolean");
        }
        const { error } = await db
          .from("system_config")
          .update({ value: { enabled }, updated_at: new Date().toISOString() })
          .eq("key", "kill_switch");
        if (error) throw error;
        return NextResponse.json({ status: "success", killSwitch: enabled });
      }

      case "update_max_daily_loss": {
        const value = assertValidNumber(body.value, "max_daily_loss");
        const { error } = await db
          .from("system_config")
          .update({ value: { value }, updated_at: new Date().toISOString() })
          .eq("key", "max_daily_loss");
        if (error) throw error;
        return NextResponse.json({ status: "success", maxDailyLoss: value });
      }

      case "update_position_size": {
        const value = assertValidNumber(body.value, "position_size");
        const { error } = await db
          .from("system_config")
          .update({ value: { value }, updated_at: new Date().toISOString() })
          .eq("key", "position_size");
        if (error) throw error;
        return NextResponse.json({ status: "success", positionSize: value });
      }

      case "update_leverage": {
        const value = assertValidNumber(body.value, "leverage");
        const { error } = await db
          .from("system_config")
          .update({ value: { value }, updated_at: new Date().toISOString() })
          .eq("key", "leverage");
        if (error) throw error;
        return NextResponse.json({ status: "success", leverage: value });
      }

      case "update_trading_fee": {
        const value = assertValidNumber(body.value, "trading_fee");
        const { error } = await db
          .from("system_config")
          .update({ value: { value }, updated_at: new Date().toISOString() })
          .eq("key", "trading_fee");
        if (error) throw error;
        return NextResponse.json({ status: "success", tradingFee: value });
      }

      case "toggle_indicator": {
        const { indicatorId, isActive } = body;
        if (typeof indicatorId !== "string" || indicatorId.length === 0) {
          throw new Error("Invalid indicatorId");
        }
        if (typeof isActive !== "boolean") {
          throw new Error("Invalid isActive: must be boolean");
        }
        const { error } = await db
          .from("indicators")
          .update({ is_active: isActive, updated_at: new Date().toISOString() })
          .eq("id", indicatorId);
        if (error) throw error;
        return NextResponse.json({ status: "success", isActive });
      }

      case "reset_daily_loss": {
        await resetDailyLoss();
        return NextResponse.json({ status: "success" });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[ConfigAPI] Error:", formatError(error, "config"));
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
