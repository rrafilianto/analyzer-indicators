import { EMA, MACD, RSI, BollingerBands, ATR, ADX } from "technicalindicators";
import type { Candle, IndicatorConfig, IndicatorResult, Signal } from "../../engine/types";

function getConfigNumber(
  config: IndicatorConfig | undefined,
  key: string,
  fallback: number
): number {
  const raw = config?.config?.[key];
  if (typeof raw !== "number" || Number.isNaN(raw) || !Number.isFinite(raw)) {
    return fallback;
  }
  return raw;
}

function getLatestAdx(candles: Candle[], adxPeriod: number): number | null {
  const adxValues = ADX.calculate({
    period: adxPeriod,
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
  });
  if (adxValues.length === 0) return null;
  return adxValues[adxValues.length - 1]!.adx;
}

// ==========================================
// EMA Crossover (9 / 21)
// ==========================================

export function emaCrossover(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const fastPeriod = Math.max(1, Math.floor(getConfigNumber(config, "fast_period", 9)));
  const slowPeriod = Math.max(1, Math.floor(getConfigNumber(config, "slow_period", 21)));

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
// EMA Crossover V2 (9 / 21 + ADX filter)
// ==========================================

export function emaCrossoverV2(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const fastPeriod = Math.max(1, Math.floor(getConfigNumber(config, "fast_period", 9)));
  const slowPeriod = Math.max(1, Math.floor(getConfigNumber(config, "slow_period", 21)));
  const adxPeriod = Math.max(1, Math.floor(getConfigNumber(config, "adx_period", 14)));
  const adxThreshold = getConfigNumber(config, "adx_threshold", 20);
  const enableAdxFilter = getConfigNumber(config, "enable_adx_filter", 1) > 0;

  const fastEMA = EMA.calculate({ period: fastPeriod, values: closes });
  const slowEMA = EMA.calculate({ period: slowPeriod, values: closes });

  if (fastEMA.length < 2 || slowEMA.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const fastCurrent = fastEMA[fastEMA.length - 1]!;
  const fastPrev = fastEMA[fastEMA.length - 2]!;
  const slowCurrent = slowEMA[slowEMA.length - 1]!;
  const slowPrev = slowEMA[slowEMA.length - 2]!;

  // Base crossover signal
  let baseSignal: Signal = "NEUTRAL";
  if (fastPrev <= slowPrev && fastCurrent > slowCurrent) {
    baseSignal = "LONG";
  } else if (fastPrev >= slowPrev && fastCurrent < slowCurrent) {
    baseSignal = "SHORT";
  }

  // ADX filter (only gates directional entries)
  let currentAdx: number | null = null;
  if (enableAdxFilter && baseSignal !== "NEUTRAL") {
    const adxValues = ADX.calculate({
      period: adxPeriod,
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
    });

    if (adxValues.length > 0) {
      currentAdx = adxValues[adxValues.length - 1]!.adx;
      if (currentAdx < adxThreshold) {
        return {
          signal: "NEUTRAL",
          metadata: {
            fast: fastCurrent,
            slow: slowCurrent,
            adx: currentAdx,
            adxThreshold,
            adxFiltered: true,
            baseSignal,
          },
        };
      }
    } else {
      // Not enough ADX data yet -> do not allow directional entry.
      return {
        signal: "NEUTRAL",
        metadata: {
          fast: fastCurrent,
          slow: slowCurrent,
          adx: null,
          adxThreshold,
          adxFiltered: true,
          baseSignal,
        },
      };
    }
  }

  return {
    signal: baseSignal,
    metadata: {
      fast: fastCurrent,
      slow: slowCurrent,
      adx: currentAdx,
      adxThreshold,
      adxFiltered: false,
    },
  };
}

// ==========================================
// MACD (12, 26, 9)
// ==========================================

export function macd(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const fastPeriod = Math.max(1, Math.floor(getConfigNumber(config, "fast_period", 12)));
  const slowPeriod = Math.max(1, Math.floor(getConfigNumber(config, "slow_period", 26)));
  const signalPeriod = Math.max(1, Math.floor(getConfigNumber(config, "signal_period", 9)));

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
// MACD V2 (12, 26, 9 + ADX filter)
// ==========================================

export function macdV2(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const fastPeriod = Math.max(1, Math.floor(getConfigNumber(config, "fast_period", 12)));
  const slowPeriod = Math.max(1, Math.floor(getConfigNumber(config, "slow_period", 26)));
  const signalPeriod = Math.max(1, Math.floor(getConfigNumber(config, "signal_period", 9)));
  const adxPeriod = Math.max(1, Math.floor(getConfigNumber(config, "adx_period", 14)));
  const adxThreshold = getConfigNumber(config, "adx_threshold", 20);
  const enableAdxFilter = getConfigNumber(config, "enable_adx_filter", 1) > 0;

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

  let baseSignal: Signal = "NEUTRAL";
  if (prev.MACD! <= prev.signal! && current.MACD! > current.signal!) {
    baseSignal = "LONG";
  } else if (prev.MACD! >= prev.signal! && current.MACD! < current.signal!) {
    baseSignal = "SHORT";
  }

  let currentAdx: number | null = null;
  if (enableAdxFilter && baseSignal !== "NEUTRAL") {
    currentAdx = getLatestAdx(candles, adxPeriod);
    if (currentAdx === null || currentAdx < adxThreshold) {
      return {
        signal: "NEUTRAL",
        metadata: {
          macd: current.MACD,
          signal: current.signal,
          adx: currentAdx,
          adxThreshold,
          adxFiltered: true,
          baseSignal,
        },
      };
    }
  }

  return {
    signal: baseSignal,
    metadata: {
      macd: current.MACD,
      signal: current.signal,
      adx: currentAdx,
      adxThreshold,
      adxFiltered: false,
    },
  };
}

// ==========================================
// Supertrend (ATR 10, Multiplier 3)
// ==========================================

export function supertrend(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const atrPeriod = Math.max(1, Math.floor(getConfigNumber(config, "atr_period", 10)));
  const multiplier = Math.max(0.1, getConfigNumber(config, "multiplier", 3));

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
// Supertrend V2 (ATR 10, Multiplier 3 + ADX filter)
// ==========================================

export function supertrendV2(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const atrPeriod = Math.max(1, Math.floor(getConfigNumber(config, "atr_period", 10)));
  const multiplier = Math.max(0.1, getConfigNumber(config, "multiplier", 3));
  const adxPeriod = Math.max(1, Math.floor(getConfigNumber(config, "adx_period", 14)));
  const adxThreshold = getConfigNumber(config, "adx_threshold", 20);
  const enableAdxFilter = getConfigNumber(config, "enable_adx_filter", 1) > 0;

  if (candles.length < atrPeriod + 2) {
    return { signal: "NEUTRAL" };
  }

  const atrValues = ATR.calculate({
    period: atrPeriod,
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
  });

  const basicUpper: number[] = [];
  const basicLower: number[] = [];
  const finalUpper: number[] = [];
  const finalLower: number[] = [];
  const isUptrend: boolean[] = [];

  for (let i = 0; i < atrValues.length; i++) {
    const candleIndex = atrPeriod + i;
    const hl2 = (candles[candleIndex]!.high + candles[candleIndex]!.low) / 2;
    const atr = atrValues[i]!;
    basicUpper.push(hl2 + multiplier * atr);
    basicLower.push(hl2 - multiplier * atr);
  }

  for (let i = 0; i < basicUpper.length; i++) {
    const candleIndex = atrPeriod + i;
    if (i === 0) {
      finalUpper.push(basicUpper[i]!);
      finalLower.push(basicLower[i]!);
      isUptrend.push(candles[candleIndex]!.close >= finalLower[0]!);
    } else {
      const prevClose = candles[candleIndex - 1]!.close;
      if (basicUpper[i]! < finalUpper[i - 1]! || prevClose > finalUpper[i - 1]!) {
        finalUpper.push(basicUpper[i]!);
      } else {
        finalUpper.push(finalUpper[i - 1]!);
      }
      if (basicLower[i]! > finalLower[i - 1]! || prevClose < finalLower[i - 1]!) {
        finalLower.push(basicLower[i]!);
      } else {
        finalLower.push(finalLower[i - 1]!);
      }
      const currentClose = candles[candleIndex]!.close;
      if (isUptrend[i - 1]!) {
        isUptrend.push(currentClose >= finalLower[i]!);
      } else {
        isUptrend.push(currentClose > finalUpper[i]!);
      }
    }
  }

  if (isUptrend.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const prevUptrend = isUptrend[isUptrend.length - 2]!;
  const currentUptrend = isUptrend[isUptrend.length - 1]!;
  const currentClose = candles[candles.length - 1]!.close;
  const atr = atrValues[atrValues.length - 1]!;
  const finalIdx = finalUpper.length - 1;
  const supertrendValue = currentUptrend ? finalLower[finalIdx]! : finalUpper[finalIdx]!;

  let baseSignal: Signal = "NEUTRAL";
  if (!prevUptrend && currentUptrend) {
    baseSignal = "LONG";
  } else if (prevUptrend && !currentUptrend) {
    baseSignal = "SHORT";
  }

  let currentAdx: number | null = null;
  if (enableAdxFilter && baseSignal !== "NEUTRAL") {
    currentAdx = getLatestAdx(candles, adxPeriod);
    if (currentAdx === null || currentAdx < adxThreshold) {
      return {
        signal: "NEUTRAL",
        metadata: {
          supertrend: supertrendValue,
          trend: currentUptrend ? "UP" : "DOWN",
          close: currentClose,
          atr,
          adx: currentAdx,
          adxThreshold,
          adxFiltered: true,
          baseSignal,
        },
      };
    }
  }

  return {
    signal: baseSignal,
    metadata: {
      supertrend: supertrendValue,
      trend: currentUptrend ? "UP" : "DOWN",
      close: currentClose,
      atr,
      adx: currentAdx,
      adxThreshold,
      adxFiltered: false,
    },
  };
}

// ==========================================
// RSI 70/30 (Oversold/Overbought)
// ==========================================

export function rsi7030(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 14)));
  const overbought = getConfigNumber(config, "overbought", 70);
  const oversold = getConfigNumber(config, "oversold", 30);

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
// RSI 70/30 + ADX filter
// ==========================================

export function rsi7030Adx(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 14)));
  const overbought = getConfigNumber(config, "overbought", 70);
  const oversold = getConfigNumber(config, "oversold", 30);
  const adxPeriod = Math.max(1, Math.floor(getConfigNumber(config, "adx_period", 14)));
  const adxThreshold = getConfigNumber(config, "adx_threshold", 20);
  const enableAdxFilter = getConfigNumber(config, "enable_adx_filter", 1) > 0;

  const closes = candles.map((c) => c.close);
  const rsiValues = RSI.calculate({ period, values: closes });

  if (rsiValues.length < 1) {
    return { signal: "NEUTRAL" };
  }

  const currentRSI = rsiValues[rsiValues.length - 1]!;
  let baseSignal: Signal = "NEUTRAL";
  if (currentRSI < oversold) {
    baseSignal = "LONG";
  } else if (currentRSI > overbought) {
    baseSignal = "SHORT";
  }

  let currentAdx: number | null = null;
  if (enableAdxFilter && baseSignal !== "NEUTRAL") {
    currentAdx = getLatestAdx(candles, adxPeriod);
    if (currentAdx === null || currentAdx < adxThreshold) {
      return {
        signal: "NEUTRAL",
        metadata: {
          rsi: currentRSI,
          adx: currentAdx,
          adxThreshold,
          adxFiltered: true,
          baseSignal,
        },
      };
    }
  }

  return {
    signal: baseSignal,
    metadata: {
      rsi: currentRSI,
      adx: currentAdx,
      adxThreshold,
      adxFiltered: false,
    },
  };
}

