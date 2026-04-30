"use client";

import Link from "next/link";
import { PositionBadge } from "./PositionBadge";

interface IndicatorCardProps {
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
  score: number;
  openPosition: {
    side: string;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
  } | null;
  onToggle: (id: string, isActive: boolean) => void;
}

const indicatorLabels: Record<string, string> = {
  ema_crossover: "EMA Cross (9/21)",
  macd: "MACD (12,26,9)",
  supertrend: "Supertrend",
  rsi_70_30: "RSI 70/30",
  rsi_70_30_v2: "RSI 70/30 V2",
  rsi_50_cross: "RSI 50 Cross",
  bollinger: "Bollinger Bands",
  bollinger_v2: "Bollinger Bands V2",
};

export function IndicatorCard({
  id,
  name,
  isActive,
  balance,
  equity,
  pnlRealized,
  pnlUnrealized,
  roi,
  dailyLoss,
  isHalted,
  totalTrades,
  winrate,
  score,
  openPosition,
  onToggle,
}: IndicatorCardProps) {
  const scoreColor =
    score >= 0.7 ? "text-emerald-400" : score >= 0.4 ? "text-yellow-400" : "text-red-400";
  const pnlRealizedColor = pnlRealized >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlUnrealizedColor = pnlUnrealized >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 border transition-colors ${
        isHalted ? "border-red-700 opacity-60" : isActive ? "border-gray-700" : "border-gray-800 opacity-50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <Link href={`/indicators/${name}`} className="hover:underline">
          <h3 className="text-sm font-semibold text-white">
            {indicatorLabels[name] ?? name}
          </h3>
        </Link>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold ${isActive ? 'text-emerald-400' : 'text-gray-500'}`}>
            {isActive ? 'ACTIVE' : 'HALTED'}
          </span>
          <button
            onClick={() => onToggle(id, !isActive)}
            title={isActive ? "Halt Indicator" : "Activate Indicator"}
            className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none cursor-pointer ${
              isActive ? "bg-emerald-600" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                isActive ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Balance & Equity */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-xs text-gray-500">Balance</div>
          <div className="text-sm font-mono text-white">${balance.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Equity</div>
          <div className="text-sm font-mono text-white">${equity.toFixed(2)}</div>
        </div>
      </div>

      {/* PnL & ROI */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div className="text-xs text-gray-500">PnL Rlz</div>
          <div className={`text-sm font-mono ${pnlRealizedColor}`}>
            {pnlRealized >= 0 ? "+" : "-"}${Math.abs(pnlRealized).toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">PnL Unrlz</div>
          <div className={`text-sm font-mono ${pnlUnrealizedColor}`}>
            {pnlUnrealized >= 0 ? "+" : "-"}${Math.abs(pnlUnrealized).toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">ROI</div>
          <div className={`text-sm font-mono ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {roi >= 0 ? "+" : ""}{roi.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
        <div>
          <span className="text-gray-500">Trades</span>
          <div className="text-white font-mono">{totalTrades}</div>
        </div>
        <div>
          <span className="text-gray-500">Winrate</span>
          <div className="text-white font-mono">{(winrate * 100).toFixed(1)}%</div>
        </div>
        <div>
          <span className="text-gray-500">Score</span>
          <div className={`font-mono font-bold ${scoreColor}`}>{(score * 100).toFixed(1)}</div>
        </div>
      </div>

      {/* Daily Loss */}
      <div className="text-xs text-gray-500 mb-2">
        Daily Loss:{" "}
        <span className={dailyLoss > 0 ? "text-red-400" : "text-gray-400"}>
          ${dailyLoss.toFixed(2)}
        </span>
      </div>

      {/* Open Position */}
      {openPosition ? (
        <div className="border-t border-gray-700 pt-2 mt-2">
          <div className="flex items-center gap-2 mb-1">
            <PositionBadge side={openPosition.side as "long" | "short"} />
            <span className="text-xs text-gray-400">Open</span>
          </div>
          <div className="text-xs text-gray-500 grid grid-cols-3 gap-2">
            <div>
              Entry: <span className="text-gray-300 font-mono">{openPosition.entry_price.toFixed(0)}</span>
            </div>
            <div>
              SL: <span className="text-red-400 font-mono">{openPosition.stop_loss.toFixed(0)}</span>
            </div>
            <div>
              TP: <span className="text-emerald-400 font-mono">{openPosition.take_profit.toFixed(0)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-600 mt-2">No open position</div>
      )}

      {/* Halted badge */}
      {isHalted && (
        <div className="mt-2 text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded text-center">
          HALTED
        </div>
      )}
    </div>
  );
}
