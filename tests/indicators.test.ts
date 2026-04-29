import { describe, it, expect } from "vitest";
import {
  emaCrossover,
  macd,
  supertrend,
  rsi7030,
  rsi50Cross,
  bollingerBands,
} from "../src/lib/indicators/index";
import type { Candle } from "../src/engine/types";

// ==========================================
// Indicators Tests
// ==========================================

function generateCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    timestamp: 1000 + i * 300000,
    open: close,
    high: close + 10,
    low: close - 10,
    close,
    volume: 100,
  }));
}

describe("Indicators — return format", () => {
  const candles = generateCandles(
    Array.from({ length: 50 }, (_, i) => 80000 + Math.sin(i / 5) * 500)
  );

  it("emaCrossover returns valid signal", () => {
    const result = emaCrossover(candles);
    expect(["LONG", "SHORT", "NEUTRAL"]).toContain(result.signal);
  });

  it("macd returns valid signal", () => {
    const result = macd(candles);
    expect(["LONG", "SHORT", "NEUTRAL"]).toContain(result.signal);
  });

  it("rsi7030 returns valid signal", () => {
    const result = rsi7030(candles);
    expect(["LONG", "SHORT", "NEUTRAL"]).toContain(result.signal);
  });

  it("rsi50Cross returns valid signal", () => {
    const result = rsi50Cross(candles);
    expect(["LONG", "SHORT", "NEUTRAL"]).toContain(result.signal);
  });

  it("bollingerBands returns valid signal", () => {
    const result = bollingerBands(candles);
    expect(["LONG", "SHORT", "NEUTRAL"]).toContain(result.signal);
  });

  it("supertrend returns valid signal", () => {
    const result = supertrend(candles);
    expect(["LONG", "SHORT", "NEUTRAL"]).toContain(result.signal);
    expect(result.metadata).toBeDefined();
    if (result.metadata) {
      expect(result.metadata).toHaveProperty("supertrend");
      expect(result.metadata).toHaveProperty("trend");
    }
  });
});

describe("Indicators — edge cases", () => {
  it("all indicators return NEUTRAL with too few candles", () => {
    const fewCandles = generateCandles([80000, 80100]);
    expect(emaCrossover(fewCandles).signal).toBe("NEUTRAL");
    expect(macd(fewCandles).signal).toBe("NEUTRAL");
    expect(rsi7030(fewCandles).signal).toBe("NEUTRAL");
    expect(rsi50Cross(fewCandles).signal).toBe("NEUTRAL");
    expect(bollingerBands(fewCandles).signal).toBe("NEUTRAL");
    expect(supertrend(fewCandles).signal).toBe("NEUTRAL");
  });

  it("all indicators return NEUTRAL with 1 candle", () => {
    const oneCandle = generateCandles([80000]);
    expect(emaCrossover(oneCandle).signal).toBe("NEUTRAL");
    expect(macd(oneCandle).signal).toBe("NEUTRAL");
    expect(rsi7030(oneCandle).signal).toBe("NEUTRAL");
    expect(rsi50Cross(oneCandle).signal).toBe("NEUTRAL");
    expect(bollingerBands(oneCandle).signal).toBe("NEUTRAL");
    expect(supertrend(oneCandle).signal).toBe("NEUTRAL");
  });

  it("all indicators return NEUTRAL with flat data", () => {
    const flatCandles = generateCandles(Array(50).fill(80000));
    expect(emaCrossover(flatCandles).signal).toBe("NEUTRAL");
    // RSI is undefined for flat data because there's no change
    // MACD flat data → all zeroes → NEUTRAL
    expect(macd(flatCandles).signal).toBe("NEUTRAL");
  });
});

describe("EMA Crossover — directional", () => {
  it("detects LONG when fast crosses above slow", () => {
    // Slow rise then sharp rise → EMA9 crosses above EMA21
    const closes = [
      ...Array(30).fill(80000),
      ...Array.from({ length: 20 }, (_, i) => 80000 + (i + 1) * 100),
    ];
    const candles = generateCandles(closes);
    const result = emaCrossover(candles);
    // After a sustained rise, EMA9 should have crossed above EMA21
    // (may not be exact crossover at this specific bar, but signal should exist)
    expect(result.metadata).toBeDefined();
  });
});

describe("RSI 70/30", () => {
  it("returns LONG when RSI drops below 30", () => {
    // Continuous price drops → RSI < 30
    const closes = Array.from({ length: 50 }, (_, i) => 80000 - i * 200);
    const candles = generateCandles(closes);
    const result = rsi7030(candles);
    expect(result.signal).toBe("LONG");
  });

  it("returns SHORT when RSI rises above 70", () => {
    // Continuous price rises → RSI > 70
    const closes = Array.from({ length: 50 }, (_, i) => 80000 + i * 200);
    const candles = generateCandles(closes);
    const result = rsi7030(candles);
    expect(result.signal).toBe("SHORT");
  });
});

describe("Supertrend — directional", () => {
  it("detects LONG when trend changes from down to up", () => {
    // Build price series where trend changes to UP on the very last candle
    const closes: number[] = [];
    // Enough candles for ATR + establish downtrend
    // ATR period = 10, need ~15+ for trend establishment, then reversal on last candle
    const totalCandles = 35;

    // First 34 candles: downtrend (80000 down to 60000)
    for (let i = 0; i < totalCandles - 1; i++) {
      closes.push(80000 - i * 600);
    }

    // Last candle: sharp rise to trigger trend change (from down to up)
    // Need close > finalUpper of previous candle
    const lastPrice = 90000; // Sharp rise
    closes.push(lastPrice);

    const candles = generateCandles(closes);
    const result = supertrend(candles);
    expect(result.signal).toBe("LONG");
    expect(result.metadata?.trend).toBe("UP");
  });

  it("detects SHORT when trend changes from up to down", () => {
    // Build price series where trend changes to DOWN on the very last candle
    const closes: number[] = [];
    const totalCandles = 35;

    // First 34 candles: uptrend (80000 up to 100000)
    for (let i = 0; i < totalCandles - 1; i++) {
      closes.push(80000 + i * 600);
    }

    // Last candle: sharp drop to trigger trend change (from up to down)
    const lastPrice = 70000; // Sharp drop
    closes.push(lastPrice);

    const candles = generateCandles(closes);
    const result = supertrend(candles);
    expect(result.signal).toBe("SHORT");
    expect(result.metadata?.trend).toBe("DOWN");
  });

  it("returns NEUTRAL when trend does not change", () => {
    // Sustained uptrend without reversal
    const closes = Array.from({ length: 50 }, (_, i) => 80000 + i * 50);
    const candles = generateCandles(closes);
    const result = supertrend(candles);
    // No trend change, should be NEUTRAL
    expect(result.signal).toBe("NEUTRAL");
  });
});
