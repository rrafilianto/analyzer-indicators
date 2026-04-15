import { getSupabase, updateAccount } from "../lib/supabase";

type OpenPositionRow = {
  side: string;
  entry_price: number;
  size: number;
  leverage: number;
};

/**
 * Calculate unrealized PnL from current price.
 */
export function calculateUnrealizedPnL(
  side: string,
  entryPrice: number,
  currentPrice: number,
  size: number,
  leverage: number
): number {
  if (!entryPrice || entryPrice <= 0) return 0;

  const priceDiff = side === "long"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;

  return (priceDiff / entryPrice) * size * leverage;
}

/**
 * Sync account equity for one indicator:
 * - If no open position: equity = balance
 * - If open position: equity = balance + unrealized PnL
 */
export async function syncIndicatorEquity(
  indicatorId: string,
  currentPrice: number
): Promise<number> {
  const db = getSupabase();

  const { data: account, error: accountError } = await db
    .from("accounts")
    .select("balance")
    .eq("indicator_id", indicatorId)
    .single();

  if (accountError) throw accountError;

  const { data: openPosition, error: positionError } = await db
    .from("positions")
    .select("side, entry_price, size, leverage")
    .eq("indicator_id", indicatorId)
    .eq("status", "open")
    .single();

  // PGRST116 means no rows; this is expected when no open position.
  if (positionError && positionError.code !== "PGRST116") throw positionError;

  const balance = Number(account?.balance ?? 0);
  let nextEquity = balance;

  if (openPosition) {
    const pos = openPosition as OpenPositionRow;
    const unrealizedPnl = calculateUnrealizedPnL(
      pos.side,
      pos.entry_price,
      currentPrice,
      pos.size,
      pos.leverage
    );
    nextEquity = balance + unrealizedPnl;
  }

  // Keep stored precision stable.
  const roundedEquity = Math.round(nextEquity * 10000) / 10000;
  await updateAccount(indicatorId, { equity: roundedEquity });
  return roundedEquity;
}
