"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Bot,
  Boxes,
  Cloud,
  Database,
  Eye,
  EyeOff,
  Flame,
  FolderGit2,
  HelpCircle,
  Lock,
  Package,
  PlugZap,
  RefreshCw,
  Search,
  Server,
  Shield,
  type LucideIcon,
} from "lucide-react";

import { authFetch } from "@/components/dashboard/auth";
import { fmtUptime } from "@/components/dashboard/debug/utils";

type KanbanWorkerStatus = {
  ready: boolean;
  workerEnv: {
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

type CloudflaredStatus = {
  service: {
    active: string | null;
    enabled: string | null;
  };
  config: {
    path: string | null;
    exists: boolean;
    tunnel: string | null;
    credentialsFile: string | null;
    routes: Array<{
      hostname: string;
      service: string;
    }>;
  };
};

type PerformanceData = {
  systemd: Array<{
    name: string;
    unit: string;
    description: string | null;
    active: string | null;
    subState: string | null;
    enabled: string | null;
    mainPid: number;
    uptime: number | null;
    command?: string | null;
    isDevMode?: boolean;
    workingDirectory: string | null;
    fragmentPath: string | null;
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

type PostgresData = {
  databases: Array<{
    name: string;
  }>;
};

type BrowserProfilesData = {
  profiles: Array<{
    name: string;
    status: string;
    details: string[];
    isDefault: boolean;
  }>;
};

type DockerData = {
  available: boolean;
  running: boolean;
  error?: string | null;
  containers: Array<{
    id: string;
    name: string;
    image: string | null;
    imageTag: string | null;
    state: string | null;
    health: string | null;
    status: string;
    runningFor: string | null;
    ports: string[];
    restartPolicy: string | null;
    composeProject: string | null;
    composeService: string | null;
    command: string | null;
    createdAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
};

type FileSearchStoresData = {
  authConfigured: boolean;
  baseUrl: string | null;
  error?: string | null;
  stores: Array<{
    name: string;
    displayName: string | null;
    createTime: string | null;
    updateTime: string | null;
    activeDocumentsCount: number | null;
    failedDocumentsCount: number | null;
    sizeBytes: number | null;
  }>;
};

type AcpData = {
  enabled: boolean;
  pluginEnabled: boolean;
  backend: string | null;
  defaultAgent: string | null;
  allowedAgents: string[];
  customAgents: string[];
  selectableAgents: string[];
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
    visibility: "private" | "public" | "unknown";
    hasConvex: boolean;
    kind: "agent" | "other";
    active: boolean;
  }>;
};

const PREFERRED_SYSTEMD_ORDER = [
  "superclaw-dashboard.service",
  "superclaw-convex.service",
  "superclaw-kanban.service",
  "anto-home.service",
  "cloudflared.service",
  "openclaw-gateway.service",
];

function pill(label: string, tone: "neutral" | "success" | "warning") {
  const classes =
    tone === "success"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${classes}`}>{label}</span>;
}

function SectionTitle({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
      <Icon size={14} className="text-zinc-500 dark:text-zinc-400" />
      <span>{title}</span>
    </h2>
  );
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

function InlineMeta({ children }: { children: ReactNode }) {
  return <span className="ml-2 break-all text-xs text-zinc-400 dark:text-zinc-500">{children}</span>;
}

function containsMaskableMachineIpv4(value: string | null | undefined) {
  if (!value) return false;

  const matches = value.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g) || [];
  return matches.some((match) => {
    const ip = match.replace(/:\d+$/, "");
    return !ip.startsWith("127.") && ip !== "0.0.0.0";
  });
}

function SensitiveValue({ value, link = false, className = "" }: { value: string; link?: boolean; className?: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-top">
      <span className={`min-w-0 break-all ${className}`}>
        {revealed ? (link ? <ExternalLink value={value} /> : value) : <span className="select-none tracking-[0.35em]">••••••</span>}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        className="shrink-0 rounded-md p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        aria-label={revealed ? "Hide sensitive value" : "Reveal sensitive value"}
        title={revealed ? "Hide" : "Reveal"}
      >
        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </span>
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

function systemdStatusLabel(active: string | null, subState: string | null, uptime: number | null) {
  const uptimeText = uptime ? fmtUptime(Math.max(0, (Date.now() - uptime) / 1000)) : null;

  if (active === "active" && uptimeText) {
    return uptimeText;
  }

  const parts: string[] = [];

  if (active && active !== "active") {
    parts.push(active.charAt(0).toUpperCase() + active.slice(1));
  }

  if (subState && subState !== active && subState !== "running" && subState !== "exited") {
    parts.push(subState);
  }

  return parts.join(" ") || uptimeText || "—";
}

function sortSystemdServices(services: PerformanceData["systemd"]) {
  return [...services].sort((a, b) => {
    const aIndex = PREFERRED_SYSTEMD_ORDER.indexOf(a.unit);
    const bIndex = PREFERRED_SYSTEMD_ORDER.indexOf(b.unit);
    const aRank = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
    const bRank = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;

    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });
}

function dockerStateTone(state: string | null) {
  if (state === "running") return "success" as const;
  if (state === "exited" || state === "dead" || state === "restarting") return "warning" as const;
  return "neutral" as const;
}

function dockerHealthTone(health: string | null) {
  if (health === "healthy") return "success" as const;
  if (health === "unhealthy") return "warning" as const;
  return "neutral" as const;
}

function formatRelativeDockerTime(value: string | null | undefined, verb: string) {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  return `${verb} ${fmtUptime(seconds)} ago`;
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let next = value / 1024;
  let index = 0;

  while (next >= 1024 && index < units.length - 1) {
    next /= 1024;
    index += 1;
  }

  return `${next.toFixed(next >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function compactStoreName(name: string) {
  return name.replace(/^fileSearchStores\//, "");
}

function RepoRows({ repos }: { repos: ReposData["repos"] }) {
  const [expandedRepos, setExpandedRepos] = useState<Record<string, boolean>>({});

  function toggleRepo(path: string) {
    setExpandedRepos((current) => ({ ...current, [path]: !current[path] }));
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
      {repos.map((repo) => {
        const expanded = !!expandedRepos[repo.path];

        return (
          <button
            key={repo.path}
            type="button"
            onClick={() => toggleRepo(repo.path)}
            className="w-full px-5 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span>{repo.name}</span>
                  {repo.visibility === "private" ? <Lock size={12} className="shrink-0 text-zinc-400 dark:text-zinc-500" aria-label="Private repo" /> : null}
                  {repo.visibility === "unknown" ? <HelpCircle size={12} className="shrink-0 text-zinc-400 dark:text-zinc-500" aria-label="Repo visibility unknown" /> : null}
                </div>
                {expanded ? (
                  <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                    <div className="break-all">{repo.path}</div>
                    {repo.remote ? <div className="break-all"><ExternalLink value={repo.remote} /></div> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {repo.branch ? pill(repo.branch, "neutral") : null}
                {repo.dirty === true ? pill("dirty", "warning") : null}
                {repo.sync ? pill(repo.sync, repo.sync === "behind" || repo.sync === "diverged" ? "warning" : "neutral") : null}
                {repo.hasConvex ? pill("convex", "neutral") : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function OpsPage() {
  const [data, setData] = useState<KanbanWorkerStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountsData | null>(null);
  const [convex, setConvex] = useState<ConvexData | null>(null);
  const [postgres, setPostgres] = useState<PostgresData | null>(null);
  const [browserProfiles, setBrowserProfiles] = useState<BrowserProfilesData | null>(null);
  const [docker, setDocker] = useState<DockerData | null>(null);
  const [fileSearch, setFileSearch] = useState<FileSearchStoresData | null>(null);
  const [acp, setAcp] = useState<AcpData | null>(null);
  const [cloudflared, setCloudflared] = useState<CloudflaredStatus | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [repos, setRepos] = useState<ReposData | null>(null);
  const [expandedConvex, setExpandedConvex] = useState<Record<string, boolean>>({});
  const [expandedDocker, setExpandedDocker] = useState<Record<string, boolean>>({});
  const [expandedFileSearch, setExpandedFileSearch] = useState<Record<string, boolean>>({});
  const [expandedSystemd, setExpandedSystemd] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    const refreshSuffix = mode === "refresh" ? "?refresh=1" : "";

    try {
      const tasks = [
        authFetch("/api/kanban-worker-status").then((next) => setData(next)),
        authFetch("/api/accounts")
          .catch(() => ({ providers: [] }))
          .then((accountsData) => setAccounts(accountsData)),
        authFetch(`/api/convex${refreshSuffix}`)
          .catch(() => ({ deployments: [] }))
          .then((convexData) => setConvex(convexData)),
        authFetch(`/api/postgres${refreshSuffix}`)
          .catch(() => ({ databases: [] }))
          .then((postgresData) => setPostgres(postgresData)),
        authFetch(`/api/browser-profiles${refreshSuffix}`)
          .catch(() => ({ profiles: [] }))
          .then((browserProfilesData) => setBrowserProfiles(browserProfilesData)),
        authFetch(`/api/docker${refreshSuffix}`)
          .catch(() => ({ available: false, running: false, containers: [] }))
          .then((dockerData) => setDocker(dockerData)),
        authFetch(`/api/file-search-stores${refreshSuffix}`)
          .catch(() => ({ authConfigured: false, baseUrl: null, stores: [], error: null }))
          .then((fileSearchData) => setFileSearch(fileSearchData)),
        authFetch("/api/acp")
          .catch(() => ({ enabled: false, pluginEnabled: false, backend: null, defaultAgent: null, allowedAgents: [], customAgents: [], selectableAgents: [] }))
          .then((acpData) => setAcp(acpData)),
        authFetch("/api/cloudflared")
          .catch(() => ({ service: { active: null, enabled: null }, config: { path: null, exists: false, tunnel: null, credentialsFile: null, routes: [] } }))
          .then((cloudflaredData) => setCloudflared(cloudflaredData)),
        authFetch("/api/mcp")
          .catch(() => ({ servers: [] }))
          .then((mcp) => setMcpServers(mcp.servers || [])),
        authFetch("/api/performance")
          .catch(() => ({ systemd: [] }))
          .then((perf) => setPerformance(perf)),
        authFetch(`/api/repos${refreshSuffix}`)
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

  function toggleDocker(id: string) {
    setExpandedDocker((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleFileSearch(id: string) {
    setExpandedFileSearch((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleSystemd(unit: string) {
    setExpandedSystemd((current) => ({ ...current, [unit]: !current[unit] }));
  }

  const loadingKanban = loading && !data;
  const openClawEnv = data ? envSummary(data.workerEnv.baseUrl, data.workerEnv.hasToken) : null;
  const showSandboxEnv = data
    ? data.sandboxDefaults.enabled || data.sandboxDefaults.configured || data.sandboxDefaults.hasToken || Boolean(data.sandboxDefaults.baseUrl)
    : false;
  const sandboxEnv = data ? envSummary(data.sandboxDefaults.baseUrl, data.sandboxDefaults.hasToken) : null;

  const accountProviders = accounts?.providers || [];
  const convexDeployments = convex?.deployments || [];
  const systemdServices = sortSystemdServices(performance?.systemd || []);
  const repoList = repos?.repos || [];
  const postgresDatabases = postgres?.databases || [];
  const browserProfileList = browserProfiles?.profiles || [];
  const dockerContainers = docker?.containers || [];
  const fileSearchStores = fileSearch?.stores || [];
  const runningDockerCount = dockerContainers.filter((container) => container.state === "running").length;

  const loadingAccounts = loading && !accounts;
  const loadingCloudflared = loading && !cloudflared;
  const loadingConvex = loading && !convex;
  const loadingPostgres = loading && !postgres;
  const loadingBrowserProfiles = loading && !browserProfiles;
  const loadingDocker = loading && !docker;
  const loadingFileSearch = loading && !fileSearch;
  const loadingAcp = loading && !acp;
  const loadingMcp = loading && mcpServers.length === 0;
  const loadingPerformance = loading && !performance;
  const loadingRepos = loading && !repos;
  const agentRepos = repoList.filter((repo) => repo.kind === "agent");
  const otherRepos = repoList.filter((repo) => repo.kind === "other");
  const visibleRepoCount = otherRepos.length + agentRepos.length;

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
        <SectionTitle title="Kanban" icon={Boxes} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingKanban ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading Kanban status...</div>
            ) : !data || !openClawEnv ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Kanban status unavailable</div>
            ) : (
              <>
                <DetailRow
                  label={
                    <span>
                      ENVs
                      {openClawEnv.detail ? <InlineMeta>{openClawEnv.detail}</InlineMeta> : null}
                    </span>
                  }
                  value={openClawEnv.badge}
                />
                {showSandboxEnv && sandboxEnv ? (
                  <DetailRow
                    label={
                      <span>
                        Sandbox ENVs
                        {sandboxEnv.detail ? <InlineMeta>{sandboxEnv.detail}</InlineMeta> : null}
                      </span>
                    }
                    value={sandboxEnv.badge}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Accounts (${accountProviders.length})`} icon={Shield} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingAccounts ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading accounts...</div>
            ) : accountProviders.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None detected</div>
            ) : (
              accountProviders.map((provider) => {
                const hasLines = Boolean(provider.lines?.length);
                const inlineDetail = provider.value ?? (!hasLines ? provider.detail ?? undefined : undefined);

                return (
                  <DetailRow
                    key={provider.id}
                    label={hasLines || !inlineDetail ? provider.label : (
                      <span>
                        {provider.label}
                        <InlineMeta><SensitiveValue value={inlineDetail} /></InlineMeta>
                      </span>
                    )}
                    detail={hasLines ? (
                      <div className="space-y-0.5">
                        {provider.lines?.map((line) => (
                          <div key={`${provider.id}-${line.label}`}>
                            <span className="font-medium text-zinc-500 dark:text-zinc-400">{line.label}:</span>{" "}
                            <SensitiveValue value={line.value} />
                          </div>
                        ))}
                      </div>
                    ) : undefined}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Convex DBs (${convexDeployments.length})`} icon={Database} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingConvex ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading Convex deployments...</div>
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
        <SectionTitle title={`Postgres DBs (${postgresDatabases.length})`} icon={Database} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingPostgres ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading Postgres databases...</div>
            ) : postgresDatabases.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None found</div>
            ) : (
              postgresDatabases.map((database) => (
                <div key={database.name} className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-200">
                  <span className="font-mono">{database.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Browser profiles (${browserProfileList.length})`} icon={Package} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingBrowserProfiles ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading browser profiles...</div>
            ) : browserProfileList.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">No browser profiles found</div>
            ) : (
              browserProfileList.map((profile) => (
                <DetailRow
                  key={profile.name}
                  label={
                    <span>
                      {profile.name}
                      {profile.details.length > 0 ? <InlineMeta>{profile.details.join(" · ")}</InlineMeta> : null}
                    </span>
                  }
                  value={
                    <div className="flex items-center gap-2">
                      {profile.isDefault ? pill("default", "neutral") : null}
                      {pill(profile.status, profile.status.startsWith("running") ? "success" : "neutral")}
                    </div>
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`ACP (${acp?.selectableAgents.length || 0})`} icon={Bot} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          {loadingAcp ? (
            <div className="px-5 py-4 text-sm text-zinc-400">Loading ACP config...</div>
          ) : !acp ? (
            <div className="px-5 py-4 text-sm text-zinc-400">ACP config unavailable</div>
          ) : acp.selectableAgents.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-400">No selectable agents</div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {acp.selectableAgents.map((agent) => (
                <div key={agent} className="px-5 py-3 text-sm text-zinc-700 dark:text-zinc-200">
                  <span className="font-mono">{agent}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`MCP servers (${mcpServers.length})`} icon={PlugZap} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingMcp ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading MCP servers...</div>
            ) : mcpServers.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None configured in mcporter</div>
            ) : (
              mcpServers.map((server) => (
                <DetailRow
                  key={server.name}
                  label={
                    <span>
                      {server.name}
                      {server.url ? <InlineMeta><ExternalLink value={server.url} /></InlineMeta> : server.target || server.transport ? <InlineMeta>{server.target || server.transport}</InlineMeta> : null}
                    </span>
                  }
                  value={
                    <div className="flex shrink-0 items-center gap-2">
                      {pill(server.transport, "neutral")}
                      {server.hasAuth && pill("auth", "neutral")}
                    </div>
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Cloudflare Tunnel (${cloudflared?.config.routes?.length || 0})`} icon={Cloud} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingCloudflared ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading Cloudflare Tunnel...</div>
            ) : !cloudflared?.config.exists ? (
              <div className="px-5 py-4 text-sm text-zinc-400">No local cloudflared config found</div>
            ) : (
              <>
                {cloudflared.config.routes.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-zinc-400">No hostnames configured</div>
                ) : (
                  cloudflared.config.routes.map((route) => (
                  <DetailRow
                    key={`${route.hostname}-${route.service}`}
                    label={
                      <span>
                        <ExternalLink value={route.hostname} />
                          <InlineMeta>{containsMaskableMachineIpv4(route.service) ? <SensitiveValue value={route.service} className="font-mono" /> : <span className="font-mono">{route.service}</span>}</InlineMeta>
                      </span>
                    }
                  />
                ))
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`systemd (${systemdServices.length})`} icon={Server} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingPerformance ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading systemd services...</div>
            ) : systemdServices.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">None</div>
            ) : (
              systemdServices.map((service) => {
                const expanded = !!expandedSystemd[service.unit];
                const dotClass =
                  service.active === "active"
                    ? "bg-emerald-400"
                    : service.active === "failed" || service.active === "inactive"
                      ? "bg-red-400"
                      : "bg-zinc-300 dark:bg-zinc-600";

                const metadata: string[] = [];
                if (service.workingDirectory) metadata.push(`cwd: ${service.workingDirectory}`);
                else if (service.fragmentPath) metadata.push(`unit: ${service.fragmentPath}`);

                if (service.mainPid > 0) metadata.push(`pid ${service.mainPid}`);

                return (
                  <button
                    key={service.unit}
                    type="button"
                    onClick={() => toggleSystemd(service.unit)}
                    className="w-full px-5 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                          <span>{service.name}</span>
                          {service.isDevMode ? <Flame size={12} className="shrink-0 text-amber-500" aria-label="Dev mode (likely hot reload)" /> : null}
                          {service.description ? <span className="min-w-0 truncate text-xs text-zinc-400 dark:text-zinc-500">{service.description}</span> : null}
                        </div>
                        {expanded && service.command ? <div className="mt-1 break-all font-mono text-xs text-zinc-400 dark:text-zinc-500">{service.command}</div> : null}
                        {expanded && metadata.length > 0 ? <div className="mt-1 break-all text-xs text-zinc-400 dark:text-zinc-500">{metadata.join(" · ")}</div> : null}
                      </div>
                      <div className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{systemdStatusLabel(service.active, service.subState, service.uptime)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Repos (${visibleRepoCount})`} icon={FolderGit2} />
        {loadingRepos ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
            <div className="px-5 py-4 text-sm text-zinc-400">Loading repos...</div>
          </div>
        ) : repoList.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
            <div className="px-5 py-4 text-sm text-zinc-400">None found</div>
          </div>
        ) : (
          <div className="space-y-5">
            {[
              { id: "openclaw", label: "General repos", repos: otherRepos },
              { id: "agents", label: "Agent repos", repos: agentRepos },
            ]
              .filter((group) => group.repos.length > 0)
              .map((group) => (
                <section key={group.id} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{group.label}</h2>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">{group.repos.length} repos</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
                    <RepoRows repos={group.repos} />
                  </div>
                </section>
              ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle title={`File Search stores (${fileSearchStores.length})`} icon={Search} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingFileSearch ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading File Search stores...</div>
            ) : !fileSearch?.authConfigured ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Google File Search is not configured</div>
            ) : fileSearch.error ? (
              <div className="px-5 py-4 text-sm text-amber-600 dark:text-amber-400">{fileSearch.error}</div>
            ) : fileSearchStores.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">No File Search stores found</div>
            ) : (
              fileSearchStores.map((store) => {
                const expanded = !!expandedFileSearch[store.name];
                const meta = compactStoreName(store.name);

                return (
                  <button
                    key={store.name}
                    type="button"
                    onClick={() => toggleFileSearch(store.name)}
                    className="w-full px-5 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-all text-sm text-zinc-800 dark:text-zinc-200">{store.displayName || meta}</div>
                        {expanded ? (
                          <div className="mt-2 space-y-1 break-all text-xs text-zinc-400 dark:text-zinc-500">
                            {store.createTime ? <div>created: {new Date(store.createTime).toLocaleString()}</div> : null}
                            {fileSearch.baseUrl ? <div>api: {fileSearch.baseUrl}</div> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {typeof store.activeDocumentsCount === "number" ? pill(`${store.activeDocumentsCount.toLocaleString()} docs`, "neutral") : null}
                        {typeof store.failedDocumentsCount === "number" && store.failedDocumentsCount > 0 ? pill(`${store.failedDocumentsCount.toLocaleString()} failed`, "warning") : null}
                        {formatBytes(store.sizeBytes) ? pill(formatBytes(store.sizeBytes) || "", "neutral") : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title={`Docker containers (${runningDockerCount} running / ${dockerContainers.length} total)`} icon={Package} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {loadingDocker ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Loading Docker containers...</div>
            ) : !docker?.available ? (
              <div className="px-5 py-4 text-sm text-zinc-400">Docker not available on this host</div>
            ) : dockerContainers.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">No containers found</div>
            ) : (
              dockerContainers.map((container) => {
                const expanded = !!expandedDocker[container.id];
                const startedText = formatRelativeDockerTime(container.startedAt, "started");
                const finishedText = formatRelativeDockerTime(container.finishedAt, "stopped");
                const composeText = [container.composeProject, container.composeService].filter(Boolean).join(" / ");

                return (
                  <button
                    key={container.id}
                    type="button"
                    onClick={() => toggleDocker(container.id)}
                    className="w-full px-5 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-800 dark:text-zinc-200">{container.name}</div>
                        {expanded ? (
                          <div className="mt-2 space-y-1 break-all text-xs text-zinc-400 dark:text-zinc-500">
                            {container.image ? <div>image: {container.image}</div> : null}
                            {container.ports.length > 0 ? <div>ports: {container.ports.join(", ")}</div> : null}
                            {container.restartPolicy ? <div>restart: {container.restartPolicy}</div> : null}
                            {composeText ? <div>compose: {composeText}</div> : null}
                            {container.state === "running" ? (startedText ? <div>{startedText}</div> : null) : finishedText ? <div>{finishedText}</div> : startedText ? <div>{startedText}</div> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {container.health && container.health !== "healthy" ? pill(container.health, dockerHealthTone(container.health)) : null}
                        {pill(container.state || "unknown", dockerStateTone(container.state))}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
