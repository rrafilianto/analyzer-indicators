import { createClient } from "@supabase/supabase-js";
import { formatError, readResponseError } from "./error-format";

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

// Binance kline response is an array-of-arrays:
// [openTime, open, high, low, close, volume, closeTime, ...]
export type BinanceRawCandle = [
  number,  // 0: openTime
  string,  // 1: open
  string,  // 2: high
  string,  // 3: low
  string,  // 4: close
  string,  // 5: volume
  number,  // 6: closeTime
  ...unknown[]
];

export async function fetchCandles(
  symbol = "BTCUSDT",
  interval = "5m",
  limit = 200
): Promise<import("../engine/types").Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const fallbackUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  let lastError: unknown;

  // Try futures API first, fallback to spot API
  for (const apiUrl of [url, fallbackUrl]) {
    try {
      console.log(`[fetchCandles] GET ${apiUrl}`);
      const res = await fetch(apiUrl);

      if (!res.ok) {
        const body = await readResponseError(res);
        console.error(`[fetchCandles] HTTP ${res.status} ${res.statusText} | URL: ${apiUrl} | Body: ${body}`);
        lastError = new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
        continue; // try fallback
      }

      // Response is array-of-arrays, e.g. [[openTime, open, high, low, close, volume, ...], ...]
      const data: BinanceRawCandle[] = await res.json();
      console.log(`[fetchCandles] Success from ${apiUrl.includes("fapi") ? "futures" : "spot"}: ${data.length} candles`);

      return data.map((candle) => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));
    } catch (error) {
      console.error(`[fetchCandles] Network error: ${formatError(error, apiUrl)}`);
      lastError = error;
    }
  }

  throw new Error(`Failed to fetch candles: ${formatError(lastError)}`);
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
