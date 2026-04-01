import { existsSync, readFileSync } from "fs";

import { CommandExecutionError, runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";

type RawVercelDomain = {
  name?: string;
  registrar?: string;
};

type ParsedDnsRecord = {
  name: string;
  type: string;
  value: string;
};

type ServerTargets = {
  ips: Set<string>;
  hosts: Set<string>;
};

function hasCredentialsError(error: unknown) {
  if (!(error instanceof CommandExecutionError)) return false;
  const text = `${error.stdout}\n${error.stderr}`;
  return /No existing credentials found|Please run `vercel login`|Login token/i.test(text);
}

function normalizeHost(value: string) {
  return value.trim().replace(/\.$/, "").toLowerCase();
}

function normalizeIp(value: string) {
  return value.trim().replace(/%.*$/, "").toLowerCase();
}

function parseDnsRecords(output: string) {
  const lines = output.split(/\r?\n/);
  const records: ParsedDnsRecord[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("> Records found under ")) continue;
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(line)) continue;
    if (/^id\s+name\s+type\s+value/i.test(line)) continue;

    const cols = rawLine.trimStart().split(/\s{2,}/).filter(Boolean);
    if (cols.length < 3) continue;

    let name = "";
    let type = "";
    let value = "";

    if (cols[0]?.startsWith("rec_")) {
      if (cols.length < 4) continue;
      name = cols[1] || "";
      type = cols[2] || "";
      value = cols[3] || "";
    } else {
      name = cols[0] || "";
      type = cols[1] || "";
      value = cols[2] || "";
    }

    if (!name || name === "@" || name === "*") continue;
    if (!["A", "AAAA", "CNAME", "ALIAS"].includes(type)) continue;

    records.push({ name, type, value });
  }

  return records;
}

function toHost(host: string, domain: string) {
  return `${host}.${domain}`;
}

function readCaddyHosts() {
  const configPath = "/etc/caddy/Caddyfile";
  if (!existsSync(configPath)) return [];

  try {
    return Array.from(
      new Set(
        readFileSync(configPath, "utf8")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"))
          .filter((line) => line.endsWith("{") && line !== "{" && !line.startsWith("(") && !line.startsWith("import "))
          .flatMap((line) => line.slice(0, -1).trim().split(",").map((host) => normalizeHost(host)).filter(Boolean)),
      ),
    );
  } catch {
    return [];
  }
}

async function readServerTargets(): Promise<ServerTargets> {
  const os = await import("os");
  const networkInterfaces = os.networkInterfaces();
  const ips = new Set<string>();

  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries || []) {
      if (!entry.address || entry.internal) continue;
      ips.add(normalizeIp(entry.address));
    }
  }

  const hosts = new Set<string>(readCaddyHosts());
  const hostname = os.hostname();
  if (hostname) hosts.add(normalizeHost(hostname));

  return { ips, hosts };
}

function matchServerTarget(record: ParsedDnsRecord, domain: string, targets: ServerTargets) {
  const host = toHost(record.name, domain);
  const normalizedValue = normalizeHost(record.value);

  if ((record.type === "A" || record.type === "AAAA") && targets.ips.has(normalizeIp(record.value))) {
    return {
      pointsHere: true,
      reason: "IP matches this server",
      host,
    };
  }

  if ((record.type === "CNAME" || record.type === "ALIAS") && targets.hosts.has(normalizedValue)) {
    return {
      pointsHere: true,
      reason: `Alias targets ${normalizedValue}`,
      host,
    };
  }

  return {
    pointsHere: false,
    reason: null,
    host,
  };
}

export async function handleVercelDomains() {
  try {
    const { stdout } = await runCommand("vercel", ["domains", "list", "--format=json", "--no-color"], { timeoutMs: 30_000 });
    const parsed = JSON.parse(stdout.replace(/^Fetching Domains under .*\n/, "")) as { domains?: RawVercelDomain[] };
    const domains = (parsed.domains || []).filter((domain) => typeof domain.name === "string" && domain.name);
    const serverTargets = await readServerTargets();

    const details = await Promise.all(
      domains.map(async (domain) => {
        try {
          const { stdout: dnsStdout } = await runCommand("vercel", ["dns", "list", domain.name as string, "--no-color"], { timeoutMs: 30_000 });
          const records = parseDnsRecords(dnsStdout)
            .map((record) => {
              const match = matchServerTarget(record, domain.name as string, serverTargets);
              return {
                host: match.host,
                type: record.type,
                value: record.value,
                pointsHere: match.pointsHere,
                reason: match.reason,
              };
            })
            .sort((a, b) => a.host.localeCompare(b.host));

          return {
            name: domain.name as string,
            registrar: domain.registrar || null,
            records,
          };
        } catch {
          return {
            name: domain.name as string,
            registrar: domain.registrar || null,
            records: [],
          };
        }
      }),
    );

    return json({ authenticated: true, domains: details });
  } catch (error) {
    if (hasCredentialsError(error)) {
      return json({ authenticated: false, domains: [] });
    }
    throw error;
  }
}
