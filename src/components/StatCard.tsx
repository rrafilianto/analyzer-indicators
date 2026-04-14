interface StatCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  color?: string;
}

export function StatCard({ label, value, suffix, color = "text-white" }: StatCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold mt-1 ${color}`}>
        {value}
        {suffix && <span className="text-sm ml-1 text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}
