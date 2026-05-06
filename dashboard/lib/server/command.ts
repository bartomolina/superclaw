import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class CommandExecutionError extends Error {
  command: string;
  args: string[];
  exitCode: number | null;
  stderr: string;
  stdout: string;
  signal: string | null;
  timedOut: boolean;
  timeoutMs: number | null;

  constructor(params: {
    command: string;
    args: string[];
    message: string;
    exitCode: number | null;
    stderr: string;
    stdout: string;
    signal?: string | null;
    timedOut?: boolean;
    timeoutMs?: number | null;
  }) {
    super(params.message);
    this.name = "CommandExecutionError";
    this.command = params.command;
    this.args = params.args;
    this.exitCode = params.exitCode;
    this.stderr = params.stderr;
    this.stdout = params.stdout;
    this.signal = params.signal ?? null;
    this.timedOut = params.timedOut ?? false;
    this.timeoutMs = params.timeoutMs ?? null;
  }
}

type RunCommandOptions = {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

function redactSensitiveText(text: string) {
  return text
    .replace(/(--token(?:=|\s+))([^\s]+)/giu, "$1[redacted]")
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/gu, "[redacted-token]");
}

function trimCommandOutput(text: string, maxLength = 4_000) {
  const trimmed = redactSensitiveText(text).trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}\n… [truncated ${trimmed.length - maxLength} chars]`;
}

export async function runCommand(command: string, args: string[], options: RunCommandOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      cwd: options.cwd,
      env: options.env,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      stdout: stdout ?? "",
      stderr: stderr ?? "",
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      code?: string | number;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string | null;
    };
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? "";
    const timedOut = Boolean(err.killed && err.signal === "SIGKILL" && timeoutMs > 0);
    const details = [
      timedOut ? `timed out after ${timeoutMs}ms` : null,
      trimCommandOutput(stderr) ? `stderr: ${trimCommandOutput(stderr)}` : null,
      trimCommandOutput(stdout) ? `stdout: ${trimCommandOutput(stdout)}` : null,
    ].filter(Boolean);
    const baseMessage = redactSensitiveText(err.message || `command failed: ${command}`);

    throw new CommandExecutionError({
      command,
      args,
      message: details.length ? `${baseMessage}\n${details.join("\n")}` : baseMessage,
      exitCode: typeof err.code === "number" ? err.code : null,
      stdout,
      stderr,
      signal: err.signal ?? null,
      timedOut,
      timeoutMs,
    });
  }
}
