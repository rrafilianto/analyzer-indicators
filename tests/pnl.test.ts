import { describe, it, expect } from "vitest";
import { PaperTradingEngine } from "../src/engine/paper-trading-engine";

// ==========================================
// PnL Calculation Tests
// ==========================================

describe("PaperTradingEngine.calculatePnL", () => {
  const engine = new PaperTradingEngine();

  // ---- LONG positions ----

  it("LONG profit: BTC $80,000 → $80,800 ($5 × 5x)", () => {
    const pnl = engine.calculatePnL("long", 80000, 80800, 5, 5);
    // Expected: (800 / 80000) × 5 × 5 = 0.01 × 25 = $0.25
    expect(pnl).toBeCloseTo(0.25, 4);
  });

  it("LONG loss: BTC $80,000 → $79,600 ($5 × 5x)", () => {
    const pnl = engine.calculatePnL("long", 80000, 79600, 5, 5);
    // Expected: (-400 / 80000) × 5 × 5 = -0.005 × 25 = -$0.125
    expect(pnl).toBeCloseTo(-0.125, 4);
  });

  it("LONG break-even: same entry and exit", () => {
    const pnl = engine.calculatePnL("long", 75000, 75000, 5, 5);
    expect(pnl).toBe(0);
  });

  // ---- SHORT positions ----

  it("SHORT profit: BTC $80,000 → $79,200 ($5 × 5x)", () => {
    const pnl = engine.calculatePnL("short", 80000, 79200, 5, 5);
    // Expected: (800 / 80000) × 5 × 5 = 0.01 × 25 = $0.25
    expect(pnl).toBeCloseTo(0.25, 4);
  });

  it("SHORT loss: BTC $80,000 → $80,400 ($5 × 5x)", () => {
    const pnl = engine.calculatePnL("short", 80000, 80400, 5, 5);
    // Expected: (-400 / 80000) × 5 × 5 = -$0.125
    expect(pnl).toBeCloseTo(-0.125, 4);
  });

  it("SHORT break-even: same entry and exit", () => {
    const pnl = engine.calculatePnL("short", 75000, 75000, 5, 5);
    expect(pnl).toBe(0);
  });

  // ---- Edge cases ----

  it("returns 0 for entryPrice = 0", () => {
    const pnl = engine.calculatePnL("long", 0, 100, 5, 5);
    expect(pnl).toBe(0);
  });

  it("returns 0 for negative entryPrice", () => {
    const pnl = engine.calculatePnL("long", -100, 100, 5, 5);
    expect(pnl).toBe(0);
  });

  // ---- Realistic BTC scenarios ----

  it("realistic LONG: exactly how the old bug manifested", () => {
    // Old formula: (75268 - 75602.8) × 5 × 5 = -$8,370 (WRONG)
    // New formula: (-334.8 / 75602.8) × 5 × 5 ≈ -$0.1108
    const pnl = engine.calculatePnL("long", 75602.8, 75268, 5, 5);
    expect(pnl).toBeCloseTo(-0.1108, 3);
    expect(Math.abs(pnl)).toBeLessThan(1); // Sanity: PnL on $25 notional is < $1
  });

  it("realistic SHORT TP hit: entry $75,268, exit $73,508.2", () => {
    // priceDiff = 75268 - 73508.2 = 1759.8
    // PnL = (1759.8 / 75268) × 5 × 5 ≈ $0.5849
    const pnl = engine.calculatePnL("short", 75268, 73508.2, 5, 5);
    expect(pnl).toBeCloseTo(0.5849, 3);
  });

  it("PnL scales linearly with size", () => {
    const pnl1 = engine.calculatePnL("long", 80000, 80800, 5, 5);
    const pnl2 = engine.calculatePnL("long", 80000, 80800, 10, 5);
    expect(pnl2).toBeCloseTo(pnl1 * 2, 6);
  });

  it("PnL scales linearly with leverage", () => {
    const pnl1 = engine.calculatePnL("long", 80000, 80800, 5, 5);
    const pnl2 = engine.calculatePnL("long", 80000, 80800, 5, 10);
    expect(pnl2).toBeCloseTo(pnl1 * 2, 6);
  });

  // ---- Max loss sanity check ----

  it("max loss capped near notional value ($25) for a 100% adverse move", () => {
    // Long: price drops to 0 → PnL = (0 - 80000) / 80000 × 5 × 5 = -$25
    const pnl = engine.calculatePnL("long", 80000, 0, 5, 5);
    expect(pnl).toBe(-25);
  });
});