// ==========================================
// RSI 70/30 V2 (Cross-based trigger)
// ==========================================

export function rsi7030V2(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 14)));
  const overbought = getConfigNumber(config, "overbought", 70);
  const oversold = getConfigNumber(config, "oversold", 30);

  const closes = candles.map((c) => c.close);
  const rsiValues = RSI.calculate({ period, values: closes });

  if (rsiValues.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const prevRSI = rsiValues[rsiValues.length - 2]!;
  const currentRSI = rsiValues[rsiValues.length - 1]!;

  // Cross-based entry into extreme zones:
  // LONG when RSI crosses down into oversold zone.
  if (prevRSI >= oversold && currentRSI < oversold) {
    return { signal: "LONG", metadata: { rsi: currentRSI, prevRsi: prevRSI } };
  }

  // SHORT when RSI crosses up into overbought zone.
  if (prevRSI <= overbought && currentRSI > overbought) {
    return { signal: "SHORT", metadata: { rsi: currentRSI, prevRsi: prevRSI } };
  }

  return { signal: "NEUTRAL", metadata: { rsi: currentRSI, prevRsi: prevRSI } };
}

// ==========================================
// RSI 70/30 V2 + ADX filter
// ==========================================

export function rsi7030V2Adx(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 14)));
  const overbought = getConfigNumber(config, "overbought", 70);
  const oversold = getConfigNumber(config, "oversold", 30);
  const adxPeriod = Math.max(1, Math.floor(getConfigNumber(config, "adx_period", 14)));
  const adxThreshold = getConfigNumber(config, "adx_threshold", 20);
  const enableAdxFilter = getConfigNumber(config, "enable_adx_filter", 1) > 0;

  const closes = candles.map((c) => c.close);
  const rsiValues = RSI.calculate({ period, values: closes });

  if (rsiValues.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const prevRSI = rsiValues[rsiValues.length - 2]!;
  const currentRSI = rsiValues[rsiValues.length - 1]!;
  let baseSignal: Signal = "NEUTRAL";

  if (prevRSI >= oversold && currentRSI < oversold) {
    baseSignal = "LONG";
  } else if (prevRSI <= overbought && currentRSI > overbought) {
    baseSignal = "SHORT";
  }

  let currentAdx: number | null = null;
  if (enableAdxFilter && baseSignal !== "NEUTRAL") {
    currentAdx = getLatestAdx(candles, adxPeriod);
    if (currentAdx === null || currentAdx < adxThreshold) {
      return {
        signal: "NEUTRAL",
        metadata: {
          rsi: currentRSI,
          prevRsi: prevRSI,
          adx: currentAdx,
          adxThreshold,
          adxFiltered: true,
          baseSignal,
        },
      };
    }
  }

  return {
    signal: baseSignal,
    metadata: {
      rsi: currentRSI,
      prevRsi: prevRSI,
      adx: currentAdx,
      adxThreshold,
      adxFiltered: false,
    },
  };
}

