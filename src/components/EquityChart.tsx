"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";

interface EquityData {
  date: string;
  equity: number;
}

export function EquityChart({ data }: { data: EquityData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-center h-64 text-sm text-gray-500">
        No equity history available.
      </div>
    );
  }

  // Format data for chart
  const formattedData = data.map((d) => ({
    ...d,
    timeLabel: new Date(d.date).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }),
  }));

  const minEquity = Math.min(...data.map(d => d.equity));
  const maxEquity = Math.max(...data.map(d => d.equity));
  const padding = (maxEquity - minEquity) * 0.1;

  const yDomain = [
    Math.max(0, minEquity - padding),
    maxEquity + padding
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-4 h-80 flex flex-col">
      <div className="text-sm text-gray-400 mb-4">Equity Curve</div>
      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickMargin={10}
              minTickGap={30}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickFormatter={(val) => `$${val.toFixed(0)}`}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "none",
                borderRadius: "0.5rem",
                color: "#f3f4f6",
                fontSize: "12px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
              }}
              itemStyle={{ color: "#34d399", fontWeight: "bold" }}
              formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Equity"]}
              labelStyle={{ color: "#9ca3af", marginBottom: "4px" }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="#34d399"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorEquity)"
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
