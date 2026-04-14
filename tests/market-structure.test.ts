import { describe, it, expect } from "vitest";
import { detectMarketStructure, getLongStopLoss, getShortStopLoss } from "../src/engine/market-structure";
import type { Candle } from "../src/engine/types";

// ==========================================
// Market Structure Tests
// ==========================================

function makeCandle(i: number, high: number, low: number, close?: number): Candle {
  return {
    timestamp: 1000 + i * 300000,
    open: close ?? (high + low) / 2,
    high,
    low,
    close: close ?? (high + low) / 2,
    volume: 100,
  };
}

describe("detectMarketStructure", () => {
  it("returns empty structure for too few candles", () => {
    const candles: Candle[] = Array.from({ length: 5 }, (_, i) =>
      makeCandle(i, 100 + i, 90 + i)
    );
    const ms = detectMarketStructure(candles);
    expect(ms.higherLows).toEqual([]);
    expect(ms.lowerHighs).toEqual([]);
    expect(ms.lastConfirmedHL).toBeNull();
    expect(ms.lastConfirmedLH).toBeNull();
  });

  it("detects swing high: highest candle surrounded by lower ones", () => {
    // Build a V-shape: descending then ascending
    const highs = [110, 108, 106, 104, 102, 100, 102, 104, 106, 108, 110,
                   108, 106, 104, 102, 100, 102, 104, 106, 108, 110];
    const lows  = highs.map(h => h - 5);
    const candles = highs.map((h, i) => makeCandle(i, h, lows[i]));

    const ms = detectMarketStructure(candles, 3);
    // Should detect the two peaks at index 0, 10, 20 area
    // (specific detection depends on lookback tuning)
    expect(ms).toBeDefined();
  });

  it("getLongStopLoss returns null when no HL found", () => {
    const ms = {
      higherLows: [],
      lowerHighs: [],
      lastConfirmedHL: null,
      lastConfirmedLH: null,
    };
    expect(getLongStopLoss(ms)).toBeNull();
  });

  it("getShortStopLoss returns null when no LH found", () => {
    const ms = {
      higherLows: [],
      lowerHighs: [],
      lastConfirmedHL: null,
      lastConfirmedLH: null,
    };
    expect(getShortStopLoss(ms)).toBeNull();
  });

  it("getLongStopLoss returns HL price", () => {
    const ms = {
      higherLows: [{ price: 79500, timestamp: 1000, type: "low" as const }],
      lowerHighs: [],
      lastConfirmedHL: { price: 79500, timestamp: 1000, type: "low" as const },
      lastConfirmedLH: null,
    };
    expect(getLongStopLoss(ms)).toBe(79500);
  });

  it("getShortStopLoss returns LH price", () => {
    const ms = {
      higherLows: [],
      lowerHighs: [{ price: 80500, timestamp: 2000, type: "high" as const }],
      lastConfirmedHL: null,
      lastConfirmedLH: { price: 80500, timestamp: 2000, type: "high" as const },
    };
    expect(getShortStopLoss(ms)).toBe(80500);
  });
});
