/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useState } from "react";

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

function SmallStatCard({ label, value, loading }: { label: string; value?: string; loading?: boolean }) {
  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
      <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">{label}</div>
      <div className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 mt-1">{loading ? "—" : value || "—"}</div>
    </div>
  );
}

export function PerformancePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    authFetch("/api/performance")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    authFetch("/api/performance")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const i = setInterval(refresh, 10000);
    return () => clearInterval(i);
  }, [refresh]);

  const hasData = Boolean(data);
  const memPct = hasData && data.memory.total > 0 ? Math.round((data.memory.used / data.memory.total) * 100) : undefined;
  const diskPct = hasData && data.disk.total > 0 ? Math.round((data.disk.used / data.disk.total) * 100) : undefined;
  const loadPct = hasData && data.cpu.cores > 0 ? Math.round((data.cpu.loadAvg[0] / data.cpu.cores) * 100) : undefined;
  const processes = data?.processes || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Performance</h1>
        <span className="text-[11px] text-zinc-400">Auto-refreshes every 10s</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="CPU Load"
          pct={loadPct}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SmallStatCard label="System Uptime" value={hasData ? fmtUptime(data.uptime) : undefined} loading={loading && !hasData} />
        <SmallStatCard label="Tracked Processes" value={hasData ? String(processes.length) : undefined} loading={loading && !hasData} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Processes</h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          {!hasData && loading ? (
            <div className="px-5 py-4 text-sm text-zinc-400">Loading processes...</div>
          ) : processes.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-400">No process data available</div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {processes.map((proc: any) => (
                <div key={`${proc.pid}-${proc.command}`} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-800 dark:text-zinc-200">
                      <span className="font-medium">{proc.command}</span>
                      <span className="ml-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">pid {proc.pid}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">running for {proc.elapsed}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    <div>CPU {proc.cpuPct.toFixed(1)}%</div>
                    <div>MEM {proc.memPct.toFixed(1)}%</div>
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
