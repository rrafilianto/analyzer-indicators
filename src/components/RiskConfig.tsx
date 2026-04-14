"use client";

import { useState } from "react";

interface RiskConfigProps {
  maxDailyLoss: number;
  positionSize: number;
  leverage: number;
  onSaved: () => void;
}

export function RiskConfig({ maxDailyLoss, positionSize, leverage, onSaved }: RiskConfigProps) {
  const [values, setValues] = useState({
    maxDailyLoss: maxDailyLoss.toString(),
    positionSize: positionSize.toString(),
    leverage: leverage.toString(),
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    try {
      await Promise.all([
        fetch("/api/dashboard/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_max_daily_loss",
            value: parseFloat(values.maxDailyLoss),
          }),
        }),
        fetch("/api/dashboard/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_position_size",
            value: parseFloat(values.positionSize),
          }),
        }),
        fetch("/api/dashboard/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_leverage",
            value: parseInt(values.leverage),
          }),
        }),
      ]);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save config:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400 mb-3">Risk Configuration</div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-gray-500 uppercase">Max Daily Loss ($)</label>
          <input
            type="number"
            value={values.maxDailyLoss}
            onChange={(e) => setValues((v) => ({ ...v, maxDailyLoss: e.target.value }))}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm mt-1 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Position Size ($)</label>
          <input
            type="number"
            value={values.positionSize}
            onChange={(e) => setValues((v) => ({ ...v, positionSize: e.target.value }))}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm mt-1 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Leverage</label>
          <input
            type="number"
            value={values.leverage}
            onChange={(e) => setValues((v) => ({ ...v, leverage: e.target.value }))}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm mt-1 text-white"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded"
        >
          {loading ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved!</span>}
      </div>
    </div>
  );
}