// ==========================================
// RSI 50 Cross (Midline Crossover)
// ==========================================

export function rsi50Cross(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 14)));
  const midline = getConfigNumber(config, "midline", 50);

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
// RSI 50 Cross + ADX filter
// ==========================================

export function rsi50CrossAdx(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 14)));
  const midline = getConfigNumber(config, "midline", 50);
  const adxPeriod = Math.max(1, Math.floor(getConfigNumber(config, "adx_period", 14)));
  const adxThreshold = getConfigNumber(config, "adx_threshold", 20);
  const enableAdxFilter = getConfigNumber(config, "enable_adx_filter", 1) > 0;

  const closes = candles.map((c) => c.close);
  const rsiValues = RSI.calculate({ period, values: closes });

  if (rsiValues.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const currentRSI = rsiValues[rsiValues.length - 1]!;
  const prevRSI = rsiValues[rsiValues.length - 2]!;
  let baseSignal: Signal = "NEUTRAL";
  if (prevRSI <= midline && currentRSI > midline) {
    baseSignal = "LONG";
  } else if (prevRSI >= midline && currentRSI < midline) {
    baseSignal = "SHORT";
  }

  let currentAdx: number | null = null;
  if (enableAdxFilter && baseSignal !== "NEUTRAL") {
    currentAdx = getLatestAdx(candles, adxPeriod);
    if (currentAdx === null || currentAdx < adxThreshold) {
      return {
        signal: "NEUTRAL",
        metadata: {
          rsi: currentRSI,
          adx: currentAdx,
          adxThreshold,
          adxFiltered: true,
          baseSignal,
        },
      };
    }
  }

  return {
    signal: baseSignal,
    metadata: {
      rsi: currentRSI,
      adx: currentAdx,
      adxThreshold,
      adxFiltered: false,
    },
  };
}

