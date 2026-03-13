/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";

import { authFetch } from "@/components/dashboard/auth";
import { fmt, fmtUptime } from "./utils";

export function PerformancePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = () => {
    setLoading(true);
    authFetch("/api/performance")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

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
  }, []);

  useEffect(() => {
    const i = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(i);
  }, []);

  if (loading && !data) return <div className="text-center text-zinc-400 py-12">Loading...</div>;
  if (!data) return <div className="text-center text-zinc-400 py-12">Failed to load performance data</div>;

  const memPct = ((data.memory.used / data.memory.total) * 100).toFixed(0);
  const diskPct = ((data.disk.used / data.disk.total) * 100).toFixed(0);
  const loadPct = ((data.cpu.loadAvg[0] / data.cpu.cores) * 100).toFixed(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Performance</h1>
        <span className="text-[11px] text-zinc-400">Auto-refreshes every 10s</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "CPU Load",
            pct: Number(loadPct),
            detail: `${data.cpu.loadAvg[0].toFixed(2)} / ${data.cpu.cores} cores`,
            sub: data.cpu.model,
          },
          {
            label: "Memory",
            pct: Number(memPct),
            detail: `${fmt(data.memory.used)} / ${fmt(data.memory.total)}`,
            sub: `${fmt(data.memory.free)} free`,
          },
          {
            label: "Disk",
            pct: Number(diskPct),
            detail: `${fmt(data.disk.used)} / ${fmt(data.disk.total)}`,
            sub: `${fmt(data.disk.free)} free`,
          },
        ].map((g) => (
          <div
            key={g.label}
            className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{g.label}</span>
              <span
                className={`text-2xl font-bold ${g.pct > 90 ? "text-red-400" : g.pct > 70 ? "text-amber-400" : "text-emerald-400"}`}
              >
                {g.pct}%
              </span>
            </div>
            <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${g.pct > 90 ? "bg-red-400" : g.pct > 70 ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ width: `${Math.min(g.pct, 100)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{g.detail}</div>
            <div className="text-[11px] text-zinc-400 truncate">{g.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
          <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">System Uptime</div>
          <div className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 mt-1">{fmtUptime(data.uptime)}</div>
        </div>
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
          <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Gateway</div>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2.5 h-2.5 rounded-full ${data.gateway.online ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200">
              {data.gateway.online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {data.pm2.length > 0 && (
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Processes</h2>
          <div className="space-y-2">
            {data.pm2.map((p: any) => (
              <div key={p.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${p.status === "online" ? "bg-emerald-400" : "bg-red-400"}`} />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{p.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span>CPU {p.cpu}%</span>
                  <span>MEM {fmt(p.memory)}</span>
                  {p.uptime && <span>Up {fmtUptime((nowMs - p.uptime) / 1000)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
