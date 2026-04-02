import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import path from "path";

import { runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";
import { listRepos } from "@/lib/server/openclaw/repos";

type ConvexDeployment = {
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
};

const HOME_DIR = process.env.HOME || homedir();
const OPENCLAW_HOME = path.join(HOME_DIR, ".openclaw");
const CONVEX_ENV_FILE_FIND_SCRIPT = [
  `find ${JSON.stringify(OPENCLAW_HOME)} -maxdepth 7`,
  "\\( -path '*/node_modules' -o -path '*/vendor_imports' -o -path '*/.tmp' -o -path '*/dist' -o -path '*/.next' \\) -prune -o",
  "\\( -name '.env.local' -o -name '.env' -o -name '.env.development' -o -name '.env.production' \\) -print",
].join(" ");

function readEnvValue(content: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escaped}\\s*=\\s*([^#\\r\\n]+?)(?:\\s+#\\s*(.+))?$`, "m"));
  return {
    value: match?.[1]?.trim() || null,
    comment: match?.[2]?.trim() || null,
  };
}

function parseDeploymentComment(comment: string | null) {
  if (!comment) return { team: null, project: null };

  const teamMatch = comment.match(/team:\s*([^,]+)/i);
  const projectMatch = comment.match(/project:\s*([^,]+)/i);

  return {
    team: teamMatch?.[1]?.trim() || null,
    project: projectMatch?.[1]?.trim() || null,
  };
}

function hasConvexSignals(content: string) {
  return ["CONVEX_DEPLOYMENT", "NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_CONVEX_SITE_URL", "CONVEX_URL", "CONVEX_SITE_URL"].some((key) => content.includes(`${key}=`));
}

async function discoverConvexEnvFiles() {
  try {
    const { stdout } = await runCommand("bash", ["-lc", CONVEX_ENV_FILE_FIND_SCRIPT], { timeoutMs: 20_000 });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function findRepoForPath(targetPath: string, repos: Awaited<ReturnType<typeof listRepos>>) {
  const normalizedTarget = path.resolve(targetPath);
  const matches = repos.filter((repo) => normalizedTarget === repo.path || normalizedTarget.startsWith(`${repo.path}${path.sep}`));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.path.length - a.path.length)[0] || null;
}

function inspectEnvFile(envPath: string, repos: Awaited<ReturnType<typeof listRepos>>): ConvexDeployment | null {
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, "utf8");
    if (!hasConvexSignals(content)) return null;

    const deployment = readEnvValue(content, "CONVEX_DEPLOYMENT");
    const clientUrl = readEnvValue(content, "NEXT_PUBLIC_CONVEX_URL").value || readEnvValue(content, "CONVEX_URL").value;
    const siteUrl = readEnvValue(content, "NEXT_PUBLIC_CONVEX_SITE_URL").value || readEnvValue(content, "CONVEX_SITE_URL").value;
    const parsedComment = parseDeploymentComment(deployment.comment);
    const appPath = path.dirname(envPath);
    const repo = findRepoForPath(appPath, repos);

    return {
      repo: repo?.name || path.basename(appPath),
      repoPath: repo?.path || appPath,
      envPath,
      appPath,
      deployment: deployment.value,
      clientUrl,
      siteUrl,
      team: parsedComment.team,
      project: parsedComment.project,
      source: path.basename(envPath),
    };
  } catch {
    return null;
  }
}

export async function listConvexDeployments() {
  const [repos, envFiles] = await Promise.all([listRepos(), discoverConvexEnvFiles()]);

  return envFiles
    .map((envPath) => inspectEnvFile(envPath, repos))
    .filter((deployment): deployment is ConvexDeployment => Boolean(deployment))
    .sort((a, b) => a.appPath.localeCompare(b.appPath));
}

export async function handleConvexDeployments() {
  return json({ deployments: await listConvexDeployments() });
}
