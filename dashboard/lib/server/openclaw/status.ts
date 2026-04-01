/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "fs";
import path from "path";

import { runCommand } from "@/lib/server/command";
import { OPENCLAW_PACKAGE_JSON } from "@/lib/server/openclaw/constants";
import { json } from "@/lib/server/openclaw/http";
import { runtimeGatewayRequest } from "@/lib/server/openclaw/runtime-gateway";

export function getInstalledOpenClawVersion() {
  try {
    const content = readFileSync(OPENCLAW_PACKAGE_JSON, "utf8");
    const data = JSON.parse(content) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

async function probeGatewayOnlineWithCli() {
  try {
    const { stdout, stderr } = await runCommand("openclaw", ["gateway", "status"], { timeoutMs: 8_000 });
    const text = `${stdout}\n${stderr}`;
    return /RPC probe:\s*ok/i.test(text);
  } catch {
    return false;
  }
}

export async function handleGatewayStatus() {
  const version = getInstalledOpenClawVersion();

  try {
    await runtimeGatewayRequest("system-presence", {}, 5_000);
    return json({ online: true, version });
  } catch {
    const online = await probeGatewayOnlineWithCli();
    return json({ online, version });
  }
}

export async function handleUsage() {
  const data = await runtimeGatewayRequest("sessions.usage", {}, 10_000);
  return json(data);
}

function summarizePm2Command(processEntry: any) {
  const execPath = typeof processEntry.pm2_env?.pm_exec_path === "string" ? processEntry.pm2_env.pm_exec_path : "";
  const execName = execPath ? path.basename(execPath) : "";
  const args = Array.isArray(processEntry.pm2_env?.args) ? processEntry.pm2_env.args.filter((value: unknown) => typeof value === "string") : [];

  if ((execName === "bash" || execName === "sh") && args.length >= 2 && (args[0] === "-c" || args[0] === "-lc")) {
    return args[1] as string;
  }

  if (execName && args.length > 0) {
    return `${execName} ${args.join(" ")}`;
  }

  return execName || null;
}

export async function handlePerformance() {
  const os = await import("os");
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();

  let diskTotal = 0;
  let diskUsed = 0;
  let diskFree = 0;
  try {
    const { stdout } = await runCommand("df", ["-B1", "/"], { timeoutMs: 5_000 });
    const lines = stdout.trim().split("\n");
    const dataLine = lines[lines.length - 1] || "";
    const parts = dataLine.trim().split(/\s+/);
    diskTotal = parseInt(parts[1] || "0", 10);
    diskUsed = parseInt(parts[2] || "0", 10);
    diskFree = parseInt(parts[3] || "0", 10);
  } catch {
    // Disk metrics unavailable.
  }

  let pm2Processes: any[] = [];
  try {
    const { stdout } = await runCommand("pm2", ["jlist"], { timeoutMs: 5_000 });
    pm2Processes = JSON.parse(stdout || "[]").map((processEntry: any) => ({
      name: processEntry.name,
      status: processEntry.pm2_env?.status,
      cpu: processEntry.monit?.cpu,
      memory: processEntry.monit?.memory,
      uptime: processEntry.pm2_env?.pm_uptime,
      command: summarizePm2Command(processEntry),
    }));
  } catch {
    // PM2 may not be installed.
  }

  let gatewayUp = false;
  try {
    await runtimeGatewayRequest("system-presence", {}, 5_000);
    gatewayUp = true;
  } catch {
    gatewayUp = await probeGatewayOnlineWithCli();
  }

  return json({
    cpu: { cores: cpus.length, model: cpus[0]?.model, loadAvg },
    memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
    disk: { total: diskTotal, used: diskUsed, free: diskFree },
    uptime,
    pm2: pm2Processes,
    gateway: { online: gatewayUp },
  });
}
