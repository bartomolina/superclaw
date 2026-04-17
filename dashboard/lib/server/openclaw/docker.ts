import { runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";

type DockerPsRow = {
  ID?: string;
  Image?: string;
  Command?: string;
  CreatedAt?: string;
  RunningFor?: string;
  Ports?: string;
  State?: string;
  Status?: string;
  Names?: string;
  Labels?: string;
};

type DockerInspectRow = {
  Id?: string;
  Name?: string;
  Config?: {
    Image?: string;
    Cmd?: string[];
    Labels?: Record<string, string>;
  };
  State?: {
    Status?: string;
    Running?: boolean;
    StartedAt?: string;
    FinishedAt?: string;
    Health?: {
      Status?: string;
    };
  };
  HostConfig?: {
    RestartPolicy?: {
      Name?: string;
    };
  };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
};

type DockerPorts = Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;

function parsePsRows(stdout: string) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as DockerPsRow;
      } catch {
        return null;
      }
    })
    .filter((row): row is DockerPsRow => Boolean(row));
}

function formatTimestamp(value?: string) {
  if (!value || value.startsWith("0001-01-01")) return null;
  return value;
}

function formatPorts(ports?: DockerPorts) {
  if (!ports) return [];

  const entries: string[] = [];

  for (const [containerPort, bindings] of Object.entries(ports)) {
    if (!bindings || bindings.length === 0) {
      entries.push(containerPort);
      continue;
    }

    for (const binding of bindings) {
      const hostIp = binding.HostIp && binding.HostIp !== "0.0.0.0" ? `${binding.HostIp}:` : "";
      const hostPort = binding.HostPort ? `${binding.HostPort}` : "";
      entries.push(`${hostIp}${hostPort}->${containerPort}`);
    }
  }

  return entries;
}

export async function handleDockerContainers() {
  try {
    const { stdout } = await runCommand("docker", ["ps", "-a", "--no-trunc", "--format", "{{json .}}"], { timeoutMs: 10_000 });
    const rows = parsePsRows(stdout);
    const ids = rows.map((row) => row.ID).filter((value): value is string => Boolean(value));

    let inspectById = new Map<string, DockerInspectRow>();
    if (ids.length > 0) {
      const { stdout: inspectStdout } = await runCommand("docker", ["inspect", ...ids], { timeoutMs: 12_000 });
      const inspectRows = JSON.parse(inspectStdout) as DockerInspectRow[];
      inspectById = new Map(inspectRows.map((row) => [row.Id || "", row]));
    }

    const containers = rows.map((row) => {
      const inspect = row.ID ? inspectById.get(row.ID) : undefined;
      const labels = inspect?.Config?.Labels || {};
      const image = inspect?.Config?.Image || row.Image || null;
      const imageTag = image?.split(":").slice(1).join(":") || null;
      const commandFromInspect = inspect?.Config?.Cmd?.join(" ") || null;
      const state = inspect?.State?.Status || row.State || null;
      const health = inspect?.State?.Health?.Status || null;
      const name = (inspect?.Name || row.Names || "").replace(/^\//, "") || row.ID || "unknown";

      return {
        id: row.ID || name,
        name,
        image,
        imageTag,
        state,
        health,
        status: row.Status || state || "unknown",
        runningFor: row.RunningFor || null,
        ports: formatPorts(inspect?.NetworkSettings?.Ports),
        restartPolicy: inspect?.HostConfig?.RestartPolicy?.Name || null,
        composeProject: labels["com.docker.compose.project"] || null,
        composeService: labels["com.docker.compose.service"] || null,
        command: commandFromInspect || row.Command || null,
        createdAt: row.CreatedAt || null,
        startedAt: formatTimestamp(inspect?.State?.StartedAt),
        finishedAt: formatTimestamp(inspect?.State?.FinishedAt),
      };
    });

    return json({
      available: true,
      running: true,
      containers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Docker unavailable";
    return json({
      available: false,
      running: false,
      error: message,
      containers: [],
    });
  }
}
