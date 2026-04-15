import { NextRequest, NextResponse } from "next/server";
import { fetchCandles, getSupabase } from "../../../../lib/supabase";
import { formatError } from "../../../../lib/error-format";
import { Logger } from "../../../../lib/logger";
import { runIndicator } from "../../../../lib/indicators";
import { detectMarketStructure } from "../../../../engine/market-structure";
import { processSignal } from "../../../../engine/position-manager";
import { PaperTradingEngine } from "../../../../engine/paper-trading-engine";
import { recalculateMetrics, getAllMetrics } from "../../../../engine/metrics";
import { checkGlobalRisk, resetDailyLoss, autoResetDailyLoss } from "../../../../engine/risk-manager";
import { syncIndicatorEquity } from "../../../../engine/equity";
import { notifyCronFatalError, notifyCronIndicatorError } from "../../../../lib/telegram";

// ==========================================
// Cron Trading Endpoint
//
// Triggered by cron-job.org every 5 minutes.
//
// Flow:
// 1. Verify cron secret (security)
// 2. Check global risk (kill switch, max daily loss)
// 3. Fetch latest 5m candles from Binance
// 4. Run all active indicators in parallel
// 5. Process signals (entry/exit/reverse)
// 6. Recalculate metrics
// 7. Flush structured logs to DB
// ==========================================

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const requestSecret = request.headers.get("x-cron-secret");

  if (cronSecret && requestSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logger = new Logger();
  logger.info("Cron execution started");

  try {
    // Step 1: Global risk check
    // If the system is globally halted (e.g. Kill Switch), we log it but WE MUST CONTINUE
    // execution so that open positions can be monitored for TP/SL and closed safely.
    const globalRisk = await checkGlobalRisk();
    if (!globalRisk.canTrade) {
      logger.warn("Global trading block active. Will only monitor and close open positions.", { reason: globalRisk.reason });
    }

    // Step 1.5: Auto-reset daily loss at UTC midnight
    const wasReset = await autoResetDailyLoss();
    if (wasReset) {
      logger.info("Daily loss auto-reset triggered (UTC midnight)");
    }

    // Step 2: Fetch candles
    logger.info("Fetching candles from Binance");
    const candles = await fetchCandles("BTCUSDT", "5m", 200);
    const currentPrice = candles[candles.length - 1]?.close ?? 0;
    logger.info(`Fetched ${candles.length} candles`, { count: candles.length });

    // Step 3: Detect market structure
    const marketStructure = detectMarketStructure(candles);
    logger.info("Market structure detected", {
      higherLows: marketStructure.higherLows.length,
      lowerHighs: marketStructure.lowerHighs.length,
    });

    // Step 4: Get active indicators
    const { data: indicators } = await getSupabase()
      .from("indicators")
      .select("id, name, config, is_active")
      .eq("is_active", true);

    if (!indicators || indicators.length === 0) {
      logger.warn("No active indicators found");
      await logger.flush();
      return NextResponse.json({
        status: "noop",
        reason: "No active indicators",
        requestId: logger.getRequestId(),
      });
    }

    logger.info(`Processing ${indicators.length} indicators`);

    // Step 5: Process each indicator sequentially
    const engine = new PaperTradingEngine();
    const results: Record<string, { signal: string; error?: string; durationMs?: number }> = {};

    for (const indicator of indicators) {
      const start = Date.now();
      try {
        logger.info(`Running indicator`, undefined, indicator.name);

        const result = runIndicator(indicator.name, candles, {
          id: indicator.id,
          name: indicator.name,
          config: indicator.config as Record<string, unknown>,
          isActive: indicator.is_active,
        });

        logger.info(`Signal: ${result.signal}`, { signal: result.signal }, indicator.name);
        results[indicator.name] = { signal: result.signal, durationMs: Date.now() - start };

        await processSignal(indicator.id, result.signal, candles, marketStructure, engine);
        if (currentPrice > 0) {
          await syncIndicatorEquity(indicator.id, currentPrice);
        }
        await recalculateMetrics(indicator.id);

        logger.info(`Processed successfully`, { durationMs: Date.now() - start }, indicator.name);
      } catch (error) {
        const errorMsg = formatError(error);
        const durationMs = Date.now() - start;
        logger.error(`Processing failed: ${errorMsg}`, { error: errorMsg, durationMs }, indicator.name);
        results[indicator.name] = { signal: "ERROR", error: errorMsg, durationMs };

        // Notify Telegram: per-indicator error
        await notifyCronIndicatorError({
          indicatorName: indicator.name,
          error: errorMsg,
          durationMs,
        }).catch(() => {}); // fire-and-forget, jangan sampai block engine
      }
    }

    // Step 6: Get updated metrics
    const metrics = await getAllMetrics();
    const executionTime = Date.now() - parseInt(logger.getRequestId().split("-")[0]!);

    logger.info("Execution completed", {
      executionTime,
      indicatorsProcessed: indicators.length,
    });

    // Flush logs to DB
    await logger.flush();

    return NextResponse.json({
      status: "success",
      requestId: logger.getRequestId(),
      executionTime,
      results,
      metrics: metrics.map((m) => ({
        name: m.indicator_name,
        trades: m.total_trades,
        winrate: m.winrate,
        profitFactor: m.profit_factor,
        maxDrawdown: m.max_drawdown,
        score: m.score,
      })),
    });
  } catch (error) {
    const errorMsg = formatError(error);
    logger.error(`Fatal error: ${errorMsg}`, { code: (error as any)?.code, details: errorMsg });
    await logger.flush();

    // Notify Telegram: fatal cron crash
    await notifyCronFatalError({
      error: errorMsg,
      requestId: logger.getRequestId(),
      executionTimeMs: Date.now() - parseInt(logger.getRequestId().split("-")[0]!),
    }).catch(() => {});

    return NextResponse.json(
      { status: "error", error: errorMsg, requestId: logger.getRequestId() },
      { status: 500 }
    );
  }
}

// ==========================================
// Manual Reset Endpoint (POST)
// ==========================================

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const requestSecret = request.headers.get("x-cron-secret");

  if (cronSecret && requestSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logger = new Logger();
  const body = await request.json();
  const { action } = body;

  try {
    switch (action) {
      case "reset_daily_loss":
        logger.info("Resetting daily loss counters");
        await resetDailyLoss();
        await logger.flush();
        return NextResponse.json({ status: "success", message: "Daily loss reset" });

      default:
        logger.warn("Unknown action", { action });
        await logger.flush();
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    const errorMsg = formatError(error);
    logger.error(`Reset failed: ${errorMsg}`, { error: errorMsg });
    await logger.flush();
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
