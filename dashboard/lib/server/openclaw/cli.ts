import { CommandExecutionError, runCommand } from "@/lib/server/command";
import { OPENCLAW_BIN, GATEWAY_TOKEN } from "@/lib/server/openclaw/constants";

type CliOptions = {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export async function runOpenClaw(args: string[], options: CliOptions = {}) {
  return runCommand(OPENCLAW_BIN, args, {
    ...options,
    env: {
      ...process.env,
      OPENCLAW_HIDE_BANNER: "1",
      OPENCLAW_SUPPRESS_NOTES: "1",
      ...options.env,
    },
  });
}

export async function runOpenClawJson<T>(args: string[], fallback: T, options: CliOptions = {}) {
  let stdout = "";

  try {
    const result = await runOpenClaw(args, options);
    stdout = result.stdout;
  } catch (error) {
    if (!(error instanceof CommandExecutionError) || !error.stdout.trim()) throw error;
    stdout = error.stdout;
  }

  try {
    return JSON.parse(stdout) as T;
  } catch {
    return fallback;
  }
}

export async function gatewayCall<T>(method: string, params: Record<string, unknown> = {}, options: CliOptions = {}) {
  if (!GATEWAY_TOKEN) {
    throw new Error("GATEWAY_TOKEN is required in environment");
  }

  const args = ["gateway", "call", method, "--json", "--params", JSON.stringify(params), "--token", GATEWAY_TOKEN];
  const { stdout } = await runOpenClaw(args, options);

  try {
    return JSON.parse(stdout) as T;
  } catch {
    return stdout.trim() as T;
  }
}
