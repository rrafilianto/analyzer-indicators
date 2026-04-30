// ==========================================
// Telegram Notifier
//
// Sends rich notifications to a Telegram chat
// when positions are opened or closed.
//
// Required env vars:
//   TELEGRAM_BOT_TOKEN  — from @BotFather
//   TELEGRAM_CHAT_ID    — your personal chat ID
// ==========================================

import type { PositionSide, ExitReason } from "../engine/types";

// ==========================================
// Config
// ==========================================

function getTelegramConfig(): { botToken: string; chatId: string } | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Notifications disabled.");
    return null;
  }

  return { botToken, chatId };
}

// ==========================================
// Core send function
// ==========================================

async function sendMessage(text: string): Promise<void> {
  const config = getTelegramConfig();
  if (!config) return;

  const { botToken, chatId } = config;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Telegram] Failed to send message: HTTP ${res.status} — ${body}`);
    }
  } catch (error) {
    console.error(`[Telegram] Network error sending message:`, error);
  }
}

// ==========================================
// Helpers
// ==========================================

const INDICATOR_EMOJI: Record<string, string> = {
  ema_crossover: "📈",
  macd:          "⚡",
  supertrend:    "🌊",
  rsi_70_30:     "🔴",
  rsi_70_30_v2:  "🟡",
  rsi_50_cross:  "🟣",
  bollinger:     "🎯",
  bollinger_v2:  "🟠",
};

const SIDE_EMOJI: Record<string, string> = {
  long:  "🟢",
  short: "🔴",
};

const EXIT_EMOJI: Record<string, string> = {
  tp:      "✅",
  sl:      "❌",
  reverse: "🔄",
};

const EXIT_LABEL: Record<string, string> = {
  tp:      "Take Profit",
  sl:      "Stop Loss",
  reverse: "Reverse Signal",
};

function formatIndicatorName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${pnl.toFixed(4)}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

// ==========================================
// Cron Error Alerts
// ==========================================

/**
 * Notify when the entire cron execution crashes (fatal error).
 * Called from the outer catch block in route.ts.
 */
export async function notifyCronFatalError(params: {
  error: string;
  requestId: string;
  executionTimeMs?: number;
}): Promise<void> {
  const { error, requestId, executionTimeMs } = params;

  const lines = [
    `🚨 <b>CRON FATAL ERROR</b>`,
    ``,
    `Engine gagal execute sepenuhnya!`,
    ``,
    `<b>❌ Error:</b>`,
    `<code>${escapeHtml(error)}</code>`,
    ``,
    `<b>🆔 Request ID:</b> <code>${requestId}</code>`,
    executionTimeMs !== undefined
      ? `<b>⏱ Durasi:</b> ${executionTimeMs}ms`
      : null,
    `<b>🕐 Waktu:</b> ${new Date().toUTCString()}`,
    ``,
    `<i>Periksa Vercel logs untuk detail lengkap.</i>`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  await sendMessage(lines);
}

/**
 * Notify when a specific indicator fails (isolated error, engine continues).
 * Called inside the per-indicator for-loop in route.ts.
 */
export async function notifyCronIndicatorError(params: {
  indicatorName: string;
  error: string;
  durationMs: number;
}): Promise<void> {
  const { indicatorName, error, durationMs } = params;

  const indicatorEmoji = INDICATOR_EMOJI[indicatorName] ?? "📊";

  const lines = [
    `⚠️ <b>INDICATOR ERROR</b>`,
    ``,
    `${indicatorEmoji} <b>${formatIndicatorName(indicatorName)}</b> gagal diproses`,
    ``,
    `<b>❌ Error:</b>`,
    `<code>${escapeHtml(error)}</code>`,
    ``,
    `<b>⏱ Durasi:</b> ${durationMs}ms`,
    `<b>🕐 Waktu:</b> ${new Date().toUTCString()}`,
    ``,
    `<i>Indikator lain tetap berjalan normal.</i>`,
  ].join("\n");

  await sendMessage(lines);
}

// ==========================================
// HTML escape helper (for error messages)
// ==========================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==========================================
// Open Position Notification
// ==========================================

export interface OpenPositionNotif {
  indicatorName: string;
  side: PositionSide;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  leverage: number;
  openedAt: Date;
}

export async function notifyPositionOpened(params: OpenPositionNotif): Promise<void> {
  const {
    indicatorName,
    side,
    entryPrice,
    stopLoss,
    takeProfit,
    size,
    leverage,
    openedAt,
  } = params;

  const indicatorEmoji = INDICATOR_EMOJI[indicatorName] ?? "📊";
  const sideEmoji = SIDE_EMOJI[side];
  const sideLabel = side === "long" ? "LONG" : "SHORT";

  const risk = Math.abs(entryPrice - stopLoss);
  const riskPct = (risk / entryPrice) * 100;
  const potentialProfit = Math.abs(takeProfit - entryPrice);
  const notionalValue = size * leverage;

  const text = [
    `${indicatorEmoji} <b>${formatIndicatorName(indicatorName)}</b>`,
    ``,
    `${sideEmoji} <b>POSISI DIBUKA — ${sideLabel}</b>`,
    ``,
    `<b>📍 Entry:</b>    ${formatPrice(entryPrice)}`,
    `<b>🛑 Stop Loss:</b> ${formatPrice(stopLoss)} <i>(${riskPct.toFixed(2)}% dari entry)</i>`,
    `<b>🎯 Take Profit:</b> ${formatPrice(takeProfit)} <i>(RR 1:2)</i>`,
    ``,
    `<b>💰 Size:</b>     $${size} × ${leverage}x = $${notionalValue} notional`,
    `<b>⚠️ Max Risk:</b>  $${(size * leverage * (risk / entryPrice)).toFixed(4)}`,
    `<b>🏆 Max Profit:</b> $${(size * leverage * (potentialProfit / entryPrice)).toFixed(4)}`,
    ``,
    `<b>🕐 Waktu:</b> ${openedAt.toUTCString()}`,
  ].join("\n");

  await sendMessage(text);
}

// ==========================================
// Daily Summary Notification
// ==========================================

export interface DailySummaryIndicator {
  name: string;
  dailyPnl: number;    // sum of realized PnL for the day
  tradeCount: number;  // total trades closed today
  wins: number;        // number of winning trades today
  balance: number;     // current balance (end of day)
  score: number;       // all-time composite score
}

export interface DailySummaryNotif {
  date: string; // YYYY-MM-DD
  indicators: DailySummaryIndicator[];
}

export async function notifyDailySummary(params: DailySummaryNotif): Promise<void> {
  const { date, indicators } = params;

  if (indicators.length === 0) {
    await sendMessage(`📅 <b>Daily Summary — ${date}</b>\n\n<i>Tidak ada data indikator hari ini.</i>`);
    return;
  }

  // Sort by daily PnL descending
  const sorted = [...indicators].sort((a, b) => b.dailyPnl - a.dailyPnl);

  const totalPnl = indicators.reduce((sum, i) => sum + i.dailyPnl, 0);
  const totalTrades = indicators.reduce((sum, i) => sum + i.tradeCount, 0);
  const totalWins = indicators.reduce((sum, i) => sum + i.wins, 0);
  const totalBalance = indicators.reduce((sum, i) => sum + i.balance, 0);
  const systemWinrate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

  const pnlEmoji = totalPnl >= 0 ? "💚" : "❤️";
  const rankEmojis = ["🥇", "🥈", "🥉"];

  // Build per-indicator rows
  const rows = sorted.map((ind, idx) => {
    const emoji = INDICATOR_EMOJI[ind.name] ?? "📊";
    const rank = rankEmojis[idx] ?? `${idx + 1}.`;
    const pnlSign = ind.dailyPnl >= 0 ? "+" : "";
    const winratePct = ind.tradeCount > 0
      ? ((ind.wins / ind.tradeCount) * 100).toFixed(0)
      : "—";
    const tradeStr = ind.tradeCount > 0
      ? `${ind.tradeCount}T ${ind.wins}W (${winratePct}%)`
      : "0 trades";

    return [
      `${rank} ${emoji} <b>${formatIndicatorName(ind.name)}</b>`,
      `    PnL: <b>${pnlSign}$${ind.dailyPnl.toFixed(4)}</b> | ${tradeStr}`,
      `    Balance: $${ind.balance.toFixed(2)} | Score: ${(ind.score * 100).toFixed(1)}`,
    ].join("\n");
  });

  const lines = [
    `📅 <b>DAILY SUMMARY — ${date}</b>`,
    ``,
    `<b>🏆 Ranking Hari Ini:</b>`,
    ``,
    rows.join("\n\n"),
    ``,
    `━━━━━━━━━━━━━━━━━━━`,
    `${pnlEmoji} <b>Total System PnL:</b> ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(4)}`,
    `📊 <b>Trades Hari Ini:</b> ${totalTrades} trades (${systemWinrate.toFixed(0)}% WR)`,
    `💼 <b>Total Balance:</b> $${totalBalance.toFixed(2)}`,
    ``,
    `<i>🔄 Daily loss counter di-reset. Trading dilanjutkan besok!</i>`,
  ].join("\n");

  await sendMessage(lines);
}

// ==========================================
// Close Position Notification
// ==========================================

export interface ClosePositionNotif {
  indicatorName: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  leverage: number;
  pnl: number;
  rMultiple: number;
  duration: number; // minutes
  exitReason: ExitReason;
  exitedAt: Date;
  newBalance: number;
}

export async function notifyPositionClosed(params: ClosePositionNotif): Promise<void> {
  const {
    indicatorName,
    side,
    entryPrice,
    exitPrice,
    stopLoss,
    takeProfit,
    size,
    leverage,
    pnl,
    rMultiple,
    duration,
    exitReason,
    exitedAt,
    newBalance,
  } = params;

  const indicatorEmoji = INDICATOR_EMOJI[indicatorName] ?? "📊";
  const exitEmoji = EXIT_EMOJI[exitReason];
  const exitLabel = EXIT_LABEL[exitReason];
  const sideEmoji = SIDE_EMOJI[side];
  const sideLabel = side === "long" ? "LONG" : "SHORT";
  const pnlEmoji = pnl >= 0 ? "💚" : "❤️";

  // Price movement
  const priceChange = exitPrice - entryPrice;
  const priceChangePct = (priceChange / entryPrice) * 100;

  // Duration formatting
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  const durationStr = hours > 0 ? `${hours}j ${mins}m` : `${mins}m`;

  const text = [
    `${indicatorEmoji} <b>${formatIndicatorName(indicatorName)}</b>`,
    ``,
    `${exitEmoji} <b>POSISI DITUTUP — ${exitLabel}</b>`,
    ``,
    `${sideEmoji} <b>Sisi:</b> ${sideLabel}`,
    `<b>📍 Entry:</b>    ${formatPrice(entryPrice)}`,
    `<b>🚪 Exit:</b>     ${formatPrice(exitPrice)} <i>(${priceChangePct >= 0 ? "+" : ""}${priceChangePct.toFixed(2)}%)</i>`,
    `<b>🛑 SL Was:</b>   ${formatPrice(stopLoss)}`,
    `<b>🎯 TP Was:</b>   ${formatPrice(takeProfit)}`,
    ``,
    `${pnlEmoji} <b>PnL:</b>       ${formatPnL(pnl)}`,
    `<b>📐 R-Multiple:</b> ${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R`,
    `<b>💼 Balance:</b>   ${formatPrice(newBalance)}`,
    ``,
    `<b>⏱ Durasi:</b>   ${durationStr}`,
    `<b>🕐 Ditutup:</b>  ${exitedAt.toUTCString()}`,
  ].join("\n");

  await sendMessage(text);
}

// ==========================================
// Kill Switch Notification
// ==========================================

export async function notifyKillSwitch(enabled: boolean, reason?: string, triggerByCommand: boolean = false): Promise<void> {
  let text = "";
  if (enabled) {
    text = [
      `🚨 <b>KILL SWITCH: AKTIF</b> 🚨`,
      ``,
      `Semua aktivitas trading telah dihentikan! Engine tidak akan membuka posisi baru atau memproses sinyal hingga Kill Switch dinonaktifkan.`,
      reason ? `\n<b>Alasan:</b> ${reason}` : "",
      triggerByCommand ? "" : `\n<i>Gunakan perintah /killswitch off untuk mengaktifkan kembali.</i>`
    ].filter(Boolean).join("\n");
  } else {
    text = [
      `🟢 <b>KILL SWITCH: NON-AKTIF</b> 🟢`,
      ``,
      `Engine trading kembali berjalan normal.`
    ].join("\n");
  }

  await sendMessage(text);
}

// ==========================================
// Account Halted Notification
// ==========================================

export async function notifyAccountHalted(indicatorId: string, reason: string): Promise<void> {
  const indicatorEmoji = INDICATOR_EMOJI[indicatorId] ?? "📊";
  const text = [
    `⚠️ <b>INDICATOR HALTED</b> ⚠️`,
    ``,
    `${indicatorEmoji} <b>${formatIndicatorName(indicatorId)}</b> telah dihentikan (Halted).`,
    `<b>Alasan:</b> ${reason}`,
    ``,
    `<i>Indikator ini tidak akan membuka posisi baru hari ini. Indikator lain tetap berjalan normal.</i>`
  ].join("\n");

  await sendMessage(text);
}
