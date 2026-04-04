import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import path from "path";

import { runCommand } from "@/lib/server/command";
import { runOpenClawJson } from "@/lib/server/openclaw/cli";
import { json } from "@/lib/server/openclaw/http";

export type RepoSummary = {
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
};

const REPOS_TTL_MS = 300_000;

const HOME_DIR = process.env.HOME || homedir();
const OPENCLAW_HOME = path.join(HOME_DIR, ".openclaw");
const MAIN_WORKSPACE = path.join(OPENCLAW_HOME, "workspace");
const FIND_GIT_REPOS_SCRIPT = [
  `find ${JSON.stringify(OPENCLAW_HOME)} -maxdepth 4`,
  "\\( -path '*/node_modules' -o -path '*/vendor_imports' -o -path '*/.tmp' -o -path '*/dist' -o -path '*/.next' \\) -prune -o",
  "-type d -name .git -print",
].join(" ");

function packageJsonHasConvex(repoRoot: string) {
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!existsSync(packageJsonPath)) return false;

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return Boolean(parsed.dependencies?.convex || parsed.devDependencies?.convex);
  } catch {
    return false;
  }
}

function hasConvexConfig(repoRoot: string) {
  return existsSync(path.join(repoRoot, "convex", "convex.config.ts")) || packageJsonHasConvex(repoRoot);
}

function isUsefulRepoRoot(repoRoot: string) {
  return repoRoot.startsWith(`${OPENCLAW_HOME}${path.sep}`) || repoRoot === OPENCLAW_HOME;
}

let reposCache: RepoSummary[] | null = null;
let reposCacheTime = 0;
let reposCacheInFlight: Promise<RepoSummary[]> | null = null;

function repoKind(repoRoot: string): RepoSummary["kind"] {
  const base = path.basename(repoRoot);
  return base === "workspace" || base.startsWith("workspace-") ? "agent" : "other";
}

function normalizeAgentsList(parsed: unknown): { agents: Array<{ id?: string; workspace?: string }>; defaultId: string | null } {
  if (Array.isArray(parsed)) {
    return { agents: parsed as Array<{ id?: string; workspace?: string }>, defaultId: null };
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { agents?: unknown[] }).agents)) {
    return {
      agents: (parsed as { agents: Array<{ id?: string; workspace?: string }> }).agents,
      defaultId: typeof (parsed as { defaultId?: unknown }).defaultId === "string" ? ((parsed as { defaultId: string }).defaultId) : null,
    };
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { list?: unknown[] }).list)) {
    return {
      agents: (parsed as { list: Array<{ id?: string; workspace?: string }> }).list,
      defaultId: typeof (parsed as { defaultId?: unknown }).defaultId === "string" ? ((parsed as { defaultId: string }).defaultId) : null,
    };
  }

  return { agents: [], defaultId: null };
}

async function listActiveAgentWorkspacePaths() {
  try {
    const parsed = await runOpenClawJson<unknown>(["agents", "list", "--json"], { agents: [] });
    const normalized = normalizeAgentsList(parsed);
    const workspaces = normalized.agents
      .map((agent) => agent.workspace)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    return new Set([MAIN_WORKSPACE, ...workspaces]);
  } catch {
    return new Set([MAIN_WORKSPACE]);
  }
}

async function readTrimmed(command: string, args: string[], cwd: string) {
  try {
    const { stdout } = await runCommand(command, args, { cwd, timeoutMs: 10_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readRepoSync(repoRoot: string): Promise<RepoSummary["sync"]> {
  try {
    const { stdout } = await runCommand("git", ["-C", repoRoot, "rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd: repoRoot, timeoutMs: 10_000 });
    const [aheadText, behindText] = stdout.trim().split(/\s+/);
    const ahead = Number.parseInt(aheadText || "0", 10) || 0;
    const behind = Number.parseInt(behindText || "0", 10) || 0;

    if (ahead > 0 && behind > 0) return "diverged";
    if (ahead > 0) return "ahead";
    if (behind > 0) return "behind";
    return null;
  } catch {
    return null;
  }
}

async function readHasCommits(repoRoot: string) {
  try {
    await runCommand("git", ["-C", repoRoot, "rev-parse", "--verify", "HEAD"], { cwd: repoRoot, timeoutMs: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function inspectRepo(repoRoot: string, activeAgentWorkspaces: Set<string>): Promise<RepoSummary> {
  const [branch, hasCommits, remote, sync] = await Promise.all([
    readTrimmed("git", ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    readHasCommits(repoRoot),
    readTrimmed("git", ["-C", repoRoot, "remote", "get-url", "origin"], repoRoot),
    readRepoSync(repoRoot),
  ]);

  let dirty: boolean | null = null;
  try {
    const { stdout } = await runCommand("git", ["-C", repoRoot, "status", "--porcelain", "--untracked-files=no"], { cwd: repoRoot, timeoutMs: 10_000 });
    dirty = stdout.trim().length > 0;
  } catch {
    dirty = null;
  }

  const kind = repoKind(repoRoot);

  return {
    name: path.basename(repoRoot),
    path: repoRoot,
    branch,
    hasCommits,
    dirty,
    sync,
    remote,
    hasConvex: hasConvexConfig(repoRoot),
    kind,
    active: kind === "agent" ? activeAgentWorkspaces.has(repoRoot) : true,
  };
}

export async function discoverGitRepoRoots() {
  try {
    const { stdout } = await runCommand("bash", ["-lc", FIND_GIT_REPOS_SCRIPT], { timeoutMs: 20_000 });
    return Array.from(
      new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((gitDir) => path.dirname(gitDir))
          .filter(isUsefulRepoRoot),
      ),
    ).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function loadRepos() {
  const [repoRoots, activeAgentWorkspaces] = await Promise.all([discoverGitRepoRoots(), listActiveAgentWorkspacePaths()]);
  const repos = await Promise.all(repoRoots.map((repoRoot) => inspectRepo(repoRoot, activeAgentWorkspaces)));
  return repos.sort((a, b) => a.path.localeCompare(b.path));
}

function refreshRepos() {
  if (!reposCacheInFlight) {
    reposCacheInFlight = loadRepos()
      .then((repos) => {
        reposCache = repos;
        reposCacheTime = Date.now();
        return repos;
      })
      .catch(() => reposCache || [])
      .finally(() => {
        reposCacheInFlight = null;
      });
  }

  return reposCacheInFlight;
}

export async function listRepos(forceRefresh = false) {
  if (forceRefresh) return refreshRepos();

  const now = Date.now();
  if (reposCache && now - reposCacheTime < REPOS_TTL_MS) return reposCache;

  if (reposCache) {
    void refreshRepos();
    return reposCache;
  }

  return refreshRepos();
}

export async function handleReposList(forceRefresh = false) {
  return json({ repos: await listRepos(forceRefresh) });
}
