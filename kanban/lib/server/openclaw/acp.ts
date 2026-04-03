import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";

import { OPENCLAW_PACKAGE_JSON } from "@/lib/server/openclaw/constants";
import { readLocalConfig } from "@/lib/server/openclaw/config";

const execFileAsync = promisify(execFile);

type RawConfig = {
  acp?: {
    enabled?: boolean;
    defaultAgent?: string;
    allowedAgents?: unknown[];
  };
  plugins?: {
    entries?: {
      acpx?: {
        enabled?: boolean;
      };
    };
  };
};

type RawAcpxConfig = {
  defaultAgent?: string;
  agents?: Record<string, unknown>;
};

export type AcpOption = {
  id: string;
  label: string;
  isDefault?: boolean;
};

const ACP_OPTIONS_TTL_MS = 10_000;

let acpOptionsCache:
  | {
      expiresAt: number;
      value: AcpOption[];
    }
  | null = null;

function normalizeId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: Iterable<unknown>) {
  return Array.from(new Set(Array.from(values).map((value) => normalizeId(value)).filter(Boolean)));
}

function compareAgentIds(a: string, b: string, defaultAgent: string | null) {
  const aIsDefault = defaultAgent ? a === defaultAgent : false;
  const bIsDefault = defaultAgent ? b === defaultAgent : false;

  if (aIsDefault && !bIsDefault) return -1;
  if (!aIsDefault && bIsDefault) return 1;
  return a.localeCompare(b);
}

function resolveAcpxBin() {
  const openclawRoot = path.dirname(OPENCLAW_PACKAGE_JSON);
  const bundledAcpx = path.join(openclawRoot, "dist", "extensions", "acpx", "node_modules", ".bin", "acpx");

  if (process.env.ACPX_BIN && existsSync(process.env.ACPX_BIN)) {
    return process.env.ACPX_BIN;
  }

  if (existsSync(bundledAcpx)) {
    return bundledAcpx;
  }

  return "acpx";
}

async function readResolvedAcpxConfig(): Promise<RawAcpxConfig | null> {
  try {
    const { stdout, stderr } = await execFileAsync(resolveAcpxBin(), ["config", "show"], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      env: process.env,
    });
    const candidate = (stdout || stderr || "").trim();
    if (!candidate) return null;
    return JSON.parse(candidate) as RawAcpxConfig;
  } catch {
    return null;
  }
}

export async function fetchAcpOptions(): Promise<AcpOption[]> {
  const now = Date.now();
  if (acpOptionsCache && acpOptionsCache.expiresAt > now) {
    return acpOptionsCache.value;
  }

  const config = readLocalConfig() as RawConfig;
  const acpConfig = config.acp ?? {};

  if (acpConfig.enabled !== true || config.plugins?.entries?.acpx?.enabled === false) {
    return [];
  }

  const acpxConfig = await readResolvedAcpxConfig();
  const defaultAgent = normalizeId(acpConfig.defaultAgent) || normalizeId(acpxConfig?.defaultAgent) || null;
  const allowedAgents = uniqueStrings(Array.isArray(acpConfig.allowedAgents) ? acpConfig.allowedAgents : []);
  const customAgents = uniqueStrings(Object.keys(acpxConfig?.agents ?? {}));

  const value = (
    allowedAgents.length > 0
      ? uniqueStrings([...allowedAgents, defaultAgent])
      : uniqueStrings([defaultAgent, ...customAgents])
  )
    .sort((a, b) => compareAgentIds(a, b, defaultAgent))
    .map((agentId) => ({
      id: agentId,
      label: agentId,
      isDefault: agentId === defaultAgent,
    }));

  acpOptionsCache = {
    expiresAt: now + ACP_OPTIONS_TTL_MS,
    value,
  };

  return value;
}
