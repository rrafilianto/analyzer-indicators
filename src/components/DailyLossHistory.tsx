"use client";

import { useState, useEffect, useCallback } from "react";

interface DailyEntry {
  id: string;
  indicatorId: string;
  indicatorName: string;
  date: string;
  dailyLoss: number;
  dailyPnl: number;
  balanceBefore: number;
  balanceAfter: number;
  equityBefore: number;
}

const INDICATOR_COLORS: Record<string, string> = {
  ema_crossover: "#60a5fa",
  macd: "#f472b6",
  supertrend: "#34d399",
  rsi_70_30: "#fbbf24",
  rsi_50_cross: "#a78bfa",
  bollinger: "#fb923c",
};

export function DailyLossHistory({ indicatorName }: { indicatorName?: string }) {
  const [history, setHistory] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/dashboard/daily-history?days=30`;
      if (indicatorName) url += `&indicatorName=${indicatorName}`;

      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      setHistory(json.history ?? []);
    } catch (error) {
      console.error("Failed to fetch daily history:", error);
    } finally {
      setLoading(false);
    }
  }, [indicatorName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 text-center text-gray-500 text-sm">
        Loading daily history...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-400 mb-2">Daily PnL History</div>
        <div className="text-center py-6 text-gray-600 text-sm">
          No daily history yet. Data will appear after the first UTC midnight reset.
        </div>
      </div>
    );
  }

  // Group by date
  const byDate = new Map<string, DailyEntry[]>();
  history.forEach((entry) => {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date)!.push(entry);
  });

  const dates = [...byDate.keys()].sort();
  const allPnL = history.map((h) => h.dailyPnl);
  const maxAbs = Math.max(...allPnL.map(Math.abs), 1);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400 mb-3">Daily PnL History</div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 text-gray-500">
              <th className="text-left py-2 px-2">Date</th>
              {indicatorName ? null : <th className="text-left py-2 px-2">Indicator</th>}
              <th className="text-right py-2 px-2">Daily Loss</th>
              <th className="text-right py-2 px-2">Daily PnL</th>
              <th className="text-right py-2 px-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-800">
                <td className="py-2 px-2 text-gray-400 whitespace-nowrap">
                  {new Date(entry.date).toLocaleDateString()}
                </td>
                {indicatorName ? null : (
                  <td className="py-2 px-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1"
                      style={{ backgroundColor: INDICATOR_COLORS[entry.indicatorName] ?? "#9ca3af" }}
                    />
                    <span className="text-gray-300">{entry.indicatorName}</span>
                  </td>
                )}
                <td className={`text-right py-2 px-2 font-mono ${entry.dailyLoss > 0 ? "text-red-400" : "text-gray-600"}`}>
                  {entry.dailyLoss > 0 ? `-$${entry.dailyLoss.toFixed(2)}` : "—"}
                </td>
                <td className={`text-right py-2 px-2 font-mono font-semibold ${entry.dailyPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {entry.dailyPnl >= 0 ? "+" : ""}${entry.dailyPnl.toFixed(2)}
                </td>
                <td className="text-right py-2 px-2 font-mono text-gray-300">
                  ${entry.balanceBefore.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mini bar chart for current indicator */}
      {indicatorName && history.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-2">PnL Trend</div>
          <div className="flex items-end gap-1 h-16">
            {history.slice(0, 14).reverse().map((entry) => {
              const pct = Math.min(Math.abs(entry.dailyPnl) / maxAbs * 100, 100);
              const isPositive = entry.dailyPnl >= 0;
              return (
                <div
                  key={entry.id}
                  className="flex-1 flex flex-col justify-end"
                  title={`${entry.date}: ${entry.dailyPnl >= 0 ? "+" : ""}$${entry.dailyPnl.toFixed(2)}`}
                >
                  <div
                    className={`w-full rounded-t ${isPositive ? "bg-emerald-500" : "bg-red-500"}`}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-600">
              {new Date(history[0].date).toLocaleDateString()}
            </span>
            <span className="text-xs text-gray-600">
              {new Date(history[history.length - 1].date).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
