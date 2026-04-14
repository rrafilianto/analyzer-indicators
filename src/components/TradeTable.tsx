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

const exitReasonLabels: Record<string, string> = {
  tp: "Take Profit",
  sl: "Stop Loss",
  reverse: "Reverse Signal",
};

export function TradeTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No trades yet. Waiting for signals...
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
            <th className="text-left py-2 px-3">Side</th>
            <th className="text-right py-2 px-3">Entry</th>
            <th className="text-right py-2 px-3">PnL</th>
            <th className="text-right py-2 px-3">R</th>
            <th className="text-right py-2 px-3">Duration</th>
            <th className="text-left py-2 px-3">Exit</th>
            <th className="text-right py-2 px-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id} className="border-b border-gray-800">
              <td className="py-2 px-3">
                <span
                  className={`text-xs font-semibold ${
                    trade.side === "long" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {trade.side.toUpperCase()}
                </span>
              </td>
              <td className="text-right py-2 px-3 font-mono">
                {trade.entryPrice.toLocaleString()}
              </td>
              <td
                className={`text-right py-2 px-3 font-mono font-semibold ${
                  trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {trade.pnl >= 0 ? "+" : ""}
                {trade.pnl.toFixed(2)}
              </td>
              <td className="text-right py-2 px-3 font-mono text-gray-300">
                {trade.rMultiple !== null ? trade.rMultiple.toFixed(2) : "—"}
              </td>
              <td className="text-right py-2 px-3 text-gray-300">
                {trade.duration !== null ? `${trade.duration}m` : "—"}
              </td>
              <td className="text-left py-2 px-3 text-gray-300">
                {exitReasonLabels[trade.exitReason] ?? trade.exitReason}
              </td>
              <td className="text-right py-2 px-3 text-gray-400 text-xs">
                {new Date(trade.exitedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
