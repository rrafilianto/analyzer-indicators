"use client";

import { useState } from "react";

interface KillSwitchProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function KillSwitch({ enabled, onToggle }: KillSwitchProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await fetch("/api/dashboard/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_kill_switch", enabled: !enabled }),
      });
      onToggle(!enabled);
    } catch (error) {
      console.error("Failed to toggle kill switch:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400">Kill Switch</span>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          enabled ? "bg-red-600" : "bg-gray-600"
        } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            enabled ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
      <span
        className={`text-xs font-semibold ${
          enabled ? "text-red-400" : "text-emerald-400"
        }`}
      >
        {enabled ? "ACTIVE" : "OFF"}
      </span>
    </div>
  );
}
