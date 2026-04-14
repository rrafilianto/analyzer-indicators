// ==========================================
// Telegram Command Handlers
//
// Handles commands received by the bot via webhook.
// Currently supported:
//   /start        — welcome message
//   /help         — list of commands
//   /status       — system overview: all indicators, positions, kill switch
//   /leaderboard  — all-time ranking by composite score
//   /leaderboard  — all-time ranking by composite score
//   /pnl          — today's realized PnL per indicator
//   /position     — details of active open positions
// ==========================================

import { getSupabase } from "./supabase";
import { formatError } from "./error-format";

// ==========================================
// Core reply helper
// ==========================================

async function replyTo(chatId: number, text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn("[TelegramCommands] TELEGRAM_BOT_TOKEN not set");
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

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
    console.error(`[TelegramCommands] replyTo failed: HTTP ${res.status} — ${body}`);
  }
}

// ==========================================
// Command router
// ==========================================

export async function handleCommand(
  command: string,
  _args: string[],
  chatId: number
): Promise<void> {
  switch (command) {
    case "/start":
      await cmdStart(chatId);
      break;
    case "/help":
      await cmdHelp(chatId);
      break;
    case "/status":
      await cmdStatus(chatId);
      break;
    case "/leaderboard":
      await cmdLeaderboard(chatId);
      break;
    case "/pnl":
      await cmdPnl(chatId);
      break;
    case "/position":
      await cmdPosition(chatId, _args);
      break;
    default:
      await replyTo(
        chatId,
        `❓ Command <code>${command}</code> tidak dikenali.\n\nKetik /help untuk daftar command.`
      );
  }
}

// ==========================================
// /start
// ==========================================

async function cmdStart(chatId: number): Promise<void> {
  const text = [
    `👋 <b>Selamat datang di BTC Indicator Bot!</b>`,
    ``,
    `Bot ini memantau <b>6 indikator</b> BTCUSDT Futures secara real-time.`,
    ``,
    `Ketik /help untuk melihat daftar command.`,
  ].join("\n");

  await replyTo(chatId, text);
}

// ==========================================
// /help
// ==========================================

async function cmdHelp(chatId: number): Promise<void> {
  const text = [
    `📖 <b>Daftar Command:</b>`,
    ``,
    `/status       — Ringkasan semua indikator & posisi terbuka`,
    `/leaderboard  — Ranking all-time berdasarkan score`,
    `/pnl          — PnL hari ini per indikator`,
    `/position     — Detail posisi terbuka (opsional: /position macd)`,
    `/help         — Tampilkan pesan ini`,
  ].join("\n");

  await replyTo(chatId, text);
}

// ==========================================
// /status
// ==========================================

const INDICATOR_EMOJI: Record<string, string> = {
  ema_crossover: "📈",
  macd:          "⚡",
  supertrend:    "🌊",
  rsi_70_30:     "🔴",
  rsi_50_cross:  "🟣",
  bollinger:     "🎯",
};

const SIDE_EMOJI: Record<string, string> = {
  long:  "🟢",
  short: "🔴",
};

