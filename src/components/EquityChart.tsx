interface EquityPoint {
  date: string;
  equity: number;
}

interface EquityDataset {
  label: string;
  data: EquityPoint[];
  color: string;
}

interface EquityChartProps {
  datasets: EquityDataset[];
  width?: number;
  height?: number;
}

// Consistent color palette for indicators
const INDICATOR_COLORS: Record<string, string> = {
  ema_crossover: "#60a5fa",    // blue
  macd: "#f472b6",            // pink
  supertrend: "#34d399",       // green
  rsi_70_30: "#fbbf24",        // yellow
  rsi_50_cross: "#a78bfa",     // purple
  bollinger: "#fb923c",        // orange
};

export function EquityChart({ datasets, width = 800, height = 200 }: EquityChartProps) {
  // Flatten all points to find global min/max
  const allPoints = datasets.flatMap((d) => d.data);

  if (allPoints.length < 2) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-400">Equity Curve</div>
        <div className="text-center py-8 text-gray-600 text-sm">
          Not enough trade data yet. Run the cron to start collecting data.
        </div>
      </div>
    );
  }

  const allValues = allPoints.map((p) => p.equity);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const padding = { top: 20, right: 20, bottom: 30, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Collect all unique dates for x-axis
  const allDates = [...new Set(allPoints.map((p) => p.date))].sort();
  const dateToIndex = new Map<string, number>();
  allDates.forEach((d, i) => dateToIndex.set(d, i));

  function toX(date: string): number {
    const idx = dateToIndex.get(date) ?? 0;
    return padding.left + (allDates.length > 1 ? (idx / (allDates.length - 1)) * chartW : chartW / 2);
  }

  function toY(equity: number): number {
    return padding.top + chartH - ((equity - min) / range) * chartH;
  }

  // Format date for label
  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  }

  // Grid line values
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400 mb-2">Equity Curve</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Grid lines */}
        {gridLines.map((pct) => {
          const y = padding.top + pct * chartH;
          const val = min + (1 - pct) * range;
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#374151"
                strokeWidth="0.5"
                strokeDasharray="2,4"
              />
              <text x={padding.left - 6} y={y + 3} fill="#9ca3af" fontSize="9" textAnchor="end">
                {val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels (show subset) */}
        {allDates.map((date, i) => {
          // Show at most 6 labels
          const step = Math.max(1, Math.floor(allDates.length / 6));
          if (i % step !== 0 && i !== allDates.length - 1) return null;
          const x = toX(date);
          return (
            <text key={date} x={x} y={height - 4} fill="#6b7280" fontSize="8" textAnchor="middle">
              {formatDate(date)}
            </text>
          );
        })}

        {/* Lines per dataset */}
        {datasets.map((ds) => {
          if (ds.data.length < 1) return null;
          const points = ds.data.map((p) => `${toX(p.date)},${toY(p.equity)}`);
          const isProfitable = ds.data.length > 0 && ds.data[ds.data.length - 1].equity >= ds.data[0].equity;
          const lineColor = isProfitable ? "#10b981" : "#ef4444";

          return (
            <polyline
              key={ds.label}
              points={points.join(" ")}
              fill="none"
              stroke={ds.color}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {datasets.map((ds) => (
          <div key={ds.label} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: ds.color }} />
            <span className="text-xs text-gray-400">{ds.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
