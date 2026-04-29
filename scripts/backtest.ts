import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { indicatorRegistry } from "../src/lib/indicators";
import { detectMarketStructure, getLongStopLoss, getShortStopLoss } from "../src/engine/market-structure";
import { PaperTradingEngine } from "../src/engine/paper-trading-engine";
import type { Candle, Signal } from "../src/engine/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Backtest Config ──────────────────────────────────────────────────────────
const INITIAL_BALANCE = 50;       // USD
const POSITION_SIZE   = 5;        // USD per trade
const LEVERAGE        = 20;       // multiplier
const TRADING_FEE     = 0.04;     // % per trade
const SLIPPAGE_BPS    = 0.0005;   // 0.05% slippage on SL & Reverse
const WARMUP_BARS     = 200;      // candles before signals are considered
const RISK_REWARD_RATIO = 2;      // TP = 2x Risk
// ─────────────────────────────────────────────────────────────────────────────

const DATA_FILE = path.join(__dirname, "../.data/BTCUSDT-15m.json");

// ANSI Colors
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", white: "\x1b[37m",
};
const colored = (text: string | number, color: string) => `${color}${text}${C.reset}`;

const engine = new PaperTradingEngine();

function calcSLTP(side: "long" | "short", currentPrice: number, marketStructure: any) {
  let stopLoss: number | null = side === "long" ? getLongStopLoss(marketStructure) : getShortStopLoss(marketStructure);

  if (stopLoss !== null) {
    if (side === "long" && stopLoss >= currentPrice) stopLoss = null;
    else if (side === "short" && stopLoss <= currentPrice) stopLoss = null;
  }

  if (!stopLoss) {
    const fallback = currentPrice * 0.005;
    stopLoss = side === "long" ? currentPrice - fallback : currentPrice + fallback;
  }

  const risk = Math.abs(currentPrice - stopLoss);
  const takeProfit = side === "long" ? currentPrice + RISK_REWARD_RATIO * risk : currentPrice - RISK_REWARD_RATIO * risk;

  return { stopLoss, takeProfit };
}

function backtestIndicator(name: string, candles: Candle[]) {
  let balance = INITIAL_BALANCE;
  let position: any = null;
  const trades: any[] = [];
  const equity = [balance];

  for (let i = WARMUP_BARS; i < candles.length; i++) {
    // The live engine fetches 200 candles max via Binance API
    // We strictly match this behavior to ensure exact 1:1 indicator parity and prevent O(N^2) complexity
    const window = candles.slice(Math.max(0, i - 199), i + 1);
    const c = candles[i]!;

    const marketStructure = detectMarketStructure(window);

    // ── If position open: check SL/TP via wick ──────────────────────────────
    if (position) {
      const { side, entry, sl, tp } = position;

      // 1. Check SL First (Pessimistic approach)
      const isSlHit = (side === "long" && c.low <= sl) || (side === "short" && c.high >= sl);
      if (isSlHit) {
        const execPrice = side === "long" ? sl * (1 - SLIPPAGE_BPS) : sl * (1 + SLIPPAGE_BPS);
        const pnl = engine.calculatePnL(side, entry, execPrice, POSITION_SIZE, LEVERAGE, TRADING_FEE);
        balance += pnl;
        trades.push({ reason: "sl", pnl, balance, side, entry, exit: execPrice });
        position = null;
        equity.push(balance);
        continue;
      }

      // 2. Check TP
      const isTpHit = (side === "long" && c.high >= tp) || (side === "short" && c.low <= tp);
      if (isTpHit) {
        const pnl = engine.calculatePnL(side, entry, tp, POSITION_SIZE, LEVERAGE, TRADING_FEE);
        balance += pnl;
        trades.push({ reason: "tp", pnl, balance, side, entry, exit: tp });
        position = null;
        equity.push(balance);
        continue;
      }
    }

    // ── Get signal ───────────────────────────────────────────────────────────
    const indicatorFn = indicatorRegistry[name];
    if (!indicatorFn) throw new Error(`Unknown indicator: ${name}`);

    // Call indicator
    const result = indicatorFn(window);
    const signal: Signal = result.signal;

    if (signal === "NEUTRAL") {
      equity.push(balance);
      continue;
    }

    const side = signal === "LONG" ? "long" : "short";

    // ── Reverse signal ───────────────────────────────────────────────────────
    if (position && position.side !== side) {
      const execPrice = position.side === "long" ? c.close * (1 - SLIPPAGE_BPS) : c.close * (1 + SLIPPAGE_BPS);
      const pnl = engine.calculatePnL(position.side, position.entry, execPrice, POSITION_SIZE, LEVERAGE, TRADING_FEE);
      balance += pnl;
      trades.push({ reason: "reverse", pnl, balance, side: position.side, entry: position.entry, exit: execPrice });
      position = null;
      equity.push(balance);
    }

    // ── Open new position ─────────────────────────────────────────────────────
    if (!position && balance > 0) {
      const { stopLoss, takeProfit } = calcSLTP(side, c.close, marketStructure);
      position = { side, entry: c.close, sl: stopLoss, tp: takeProfit };
    }

    equity.push(balance);
  }

  // Close open position at end
  if (position) {
    const lastCandle = candles[candles.length - 1]!;
    const pnl = engine.calculatePnL(position.side, position.entry, lastCandle.close, POSITION_SIZE, LEVERAGE, TRADING_FEE);
    balance += pnl;
    trades.push({ reason: "end", pnl, balance, side: position.side, entry: position.entry, exit: lastCandle.close });
    equity.push(balance);
  }

  return { trades, equity, finalBalance: balance };
}

