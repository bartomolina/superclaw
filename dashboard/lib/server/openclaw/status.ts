import { readdirSync } from "fs";
import { readFileSync } from "fs";
import { readlinkSync } from "fs";

import { runCommand } from "@/lib/server/command";
import { OPENCLAW_HOME } from "@/lib/server/openclaw/constants";
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

const SYSTEMD_CORE_UNITS = new Set(["cloudflared.service", "openclaw-gateway.service"]);
const WORKSPACE_ROOT = `${OPENCLAW_HOME}/workspace`;

function parseSystemdProperties(stdout: string) {
  const props: Record<string, string> = {};

  for (const line of stdout.split("\n")) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    props[key] = value;
  }

  return props;
}

function collectSystemdCandidateUnits() {
  const units = new Set<string>();

  try {
    for (const entry of readdirSync("/etc/systemd/system")) {
      if (entry.endsWith(".service")) units.add(entry);
    }
  } catch {
    // Ignore missing/unreadable dir.
  }

  for (const unit of SYSTEMD_CORE_UNITS) units.add(unit);
  return Array.from(units);
}

function summarizeSystemdExecStart(value: string | undefined) {
  if (!value) return null;

  const argvMatch = value.match(/argv\[\]=(.+?)(?:\s+;\s+ignore_errors=|$)/);
  const command = (argvMatch?.[1] || value).trim();
  if (!command) return null;

  return command
    .replace(/(--token)\s+\S+/g, "$1 [redacted]")
    .replace(/(Authorization=Bearer\s+)\S+/gi, "$1[redacted]")
    .replace(/([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)=)\S+/gi, "$1[redacted]");
}

function parseSystemdTimestamp(value: string | undefined) {
  if (!value || value === "n/a") return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

async function readSystemdServices() {
  const candidates = collectSystemdCandidateUnits();

  const services = await Promise.all(
    candidates.map(async (unit) => {
      try {
        const { stdout } = await runCommand(
          "systemctl",
          [
            "show",
            unit,
            "-p",
            "Id",
            "-p",
            "Description",
            "-p",
            "LoadState",
            "-p",
            "UnitFileState",
            "-p",
            "ActiveState",
            "-p",
            "SubState",
            "-p",
            "MainPID",
            "-p",
            "ExecMainStartTimestamp",
            "-p",
            "FragmentPath",
            "-p",
            "WorkingDirectory",
            "-p",
            "ExecStart",
          ],
          { timeoutMs: 5_000 },
        );

        const props = parseSystemdProperties(stdout);
        if (!props.Id || props.LoadState === "not-found") return null;

        const workingDirectory = props.WorkingDirectory || null;
        const fragmentPath = props.FragmentPath || null;
        const isWorkspaceService = Boolean(workingDirectory && workingDirectory.startsWith(WORKSPACE_ROOT));
        const isCoreUnit = SYSTEMD_CORE_UNITS.has(props.Id);

        if (!isWorkspaceService && !isCoreUnit) return null;

        return {
          name: props.Id.replace(/\.service$/, ""),
          unit: props.Id,
          description: props.Description || null,
          active: props.ActiveState || null,
          subState: props.SubState || null,
          enabled: props.UnitFileState || null,
          mainPid: Number.parseInt(props.MainPID || "0", 10) || 0,
          uptime: parseSystemdTimestamp(props.ExecMainStartTimestamp),
          command: summarizeSystemdExecStart(props.ExecStart),
          workingDirectory,
          fragmentPath,
        };
      } catch {
        return null;
      }
    }),
  );

  return services.filter(Boolean);
}

type ProcessRow = {
  pid: number;
  cpuPct: number;
  memPct: number;
  rssBytes: number;
  elapsed: string;
  command: string;
  cwd?: string | null;
};

async function readProcesses() {
  try {
    const { stdout } = await runCommand("ps", ["-eo", "pid=,pcpu=,pmem=,rss=,etime=,args="], {
      timeoutMs: 8_000,
    });

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+)$/);
        if (!match) return null;

        return {
          pid: Number.parseInt(match[1] || "0", 10) || 0,
          cpuPct: Number.parseFloat(match[2] || "0") || 0,
          memPct: Number.parseFloat(match[3] || "0") || 0,
          rssBytes: (Number.parseInt(match[4] || "0", 10) || 0) * 1024,
          elapsed: match[5],
          command: match[6],
        };
      })
      .filter((row): row is ProcessRow => Boolean(row))
      .filter((row) => row.command !== "ps" && !row.command.startsWith("ps "));
  } catch {
    return [];
  }
}

function readProcessCwd(pid: number) {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}

function enrichProcesses(rows: ProcessRow[]) {
  return rows.map((row) => ({
    ...row,
    cwd: readProcessCwd(row.pid),
  }));
}

function summarizeCpuTimes(cpus: Array<{ times: Record<string, number> }>) {
  return cpus.reduce(
    (acc, cpu) => {
      const times = cpu.times || {};
      const idle = Number(times.idle || 0);
      const total = Object.values(times).reduce((sum, value) => sum + Number(value || 0), 0);
      acc.idle += idle;
      acc.total += total;
      return acc;
    },
    { idle: 0, total: 0 },
  );
}

async function readCpuUtilization(osModule: typeof import("os")) {
  try {
    const start = summarizeCpuTimes(osModule.cpus());
    await new Promise((resolve) => setTimeout(resolve, 250));
    const end = summarizeCpuTimes(osModule.cpus());

    const totalDelta = end.total - start.total;
    const idleDelta = end.idle - start.idle;
    if (totalDelta <= 0) return null;

    const busyPct = ((totalDelta - idleDelta) / totalDelta) * 100;
    return Math.max(0, Math.min(100, busyPct));
  } catch {
    return null;
  }
}

export async function handlePerformance() {
  const os = await import("os");
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();
  const cpuUtilizationPromise = readCpuUtilization(os);

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

  const [systemdServices, processes, utilizationPct] = await Promise.all([readSystemdServices(), readProcesses(), cpuUtilizationPromise]);

  const topCpuProcesses = enrichProcesses([...processes].sort((a, b) => b.cpuPct - a.cpuPct).slice(0, 12));
  const topMemoryProcesses = enrichProcesses([...processes].sort((a, b) => b.rssBytes - a.rssBytes).slice(0, 12));

  return json({
    cpu: { cores: cpus.length, model: cpus[0]?.model, loadAvg, utilizationPct },
    memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
    disk: { total: diskTotal, used: diskUsed, free: diskFree },
    uptime,
    systemd: systemdServices,
    processes: {
      cpu: topCpuProcesses,
      memory: topMemoryProcesses,
    },
  });
}
