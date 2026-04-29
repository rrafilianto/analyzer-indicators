/**
 * ============================================================
 * BTC Futures Backtest Engine (In-Memory)
 * ============================================================
 *
 * Usage:
 *   node scripts/backtest.mjs [indicator]
 *
 * Examples:
 *   node scripts/backtest.mjs              → all indicators
 *   node scripts/backtest.mjs supertrend   → single indicator
 *
 * Config (edit below):
 *   INITIAL_BALANCE, POSITION_SIZE, LEVERAGE, TRADING_FEE, SLIPPAGE_BPS
 * ============================================================
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Backtest Config ──────────────────────────────────────────────────────────
const INITIAL_BALANCE = 50;       // USD
const POSITION_SIZE   = 5;        // USD per trade
const LEVERAGE        = 20;       // multiplier
const TRADING_FEE     = 0.04;     // % per trade (e.g. 0.04 = 0.04%)
const SLIPPAGE_BPS    = 0.0005;   // 0.05% slippage on SL & Reverse exits
const WARMUP_BARS     = 200;      // candles before signals are considered
const RR_RATIO        = 2;        // Take Profit = 2× the risk distance
// ─────────────────────────────────────────────────────────────────────────────

const DATA_FILE = path.join(__dirname, "../.data/BTCUSDT-5m.json");

// ── ANSI Colors ───────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  blue:   "\x1b[34m",
  white:  "\x1b[37m",
};

function colored(text, color) {
  return `${color}${text}${C.reset}`;
}

// ── Simple EMA ────────────────────────────────────────────────────────────────
function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const result = [];
  let ema = values[0];
  for (const v of values) {
    ema = v * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ── Simple RSI ────────────────────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  const rsi = [];
  if (closes.length <= period) return rsi;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 1)));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 1)));
  }
  return rsi;
}

// ── ATR ───────────────────────────────────────────────────────────────────────
function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low  = candles[i].low;
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  const atrs = [];
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  atrs.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    atrs.push(atr);
  }
  return atrs;
}

// ── Bollinger Bands ───────────────────────────────────────────────────────────
function calcBB(closes, period = 20, stdDevMult = 2) {
  const result = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean  = slice.reduce((s, v) => s + v, 0) / period;
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    result.push({ upper: mean + stdDevMult * std, lower: mean - stdDevMult * std, middle: mean });
  }
  return result;
}

// ── Indicator Signals ─────────────────────────────────────────────────────────
const INDICATORS = {
  ema_crossover(candles) {
    const closes = candles.map(c => c.close);
    const fast = calcEMA(closes, 9);
    const slow = calcEMA(closes, 21);
    const f = fast, s = slow, n = f.length;
    if (n < 2) return "NEUTRAL";
    if (f[n-2] <= s[n-2] && f[n-1] > s[n-1]) return "LONG";
    if (f[n-2] >= s[n-2] && f[n-1] < s[n-1]) return "SHORT";
    return "NEUTRAL";
  },

  macd(candles) {
    const closes = candles.map(c => c.close);
    const fast   = calcEMA(closes, 12);
    const slow   = calcEMA(closes, 26);
    if (fast.length < 2 || slow.length < 2) return "NEUTRAL";

    const macdLine = fast.map((v, i) => v - slow[i]);
    const signal   = calcEMA(macdLine, 9);
    const n = signal.length;
    if (n < 2) return "NEUTRAL";

    const mi  = macdLine.length;
    const mCurr = macdLine[mi - 1], mPrev = macdLine[mi - 2];
    const sCurr = signal[n - 1],    sPrev = signal[n - 2];

    if (mPrev <= sPrev && mCurr > sCurr) return "LONG";
    if (mPrev >= sPrev && mCurr < sCurr) return "SHORT";
    return "NEUTRAL";
  },

  supertrend(candles) {
    const period = 10, mult = 3;
    const atrs = calcATR(candles, period);
    if (atrs.length < 2) return "NEUTRAL";

    const atr     = atrs[atrs.length - 1];
    const prevATR = atrs[atrs.length - 2];
    const curr    = candles[candles.length - 1];
    const prev    = candles[candles.length - 2];

    const upperCurr = (curr.high + curr.low) / 2 + mult * atr;
    const lowerCurr = (curr.high + curr.low) / 2 - mult * atr;
    const upperPrev = (prev.high + prev.low) / 2 + mult * prevATR;
    const lowerPrev = (prev.high + prev.low) / 2 - mult * prevATR;

    const wasBelow = prev.close < lowerPrev;
    const isAbove  = curr.close > lowerCurr;
    const wasAbove = prev.close > upperPrev;
    const isBelow  = curr.close < upperCurr;

    if (wasBelow && isAbove) return "LONG";
    if (wasAbove && isBelow) return "SHORT";
    return "NEUTRAL";
  },

  rsi_70_30(candles) {
    const closes = candles.map(c => c.close);
    const rsi = calcRSI(closes, 14);
    if (rsi.length < 1) return "NEUTRAL";
    const curr = rsi[rsi.length - 1];
    if (curr < 30) return "LONG";
    if (curr > 70) return "SHORT";
    return "NEUTRAL";
  },

  rsi_50_cross(candles) {
    const closes = candles.map(c => c.close);
    const rsi = calcRSI(closes, 14);
    if (rsi.length < 2) return "NEUTRAL";
    const curr = rsi[rsi.length - 1], prev = rsi[rsi.length - 2];
    if (prev <= 50 && curr > 50) return "LONG";
    if (prev >= 50 && curr < 50) return "SHORT";
    return "NEUTRAL";
  },

  bollinger(candles) {
    const closes = candles.map(c => c.close);
    const bb = calcBB(closes, 20, 2);
    if (bb.length < 1) return "NEUTRAL";
    const curr = bb[bb.length - 1];
    const c    = closes[closes.length - 1];
    const p    = closes[closes.length - 2];
    if (p > curr.lower && c <= curr.lower) return "LONG";
    if (p < curr.upper && c >= curr.upper) return "SHORT";
    return "NEUTRAL";
  },
};

// ── PnL Calculator ─────────────────────────────────────────────────────────────
function calcPnL(side, entryPrice, exitPrice, size, leverage, fee) {
  const priceDiff  = side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const grossPnl   = (priceDiff / entryPrice) * size * leverage;
  const notionalIn = size * leverage;
  const notionalOut = notionalIn + grossPnl;
  const feeAmt     = (notionalIn + notionalOut) * (fee / 100);
  return grossPnl - feeAmt;
}

// ── Market Structure (simplified ATR-based TP/SL) ─────────────────────────────
function calcSLTP(side, entryPrice, atr) {
  const risk = Math.max(atr * 1.5, entryPrice * 0.005); // at least 0.5% from entry
  const stopLoss   = side === "long" ? entryPrice - risk : entryPrice + risk;
  const takeProfit = side === "long" ? entryPrice + risk * RR_RATIO : entryPrice - risk * RR_RATIO;
  return { stopLoss, takeProfit };
}

// ── Backtest one indicator ─────────────────────────────────────────────────────
function backtestIndicator(name, candles) {
  let balance  = INITIAL_BALANCE;
  let position = null; // { side, entry, sl, tp, openIdx }
  const trades = [];
  const equity = [balance];

  const atrs = calcATR(candles, 14);

  for (let i = WARMUP_BARS; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const c      = candles[i];
    const atrIdx = i - 1; // ATR array is 1 shorter (starts from i=1)
    const atr    = atrs[Math.min(atrIdx, atrs.length - 1)] ?? atrs[atrs.length - 1];

    // ── If position open: check SL/TP via wick ──────────────────────────────
    if (position) {
      const { side, entry, sl, tp } = position;

      // SL first (pessimistic)
      const slHit = side === "long" ? c.low <= sl : c.high >= sl;
      if (slHit) {
        const execPrice = side === "long"
          ? sl * (1 - SLIPPAGE_BPS)
          : sl * (1 + SLIPPAGE_BPS);
        const pnl = calcPnL(side, entry, execPrice, POSITION_SIZE, LEVERAGE, TRADING_FEE);
        balance += pnl;
        trades.push({ reason: "sl", pnl, balance, side, entry, exit: execPrice });
        position = null;
        equity.push(balance);
        continue;
      }

      // TP (limit, exact price)
      const tpHit = side === "long" ? c.high >= tp : c.low <= tp;
      if (tpHit) {
        const pnl = calcPnL(side, entry, tp, POSITION_SIZE, LEVERAGE, TRADING_FEE);
        balance += pnl;
        trades.push({ reason: "tp", pnl, balance, side, entry, exit: tp });
        position = null;
        equity.push(balance);
        continue;
      }
    }

    // ── Get signal ───────────────────────────────────────────────────────────
    const signal = INDICATORS[name](window);
    if (signal === "NEUTRAL") {
      equity.push(balance);
      continue;
    }

    const side = signal === "LONG" ? "long" : "short";

    // ── Reverse signal ───────────────────────────────────────────────────────
    if (position && position.side !== side) {
      const execPrice = position.side === "long"
        ? c.close * (1 - SLIPPAGE_BPS)
        : c.close * (1 + SLIPPAGE_BPS);
      const pnl = calcPnL(position.side, position.entry, execPrice, POSITION_SIZE, LEVERAGE, TRADING_FEE);
      balance += pnl;
      trades.push({ reason: "reverse", pnl, balance, side: position.side, entry: position.entry, exit: execPrice });
      position = null;
      equity.push(balance);
    }

    // ── Open new position ─────────────────────────────────────────────────────
    if (!position && balance > 0) {
      const { stopLoss, takeProfit } = calcSLTP(side, c.close, atr);
      position = { side, entry: c.close, sl: stopLoss, tp: takeProfit, openIdx: i };
    }

    equity.push(balance);
  }

  // Close any open position at last candle
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const pnl = calcPnL(position.side, position.entry, lastCandle.close, POSITION_SIZE, LEVERAGE, TRADING_FEE);
    balance += pnl;
    trades.push({ reason: "end", pnl, balance, side: position.side, entry: position.entry, exit: lastCandle.close });
    equity.push(balance);
  }

  return { trades, equity, finalBalance: balance };
}

// ── Metrics Calculator ─────────────────────────────────────────────────────────
function calcMetrics(trades, equity) {
  if (trades.length === 0) return null;

  const wins    = trades.filter(t => t.pnl > 0);
  const losses  = trades.filter(t => t.pnl <= 0);
  const winrate = (wins.length / trades.length) * 100;

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgWin   = wins.length  > 0 ? grossProfit / wins.length  : 0;
  const avgLoss  = losses.length > 0 ? grossLoss  / losses.length : 0;

  // Max Drawdown
  let peak = equity[0], maxDD = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = (peak - e) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  const tpCount  = trades.filter(t => t.reason === "tp").length;
  const slCount  = trades.filter(t => t.reason === "sl").length;
  const revCount = trades.filter(t => t.reason === "reverse").length;
  const endCount = trades.filter(t => t.reason === "end").length;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winrate,
    profitFactor,
    totalPnl,
    avgWin,
    avgLoss,
    maxDrawdown: maxDD * 100,
    tpCount,
    slCount,
    revCount,
    endCount,
  };
}

// ── Print Results ──────────────────────────────────────────────────────────────
function printResults(name, metrics, finalBalance) {
  if (!metrics) {
    console.log(colored(`  ${name}: No trades`, C.dim));
    return;
  }

  const pnlColor  = metrics.totalPnl >= 0 ? C.green : C.red;
  const wrColor   = metrics.winrate >= 50 ? C.green : C.red;
  const pfColor   = metrics.profitFactor >= 1 ? C.green : C.red;
  const ddColor   = metrics.maxDrawdown <= 30 ? C.green : C.red;

  const nameLabel = name.padEnd(16);
  const trades    = String(metrics.totalTrades).padStart(5);
  const wr        = `${metrics.winrate.toFixed(1)}%`.padStart(7);
  const pf        = (isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "∞").padStart(6);
  const totalPnl  = `${metrics.totalPnl >= 0 ? "+" : ""}$${metrics.totalPnl.toFixed(2)}`.padStart(10);
  const bal       = `$${finalBalance.toFixed(2)}`.padStart(9);
  const dd        = `${metrics.maxDrawdown.toFixed(1)}%`.padStart(7);

  console.log(
    `  ${colored(nameLabel, C.bold)} │` +
    ` Trades:${colored(trades, C.cyan)} │` +
    ` WR:${colored(wr, wrColor)} │` +
    ` PF:${colored(pf, pfColor)} │` +
    ` PnL:${colored(totalPnl, pnlColor)} │` +
    ` Bal:${colored(bal, pnlColor)} │` +
    ` MaxDD:${colored(dd, ddColor)}`
  );

  console.log(
    colored(`  ${"".padEnd(16)} │`, C.dim) +
    colored(` TP: ${metrics.tpCount}  SL: ${metrics.slCount}  Rev: ${metrics.revCount}  AvgW: $${metrics.avgWin.toFixed(2)}  AvgL: -$${metrics.avgLoss.toFixed(2)}`, C.dim)
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const targetIndicator = process.argv[2]?.toLowerCase();

  if (!fs.existsSync(DATA_FILE)) {
    console.error(colored(`\n❌ Data file not found: ${DATA_FILE}`, C.red));
    console.error(colored("   Run: node scripts/fetch-btc-data.mjs first\n", C.yellow));
    process.exit(1);
  }

  console.log(colored("\n📊 Loading BTC 5m data...", C.cyan));
  const rawData = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  // Convert to Candle format
  const candles = rawData.map(d => ({
    timestamp: d.openTime,
    open:      d.open,
    high:      d.high,
    low:       d.low,
    close:     d.close,
    volume:    d.volume,
  }));

  const firstDate = new Date(candles[0].timestamp).toISOString().split("T")[0];
  const lastDate  = new Date(candles[candles.length - 1].timestamp).toISOString().split("T")[0];

  console.log(colored(`   Candles  : ${candles.length.toLocaleString()}`, C.dim));
  console.log(colored(`   Period   : ${firstDate} → ${lastDate}`, C.dim));
  console.log(colored(`   Timeframe: 5 minutes`, C.dim));
  console.log();
  console.log(colored("⚙️  Config:", C.cyan));
  console.log(colored(`   Balance  : $${INITIAL_BALANCE}    Position: $${POSITION_SIZE} × ${LEVERAGE}x`, C.dim));
  console.log(colored(`   Fee      : ${TRADING_FEE}%         Slippage: ${(SLIPPAGE_BPS * 100).toFixed(2)}%`, C.dim));
  console.log(colored(`   RR Ratio : 1:${RR_RATIO}         Warmup: ${WARMUP_BARS} bars`, C.dim));
  console.log();

  const indicatorsToRun = targetIndicator
    ? { [targetIndicator]: INDICATORS[targetIndicator] }
    : INDICATORS;

  if (targetIndicator && !INDICATORS[targetIndicator]) {
    console.error(colored(`❌ Unknown indicator: ${targetIndicator}`, C.red));
    console.error(`Available: ${Object.keys(INDICATORS).join(", ")}`);
    process.exit(1);
  }

  console.log(colored("─".repeat(90), C.dim));
  console.log(colored(`  ${"Indicator".padEnd(16)} │ Trades  │    WR  │    PF │       PnL │     Bal │  MaxDD`, C.bold + C.white));
  console.log(colored("─".repeat(90), C.dim));

  const summary = [];

  for (const [indName, _fn] of Object.entries(indicatorsToRun)) {
    process.stdout.write(colored(`  Running ${indName}...`, C.dim) + "\r");
    const start = Date.now();
    const { trades, equity, finalBalance } = backtestIndicator(indName, candles);
    const metrics = calcMetrics(trades, equity);
    const duration = Date.now() - start;

    printResults(indName, metrics, finalBalance);
    console.log();

    if (metrics) {
      summary.push({ name: indName, metrics, finalBalance, duration });
    }
  }

  console.log(colored("─".repeat(90), C.dim));

  if (summary.length > 1) {
    // Rank by score (winrate * profitFactor)
    summary.sort((a, b) => {
      const scoreA = a.metrics.winrate * Math.min(a.metrics.profitFactor, 10);
      const scoreB = b.metrics.winrate * Math.min(b.metrics.profitFactor, 10);
      return scoreB - scoreA;
    });

    console.log(colored("\n🏆 Ranking (by WR × PF Score):", C.bold + C.yellow));
    const medals = ["🥇", "🥈", "🥉"];
    summary.forEach((r, i) => {
      const medal = medals[i] ?? `${i + 1}.`;
      const scoreLabel = (r.metrics.winrate * Math.min(r.metrics.profitFactor, 10)).toFixed(1);
      const pnlSign = r.metrics.totalPnl >= 0 ? "+" : "";
      console.log(
        `   ${medal}  ${colored(r.name.padEnd(16), C.bold)}  ` +
        `Score: ${colored(scoreLabel, C.cyan)}  ` +
        `PnL: ${colored(`${pnlSign}$${r.metrics.totalPnl.toFixed(2)}`, r.metrics.totalPnl >= 0 ? C.green : C.red)}  ` +
        `Balance: ${colored(`$${r.finalBalance.toFixed(2)}`, r.metrics.totalPnl >= 0 ? C.green : C.red)}`
      );
    });
  }

  console.log(colored("\n✅ Backtest complete\n", C.green));
}

main().catch(err => {
  console.error(colored(`\n❌ Fatal: ${err.message}\n`, C.red));
  process.exit(1);
});
