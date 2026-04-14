import { createClient } from "@supabase/supabase-js";

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    // During build time, return a dummy client
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return createClient("https://dummy.supabase.co", "dummy");
    }
    throw new Error(
      "Missing Supabase environment variables. Copy .env.local.example to .env.local and fill in your values."
    );
  }

  _supabase = createClient(supabaseUrl, supabaseSecretKey);
  return _supabase;
}

// Re-export all helper functions that use supabase
// These will lazily initialize the client when called

// ==========================================
// Helper: Fetch latest N candles from Binance
// ==========================================

export interface BinanceCandle {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

export async function fetchCandles(
  symbol = "BTCUSDT",
  interval = "5m",
  limit = 200
): Promise<import("../engine/types").Candle[]> {
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch candles: ${res.statusText}`);
  }

  const data: BinanceCandle[] = await res.json();

  return data.map((candle) => ({
    timestamp: candle.openTime,
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume),
  }));
}

// ==========================================
// Helper: Get indicator by name
// ==========================================

export async function getIndicator(name: string) {
  const { data, error } = await getSupabase()
    .from("indicators")
    .select("*")
    .eq("name", name)
    .single();

  if (error) throw error;
  return data;
}

// ==========================================
// Helper: Get account by indicator_id
// ==========================================

export async function getAccount(indicatorId: string) {
  const { data, error } = await getSupabase()
    .from("accounts")
    .select("*")
    .eq("indicator_id", indicatorId)
    .single();

  if (error) throw error;
  return data;
}

// ==========================================
// Helper: Get open position for indicator
// ==========================================

export async function getOpenPosition(indicatorId: string) {
  const { data, error } = await getSupabase()
    .from("positions")
    .select("*")
    .eq("indicator_id", indicatorId)
    .eq("status", "open")
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
  return data;
}

// ==========================================
// Helper: Create position
// ==========================================

export async function createPosition(position: {
  indicator_id: string;
  side: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  size: number;
  leverage: number;
}) {
  const { data, error } = await getSupabase()
    .from("positions")
    .insert(position)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ==========================================
// Helper: Close position
// ==========================================

export async function closePosition(positionId: string) {
  const { data, error } = await getSupabase()
    .from("positions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", positionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ==========================================
// Helper: Record trade
// ==========================================

export async function recordTrade(trade: {
  position_id: string;
  pnl: number;
  r_multiple: number | null;
  duration: number | null;
  exit_reason: string;
}) {
  const { data, error } = await getSupabase()
    .from("multi_trades")
    .insert(trade)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ==========================================
// Helper: Update account balance/equity
// ==========================================

export async function updateAccount(
  indicatorId: string,
  updates: { balance?: number; equity?: number; daily_loss?: number; is_halted?: boolean }
) {
  const { data, error } = await getSupabase()
    .from("accounts")
    .update(updates)
    .eq("indicator_id", indicatorId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
