import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { GATEWAY_TOKEN, OPENCLAW_BIN } from "@/lib/server/openclaw/constants";

const execFileAsync = promisify(execFile);

type CliOptions = {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

export async function runOpenClaw(args: string[], options: CliOptions = {}) {
  const { stdout, stderr } = await execFileAsync(OPENCLAW_BIN, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? 15_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      OPENCLAW_HIDE_BANNER: "1",
      OPENCLAW_SUPPRESS_NOTES: "1",
      ...options.env,
    },
  });

  return { stdout, stderr };
}

export async function runOpenClawJson<T>(args: string[], fallback: T, options: CliOptions = {}) {
  const { stdout } = await runOpenClaw(args, options);

  try {
    return JSON.parse(stdout) as T;
  } catch {
    return fallback;
  }
}

export async function gatewayCall<T>(method: string, params: Record<string, unknown> = {}) {
  if (!GATEWAY_TOKEN) {
    throw new Error("GATEWAY_TOKEN is required in environment");
  }

  const args = ["gateway", "call", method, "--json", "--params", JSON.stringify(params), "--token", GATEWAY_TOKEN];
  const { stdout } = await runOpenClaw(args);

  try {
    return JSON.parse(stdout) as T;
  } catch {
    return stdout.trim() as T;
  }
}
