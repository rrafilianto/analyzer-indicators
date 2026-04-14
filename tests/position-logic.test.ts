import { describe, it, expect } from "vitest";

// ==========================================
// Position Logic Tests
//
// Tests for SL/TP calculation and TP/SL hit detection.
// ==========================================

const RISK_REWARD_RATIO = 2;

// ==========================================
// SL/TP Calculation
// ==========================================

describe("SL/TP Calculation", () => {
  it("LONG: TP is above entry by 2× risk", () => {
    const entry = 80000;
    const sl = 79600; // risk = $400
    const risk = Math.abs(entry - sl);
    const tp = entry + RISK_REWARD_RATIO * risk;
    expect(tp).toBe(80800);
    expect(risk).toBe(400);
  });

  it("SHORT: TP is below entry by 2× risk", () => {
    const entry = 80000;
    const sl = 80400; // risk = $400
    const risk = Math.abs(entry - sl);
    const tp = entry - RISK_REWARD_RATIO * risk;
    expect(tp).toBe(79200);
  });

  it("LONG SL fallback: 0.5% below entry", () => {
    const entry = 80000;
    const fallbackSL = entry - entry * 0.005;
    expect(fallbackSL).toBe(79600);
  });

  it("SHORT SL fallback: 0.5% above entry", () => {
    const entry = 80000;
    const fallbackSL = entry + entry * 0.005;
    expect(fallbackSL).toBe(80400);
  });
});

// ==========================================
// TP/SL Hit Detection
// ==========================================

describe("TP/SL Hit Detection", () => {
  it("LONG TP hit: price >= take_profit", () => {
    const position = { side: "long", take_profit: 80800, stop_loss: 79600 };
    const currentPrice = 80800;
    const tpHit = currentPrice >= position.take_profit;
    const slHit = currentPrice <= position.stop_loss;
    expect(tpHit).toBe(true);
    expect(slHit).toBe(false);
  });

  it("LONG SL hit: price <= stop_loss", () => {
    const position = { side: "long", take_profit: 80800, stop_loss: 79600 };
    const currentPrice = 79600;
    const tpHit = currentPrice >= position.take_profit;
    const slHit = currentPrice <= position.stop_loss;
    expect(tpHit).toBe(false);
    expect(slHit).toBe(true);
  });

  it("SHORT TP hit: price <= take_profit", () => {
    const position = { side: "short", take_profit: 79200, stop_loss: 80400 };
    const currentPrice = 79200;
    const tpHit = currentPrice <= position.take_profit;
    const slHit = currentPrice >= position.stop_loss;
    expect(tpHit).toBe(true);
    expect(slHit).toBe(false);
  });

  it("SHORT SL hit: price >= stop_loss", () => {
    const position = { side: "short", take_profit: 79200, stop_loss: 80400 };
    const currentPrice = 80400;
    const tpHit = currentPrice <= position.take_profit;
    const slHit = currentPrice >= position.stop_loss;
    expect(tpHit).toBe(false);
    expect(slHit).toBe(true);
  });

  it("price between SL and TP: no trigger", () => {
    const position = { side: "long", take_profit: 80800, stop_loss: 79600 };
    const currentPrice = 80000;
    const tpHit = currentPrice >= position.take_profit;
    const slHit = currentPrice <= position.stop_loss;
    expect(tpHit).toBe(false);
    expect(slHit).toBe(false);
  });
});

// ==========================================
// Trailing SL Logic
// ==========================================

describe("Trailing SL Logic", () => {
  it("LONG: new HL > current SL → should update", () => {
    const currentSL = 79600;
    const newHL = 79800;
    const shouldUpdate = newHL > currentSL;
    expect(shouldUpdate).toBe(true);
  });

  it("LONG: new HL < current SL → should NOT update (never lower SL)", () => {
    const currentSL = 79600;
    const newHL = 79400;
    const shouldUpdate = newHL > currentSL;
    expect(shouldUpdate).toBe(false);
  });

  it("SHORT: new LH < current SL → should update", () => {
    const currentSL = 80400;
    const newLH = 80200;
    const shouldUpdate = newLH < currentSL;
    expect(shouldUpdate).toBe(true);
  });

  it("SHORT: new LH > current SL → should NOT update (never raise SL)", () => {
    const currentSL = 80400;
    const newLH = 80600;
    const shouldUpdate = newLH < currentSL;
    expect(shouldUpdate).toBe(false);
  });
});
