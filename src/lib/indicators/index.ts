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

  const atrValues = ATR.calculate({
    period: atrPeriod,
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
  });

  if (atrValues.length < 1) {
    return { signal: "NEUTRAL" };
  }

  // Calculate Supertrend manually
  const typicalPrices = candles.map((c) => (c.high + c.low + c.close) / 3);
  const atr = atrValues[atrValues.length - 1]!;
  const currentTP = typicalPrices[typicalPrices.length - 1]!;
  const prevTP = typicalPrices[typicalPrices.length - 2]!;
  const currentHigh = candles[candles.length - 1]!.high;
  const currentLow = candles[candles.length - 1]!.low;

  // Basic upper and lower bands
  const upperBand = currentTP + multiplier * atr;
  const lowerBand = currentTP - multiplier * atr;

  // For trend detection, compare current close to bands
  const prevCandle = candles[candles.length - 2]!;

  // Simple Supertrend signal: price crossing the bands
  // Long: close was below lower band, now above
  if (prevCandle.close <= lowerBand && candles[candles.length - 1]!.close > lowerBand) {
    return { signal: "LONG", metadata: { atr, lowerBand, upperBand } };
  }

  // Short: close was above upper band, now below
  if (prevCandle.close >= upperBand && candles[candles.length - 1]!.close < upperBand) {
    return { signal: "SHORT", metadata: { atr, lowerBand, upperBand } };
  }

  // Alternative: trend flip based on price position relative to center
  const centerBand = currentTP;
  const wasBelow = prevCandle.close < centerBand;
  const isAbove = candles[candles.length - 1]!.close > centerBand;
  const wasAbove = prevCandle.close > centerBand;
  const isBelow = candles[candles.length - 1]!.close < centerBand;

  if (wasBelow && isAbove) {
    return { signal: "LONG", metadata: { atr, centerBand } };
  }

  if (wasAbove && isBelow) {
    return { signal: "SHORT", metadata: { atr, centerBand } };
  }

  return { signal: "NEUTRAL", metadata: { atr, centerBand } };
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
// Bollinger Bands (20, 2)
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

  // Long: close was above lower band, now below (breakout below)
  if (prevClose > current.lower! && currentClose <= current.lower!) {
    return {
      signal: "LONG",
      metadata: { upper: current.upper, middle: current.middle, lower: current.lower },
    };
  }

  // Short: close was below upper band, now above (breakout above)
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
