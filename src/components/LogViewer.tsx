"use client";

import { useState, useCallback } from "react";

interface LogEntry {
  id: string;
  requestId: string;
  level: string;
  indicator: string | null;
  message: string;
  context: Record<string, unknown> | null;
  timestamp: string;
}

const levelStyles: Record<string, string> = {
  info: "text-blue-400 bg-blue-900/30",
  warn: "text-yellow-400 bg-yellow-900/30",
  error: "text-red-400 bg-red-900/30",
  debug: "text-gray-400 bg-gray-800/30",
};

export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterIndicator, setFilterIndicator] = useState<string>("all");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/dashboard/logs?limit=100";
      if (filterLevel !== "all") url += `&level=${filterLevel}`;
      if (filterIndicator !== "all") url += `&indicator=${filterIndicator}`;

      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      setLogs(json.logs ?? []);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setLoading(false);
    }
  }, [filterLevel, filterIndicator]);

  const handleOpen = () => {
    setOpen(true);
    fetchLogs();
  };

  const handleClose = () => {
    setOpen(false);
    setLogs([]);
  };

  // Unique indicators for filter dropdown
  const indicators = [...new Set(logs.map((l) => l.indicator).filter((i): i is string => i !== null))];

  return (
    <div className="bg-gray-800 rounded-lg">
      {/* Toggle button */}
      <button
        onClick={open ? handleClose : handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <span className="font-medium">Execution Logs</span>
        <span className="text-xs">{open ? "▼" : "▶"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-700">
          {/* Filters */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Level:</label>
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
              >
                <option value="all">All</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Indicator:</label>
              <select
                value={filterIndicator}
                onChange={(e) => setFilterIndicator(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
              >
                <option value="all">All</option>
                {indicators.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="ml-auto text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              {loading ? "Loading..." : "↻ Refresh"}
            </button>
          </div>

          {/* Log entries */}
          <div className="max-h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-sm">
                {loading ? "Loading logs..." : "No logs found"}
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {logs.map((log) => (
                  <div key={log.id} className="px-4 py-2 text-xs font-mono hover:bg-gray-750">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${levelStyles[log.level] ?? levelStyles.info}`}>
                        {log.level.toUpperCase()}
                      </span>
                      {log.indicator && (
                        <span className="text-purple-400 whitespace-nowrap">[{log.indicator}]</span>
                      )}
                      <span className="text-gray-300 truncate">{log.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
