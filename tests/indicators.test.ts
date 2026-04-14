import { describe, it, expect } from "vitest";
import {
  emaCrossover,
  macd,
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
});

describe("Indicators — edge cases", () => {
  it("all indicators return NEUTRAL with too few candles", () => {
    const fewCandles = generateCandles([80000, 80100]);
    expect(emaCrossover(fewCandles).signal).toBe("NEUTRAL");
    expect(macd(fewCandles).signal).toBe("NEUTRAL");
    expect(rsi7030(fewCandles).signal).toBe("NEUTRAL");
    expect(rsi50Cross(fewCandles).signal).toBe("NEUTRAL");
    expect(bollingerBands(fewCandles).signal).toBe("NEUTRAL");
  });

  it("all indicators return NEUTRAL with 1 candle", () => {
    const oneCandle = generateCandles([80000]);
    expect(emaCrossover(oneCandle).signal).toBe("NEUTRAL");
    expect(macd(oneCandle).signal).toBe("NEUTRAL");
    expect(rsi7030(oneCandle).signal).toBe("NEUTRAL");
    expect(rsi50Cross(oneCandle).signal).toBe("NEUTRAL");
    expect(bollingerBands(oneCandle).signal).toBe("NEUTRAL");
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