function formatIndicatorName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function cmdStatus(chatId: number): Promise<void> {
  await replyTo(chatId, "⏳ Mengambil data...");

  try {
    const db = getSupabase();

    // Fetch indicators with accounts + metrics
    const { data: indicators, error: indError } = await db
      .from("indicators")
      .select(`
        id, name, is_active,
        accounts!inner(balance, equity, daily_loss, is_halted),
        performance_metrics!inner(total_trades, winrate, score)
      `)
      .order("name");

    if (indError) throw indError;

    // Fetch all open positions
    const { data: openPositions } = await db
      .from("positions")
      .select("*")
      .eq("status", "open");

    const posMap = new Map<string, any>();
    openPositions?.forEach((p) => posMap.set(p.indicator_id, p));

    // Fetch system config
    const { data: configRows } = await db
      .from("system_config")
      .select("key, value");

    const configMap = new Map<string, any>();
    configRows?.forEach((r) => configMap.set(r.key, r.value));

    const killSwitch = (configMap.get("kill_switch") as { enabled?: boolean })?.enabled ?? false;
    const maxDailyLoss = (configMap.get("max_daily_loss") as { value?: number })?.value ?? 100;
    const positionSize = (configMap.get("position_size") as { value?: number })?.value ?? 5;
    const leverage = (configMap.get("leverage") as { value?: number })?.value ?? 5;

    // ── Header ──
    const now = new Date().toUTCString();
    const killLine = killSwitch
      ? `🔴 <b>Kill Switch: AKTIF</b> — Semua trading dihentikan!`
      : `🟢 <b>Kill Switch: Non-aktif</b>`;

    const lines: string[] = [
      `📊 <b>SYSTEM STATUS</b>`,
      `<i>${now}</i>`,
      ``,
      killLine,
      `⚙️ Size: $${positionSize} × ${leverage}x | Max Loss/Hari: $${maxDailyLoss}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━`,
    ];

    // ── Per-indicator rows ──
    for (const ind of indicators ?? []) {
      const emoji = INDICATOR_EMOJI[ind.name] ?? "📊";
      const acc = ind.accounts as any;
      const met = ind.performance_metrics as any;
      const pos = posMap.get(ind.id);

      const statusTag = !ind.is_active
        ? "⏸ <i>Non-aktif</i>"
        : acc?.is_halted
        ? "🚫 <i>Halted</i>"
        : "✅ <i>Aktif</i>";

      const balanceLine = `💰 Balance: <b>$${Number(acc?.balance ?? 0).toFixed(2)}</b> | Equity: $${Number(acc?.equity ?? 0).toFixed(2)}`;
      const dailyLossLine = `📉 Daily Loss: $${Number(acc?.daily_loss ?? 0).toFixed(4)}`;
      const metricsLine = `📐 ${met?.total_trades ?? 0} trades | WR: ${(Number(met?.winrate ?? 0) * 100).toFixed(1)}% | Score: ${(Number(met?.score ?? 0) * 100).toFixed(1)}`;

      lines.push(``, `${emoji} <b>${formatIndicatorName(ind.name)}</b> — ${statusTag}`);
      lines.push(balanceLine);
      lines.push(dailyLossLine);
      lines.push(metricsLine);

      if (pos) {
        const sideEmoji = SIDE_EMOJI[pos.side] ?? "◻️";
        const priceLine = `  Entry: $${Number(pos.entry_price).toFixed(2)} | SL: $${Number(pos.stop_loss).toFixed(2)} | TP: $${Number(pos.take_profit).toFixed(2)}`;
        lines.push(`${sideEmoji} <b>Open ${pos.side.toUpperCase()}</b>`);
        lines.push(priceLine);
      } else {
        lines.push(`◻️ <i>Tidak ada posisi terbuka</i>`);
      }
    }

    lines.push(``, `━━━━━━━━━━━━━━━━━━━`);
    lines.push(`<i>Gunakan /help untuk daftar command lengkap.</i>`);

    await replyTo(chatId, lines.join("\n"));
  } catch (error) {
    const msg = formatError(error);
    console.error("[TelegramCommands] /status error:", msg);
    await replyTo(chatId, `❌ Gagal mengambil data:\n<code>${msg}</code>`);
  }
}

// ==========================================
// /leaderboard
// ==========================================

async function cmdLeaderboard(chatId: number): Promise<void> {
  await replyTo(chatId, "⏳ Mengambil data...");

  try {
    const db = getSupabase();

    // Fetch all indicators with metrics, sorted by score desc
    const { data: indicators, error } = await db
      .from("indicators")
      .select(`
        id, name, is_active,
        accounts!inner(balance),
        performance_metrics!inner(total_trades, winrate, profit_factor, max_drawdown, score)
      `)
      .order("name");

    if (error) throw error;

    // Sort by score descending
    const sorted = [...(indicators ?? [])].sort((a: any, b: any) =>
      Number(b.performance_metrics?.score ?? 0) - Number(a.performance_metrics?.score ?? 0)
    );

    const rankEmojis = ["🥇", "🥈", "🥉"];
    const lines: string[] = [
      `🏆 <b>LEADERBOARD — All Time</b>`,
      `<i>${new Date().toUTCString()}</i>`,
      ``,
    ];

    sorted.forEach((ind: any, idx) => {
      const emoji = INDICATOR_EMOJI[ind.name] ?? "📊";
      const rank = rankEmojis[idx] ?? `${idx + 1}.`;
      const met = ind.performance_metrics as any;
      const acc = ind.accounts as any;

      const score = Number(met?.score ?? 0) * 100;
      const winrate = Number(met?.winrate ?? 0) * 100;
      const pf = Number(met?.profit_factor ?? 0);
      const dd = Number(met?.max_drawdown ?? 0) * 100;
      const trades = met?.total_trades ?? 0;
      const balance = Number(acc?.balance ?? 0);
      const activeTag = ind.is_active ? "" : " <i>(off)</i>";

      lines.push(
        `${rank} ${emoji} <b>${formatIndicatorName(ind.name)}</b>${activeTag}`,
        `    🎯 Score: <b>${score.toFixed(1)}</b>`,
        `    📐 WR: ${winrate.toFixed(1)}% | PF: ${pf.toFixed(2)} | DD: ${dd.toFixed(1)}%`,
        `    🔢 Trades: ${trades} | 💰 Balance: $${balance.toFixed(2)}`,
        ``,
      );
    });

    lines.push(`<i>Score = WR×0.4 + PF×0.3 + (1-DD)×0.3</i>`);

    await replyTo(chatId, lines.join("\n"));
  } catch (error) {
    const msg = formatError(error);
    console.error("[TelegramCommands] /leaderboard error:", msg);
    await replyTo(chatId, `❌ Gagal mengambil data:\n<code>${msg}</code>`);
  }
}

