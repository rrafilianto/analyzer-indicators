/**
 * Fetch historical BTCUSDT kline data from Binance
 * Usage: node scripts/fetch-btc-data.mjs
 *
 * Rate limit: 1200 weight/min. Each request = 1 weight.
 * Max 1000 candles per request.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../.data");

// ── Config ──────────────────────────────────────────────────────────────────
const SYMBOL = "BTCUSDT";
const INTERVAL = "5m"; // target timeframe
const CANDLES_PER_REQUEST = 1000;
const DELAY_MS = 300; // be polite to Binance

// 6 months back from now (UTC)
const END_TIME = Date.now();
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const START_TIME = END_TIME - SIX_MONTHS_MS;
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://data-api.binance.vision/api/v3/klines";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchKlines(symbol, interval, startTime, endTime) {
  const url = new URL(BASE_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("startTime", String(startTime));
  url.searchParams.set("endTime", String(endTime));
  url.searchParams.set("limit", String(CANDLES_PER_REQUEST));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function mapKline(k) {
  return {
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  };
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const startDate = new Date(START_TIME).toISOString().split("T")[0];
  const endDate = new Date(END_TIME).toISOString().split("T")[0];
  console.log(`\n📊 Fetching ${SYMBOL} ${INTERVAL} data`);
  console.log(`📅 Range: ${startDate} → ${endDate} (6 months)`);
  console.log(`⏳ This will take a few minutes...\n`);

  const allCandles = [];
  let currentStart = START_TIME;
  let page = 0;

  while (currentStart < END_TIME) {
    page++;
    const raw = await fetchKlines(SYMBOL, INTERVAL, currentStart, END_TIME);

    if (!raw || raw.length === 0) break;

    const candles = raw.map(mapKline);
    allCandles.push(...candles);

    const lastCandle = candles[candles.length - 1];
    const lastDate = new Date(lastCandle.closeTime).toISOString().split("T")[0];
    process.stdout.write(`  Page ${page}: +${candles.length} candles (last: ${lastDate})  \r`);

    if (raw.length < CANDLES_PER_REQUEST) break;

    currentStart = lastCandle.closeTime + 1;
    await sleep(DELAY_MS);
  }

  // Sort by openTime (should already be sorted, but just to be safe)
  allCandles.sort((a, b) => a.openTime - b.openTime);

  const outFile = path.join(DATA_DIR, `${SYMBOL}-${INTERVAL}.json`);
  fs.writeFileSync(outFile, JSON.stringify(allCandles, null, 2));

  console.log(`\n\n✅ Done!`);
  console.log(`   Total candles : ${allCandles.length.toLocaleString()}`);
  console.log(`   First candle  : ${new Date(allCandles[0].openTime).toISOString()}`);
  console.log(`   Last candle   : ${new Date(allCandles[allCandles.length - 1].openTime).toISOString()}`);
  console.log(`   File saved    : ${outFile}`);
  console.log(`   File size     : ${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB\n`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
