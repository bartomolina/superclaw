"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, Server } from "lucide-react";

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
    records: Array<{
      host: string;
      type: string;
      value: string;
      pointsHere: boolean;
      reason: string | null;
    }>;
  }>;
};

type AccountsData = {
  providers: Array<{
    id: string;
    label: string;
    value: string | null;
    detail: string | null;
    lines?: Array<{
      label: string;
      value: string;
    }>;
  }>;
};

type ConvexData = {
  deployments: Array<{
    repo: string;
    repoPath: string;
    envPath: string;
    appPath: string;
    deployment: string | null;
    clientUrl: string | null;
    siteUrl: string | null;
    team: string | null;
    project: string | null;
    source: string | null;
  }>;
};

type ReposData = {
  repos: Array<{
    name: string;
    path: string;
    branch: string | null;
    hasCommits: boolean;
    dirty: boolean | null;
    sync: "ahead" | "behind" | "diverged" | null;
    remote: string | null;
    hasConvex: boolean;
    kind: "agent" | "other";
    active: boolean;
  }>;
};

const PREFERRED_PM2_ORDER = ["superclaw-dashboard", "superclaw-kanban", "convex"];

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

  const gitSshMatch = value.match(/^git@([^:]+):(.+)$/i);
  if (gitSshMatch) {
    const [, host, repoPath] = gitSshMatch;
    return `https://${host}/${repoPath.replace(/\.git$/i, "")}`;
  }

  const sshUrlMatch = value.match(/^ssh:\/\/git@([^/]+)\/(.+)$/i);
  if (sshUrlMatch) {
    const [, host, repoPath] = sshUrlMatch;
    return `https://${host}/${repoPath.replace(/\.git$/i, "")}`;
  }

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

function pm2StatusLabel(status: string | null, uptime: number | null) {
  const uptimeText = uptime ? fmtUptime(Math.max(0, (Date.now() - uptime) / 1000)) : null;
  if (!status) return uptimeText || "—";

  const normalized = status.toLowerCase();
  const base = normalized === "online" ? "Online" : normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return uptimeText ? `${base} ${uptimeText}` : base;
}

function sortPm2Processes(processes: PerformanceData["pm2"]) {
  return [...processes].sort((a, b) => {
    const aIndex = PREFERRED_PM2_ORDER.indexOf(a.name);
    const bIndex = PREFERRED_PM2_ORDER.indexOf(b.name);
    const aRank = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
    const bRank = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;

    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });
}

function getVercelHosts(domain: VercelDomainsData["domains"][number]) {
  const byHost = new Map<string, { host: string; pointsHere: boolean }>();

  for (const record of domain.records) {
    const existing = byHost.get(record.host);
    if (!existing) {
      byHost.set(record.host, { host: record.host, pointsHere: record.pointsHere });
      continue;
    }

    if (record.pointsHere) existing.pointsHere = true;
  }

  return Array.from(byHost.values()).sort((a, b) => {
    if (a.pointsHere !== b.pointsHere) return a.pointsHere ? -1 : 1;
    return a.host.localeCompare(b.host);
  });
}

function sortVercelDomains(domains: VercelDomainsData["domains"]) {
  return [...domains].sort((a, b) => {
    const aHasIpMatch = a.records.some((record) => record.pointsHere && (record.type === "A" || record.type === "AAAA"));
    const bHasIpMatch = b.records.some((record) => record.pointsHere && (record.type === "A" || record.type === "AAAA"));
    if (aHasIpMatch !== bHasIpMatch) return aHasIpMatch ? -1 : 1;

    const aHasAnyMatch = a.records.some((record) => record.pointsHere);
    const bHasAnyMatch = b.records.some((record) => record.pointsHere);
    if (aHasAnyMatch !== bHasAnyMatch) return aHasAnyMatch ? -1 : 1;

    return a.name.localeCompare(b.name);
  });
}

