"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { authFetch } from "@/components/dashboard/auth";
import { StateMessage } from "@/components/dashboard/state-message";
import { fmtUptime } from "@/components/dashboard/debug/utils";

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

type McpServer = {
  name: string;
  transport: string;
  target: string | null;
  url?: string | null;
  hasAuth: boolean;
  workingDirectory: string | null;
  argsCount: number;
};

type CaddyStatus = {
  service: {
    active: string | null;
    enabled: string | null;
  };
  config: {
    path: string | null;
    exists: boolean;
    size: number;
    sites: string[];
  };
};

type PerformanceData = {
  pm2: Array<{
    name: string;
    status: string | null;
    cpu: number;
    memory: number;
    uptime: number | null;
    command?: string | null;
  }>;
};

type VercelDomainsData = {
  authenticated: boolean;
  domains: Array<{
    name: string;
    registrar: string | null;
    subdomains: string[];
  }>;
};

function pill(label: string, tone: "neutral" | "success" | "warning") {
  const classes =
    tone === "success"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${classes}`}>{label}</span>;
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</h2>;
}

function DetailRow({ label, value, detail }: { label: ReactNode; value?: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">{label}</div>
        {detail ? <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{detail}</div> : null}
      </div>
      {value ? <div className="shrink-0">{value}</div> : null}
    </div>
  );
}

function toHref(value: string | null | undefined) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`;
  if (/^[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(value)) return `https://${value}`;
  return null;
}

function ExternalLink({ value }: { value: string }) {
  const href = toHref(value);
  if (!href) return <span className="break-all">{value}</span>;

  return (
    <a href={href} target="_blank" rel="noreferrer" className="break-all hover:text-zinc-600 dark:hover:text-zinc-300 hover:underline">
      {value}
    </a>
  );
}

function envSummary(baseUrl: string | null, hasToken: boolean) {
  const missing: string[] = [];
  if (!baseUrl) missing.push("URL");
  if (!hasToken) missing.push("token");

  if (missing.length === 0) {
    return {
      badge: pill("set", "success"),
      detail: "KANBAN_BASE_URL + KANBAN_AGENT_TOKEN",
    };
  }

  return {
    badge: pill("missing", "neutral"),
    detail: `Missing ${missing.join(" + ")}`,
  };
}

export function OpsPage() {
  const [data, setData] = useState<KanbanWorkerStatus | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [caddy, setCaddy] = useState<CaddyStatus | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [vercel, setVercel] = useState<VercelDomainsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const tasks = [
        authFetch("/api/kanban-worker-status").then((next) => setData(next)),
        authFetch("/api/mcp")
          .catch(() => ({ servers: [] }))
          .then((mcp) => setMcpServers(mcp.servers || [])),
        authFetch("/api/caddy")
          .catch(() => ({ service: { active: null, enabled: null }, config: { path: null, exists: false, size: 0, sites: [] } }))
          .then((caddyData) => setCaddy(caddyData)),
        authFetch("/api/performance")
          .catch(() => ({ pm2: [] }))
          .then((perf) => setPerformance(perf)),
        authFetch("/api/vercel")
          .catch(() => ({ authenticated: false, domains: [] }))
          .then((vercelData) => setVercel(vercelData)),
      ];

      await Promise.allSettled(tasks);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  if (loading && !data) return <StateMessage>Loading ops...</StateMessage>;
  if (!data) return <StateMessage tone="error">Failed to load ops</StateMessage>;

  const openClawEnv = envSummary(data.host.baseUrl, data.host.hasToken);
  const showSandboxEnv = data.sandboxDefaults.enabled || data.sandboxDefaults.configured || data.sandboxDefaults.hasToken || Boolean(data.sandboxDefaults.baseUrl);
  const sandboxEnv = envSummary(data.sandboxDefaults.baseUrl, data.sandboxDefaults.hasToken);

  const caddyState = caddy?.service.active === "active" ? pill("active", "success") : pill(caddy?.service.active || "unknown", "neutral");
  const pm2Processes = performance?.pm2 || [];
  const vercelDomains = vercel?.domains || [];
  const vercelSubdomainCount = vercelDomains.reduce((sum, domain) => sum + domain.subdomains.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Ops</h1>
        <button
          onClick={() => void load("refresh")}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        <SectionTitle title="Kanban" />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            <DetailRow label="ENVs" value={openClawEnv.badge} />
            {showSandboxEnv ? <DetailRow label="Sandbox ENVs" value={sandboxEnv.badge} /> : null}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`MCP servers (${mcpServers.length})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {mcpServers.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None</div>
            ) : (
              mcpServers.map((server) => (
                <DetailRow
                  key={server.name}
                  label={server.name}
                  value={
                    <div className="flex shrink-0 items-center gap-2">
                      {pill(server.transport, "neutral")}
                      {server.hasAuth && pill("auth", "neutral")}
                    </div>
                  }
                  detail={server.url ? <ExternalLink value={server.url} /> : server.target || server.transport}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle title={`Caddy (${caddy?.config.sites?.length || 0})`} />
          {caddyState}
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {caddy?.config.sites?.length ? (
              caddy.config.sites.map((site) => (
                <div key={site} className="px-5 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  <ExternalLink value={site} />
                </div>
              ))
            ) : (
              <div className="px-5 py-4 text-sm text-zinc-400">No sites found</div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Vercel subdomains (${vercelSubdomainCount})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {!vercel?.authenticated ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Not authenticated</div>
            ) : vercelDomains.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None</div>
            ) : (
              vercelDomains.map((domain) => (
                <DetailRow
                  key={domain.name}
                  label={<ExternalLink value={domain.name} />}
                  detail={
                    domain.subdomains.length > 0 ? (
                      <div className="space-y-1">
                        {domain.subdomains.map((item) => (
                          <div key={item}>
                            <ExternalLink value={item} />
                          </div>
                        ))}
                      </div>
                    ) : undefined
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`PM2 (${pm2Processes.length})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {pm2Processes.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None</div>
            ) : (
              pm2Processes.map((process) => {
                const uptimeText = process.uptime ? fmtUptime(Math.max(0, (Date.now() - process.uptime) / 1000)) : null;
                const dotClass =
                  process.status === "online"
                    ? "bg-emerald-400"
                    : process.status === "stopped" || process.status === "errored"
                      ? "bg-red-400"
                      : "bg-zinc-300 dark:bg-zinc-600";

                return (
                  <div key={process.name} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                        <span>{process.name}</span>
                      </div>
                      {process.command ? <div className="mt-0.5 break-all font-mono text-xs text-zinc-400 dark:text-zinc-500">{process.command}</div> : null}
                    </div>
                    <div className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{uptimeText ? `Up ${uptimeText}` : "—"}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
