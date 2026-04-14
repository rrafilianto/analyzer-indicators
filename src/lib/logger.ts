import { getSupabase } from "./supabase";

// ==========================================
// Structured Logger
//
// Persists logs to Supabase execution_logs table.
// Falls back to console output if DB unavailable.
// ==========================================

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string;
  requestId: string;
  level: LogLevel;
  indicator?: string;
  message: string;
  context?: Record<string, unknown>;
}

export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class Logger {
  private requestId: string;
  private entries: LogEntry[] = [];

  constructor(requestId?: string) {
    this.requestId = requestId ?? generateRequestId();
  }

  getRequestId(): string {
    return this.requestId;
  }

  getEntries(): LogEntry[] {
    return this.entries;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, indicator?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      level,
      indicator,
      message,
      context,
    };

    this.entries.push(entry);

    // Console fallback (always output)
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const indicatorPrefix = indicator ? ` [${indicator}]` : "";
    const msg = `${prefix}${indicatorPrefix} ${message}`;

    switch (level) {
      case "error":
        console.error(msg, context ?? "");
        break;
      case "warn":
        console.warn(msg, context ?? "");
        break;
      case "debug":
        console.debug(msg, context ?? "");
        break;
      default:
        console.log(msg, context ?? "");
    }
  }

  info(message: string, context?: Record<string, unknown>, indicator?: string) {
    this.log("info", message, context, indicator);
  }

  warn(message: string, context?: Record<string, unknown>, indicator?: string) {
    this.log("warn", message, context, indicator);
  }

  error(message: string, context?: Record<string, unknown>, indicator?: string) {
    this.log("error", message, context, indicator);
  }

  debug(message: string, context?: Record<string, unknown>, indicator?: string) {
    this.log("debug", message, context, indicator);
  }

  /**
   * Persist all collected log entries to Supabase.
   * Called at end of cron execution.
   */
  async flush(): Promise<void> {
    if (this.entries.length === 0) return;

    try {
      const db = getSupabase();
      const rows = this.entries.map((e) => ({
        request_id: e.requestId,
        level: e.level,
        indicator_name: e.indicator ?? null,
        message: e.message,
        context: e.context ?? null,
        created_at: e.timestamp,
      }));

      const { error } = await db.from("execution_logs").insert(rows);
      if (error) {
        console.error("[Logger] Failed to persist logs:", error);
      }
    } catch (err) {
      // Graceful degradation — don't crash if logging fails
      console.error("[Logger] Exception during flush:", err);
    }
  }
}
