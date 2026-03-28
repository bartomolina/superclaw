/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, RefreshCw, Shield, Waypoints } from "lucide-react";

import { authFetch } from "@/components/dashboard/auth";

type KanbanWorkerStatus = {
  ready: boolean;
  host: {
    configured: boolean;
    baseUrl: string | null;
    hasToken: boolean;
  };
  sandboxDefaults: {
    configured: boolean;
    baseUrl: string | null;
    hasToken: boolean;
    enabled: boolean;
    mode: string;
  };
  derived: {
    available: boolean;
    baseUrl: string | null;
    hasToken: boolean;
  };
  checks: {
    hostMatchesDerived: boolean | null;
    sandboxMatchesHost: boolean | null;
    sandboxMatchesDerived: boolean | null;
  };
  warnings?: string[];
};

function statusBadge(active: boolean) {
  return active
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500";
}

function CheckRow({ label, value }: { label: string; value: boolean | null }) {
  const tone = value == null ? "text-zinc-400 dark:text-zinc-500" : value ? "text-emerald-500" : "text-amber-500";
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className={`font-medium ${tone}`}>
        {value == null ? "n/a" : value ? "match" : "mismatch"}
      </span>
    </div>
  );
}

function RuntimeCard({
  title,
  icon,
  data,
  extra,
}: {
  title: string;
  icon: ReactNode;
  data: { configured: boolean; baseUrl: string | null; hasToken: boolean };
  extra?: ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-zinc-400">{icon}</div>
          <div>
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</div>
            <div className="text-[11px] text-zinc-400">Read-only runtime status</div>
          </div>
        </div>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${statusBadge(data.configured)}`}>
          {data.configured ? "set" : "missing"}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-600 dark:text-zinc-400">Base URL</span>
          <span className="text-zinc-800 dark:text-zinc-200 font-medium text-right truncate max-w-[70%]">
            {data.baseUrl || "missing"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-600 dark:text-zinc-400">Agent token</span>
          <span className={`font-medium ${data.hasToken ? "text-emerald-500" : "text-zinc-400 dark:text-zinc-500"}`}>
            {data.hasToken ? "present" : "missing"}
          </span>
        </div>
        {extra}
      </div>
    </div>
  );
}

export function OpsPage() {
  const [data, setData] = useState<KanbanWorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const initial = !data;
    if (initial) setLoading(true);
    else setRefreshing(true);

    try {
      const next = await authFetch("/api/kanban-worker-status");
      setData(next);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) return <div className="text-center text-zinc-400 py-12">Loading ops status...</div>;
  if (!data) return <div className="text-center text-zinc-400 py-12">Failed to load ops status</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Ops</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Global Kanban worker runtime wiring for the OpenClaw gateway service, plus optional sandbox overrides.</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Kanban worker env</div>
            <div className="mt-1 flex items-center gap-2">
              {data.ready ? <CheckCircle2 size={18} className="text-emerald-500" /> : <CircleAlert size={18} className="text-amber-500" />}
              <span className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">{data.ready ? "Ready" : "Needs attention"}</span>
            </div>
          </div>
          <div className="text-right text-xs text-zinc-400">
            <div>Single runtime contract</div>
            <div className="font-mono mt-1">KANBAN_BASE_URL + KANBAN_AGENT_TOKEN</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <RuntimeCard title="OpenClaw host runtime" icon={<Waypoints size={16} />} data={data.host} />
        <RuntimeCard
          title="Derived from local Kanban app"
          icon={<RefreshCw size={16} />}
          data={{ configured: data.derived.available, baseUrl: data.derived.baseUrl, hasToken: data.derived.hasToken }}
          extra={<div className="text-[11px] text-zinc-400">Computed via <span className="font-mono">kanban/scripts/resolve-worker-env.sh</span></div>}
        />
        <RuntimeCard
          title="Sandbox defaults (optional)"
          icon={<Shield size={16} />}
          data={data.sandboxDefaults}
          extra={
            <>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Sandbox mode</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-medium">{data.sandboxDefaults.enabled ? data.sandboxDefaults.mode : "off"}</span>
              </div>
              <div className="text-[11px] text-zinc-400">
                Leave this unset by default. Sandboxed Kanban workers should get env manually per agent when needed.
              </div>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Consistency checks</h2>
          <CheckRow label="Host matches derived local Kanban values" value={data.checks.hostMatchesDerived} />
          <CheckRow label="Optional sandbox defaults match host runtime" value={data.checks.sandboxMatchesHost} />
          <CheckRow label="Optional sandbox defaults match derived local Kanban values" value={data.checks.sandboxMatchesDerived} />
        </div>

        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Warnings</h2>
          {data.warnings && data.warnings.length > 0 ? (
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {data.warnings.map((warning) => (
                <li key={warning} className="flex gap-2">
                  <CircleAlert size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-emerald-600 dark:text-emerald-400">No warnings.</div>
          )}
        </div>
      </div>
    </div>
  );
}
