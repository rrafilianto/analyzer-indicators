import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

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
}

export function MultiEquityChart({ datasets }: EquityChartProps) {
  const allPoints = datasets.flatMap((d) => d.data);

  if (allPoints.length < 2) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 h-80 flex flex-col items-center justify-center">
        <div className="text-sm text-gray-400 mb-2">Equity Curve</div>
        <div className="text-center text-gray-600 text-sm">
          Not enough trade data yet. Run the cron to start collecting data.
        </div>
      </div>
    );
  }

  // Find min/max for YAxis
  const allValues = allPoints.map((p) => p.equity);
  const minEquity = Math.min(...allValues);
  const maxEquity = Math.max(...allValues);
  const padding = (maxEquity - minEquity) * 0.1 || 10;

  const yDomain = [
    Math.max(0, minEquity - padding),
    maxEquity + padding
  ];

  // Map dates to timestamps for a continuous time scale XAxis
  const datasetsWithTimestamp = datasets.map(ds => ({
    ...ds,
    data: ds.data.map(p => ({
      ...p,
      timestamp: new Date(p.date).getTime()
    }))
  }));

  const formatTime = (tickItem: number) => {
    return new Date(tickItem).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 h-[400px] flex flex-col">
      <div className="text-sm text-gray-400 mb-4">Equity Curve Overview</div>
      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTime}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickMargin={10}
              axisLine={false}
              tickLine={false}
              allowDuplicatedCategory={false}
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
              labelFormatter={(label) => formatTime(label as number)}
              formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name]}
            />
            <Legend 
              wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
              iconType="circle"
            />
            {datasetsWithTimestamp.map((ds) => (
              <Line
                key={ds.label}
                data={ds.data}
                name={ds.label}
                dataKey="equity"
                type="monotone"
                stroke={ds.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                animationDuration={1500}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
