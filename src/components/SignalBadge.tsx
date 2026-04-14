import type { Signal } from "../engine/types";

const signalStyles: Record<Signal, string> = {
  LONG: "bg-emerald-900/50 text-emerald-400 border-emerald-700",
  SHORT: "bg-red-900/50 text-red-400 border-red-700",
  NEUTRAL: "bg-gray-700/50 text-gray-400 border-gray-600",
};

export function SignalBadge({ signal }: { signal: Signal }) {
  const style = signalStyles[signal] || signalStyles.NEUTRAL;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${style}`}>
      {signal}
    </span>
  );
}