// ==========================================
// Bollinger Bands (20, 2) - Mean Reversion Strategy
// PRD 3.6: Long when close below lower band, Short when close above upper band
// ==========================================

export function bollingerBands(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 20)));
  const stdDev = Math.max(0.1, getConfigNumber(config, "std_dev", 2));

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
// Bollinger Bands + ADX filter
// ==========================================

export function bollingerBandsAdx(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 20)));
  const stdDev = Math.max(0.1, getConfigNumber(config, "std_dev", 2));
  const adxPeriod = Math.max(1, Math.floor(getConfigNumber(config, "adx_period", 14)));
  const adxThreshold = getConfigNumber(config, "adx_threshold", 20);
  const enableAdxFilter = getConfigNumber(config, "enable_adx_filter", 1) > 0;

  const closes = candles.map((c) => c.close);
  const bbResult = BollingerBands.calculate({ period, values: closes, stdDev });

  if (bbResult.length < 1 || closes.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const current = bbResult[bbResult.length - 1]!;
  const currentClose = closes[closes.length - 1]!;
  const prevClose = closes[closes.length - 2]!;

  let baseSignal: Signal = "NEUTRAL";
  if (prevClose > current.lower! && currentClose <= current.lower!) {
    baseSignal = "LONG";
  } else if (prevClose < current.upper! && currentClose >= current.upper!) {
    baseSignal = "SHORT";
  }

  let currentAdx: number | null = null;
  if (enableAdxFilter && baseSignal !== "NEUTRAL") {
    currentAdx = getLatestAdx(candles, adxPeriod);
    if (currentAdx === null || currentAdx < adxThreshold) {
      return {
        signal: "NEUTRAL",
        metadata: {
          upper: current.upper,
          middle: current.middle,
          lower: current.lower,
          adx: currentAdx,
          adxThreshold,
          adxFiltered: true,
          baseSignal,
        },
      };
    }
  }

  return {
    signal: baseSignal,
    metadata: {
      upper: current.upper,
      middle: current.middle,
      lower: current.lower,
      adx: currentAdx,
      adxThreshold,
      adxFiltered: false,
    },
  };
}

