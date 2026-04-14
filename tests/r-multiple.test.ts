import { describe, it, expect } from "vitest";
import { PaperTradingEngine } from "../src/engine/paper-trading-engine";

// ==========================================
// R-Multiple Calculation Tests
//
// R-Multiple = PnL / dollarRisk
// dollarRisk = (|entry - SL| / entry) × size × leverage
// ==========================================

describe("R-Multiple Calculation", () => {
  const engine = new PaperTradingEngine();

  function calculateRMultiple(
    side: "long" | "short",
    entryPrice: number,
    exitPrice: number,
    stopLoss: number,
    size: number,
    leverage: number
  ): number {
    const pnl = engine.calculatePnL(side, entryPrice, exitPrice, size, leverage);
    const risk = Math.abs(entryPrice - stopLoss);
    const dollarRisk = entryPrice > 0
      ? (risk / entryPrice) * size * leverage
      : 0;
    return dollarRisk > 0 ? pnl / dollarRisk : 0;
  }

  it("LONG TP hit at RR 1:2 → R = +2.0", () => {
    // Entry $80,000, SL $79,600 (risk $400)
    // TP = $80,000 + 2 × $400 = $80,800
    const r = calculateRMultiple("long", 80000, 80800, 79600, 5, 5);
    expect(r).toBeCloseTo(2.0, 2);
  });

  it("LONG SL hit → R = -1.0", () => {
    // Entry $80,000, SL $79,600 (risk $400), exit at SL
    const r = calculateRMultiple("long", 80000, 79600, 79600, 5, 5);
    expect(r).toBeCloseTo(-1.0, 2);
  });

  it("SHORT TP hit at RR 1:2 → R = +2.0", () => {
    // Entry $80,000, SL $80,400 (risk $400)
    // TP = $80,000 - 2 × $400 = $79,200
    const r = calculateRMultiple("short", 80000, 79200, 80400, 5, 5);
    expect(r).toBeCloseTo(2.0, 2);
  });

  it("SHORT SL hit → R = -1.0", () => {
    // Entry $80,000, SL $80,400, exit at SL
    const r = calculateRMultiple("short", 80000, 80400, 80400, 5, 5);
    expect(r).toBeCloseTo(-1.0, 2);
  });

  it("break-even → R = 0", () => {
    const r = calculateRMultiple("long", 80000, 80000, 79600, 5, 5);
    expect(r).toBe(0);
  });

  it("LONG reverse at minor loss → R between -1 and 0", () => {
    // Entry $80,000, SL $79,600, exit $79,800 (half way to SL)
    const r = calculateRMultiple("long", 80000, 79800, 79600, 5, 5);
    expect(r).toBeCloseTo(-0.5, 2);
  });
});
