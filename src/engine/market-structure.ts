import type { Candle, MarketStructure, SwingPoint } from "../engine/types";

/**
 * Market Structure Detector
 *
 * Non-repainting algorithm for detecting Higher Lows (HL) and Lower Highs (LH).
 * Only confirms swing points after they've been validated by subsequent price action.
 *
 * Swing detection logic:
 * - A swing low is confirmed when price makes X higher candles after it
 * - A swing high is confirmed when price makes X lower candles after it
 * - Higher Low: current confirmed low > previous confirmed low
 * - Lower High: current confirmed high < previous confirmed high
 */

const DEFAULT_CONFIRMATION_BARS = 3;

interface SwingCandidate {
  price: number;
  timestamp: number;
  type: "high" | "low";
  barsAgo: number;
}

/**
 * Detect swing points from OHLCV data (non-repainting).
 *
 * @param candles - Array of OHLCV candles (oldest first)
 * @param confirmationBars - Number of bars needed to confirm a swing
 * @returns MarketStructure with confirmed HLs and LHs
 */
export function detectMarketStructure(
  candles: Candle[],
  confirmationBars: number = DEFAULT_CONFIRMATION_BARS
): MarketStructure {
  const swingCandidates: SwingCandidate[] = [];
  const confirmedHighs: SwingPoint[] = [];
  const confirmedLows: SwingPoint[] = [];

  const lookback = 5; // bars to look back/forward for swing detection

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];

    // Check for swing high
    const isSwingHigh = checkSwingHigh(candles, i, lookback);
    if (isSwingHigh) {
      swingCandidates.push({
        price: current.high,
        timestamp: current.timestamp,
        type: "high",
        barsAgo: candles.length - 1 - i,
      });
    }

    // Check for swing low
    const isSwingLow = checkSwingLow(candles, i, lookback);
    if (isSwingLow) {
      swingCandidates.push({
        price: current.low,
        timestamp: current.timestamp,
        type: "low",
        barsAgo: candles.length - 1 - i,
      });
    }
  }

  // Confirm swings based on subsequent price action
  const currentBarIndex = candles.length - 1;

  for (const candidate of swingCandidates) {
    const candidateIndex = candles.findIndex((c) => c.timestamp === candidate.timestamp);
    const barsSinceCandidate = currentBarIndex - candidateIndex;

    if (barsSinceCandidate >= confirmationBars) {
      if (candidate.type === "high") {
        confirmedHighs.push({
          price: candidate.price,
          timestamp: candidate.timestamp,
          type: "high",
        });
      } else {
        confirmedLows.push({
          price: candidate.price,
          timestamp: candidate.timestamp,
          type: "low",
        });
      }
    }
  }

  // Find Higher Lows and Lower Highs
  const higherLows = findHigherLows(confirmedLows);
  const lowerHighs = findLowerHighs(confirmedHighs);

  const lastConfirmedHL = higherLows.length > 0 ? higherLows[higherLows.length - 1] : null;
  const lastConfirmedLH = lowerHighs.length > 0 ? lowerHighs[lowerHighs.length - 1] : null;

  return {
    higherLows,
    lowerHighs,
    lastConfirmedHL,
    lastConfirmedLH,
  };
}

/**
 * Check if the candle at index i is a swing high.
 * A swing high has higher high than N bars before and after.
 */
function checkSwingHigh(candles: Candle[], i: number, lookback: number): boolean {
  const current = candles[i];

  for (let j = 1; j <= lookback; j++) {
    if (candles[i - j].high >= current.high) return false;
    if (candles[i + j].high >= current.high) return false;
  }

  return true;
}

/**
 * Check if the candle at index i is a swing low.
 * A swing low has lower low than N bars before and after.
 */
function checkSwingLow(candles: Candle[], i: number, lookback: number): boolean {
  const current = candles[i];

  for (let j = 1; j <= lookback; j++) {
    if (candles[i - j].low <= current.low) return false;
    if (candles[i + j].low <= current.low) return false;
  }

  return true;
}

/**
 * Find Higher Lows in a sequence of confirmed swing lows.
 * A Higher Low is a low that is higher than the previous confirmed low.
 */
function findHigherLows(lows: SwingPoint[]): SwingPoint[] {
  const result: SwingPoint[] = [];

  for (let i = 0; i < lows.length; i++) {
    if (result.length === 0) {
      result.push(lows[i]);
    } else {
      const last = result[result.length - 1];
      if (lows[i].price > last.price && lows[i].timestamp > last.timestamp) {
        result.push(lows[i]);
      }
    }
  }

  return result;
}

/**
 * Find Lower Highs in a sequence of confirmed swing highs.
 * A Lower High is a high that is lower than the previous confirmed high.
 */
function findLowerHighs(highs: SwingPoint[]): SwingPoint[] {
  const result: SwingPoint[] = [];

  for (let i = 0; i < highs.length; i++) {
    if (result.length === 0) {
      result.push(highs[i]);
    } else {
      const last = result[result.length - 1];
      if (highs[i].price < last.price && highs[i].timestamp > last.timestamp) {
        result.push(highs[i]);
      }
    }
  }

  return result;
}

/**
 * Get stop loss price for a long position.
 * Returns the last confirmed Higher Low price.
 */
export function getLongStopLoss(structure: MarketStructure): number | null {
  return structure.lastConfirmedHL?.price ?? null;
}

/**
 * Get stop loss price for a short position.
 * Returns the last confirmed Lower High price.
 */
export function getShortStopLoss(structure: MarketStructure): number | null {
  return structure.lastConfirmedLH?.price ?? null;
}
