"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PositionBadge } from "../../../components/PositionBadge";
import { TradeTable } from "../../../components/TradeTable";
import { StatCard } from "../../../components/StatCard";
import { DailyLossHistory } from "../../../components/DailyLossHistory";

interface Trade {
  id: string;
  pnl: number;
  rMultiple: number | null;
  duration: number | null;
  exitReason: string;
  exitedAt: string;
  side: string;
  entryPrice: number;
}

interface IndicatorDetail {
  id: string;
  name: string;
  isActive: boolean;
  balance: number;
  equity: number;
  dailyLoss: number;
  isHalted: boolean;
  totalTrades: number;
  winrate: number;
  profitFactor: number;
  maxDrawdown: number;
  score: number;
  metricsUpdatedAt: string;
  pnlRealized: number;
  pnlUnrealized: number;
}

interface DetailData {
  indicator: IndicatorDetail;
  openPosition: {
    id: string;
    side: string;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    size: number;
    leverage: number;
    opened_at: string;
  } | null;
  trades: Trade[];
  hasMoreTrades: boolean;
  currentPrice: number | null;
}

const TRADE_PAGE_SIZE = 10;

const indicatorLabels: Record<string, string> = {
  ema_crossover: "EMA Cross (9/21)",
  macd: "MACD (12,26,9)",
  supertrend: "Supertrend",
  rsi_70_30: "RSI 70/30",
  rsi_50_cross: "RSI 50 Cross",
  bollinger: "Bollinger Bands",
};

export default function IndicatorDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const [name, setName] = useState<string>("");
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    params.then((p) => setName(p.name));
  }, [params]);

  const fetchData = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/indicator/${name}?limit=${TRADE_PAGE_SIZE}&offset=0`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Failed to fetch indicator data:", error);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadMoreTrades = useCallback(async () => {
    if (!name || !data || loadingMore || !data.hasMoreTrades) return;
    setLoadingMore(true);
    try {
      const offset = data.trades.length;
      const res = await fetch(
        `/api/dashboard/indicator/${name}?limit=${TRADE_PAGE_SIZE}&offset=${offset}`,
        { cache: "no-store" }
      );
      const json: DetailData = await res.json();
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          trades: [...prev.trades, ...(json.trades || [])],
          hasMoreTrades: json.hasMoreTrades,
        };
      });
    } catch (error) {
      console.error("Failed to load more trades:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [name, data, loadingMore]);

  if (!name) return null;

  const indicator = data?.indicator;

  if (!indicator) return null;

  const scoreColor =
    indicator.score >= 0.7
      ? "text-emerald-400"
      : indicator.score >= 0.4
      ? "text-yellow-400"
      : "text-red-400";
  const drawdownPercent = indicator.maxDrawdown * 100;
  const drawdownBarWidth = Math.min(Math.max(drawdownPercent, 0), 100);
  const pnlRealizedColor = indicator.pnlRealized >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlUnrealizedColor = indicator.pnlUnrealized >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-lg font-bold">
              {indicatorLabels[name] ?? name}
            </h1>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm px-4 py-2 rounded"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {!data ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">Loading...</p>
          </div>
        ) : (
          <>
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Balance" value={`$${indicator.balance.toFixed(2)}`} />
              <StatCard label="Equity" value={`$${indicator.equity.toFixed(2)}`} />
              <StatCard label="Winrate" value={(indicator.winrate * 100).toFixed(1)} suffix="%" />
              <StatCard label="Profit Factor" value={indicator.profitFactor.toFixed(2)} />
              <StatCard label="Score" value={indicator.score.toFixed(3)} color={scoreColor} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Total Trades" value={indicator.totalTrades} />
              <StatCard
                label="Max Drawdown"
                value={drawdownPercent.toFixed(1)}
                suffix="%"
                color="text-red-400"
              />
              <StatCard label="Daily Loss" value={`$${indicator.dailyLoss.toFixed(2)}`} />
              <StatCard
                label="PnL Realized"
                value={`${indicator.pnlRealized >= 0 ? "+" : "-"}$${Math.abs(indicator.pnlRealized).toFixed(2)}`}
                color={pnlRealizedColor}
              />
              <StatCard
                label="PnL Unrealized"
                value={`${indicator.pnlUnrealized >= 0 ? "+" : "-"}$${Math.abs(indicator.pnlUnrealized).toFixed(2)}`}
                color={pnlUnrealizedColor}
              />
            </div>

            {/* Progress bars for key metrics */}
            <div className="bg-gray-800 rounded-lg p-4 space-y-3">
              <div className="text-sm text-gray-400 mb-2">Performance Breakdown</div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Winrate</span>
                  <span className="text-gray-300">{(indicator.winrate * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${indicator.winrate * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Score</span>
                  <span className="text-gray-300">{indicator.score.toFixed(3)}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      indicator.score >= 0.7 ? "bg-emerald-500" : indicator.score >= 0.4 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${indicator.score * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Drawdown</span>
                  <span className="text-gray-300">{drawdownPercent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full transition-all"
                    style={{ width: `${drawdownBarWidth}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Open Position */}
            {data.openPosition ? (
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <PositionBadge side={data.openPosition.side as "long" | "short"} />
                  <span className="text-sm font-semibold text-white">Open Position</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Entry</div>
                    <div className="font-mono text-white">{data.openPosition.entry_price.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Stop Loss</div>
                    <div className="font-mono text-red-400">{data.openPosition.stop_loss.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Take Profit</div>
                    <div className="font-mono text-emerald-400">{data.openPosition.take_profit.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Size</div>
                    <div className="font-mono text-white">${data.openPosition.size}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Leverage</div>
                    <div className="font-mono text-white">{data.openPosition.leverage}x</div>
                  </div>
                </div>
                {data.currentPrice && (
                  <div className="mt-3 text-xs text-gray-500">
                    Current Price:{" "}
                    <span className="font-mono text-white">{data.currentPrice.toLocaleString()}</span>
                  </div>
                )}
                <div className="mt-1 text-xs text-gray-500">
                  Opened: {new Date(data.openPosition.opened_at).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-4 text-center text-gray-500 text-sm">
                No open position
              </div>
            )}

            {/* Trade History */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-3">Trade History</div>
              <TradeTable trades={data.trades} />
              {data.hasMoreTrades && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={loadMoreTrades}
                    disabled={loadingMore}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-xs px-3 py-1.5 rounded"
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </div>

            {/* Daily Loss History */}
            <DailyLossHistory indicatorName={name} />

            {/* Metadata */}
            <div className="text-xs text-gray-600 text-center">
              Metrics updated: {indicator.metricsUpdatedAt ? new Date(indicator.metricsUpdatedAt).toLocaleString() : "Never"}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