function RepoGroup({ title, repos }: { title: string; repos: ReposData["repos"] }) {
  if (repos.length === 0) return null;

  return (
    <div>
      <div className="px-5 py-2 text-[11px] uppercase tracking-wider font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50/80 dark:bg-zinc-950/30">{title}</div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {repos.map((repo) => (
          <DetailRow
            key={repo.path}
            label={repo.name}
            value={
              <div className="flex items-center gap-2">
                {repo.branch ? pill(repo.branch, "neutral") : null}
                {repo.dirty === true ? pill("dirty", "warning") : null}
                {repo.sync ? pill(repo.sync, repo.sync === "behind" || repo.sync === "diverged" ? "warning" : "neutral") : null}
                {repo.hasConvex ? pill("convex", "neutral") : null}
              </div>
            }
            detail={
              <div className="space-y-0.5">
                <div className="break-all">{repo.path}</div>
                {repo.remote ? <div className="break-all"><ExternalLink value={repo.remote} /></div> : null}
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

export function OpsPage() {
  const [data, setData] = useState<KanbanWorkerStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountsData | null>(null);
  const [convex, setConvex] = useState<ConvexData | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [caddy, setCaddy] = useState<CaddyStatus | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [vercel, setVercel] = useState<VercelDomainsData | null>(null);
  const [repos, setRepos] = useState<ReposData | null>(null);
  const [expandedConvex, setExpandedConvex] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const tasks = [
        authFetch("/api/kanban-worker-status").then((next) => setData(next)),
        authFetch("/api/accounts")
          .catch(() => ({ providers: [] }))
          .then((accountsData) => setAccounts(accountsData)),
        authFetch("/api/convex")
          .catch(() => ({ deployments: [] }))
          .then((convexData) => setConvex(convexData)),
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
        authFetch("/api/repos")
          .catch(() => ({ repos: [] }))
          .then((reposData) => setRepos(reposData)),
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

  function toggleConvex(id: string) {
    setExpandedConvex((current) => ({ ...current, [id]: !current[id] }));
  }

  if (loading && !data) return <StateMessage>Loading ops...</StateMessage>;
  if (!data) return <StateMessage tone="error">Failed to load ops</StateMessage>;

  const openClawEnv = envSummary(data.host.baseUrl, data.host.hasToken);
  const showSandboxEnv = data.sandboxDefaults.enabled || data.sandboxDefaults.configured || data.sandboxDefaults.hasToken || Boolean(data.sandboxDefaults.baseUrl);
  const sandboxEnv = envSummary(data.sandboxDefaults.baseUrl, data.sandboxDefaults.hasToken);

  const accountProviders = accounts?.providers || [];
  const convexDeployments = convex?.deployments || [];
  const pm2Processes = sortPm2Processes(performance?.pm2 || []);
  const vercelDomains = sortVercelDomains(vercel?.domains || []);
  const vercelHostCount = vercelDomains.reduce((sum, domain) => sum + getVercelHosts(domain).length, 0);
  const repoList = repos?.repos || [];

  const loadingAccounts = loading && !accounts;
  const loadingConvex = loading && !convex;
  const loadingMcp = loading && mcpServers.length === 0;
  const loadingCaddy = loading && !caddy;
  const loadingPerformance = loading && !performance;
  const loadingVercel = loading && !vercel;
  const loadingRepos = loading && !repos;
  const agentRepos = repoList.filter((repo) => repo.kind === "agent" && repo.active && (repo.hasCommits || repo.dirty === true));
  const otherRepos = repoList.filter((repo) => repo.kind === "other");

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
            <DetailRow label="ENVs" value={openClawEnv.badge} detail={openClawEnv.detail} />
            {showSandboxEnv ? <DetailRow label="Sandbox ENVs" value={sandboxEnv.badge} detail={sandboxEnv.detail} /> : null}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Accounts (${accountProviders.length})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingAccounts ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading...</div>
            ) : accountProviders.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None detected</div>
            ) : (
              accountProviders.map((provider) => (
                <DetailRow
                  key={provider.id}
                  label={provider.label}
                  value={provider.value ?? undefined}
                  detail={provider.lines?.length ? (
                    <div className="space-y-0.5">
                      {provider.lines.map((line) => (
                        <div key={`${provider.id}-${line.label}`}>
                          <span className="font-medium text-zinc-500 dark:text-zinc-400">{line.label}:</span>{" "}
                          <span>{line.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : provider.detail ?? undefined}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Convex DBs (${convexDeployments.length})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingConvex ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading...</div>
            ) : convexDeployments.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None found</div>
            ) : (
              convexDeployments.map((deployment) => {
                const id = `${deployment.envPath}:${deployment.deployment || deployment.source || "convex"}`;
                const expanded = !!expandedConvex[id];

                return (
                  <DetailRow
                    key={id}
                    label={deployment.team ? `${deployment.project || deployment.repo} (${deployment.team})` : deployment.project || deployment.repo}
                    value={
                      <button
                        type="button"
                        onClick={() => toggleConvex(id)}
                        className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                      >
                        {expanded ? "Hide details" : "Show details"}
                      </button>
                    }
                    detail={
                      expanded ? (
                        <div className="space-y-1">
                          {deployment.deployment ? <div className="font-mono">{deployment.deployment}</div> : null}
                          {deployment.siteUrl ? <div><ExternalLink value={deployment.siteUrl} /></div> : null}
                          {deployment.clientUrl ? <div><ExternalLink value={deployment.clientUrl} /></div> : null}
                          <div className="break-all">app: {deployment.appPath}</div>
                          <div className="break-all">env: {deployment.envPath}</div>
                        </div>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`MCP servers (${mcpServers.length})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingMcp ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading mcporter config...</div>
            ) : mcpServers.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None configured in mcporter</div>
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
        <SectionTitle title={`Caddy (${caddy?.config.sites?.length || 0})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingCaddy ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading...</div>
            ) : caddy?.config.sites?.length ? (
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
        <SectionTitle title={`Vercel DNS (${vercelHostCount})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingVercel ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading...</div>
            ) : !vercel?.authenticated ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Not authenticated</div>
            ) : vercelDomains.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None</div>
            ) : (
              vercelDomains.map((domain) => {
                const hosts = getVercelHosts(domain);

                return (
                  <DetailRow
                    key={domain.name}
                    label={<ExternalLink value={domain.name} />}
                    detail={
                      hosts.length > 0 ? (
                        <div className="space-y-2">
                          {hosts.map((host) => (
                            <div key={host.host} className="flex items-start gap-2">
                              <div className="mt-0.5 shrink-0 text-zinc-400 dark:text-zinc-500">
                                {host.pointsHere ? <Server size={13} className="text-emerald-500" /> : <span className="inline-block h-[13px] w-[13px]" />}
                              </div>
                              <div className="min-w-0">
                                <ExternalLink value={host.host} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`PM2 (${pm2Processes.length})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingPerformance ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading...</div>
            ) : pm2Processes.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None</div>
            ) : (
              pm2Processes.map((process) => {
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
                    <div className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{pm2StatusLabel(process.status, process.uptime)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Repos (${repoList.length})`} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          {loadingRepos ? (
            <div className="px-5 py-4 text-sm text-zinc-400">Loading...</div>
          ) : repoList.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-400">None found</div>
          ) : (
            <div>
              <RepoGroup title={`OpenClaw repos (${otherRepos.length})`} repos={otherRepos} />
              <RepoGroup title={`Active agent repos (${agentRepos.length})`} repos={agentRepos} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