// ==========================================
// Bollinger Bands V2 (20, 2) - Mean Reversion Strategy
// Fix: use previous band for previous close comparison
// ==========================================

export function bollingerBandsV2(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 20)));
  const stdDev = Math.max(0.1, getConfigNumber(config, "std_dev", 2));

  const closes = candles.map((c) => c.close);
  const bbResult = BollingerBands.calculate({ period, values: closes, stdDev });

  if (bbResult.length < 2 || closes.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const current = bbResult[bbResult.length - 1]!;
  const prev = bbResult[bbResult.length - 2]!;
  const currentClose = closes[closes.length - 1]!;
  const prevClose = closes[closes.length - 2]!;

  // Mean Reversion: detect cross into oversold/overbought zones using matching band timestamps.
  // Long: previous close above previous lower band, then current close below/equal current lower band.
  if (prevClose > prev.lower! && currentClose <= current.lower!) {
    return {
      signal: "LONG",
      metadata: {
        upper: current.upper,
        middle: current.middle,
        lower: current.lower,
        prevUpper: prev.upper,
        prevMiddle: prev.middle,
        prevLower: prev.lower,
      },
    };
  }

  // Short: previous close below previous upper band, then current close above/equal current upper band.
  if (prevClose < prev.upper! && currentClose >= current.upper!) {
    return {
      signal: "SHORT",
      metadata: {
        upper: current.upper,
        middle: current.middle,
        lower: current.lower,
        prevUpper: prev.upper,
        prevMiddle: prev.middle,
        prevLower: prev.lower,
      },
    };
  }

  return {
    signal: "NEUTRAL",
    metadata: {
      upper: current.upper,
      middle: current.middle,
      lower: current.lower,
      prevUpper: prev.upper,
      prevMiddle: prev.middle,
      prevLower: prev.lower,
    },
  };
}

// ==========================================
// Bollinger Bands V2 + ADX filter
// ==========================================

