"use client";

import { useState, useCallback, useEffect } from "react";
import { IndicatorCard } from "../components/IndicatorCard";
import { KillSwitch } from "../components/KillSwitch";
import { RiskConfig } from "../components/RiskConfig";
import { EquityChart } from "../components/EquityChart";
import { LogViewer } from "../components/LogViewer";

const INDICATOR_COLORS: Record<string, string> = {
  ema_crossover: "#60a5fa",
  macd: "#f472b6",
  supertrend: "#34d399",
  rsi_70_30: "#fbbf24",
  rsi_50_cross: "#a78bfa",
  bollinger: "#fb923c",
};

interface IndicatorData {
  id: string;
  name: string;
  isActive: boolean;
  balance: number;
  equity: number;
  pnlRealized: number;
  pnlUnrealized: number;
  roi: number;
  dailyLoss: number;
  isHalted: boolean;
  totalTrades: number;
  winrate: number;
  profitFactor: number;
  maxDrawdown: number;
  score: number;
  equityHistory: { date: string; equity: number }[];
  openPosition: {
    side: string;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
  } | null;
}

interface DashboardData {
  indicators: IndicatorData[];
  killSwitch: boolean;
  maxDailyLoss: number;
  positionSize: number;
  leverage: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = async (indicatorId: string, isActive: boolean) => {
    try {
      await fetch("/api/dashboard/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_indicator", indicatorId, isActive }),
      });
      // Update local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          indicators: prev.indicators.map((ind) =>
            ind.id === indicatorId ? { ...ind, isActive } : ind
          ),
        };
      });
    } catch (error) {
      console.error("Failed to toggle indicator:", error);
    }
  };

  const handleKillSwitch = (enabled: boolean) => {
    setData((prev) => (prev ? { ...prev, killSwitch: enabled } : prev));
  };

  const handleConfigSaved = () => {
    fetchData();
  };

  // Auto-load data on first visit
  useEffect(() => {
    fetchData();
  }, []);

  // Build equity chart datasets from trade history
  const equityDatasets =
    data?.indicators.map((ind) => ({
      label: ind.name,
      data: ind.equityHistory ?? [],
      color: INDICATOR_COLORS[ind.name] ?? "#9ca3af",
    })) ?? [];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">BTC Futures Indicator Research Engine</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {lastUpdated ? `Last updated: ${lastUpdated}` : "Click refresh to load data"}
            </p>
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

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Status Bar */}
        {data && (
          <div className="flex items-center gap-6">
            <KillSwitch enabled={data.killSwitch} onToggle={handleKillSwitch} />
            <div className="text-xs text-gray-500">
              Max Daily Loss: <span className="text-gray-300">${data.maxDailyLoss}</span>
            </div>
            <div className="text-xs text-gray-500">
              Position Size: <span className="text-gray-300">${data.positionSize}</span>
            </div>
            <div className="text-xs text-gray-500">
              Leverage: <span className="text-gray-300">{data.leverage}x</span>
            </div>
          </div>
        )}

        {/* Risk Config */}
        {data && (
          <RiskConfig
            maxDailyLoss={data.maxDailyLoss}
            positionSize={data.positionSize}
            leverage={data.leverage}
            onSaved={handleConfigSaved}
          />
        )}

        {/* Equity Chart */}
        <EquityChart datasets={equityDatasets} />

        {/* Indicator Cards */}
        {!data ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No data loaded</p>
            <p className="text-sm mt-2">Click Refresh to fetch dashboard data</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.indicators.map((indicator) => (
              <IndicatorCard
                key={indicator.id}
                id={indicator.id}
                name={indicator.name}
                isActive={indicator.isActive}
                balance={indicator.balance}
                equity={indicator.equity}
                pnlRealized={indicator.pnlRealized}
                pnlUnrealized={indicator.pnlUnrealized}
                roi={indicator.roi}
                dailyLoss={indicator.dailyLoss}
                isHalted={indicator.isHalted}
                totalTrades={indicator.totalTrades}
                winrate={indicator.winrate}
                score={indicator.score}
                openPosition={indicator.openPosition}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}

        {/* Execution Logs */}
        <LogViewer />
      </main>
    </div>
  );
}
