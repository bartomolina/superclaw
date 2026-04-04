/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useState } from "react";

import { Clock3, Cpu, MemoryStick, RefreshCw } from "lucide-react";

import { authFetch } from "@/components/dashboard/auth";
import { fmt, fmtUptime } from "./utils";

function MetricCard({
  label,
  pct,
  detail,
  sub,
  loading,
}: {
  label: string;
  pct?: number;
  detail?: string;
  sub?: string;
  loading?: boolean;
}) {
  const tone = typeof pct === "number" ? (pct > 90 ? "text-red-400" : pct > 70 ? "text-amber-400" : "text-emerald-400") : "text-zinc-300 dark:text-zinc-600";
  const barTone = typeof pct === "number" ? (pct > 90 ? "bg-red-400" : pct > 70 ? "bg-amber-400" : "bg-emerald-400") : "bg-zinc-200 dark:bg-zinc-700";

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{label}</span>
        <span className={`text-2xl font-bold ${tone}`}>{loading || typeof pct !== "number" ? "—" : `${pct}%`}</span>
      </div>
      <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
      </div>
      <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{loading ? "Loading…" : detail || "—"}</div>
      <div className="text-[11px] text-zinc-400 truncate">{loading ? " " : sub || "—"}</div>
    </div>
  );
}


export function PerformancePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState(10);
  const [processSort, setProcessSort] = useState<"cpu" | "memory">("cpu");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "refresh") => {
      if (mode === "refresh" && refreshing) return;

      setNextRefreshIn(10);
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const next = await authFetch("/api/performance");
        setData(next);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [refreshing],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    const i = setInterval(() => {
      setNextRefreshIn((current) => {
        if (loading || refreshing) return current;
        if (current <= 1) {
          void load("refresh");
          return 10;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(i);
  }, [load, loading, refreshing]);

  const hasData = Boolean(data);
  const memPct = hasData && data.memory.total > 0 ? Math.round((data.memory.used / data.memory.total) * 100) : undefined;
  const diskPct = hasData && data.disk.total > 0 ? Math.round((data.disk.used / data.disk.total) * 100) : undefined;
  const cpuPct = hasData && typeof data.cpu.utilizationPct === "number" ? Math.round(data.cpu.utilizationPct) : undefined;
  const processes = data?.processes?.[processSort] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Performance</h1>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-400">{refreshing ? "Refreshing…" : `Refresh in ${nextRefreshIn}s`}</span>
          <button
            onClick={() => void load("refresh")}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        System uptime:{" "}
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{loading && !hasData ? "—" : hasData ? fmtUptime(data.uptime) : "—"}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="CPU"
          pct={cpuPct}
          detail={hasData ? `${data.cpu.loadAvg[0].toFixed(2)} / ${data.cpu.cores} cores` : undefined}
          sub={hasData ? data.cpu.model : undefined}
          loading={loading && !hasData}
        />
        <MetricCard
          label="Memory"
          pct={memPct}
          detail={hasData ? `${fmt(data.memory.used)} / ${fmt(data.memory.total)}` : undefined}
          sub={hasData ? `${fmt(data.memory.free)} free` : undefined}
          loading={loading && !hasData}
        />
        <MetricCard
          label="Disk"
          pct={diskPct}
          detail={hasData ? `${fmt(data.disk.used)} / ${fmt(data.disk.total)}` : undefined}
          sub={hasData ? `${fmt(data.disk.free)} free` : undefined}
          loading={loading && !hasData}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setProcessSort("cpu")}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              processSort === "cpu"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Top CPU
          </button>
          <button
            type="button"
            onClick={() => setProcessSort("memory")}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              processSort === "memory"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Top Memory
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          {!hasData && loading ? (
            <div className="px-5 py-4 text-sm text-zinc-400">Loading processes...</div>
          ) : processes.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-400">No process data available</div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {processes.map((proc: any) => (
                <div key={`${proc.pid}-${proc.command}`} className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="min-w-0 text-sm text-zinc-800 dark:text-zinc-200">
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-medium" title={proc.command}>{proc.command}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                      <span className="font-mono">{proc.pid}</span>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={12} className="shrink-0" />
                        <span>{proc.elapsed}</span>
                      </span>
                    </div>
                    {proc.cwd ? (
                      <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-zinc-400 dark:text-zinc-500" title={proc.cwd}>
                        {proc.cwd}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400 md:text-right">
                    <div className="flex items-center gap-3 md:justify-end">
                      <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                        <Cpu size={14} className="shrink-0" />
                        <span>{proc.cpuPct.toFixed(1)}%</span>
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">/</span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                        <MemoryStick size={14} className="shrink-0" />
                        <span>{fmt(proc.rssBytes || 0)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
