import { CommandExecutionError, runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";

type RawVercelDomain = {
  name?: string;
  registrar?: string;
};

type ParsedDnsRecord = {
  name: string;
  type: string;
};

function hasCredentialsError(error: unknown) {
  if (!(error instanceof CommandExecutionError)) return false;
  const text = `${error.stdout}\n${error.stderr}`;
  return /No existing credentials found|Please run `vercel login`|Login token/i.test(text);
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

    if (cols[0]?.startsWith("rec_")) {
      if (cols.length < 4) continue;
      name = cols[1] || "";
      type = cols[2] || "";
    } else {
      name = cols[0] || "";
      type = cols[1] || "";
    }

    if (!name || name === "@" || name === "*") continue;
    if (!["A", "AAAA", "CNAME", "ALIAS"].includes(type)) continue;

    records.push({ name, type });
  }

  return records;
}

function toSubdomain(host: string, domain: string) {
  return `${host}.${domain}`;
}

export async function handleVercelDomains() {
  try {
    const { stdout } = await runCommand("vercel", ["domains", "list", "--format=json", "--no-color"], { timeoutMs: 30_000 });
    const parsed = JSON.parse(stdout) as { domains?: RawVercelDomain[] };
    const domains = (parsed.domains || []).filter((domain) => typeof domain.name === "string" && domain.name);

    const details = await Promise.all(
      domains.map(async (domain) => {
        try {
          const { stdout: dnsStdout } = await runCommand("vercel", ["dns", "list", domain.name as string, "--no-color"], { timeoutMs: 30_000 });
          const records = parseDnsRecords(dnsStdout);
          const subdomains = Array.from(new Set(records.map((record) => toSubdomain(record.name, domain.name as string)))).sort((a, b) => a.localeCompare(b));

          return {
            name: domain.name as string,
            registrar: domain.registrar || null,
            subdomains,
          };
        } catch {
          return {
            name: domain.name as string,
            registrar: domain.registrar || null,
            subdomains: [],
          };
        }
      })
    );

    return json({ authenticated: true, domains: details });
  } catch (error) {
    if (hasCredentialsError(error)) {
      return json({ authenticated: false, domains: [] });
    }
    throw error;
  }
}