// ==========================================
// /pnl
// ==========================================

async function cmdPnl(chatId: number): Promise<void> {
  await replyTo(chatId, "⏳ Mengambil data...");

  try {
    const db = getSupabase();

    // Today UTC window
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();

    const dateLabel = now.toISOString().split("T")[0]!;

    // Fetch today's trades
    const { data: todayTrades } = await db
      .from("multi_trades")
      .select(`
        pnl, exit_reason,
        positions!inner(
          indicator_id,
          indicators!inner(name)
        )
      `)
      .gte("exited_at", todayStart);

    // Fetch all indicators (to include ones with 0 trades)
    const { data: indicators, error } = await db
      .from("indicators")
      .select("id, name, is_active, accounts!inner(daily_loss)")
      .order("name");

    if (error) throw error;

    // Group today's trades by indicator
    type TradeRow = {
      pnl: number;
      exit_reason: string;
      positions: { indicator_id: string; indicators: { name: string } };
    };

    const statMap = new Map<
      string,
      { name: string; dailyPnl: number; trades: number; wins: number; tpCount: number; slCount: number; revCount: number }
    >();

    for (const ind of indicators ?? []) {
      statMap.set(ind.id, {
        name: ind.name,
        dailyPnl: 0,
        trades: 0,
        wins: 0,
        tpCount: 0,
        slCount: 0,
        revCount: 0,
      });
    }

    for (const t of (todayTrades as unknown as TradeRow[]) ?? []) {
      const indId = t.positions.indicator_id;
      const entry = statMap.get(indId);
      if (!entry) continue;
      entry.dailyPnl += t.pnl;
      entry.trades += 1;
      if (t.pnl > 0) entry.wins += 1;
      if (t.exit_reason === "tp") entry.tpCount += 1;
      else if (t.exit_reason === "sl") entry.slCount += 1;
      else if (t.exit_reason === "reverse") entry.revCount += 1;
    }

    // Sort by daily PnL desc
    const sorted = [...statMap.values()].sort((a, b) => b.dailyPnl - a.dailyPnl);

    const totalPnl = sorted.reduce((s, i) => s + i.dailyPnl, 0);
    const totalTrades = sorted.reduce((s, i) => s + i.trades, 0);
    const totalWins = sorted.reduce((s, i) => s + i.wins, 0);
    const systemWR = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const pnlEmoji = totalPnl >= 0 ? "💚" : "❤️";

    const lines: string[] = [
      `📅 <b>PnL HARI INI — ${dateLabel}</b>`,
      `<i>${now.toUTCString()}</i>`,
      ``,
    ];

    for (const stat of sorted) {
      const emoji = INDICATOR_EMOJI[stat.name] ?? "📊";
      const sign = stat.dailyPnl >= 0 ? "+" : "";
      const pnlColor = stat.dailyPnl >= 0 ? "💚" : "❤️";
      const wr = stat.trades > 0 ? ((stat.wins / stat.trades) * 100).toFixed(0) : "—";

      if (stat.trades === 0) {
        lines.push(`${emoji} <b>${formatIndicatorName(stat.name)}</b>: <i>Belum ada trade hari ini</i>`);
      } else {
        lines.push(
          `${emoji} <b>${formatIndicatorName(stat.name)}</b>`,
          `    ${pnlColor} PnL: <b>${sign}$${stat.dailyPnl.toFixed(4)}</b>`,
          `    📊 ${stat.trades}T | ✅${stat.tpCount} TP | ❌${stat.slCount} SL | 🔄${stat.revCount} Rev | WR: ${wr}%`,
        );
      }
      lines.push(``);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━`);
    lines.push(`${pnlEmoji} <b>Total System:</b> ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(4)}`);
    lines.push(`📊 ${totalTrades} trades | WR: ${systemWR.toFixed(0)}%`);

    await replyTo(chatId, lines.join("\n"));
  } catch (error) {
    const msg = formatError(error);
    console.error("[TelegramCommands] /pnl error:", msg);
    await replyTo(chatId, `❌ Gagal mengambil data:\n<code>${msg}</code>`);
  }
}

// ==========================================
// /position
// ==========================================

async function cmdPosition(chatId: number, args: string[]): Promise<void> {
  await replyTo(chatId, "⏳ Mengambil data posisi...");

  try {
    const db = getSupabase();

    // Fetch open positions with indicator name
    const { data: openPositions, error } = await db
      .from("positions")
      .select(`
        *,
        indicators!inner (name)
      `)
      .eq("status", "open")
      .order("opened_at", { ascending: false });

    if (error) throw error;

    const filterName = args.length > 0 ? args.join(" ").toLowerCase() : null;

    type PosRow = {
      id: string;
      side: string;
      entry_price: number;
      stop_loss: number;
      take_profit: number;
      size: number;
      leverage: number;
      opened_at: string;
      indicators: { name: string };
    };

    let positions = (openPositions as unknown as PosRow[]) ?? [];

    if (filterName) {
      positions = positions.filter((p) =>
        p.indicators.name.toLowerCase().includes(filterName) ||
        formatIndicatorName(p.indicators.name).toLowerCase().includes(filterName)
      );
    }

    if (positions.length === 0) {
      if (filterName) {
        await replyTo(chatId, `🔍 Tidak ada posisi terbuka untuk indikator yang mengandung "<b>${filterName}</b>"`);
      } else {
        await replyTo(chatId, `◻️ Saat ini tidak ada posisi yang terbuka.`);
      }
      return;
    }

    const lines: string[] = [
      `🎯 <b>OPEN POSITIONS</b>`,
      `<i>${new Date().toUTCString()}</i>`,
      ``,
    ];

    for (const pos of positions) {
      const name = pos.indicators.name;
      const emoji = INDICATOR_EMOJI[name] ?? "📊";
      const sideEmoji = SIDE_EMOJI[pos.side] ?? "◻️";
      
      const openedAt = new Date(pos.opened_at);
      const durationMs = Date.now() - openedAt.getTime();
      const hours = Math.floor(durationMs / 3600000);
      const mins = Math.floor((durationMs % 3600000) / 60000);
      const durationStr = hours > 0 ? `${hours}j ${mins}m` : `${mins}m`;

      const riskPct = (Math.abs(pos.entry_price - pos.stop_loss) / pos.entry_price) * 100;
      const notional = pos.size * pos.leverage;

      lines.push(
        `${emoji} <b>${formatIndicatorName(name)}</b>`,
        `${sideEmoji} <b>Sisi:</b> ${pos.side.toUpperCase()}`,
        `📍 <b>Entry:</b> $${pos.entry_price.toFixed(2)}`,
        `🛑 <b>SL:</b> $${pos.stop_loss.toFixed(2)} <i>(${riskPct.toFixed(2)}% risk)</i>`,
        `🎯 <b>TP:</b> $${pos.take_profit.toFixed(2)}`,
        `💰 <b>Size:</b> $${pos.size} × ${pos.leverage}x = $${notional} notional`,
        `⏱ <b>Durasi:</b> ${durationStr} <i>(dibuka ${openedAt.toLocaleTimeString('id-ID', {timeZone: 'UTC'})} UTC)</i>`,
        ``
      );
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Total Open Posisi: <b>${positions.length}</b>`);

    await replyTo(chatId, lines.join("\n"));
  } catch (error) {
    const msg = formatError(error);
    console.error("[TelegramCommands] /position error:", msg);
    await replyTo(chatId, `❌ Gagal mengambil data posisi:\n<code>${msg}</code>`);
  }
}