function calcMetrics(trades: any[], equity: number[]) {
  if (trades.length === 0) return null;

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winrate = (wins.length / trades.length) * 100;

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

  let peak = equity[0]!, maxDD = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = (peak - e) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalTrades: trades.length, winrate, profitFactor, totalPnl,
    avgWin, avgLoss, maxDrawdown: maxDD * 100,
    tpCount: trades.filter(t => t.reason === "tp").length,
    slCount: trades.filter(t => t.reason === "sl").length,
    revCount: trades.filter(t => t.reason === "reverse").length,
  };
}

function printResults(name: string, metrics: any, finalBalance: number) {
  if (!metrics) return console.log(colored(`  ${name}: No trades`, C.dim));

  const pnlColor = metrics.totalPnl >= 0 ? C.green : C.red;
  const wrColor = metrics.winrate >= 50 ? C.green : C.red;
  const pfColor = metrics.profitFactor >= 1 ? C.green : C.red;
  const ddColor = metrics.maxDrawdown <= 30 ? C.green : C.red;

  const tradesStr = String(metrics.totalTrades).padStart(5);
  const wrStr = `${metrics.winrate.toFixed(1)}%`.padStart(7);
  const pfStr = (isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "∞").padStart(6);
  const pnlStr = `${metrics.totalPnl >= 0 ? "+" : ""}$${metrics.totalPnl.toFixed(2)}`.padStart(10);
  const balStr = `$${finalBalance.toFixed(2)}`.padStart(9);
  const ddStr = `${metrics.maxDrawdown.toFixed(1)}%`.padStart(7);

  console.log(
    `  ${colored(name.padEnd(16), C.bold)} │` +
    ` Trades:${colored(tradesStr, C.cyan)} │` +
    ` WR:${colored(wrStr, wrColor)} │` +
    ` PF:${colored(pfStr, pfColor)} │` +
    ` PnL:${colored(pnlStr, pnlColor)} │` +
    ` Bal:${colored(balStr, pnlColor)} │` +
    ` MaxDD:${colored(ddStr, ddColor)}`
  );
  console.log(colored(`  ${"".padEnd(16)} │ TP: ${metrics.tpCount}  SL: ${metrics.slCount}  Rev: ${metrics.revCount}  AvgW: $${metrics.avgWin.toFixed(2)}  AvgL: -$${metrics.avgLoss.toFixed(2)}`, C.dim));
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(colored(`❌ Data file not found: ${DATA_FILE}`, C.red));
    process.exit(1);
  }

  console.log(colored("\n📊 Loading BTC 15m data...", C.cyan));
  const rawData = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  const candles: Candle[] = rawData.map((d: any) => ({
    timestamp: d.openTime, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
  }));

  console.log(colored(`   Candles  : ${candles.length.toLocaleString()}`, C.dim));
  console.log(colored("⚙️  Config:", C.cyan));
  console.log(colored(`   Balance  : $${INITIAL_BALANCE}    Position: $${POSITION_SIZE} × ${LEVERAGE}x`, C.dim));
  console.log(colored(`   Fee      : ${TRADING_FEE}%         Slippage: ${(SLIPPAGE_BPS * 100).toFixed(2)}%`, C.dim));
  console.log();

  const summary = [];
  for (const indName of Object.keys(indicatorRegistry)) {
    process.stdout.write(colored(`  Running ${indName}...`, C.dim) + "\r");
    const { trades, equity, finalBalance } = backtestIndicator(indName, candles);
    const metrics = calcMetrics(trades, equity);
    
    printResults(indName, metrics, finalBalance);
    console.log();
    
    if (metrics) summary.push({ name: indName, metrics, finalBalance });
  }

  if (summary.length > 1) {
    summary.sort((a, b) => {
      const scoreA = a.metrics.winrate * Math.min(a.metrics.profitFactor, 10);
      const scoreB = b.metrics.winrate * Math.min(b.metrics.profitFactor, 10);
      return scoreB - scoreA;
    });

    console.log(colored("🏆 Ranking (by WR × PF Score):", C.bold + C.yellow));
    summary.forEach((r, i) => {
      const score = (r.metrics.winrate * Math.min(r.metrics.profitFactor, 10)).toFixed(1);
      const pnlSign = r.metrics.totalPnl >= 0 ? "+" : "";
      console.log(`   ${i + 1}.  ${colored(r.name.padEnd(16), C.bold)}  Score: ${colored(score, C.cyan)}  PnL: ${colored(`${pnlSign}$${r.metrics.totalPnl.toFixed(2)}`, r.metrics.totalPnl >= 0 ? C.green : C.red)}`);
    });
  }
}

main().catch(err => {
  console.error(colored(`\n❌ Error: ${err.message}`, C.red));
  process.exit(1);
});