export function bollingerBandsV2Adx(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(1, Math.floor(getConfigNumber(config, "period", 20)));
  const stdDev = Math.max(0.1, getConfigNumber(config, "std_dev", 2));
  const adxPeriod = Math.max(1, Math.floor(getConfigNumber(config, "adx_period", 14)));
  const adxThreshold = getConfigNumber(config, "adx_threshold", 20);
  const enableAdxFilter = getConfigNumber(config, "enable_adx_filter", 1) > 0;

  const closes = candles.map((c) => c.close);
  const bbResult = BollingerBands.calculate({ period, values: closes, stdDev });

  if (bbResult.length < 2 || closes.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const current = bbResult[bbResult.length - 1]!;
  const prev = bbResult[bbResult.length - 2]!;
  const currentClose = closes[closes.length - 1]!;
  const prevClose = closes[closes.length - 2]!;
  let baseSignal: Signal = "NEUTRAL";

  if (prevClose > prev.lower! && currentClose <= current.lower!) {
    baseSignal = "LONG";
  } else if (prevClose < prev.upper! && currentClose >= current.upper!) {
    baseSignal = "SHORT";
  }

  let currentAdx: number | null = null;
  if (enableAdxFilter && baseSignal !== "NEUTRAL") {
    currentAdx = getLatestAdx(candles, adxPeriod);
    if (currentAdx === null || currentAdx < adxThreshold) {
      return {
        signal: "NEUTRAL",
        metadata: {
          upper: current.upper,
          middle: current.middle,
          lower: current.lower,
          prevUpper: prev.upper,
          prevMiddle: prev.middle,
          prevLower: prev.lower,
          adx: currentAdx,
          adxThreshold,
          adxFiltered: true,
          baseSignal,
        },
      };
    }
  }

  return {
    signal: baseSignal,
    metadata: {
      upper: current.upper,
      middle: current.middle,
      lower: current.lower,
      prevUpper: prev.upper,
      prevMiddle: prev.middle,
      prevLower: prev.lower,
      adx: currentAdx,
      adxThreshold,
      adxFiltered: false,
    },
  };
}

// ==========================================
// Donchian Breakout (N-channel)
// ==========================================

export function donchian(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const period = Math.max(2, Math.floor(getConfigNumber(config, "period", 20)));
  const breakoutBufferPct = Math.max(0, getConfigNumber(config, "breakout_buffer_pct", 0));
  const useCloseConfirmation = getConfigNumber(config, "use_close_confirmation", 1) > 0;

  if (candles.length < period + 1) {
    return { signal: "NEUTRAL" };
  }

  const current = candles[candles.length - 1]!;
  const lookback = candles.slice(candles.length - period - 1, candles.length - 1);
  const upper = Math.max(...lookback.map((c) => c.high));
  const lower = Math.min(...lookback.map((c) => c.low));
  const upperBreak = upper * (1 + breakoutBufferPct / 100);
  const lowerBreak = lower * (1 - breakoutBufferPct / 100);

  const longTriggered = useCloseConfirmation
    ? current.close > upperBreak
    : current.high > upperBreak;

  if (longTriggered) {
    return {
      signal: "LONG",
      metadata: {
        upper,
        lower,
        upperBreak,
        lowerBreak,
        period,
        breakoutBufferPct,
        useCloseConfirmation,
      },
    };
  }

  const shortTriggered = useCloseConfirmation
    ? current.close < lowerBreak
    : current.low < lowerBreak;

  if (shortTriggered) {
    return {
      signal: "SHORT",
      metadata: {
        upper,
        lower,
        upperBreak,
        lowerBreak,
        period,
        breakoutBufferPct,
        useCloseConfirmation,
      },
    };
  }

  return {
    signal: "NEUTRAL",
    metadata: {
      upper,
      lower,
      upperBreak,
      lowerBreak,
      period,
      breakoutBufferPct,
      useCloseConfirmation,
    },
  };
}

// ==========================================
// VWAP Bias + Pullback (session anchored)
// ==========================================

export function vwapBiasPullback(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const pullbackBps = Math.max(0, getConfigNumber(config, "pullback_bps", 10));
  const reclaimBps = Math.max(0, getConfigNumber(config, "reclaim_bps", 0));
  const useCloseConfirmation = getConfigNumber(config, "use_close_confirmation", 1) > 0;

  if (candles.length < 2) {
    return { signal: "NEUTRAL" };
  }

  // Session-anchored VWAP (reset at UTC day boundary)
  const latestTs = candles[candles.length - 1]!.timestamp;
  const latestDate = new Date(latestTs).toISOString().slice(0, 10);
  const sessionCandles = candles.filter(
    (c) => new Date(c.timestamp).toISOString().slice(0, 10) === latestDate
  );

  if (sessionCandles.length < 2) {
    return { signal: "NEUTRAL" };
  }

  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const c of sessionCandles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
  }

  if (cumulativeVolume <= 0) {
    return { signal: "NEUTRAL" };
  }

  const vwap = cumulativePV / cumulativeVolume;
  const prev = sessionCandles[sessionCandles.length - 2]!;
  const current = sessionCandles[sessionCandles.length - 1]!;
  const pullbackPct = pullbackBps / 10000;
  const reclaimPct = reclaimBps / 10000;
  const belowPullback = vwap * (1 - pullbackPct);
  const abovePullback = vwap * (1 + pullbackPct);
  const reclaimLongLevel = vwap * (1 + reclaimPct);
  const reclaimShortLevel = vwap * (1 - reclaimPct);

  // LONG: bias above VWAP + prior pullback below VWAP zone + reclaim back above VWAP zone.
  const longSignal = useCloseConfirmation
    ? prev.close <= belowPullback && current.close >= reclaimLongLevel
    : prev.low <= belowPullback && current.high >= reclaimLongLevel;

  if (longSignal) {
    return {
      signal: "LONG",
      metadata: {
        vwap,
        pullbackBps,
        reclaimBps,
        useCloseConfirmation,
        prevClose: prev.close,
        currentClose: current.close,
      },
    };
  }

  // SHORT: bias below VWAP + prior pullback above VWAP zone + reclaim back below VWAP zone.
  const shortSignal = useCloseConfirmation
    ? prev.close >= abovePullback && current.close <= reclaimShortLevel
    : prev.high >= abovePullback && current.low <= reclaimShortLevel;

  if (shortSignal) {
    return {
      signal: "SHORT",
      metadata: {
        vwap,
        pullbackBps,
        reclaimBps,
        useCloseConfirmation,
        prevClose: prev.close,
        currentClose: current.close,
      },
    };
  }

  return {
    signal: "NEUTRAL",
    metadata: {
      vwap,
      pullbackBps,
      reclaimBps,
      useCloseConfirmation,
      prevClose: prev.close,
      currentClose: current.close,
    },
  };
}

