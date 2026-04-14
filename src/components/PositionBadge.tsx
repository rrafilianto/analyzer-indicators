export function PositionBadge({ side }: { side: "long" | "short" }) {
  const styles =
    side === "long"
      ? "bg-emerald-900/50 text-emerald-400 border-emerald-700"
      : "bg-red-900/50 text-red-400 border-red-700";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${styles}`}>
      {side.toUpperCase()}
    </span>
  );
}
