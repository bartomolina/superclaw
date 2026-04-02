import { CommandExecutionError, runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";

type AccountLine = {
  label: string;
  value: string;
};

type AccountProvider = {
  id: string;
  label: string;
  value: string | null;
  detail: string | null;
  lines?: AccountLine[];
};

function commandMissing(error: unknown) {
  return error instanceof CommandExecutionError && /not found/i.test(error.message);
}

async function readGitIdentityLine(): Promise<AccountLine | null> {
  try {
    const [nameResult, emailResult] = await Promise.allSettled([
      runCommand("git", ["config", "--global", "user.name"], { timeoutMs: 10_000 }),
      runCommand("git", ["config", "--global", "user.email"], { timeoutMs: 10_000 }),
    ]);

    const name = nameResult.status === "fulfilled" ? nameResult.value.stdout.trim() : "";
    const email = emailResult.status === "fulfilled" ? emailResult.value.stdout.trim() : "";

    if (!name && !email) return null;

    return {
      label: "git",
      value: name && email ? `${name} <${email}>` : name || email,
    };
  } catch (error) {
    if (commandMissing(error)) return null;
    return null;
  }
}

async function readGhLine(): Promise<AccountLine | null> {
  try {
    const { stdout } = await runCommand("gh", ["auth", "status", "--json", "hosts"], { timeoutMs: 10_000 });
    const parsed = JSON.parse(stdout) as {
      hosts?: Record<string, Array<{ active?: boolean; login?: string; host?: string }>>;
    };

    for (const [host, accounts] of Object.entries(parsed.hosts || {})) {
      const active = accounts.find((account) => account.active);
      if (!active?.login) continue;

      return {
        label: "gh",
        value: host === "github.com" ? active.login : `${active.login} · ${host}`,
      };
    }
  } catch (error) {
    if (commandMissing(error)) return null;
    return null;
  }

  return null;
}

async function readGithubAccount(): Promise<AccountProvider | null> {
  const lines = (await Promise.all([readGitIdentityLine(), readGhLine()])).filter((line): line is AccountLine => Boolean(line));
  if (lines.length === 0) return null;

  return {
    id: "github",
    label: "GitHub",
    value: null,
    detail: null,
    lines,
  };
}

async function readVercelAccount(): Promise<AccountProvider | null> {
  try {
    const { stdout } = await runCommand("vercel", ["whoami"], { timeoutMs: 10_000 });
    const login = stdout.trim();
    if (!login) return null;

    return {
      id: "vercel",
      label: "Vercel",
      value: null,
      detail: login,
    };
  } catch (error) {
    if (commandMissing(error)) return null;
    return null;
  }
}

async function readGoogleAccount(): Promise<AccountProvider | null> {
  try {
    const { stdout } = await runCommand("gcloud", ["auth", "list", "--format=json"], { timeoutMs: 10_000 });
    const parsed = JSON.parse(stdout) as Array<{ account?: string; status?: string }>;
    const active = parsed.find((entry) => entry.status === "ACTIVE" && entry.account);
    if (!active?.account) return null;

    return {
      id: "google",
      label: "Google",
      value: active.account,
      detail: "via gcloud auth",
    };
  } catch (error) {
    if (commandMissing(error)) return null;
    return null;
  }
}

export async function handleAccountsList() {
  const providers = (await Promise.all([
    readGithubAccount(),
    readVercelAccount(),
    readGoogleAccount(),
  ])).filter((provider): provider is AccountProvider => Boolean(provider));

  return json({ providers });
}