// ==========================================
// VWAP Cross (session anchored)
// ==========================================

export function vwapCross(
  candles: Candle[],
  config?: IndicatorConfig
): IndicatorResult {
  const useCloseConfirmation = getConfigNumber(config, "use_close_confirmation", 1) > 0;

  if (candles.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const latestTs = candles[candles.length - 1]!.timestamp;
  const latestDate = new Date(latestTs).toISOString().slice(0, 10);
  const sessionCandles = candles.filter(
    (c) => new Date(c.timestamp).toISOString().slice(0, 10) === latestDate
  );

  if (sessionCandles.length < 2) {
    return { signal: "NEUTRAL" };
  }

  const vwapSeries: number[] = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const c of sessionCandles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
    if (cumulativeVolume <= 0) {
      vwapSeries.push(c.close);
    } else {
      vwapSeries.push(cumulativePV / cumulativeVolume);
    }
  }

  const prev = sessionCandles[sessionCandles.length - 2]!;
  const current = sessionCandles[sessionCandles.length - 1]!;
  const prevVwap = vwapSeries[vwapSeries.length - 2]!;
  const currentVwap = vwapSeries[vwapSeries.length - 1]!;

  const prevPrice = useCloseConfirmation ? prev.close : ((prev.high + prev.low) / 2);
  const currentPrice = useCloseConfirmation ? current.close : ((current.high + current.low) / 2);

  if (prevPrice <= prevVwap && currentPrice > currentVwap) {
    return {
      signal: "LONG",
      metadata: {
        prevPrice,
        currentPrice,
        prevVwap,
        currentVwap,
        useCloseConfirmation,
      },
    };
  }

  if (prevPrice >= prevVwap && currentPrice < currentVwap) {
    return {
      signal: "SHORT",
      metadata: {
        prevPrice,
        currentPrice,
        prevVwap,
        currentVwap,
        useCloseConfirmation,
      },
    };
  }

  return {
    signal: "NEUTRAL",
    metadata: {
      prevPrice,
      currentPrice,
      prevVwap,
      currentVwap,
      useCloseConfirmation,
    },
  };
}

// ==========================================
// Indicator Registry & Dispatcher
// ==========================================

type IndicatorFn = (candles: Candle[], config?: IndicatorConfig) => IndicatorResult;

export const indicatorRegistry: Record<string, IndicatorFn> = {
  ema_crossover: emaCrossover,
  ema_crossover_v2: emaCrossoverV2,
  macd,
  macd_v2: macdV2,
  supertrend,
  supertrend_v2: supertrendV2,
  rsi_70_30: rsi7030,
  rsi_70_30_adx: rsi7030Adx,
  rsi_70_30_v2: rsi7030V2,
  rsi_70_30_v2_adx: rsi7030V2Adx,
  rsi_50_cross: rsi50Cross,
  rsi_50_cross_adx: rsi50CrossAdx,
  bollinger: bollingerBands,
  bollinger_adx: bollingerBandsAdx,
  bollinger_v2: bollingerBandsV2,
  bollinger_v2_adx: bollingerBandsV2Adx,
  donchian,
  vwap: vwapBiasPullback,
  vwap_cross: vwapCross,
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
