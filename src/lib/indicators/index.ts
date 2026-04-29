import { EMA, MACD, RSI, BollingerBands, ATR } from "technicalindicators";
import type { Candle, IndicatorConfig, IndicatorResult, Signal } from "../../engine/types";

// ==========================================
// EMA Crossover (9 / 21)
// ==========================================

export function emaCrossover(
  candles: Candle[],
  _config?: IndicatorConfig
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const fastPeriod = 9;
  const slowPeriod = 21;

  const fastEMA = EMA.calculate({ period: fastPeriod, values: closes });
  const slowEMA = EMA.calculate({ period: slowPeriod, values: closes });

  // Need at least 2 data points to detect crossover
  if (fastEMA.length < 2 || slowEMA.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const fastCurrent = fastEMA[fastEMA.length - 1]!;
  const fastPrev = fastEMA[fastEMA.length - 2]!;
  const slowCurrent = slowEMA[slowEMA.length - 1]!;
  const slowPrev = slowEMA[slowEMA.length - 2]!;

  // Long: EMA9 crosses above EMA21
  if (fastPrev <= slowPrev && fastCurrent > slowCurrent) {
    return { signal: "LONG", metadata: { fast: fastCurrent, slow: slowCurrent } };
  }

  // Short: EMA9 crosses below EMA21
  if (fastPrev >= slowPrev && fastCurrent < slowCurrent) {
    return { signal: "SHORT", metadata: { fast: fastCurrent, slow: slowCurrent } };
  }

  return { signal: "NEUTRAL", metadata: { fast: fastCurrent, slow: slowCurrent } };
}

// ==========================================
// MACD (12, 26, 9)
// ==========================================

export function macd(
  candles: Candle[],
  _config?: IndicatorConfig
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const fastPeriod = 12;
  const slowPeriod = 26;
  const signalPeriod = 9;

  const macdResult = MACD.calculate({
    fastPeriod,
    slowPeriod,
    signalPeriod,
    values: closes,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  if (macdResult.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const current = macdResult[macdResult.length - 1]!;
  const prev = macdResult[macdResult.length - 2]!;

  // Long: MACD line crosses above Signal line
  if (prev.MACD! <= prev.signal! && current.MACD! > current.signal!) {
    return { signal: "LONG", metadata: { macd: current.MACD, signal: current.signal } };
  }

  // Short: MACD line crosses below Signal line
  if (prev.MACD! >= prev.signal! && current.MACD! < current.signal!) {
    return { signal: "SHORT", metadata: { macd: current.MACD, signal: current.signal } };
  }

  return { signal: "NEUTRAL", metadata: { macd: current.MACD, signal: current.signal } };
}

// ==========================================
// Supertrend (ATR 10, Multiplier 3)
// ==========================================

export function supertrend(
  candles: Candle[],
  _config?: IndicatorConfig
): IndicatorResult {
  const atrPeriod = 10;
  const multiplier = 3;

  // Need at least atrPeriod + 2 candles for ATR + trend change detection
  if (candles.length < atrPeriod + 2) {
    return { signal: "NEUTRAL" };
  }

  const atrValues = ATR.calculate({
    period: atrPeriod,
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
  });

  // ATR values from technicalindicators start from candle index atrPeriod
  // atrValues[i] corresponds to candles[atrPeriod + i]
  // Length is candles.length - atrPeriod (not candles.length - atrPeriod + 1)

  const basicUpper: number[] = [];
  const basicLower: number[] = [];
  const finalUpper: number[] = [];
  const finalLower: number[] = [];
  const isUptrend: boolean[] = [];

  // Calculate Basic Bands
  // atrValues[i] corresponds to candles[atrPeriod + i]
  for (let i = 0; i < atrValues.length; i++) {
    const candleIndex = atrPeriod + i;
    const hl2 = (candles[candleIndex]!.high + candles[candleIndex]!.low) / 2;
    const atr = atrValues[i]!;

    basicUpper.push(hl2 + multiplier * atr);
    basicLower.push(hl2 - multiplier * atr);
  }

  // Calculate Final Bands and Trend
  // atrValues[i] corresponds to candles[atrPeriod + i]
  for (let i = 0; i < basicUpper.length; i++) {
    const candleIndex = atrPeriod + i;

    if (i === 0) {
      // Initialize first values
      finalUpper.push(basicUpper[i]!);
      finalLower.push(basicLower[i]!);
      // Initial trend: uptrend if close >= finalLower
      isUptrend.push(candles[candleIndex]!.close >= finalLower[0]!);
    } else {
      const prevClose = candles[candleIndex - 1]!.close;

      // Final Upper Band
      if (basicUpper[i]! < finalUpper[i - 1]! || prevClose > finalUpper[i - 1]!) {
        finalUpper.push(basicUpper[i]!);
      } else {
        finalUpper.push(finalUpper[i - 1]!);
      }

      // Final Lower Band
      if (basicLower[i]! > finalLower[i - 1]! || prevClose < finalLower[i - 1]!) {
        finalLower.push(basicLower[i]!);
      } else {
        finalLower.push(finalLower[i - 1]!);
      }

      // Trend determination
      const currentClose = candles[candleIndex]!.close;
      if (isUptrend[i - 1]!) {
        // Was uptrend: continue if close >= finalLower, switch if close < finalLower
        isUptrend.push(currentClose >= finalLower[i]!);
      } else {
        // Was downtrend: continue if close <= finalUpper, switch if close > finalUpper
        isUptrend.push(currentClose > finalUpper[i]!);
      }
    }
  }

  // Need at least 2 trend values to detect a change
  if (isUptrend.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const prevUptrend = isUptrend[isUptrend.length - 2]!;
  const currentUptrend = isUptrend[isUptrend.length - 1]!;

  const currentClose = candles[candles.length - 1]!.close;
  const atr = atrValues[atrValues.length - 1]!;
  const finalIdx = finalUpper.length - 1;
  const supertrendValue = currentUptrend ? finalLower[finalIdx]! : finalUpper[finalIdx]!;

  // Signal: trend change detection
  if (!prevUptrend && currentUptrend) {
    // Downtrend to Uptrend = LONG
    return {
      signal: "LONG",
      metadata: {
        supertrend: supertrendValue,
        trend: "UP",
        close: currentClose,
        atr,
      },
    };
  }

  if (prevUptrend && !currentUptrend) {
    // Uptrend to Downtrend = SHORT
    return {
      signal: "SHORT",
      metadata: {
        supertrend: supertrendValue,
        trend: "DOWN",
        close: currentClose,
        atr,
      },
    };
  }

  // No trend change
  return {
    signal: "NEUTRAL",
    metadata: {
      supertrend: supertrendValue,
      trend: currentUptrend ? "UP" : "DOWN",
      close: currentClose,
      atr,
    },
  };
}

// ==========================================
// RSI 70/30 (Oversold/Overbought)
// ==========================================

export function rsi7030(
  candles: Candle[],
  _config?: IndicatorConfig
): IndicatorResult {
  const period = 14;
  const overbought = 70;
  const oversold = 30;

  const closes = candles.map((c) => c.close);
  const rsiValues = RSI.calculate({ period, values: closes });

  if (rsiValues.length < 1) {
    return { signal: "NEUTRAL" };
  }

  const currentRSI = rsiValues[rsiValues.length - 1]!;

  // Long: RSI < 30 (oversold)
  if (currentRSI < oversold) {
    return { signal: "LONG", metadata: { rsi: currentRSI } };
  }

  // Short: RSI > 70 (overbought)
  if (currentRSI > overbought) {
    return { signal: "SHORT", metadata: { rsi: currentRSI } };
  }

  return { signal: "NEUTRAL", metadata: { rsi: currentRSI } };
}

// ==========================================
// RSI 50 Cross (Midline Crossover)
// ==========================================

export function rsi50Cross(
  candles: Candle[],
  _config?: IndicatorConfig
): IndicatorResult {
  const period = 14;
  const midline = 50;

  const closes = candles.map((c) => c.close);
  const rsiValues = RSI.calculate({ period, values: closes });

  if (rsiValues.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const currentRSI = rsiValues[rsiValues.length - 1]!;
  const prevRSI = rsiValues[rsiValues.length - 2]!;

  // Long: RSI crosses above 50
  if (prevRSI <= midline && currentRSI > midline) {
    return { signal: "LONG", metadata: { rsi: currentRSI } };
  }

  // Short: RSI crosses below 50
  if (prevRSI >= midline && currentRSI < midline) {
    return { signal: "SHORT", metadata: { rsi: currentRSI } };
  }

  return { signal: "NEUTRAL", metadata: { rsi: currentRSI } };
}

// ==========================================
// Bollinger Bands (20, 2) - Mean Reversion Strategy
// PRD 3.6: Long when close below lower band, Short when close above upper band
// ==========================================

export function bollingerBands(
  candles: Candle[],
  _config?: IndicatorConfig
): IndicatorResult {
  const period = 20;
  const stdDev = 2;

  const closes = candles.map((c) => c.close);
  const bbResult = BollingerBands.calculate({ period, values: closes, stdDev });

  if (bbResult.length < 1) {
    return { signal: "NEUTRAL" };
  }

  const current = bbResult[bbResult.length - 1]!;
  const currentClose = closes[closes.length - 1]!;
  const prevClose = closes[closes.length - 2]!;

  // Mean Reversion: Detect cross into oversold/overbought zones
  // Long: price crosses BELOW lower band (entering oversold territory)
  if (prevClose > current.lower! && currentClose <= current.lower!) {
    return {
      signal: "LONG",
      metadata: { upper: current.upper, middle: current.middle, lower: current.lower },
    };
  }

  // Short: price crosses ABOVE upper band (entering overbought territory)
  if (prevClose < current.upper! && currentClose >= current.upper!) {
    return {
      signal: "SHORT",
      metadata: { upper: current.upper, middle: current.middle, lower: current.lower },
    };
  }

  return {
    signal: "NEUTRAL",
    metadata: { upper: current.upper, middle: current.middle, lower: current.lower },
  };
}

// ==========================================
// Indicator Registry & Dispatcher
// ==========================================

type IndicatorFn = (candles: Candle[], config?: IndicatorConfig) => IndicatorResult;

export const indicatorRegistry: Record<string, IndicatorFn> = {
  ema_crossover: emaCrossover,
  macd,
  supertrend,
  rsi_70_30: rsi7030,
  rsi_50_cross: rsi50Cross,
  bollinger: bollingerBands,
};

/**
 * Run a single indicator by name.
 */
export function runIndicator(
  name: string,
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const fn = indicatorRegistry[name];
  if (!fn) {
    throw new Error(`Unknown indicator: ${name}`);
  }
  return fn(candles, config);
}

/**
 * Run all active indicators in parallel.
 */
export async function runAllIndicators(
  candles: Candle[],
  activeIndicators: IndicatorConfig[]
): Promise<Map<string, IndicatorResult>> {
  const results = new Map<string, IndicatorResult>();

  const promises = activeIndicators.map(async (indicator) => {
    try {
      const result = runIndicator(indicator.name, candles, indicator);
      results.set(indicator.name, result);
    } catch (error) {
      console.error(`Error running indicator ${indicator.name}:`, error);
      results.set(indicator.name, { signal: "NEUTRAL", metadata: { error: String(error) } });
    }
  });

  await Promise.allSettled(promises);

  return results;
}
