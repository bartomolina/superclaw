import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class CommandExecutionError extends Error {
  command: string;
  args: string[];
  exitCode: number | null;
  stderr: string;
  stdout: string;

  constructor(params: {
    command: string;
    args: string[];
    message: string;
    exitCode: number | null;
    stderr: string;
    stdout: string;
  }) {
    super(params.message);
    this.name = "CommandExecutionError";
    this.command = params.command;
    this.args = params.args;
    this.exitCode = params.exitCode;
    this.stderr = params.stderr;
    this.stdout = params.stdout;
  }
}

type RunCommandOptions = {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export async function runCommand(command: string, args: string[], options: RunCommandOptions = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs ?? 15_000,
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
    };

    throw new CommandExecutionError({
      command,
      args,
      message: err.message || `command failed: ${command}`,
      exitCode: typeof err.code === "number" ? err.code : null,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    });
  }
}
