import { existsSync } from "fs";
import path from "path";

import { runCommand } from "@/lib/server/command";
import { readLocalConfig } from "@/lib/server/openclaw/config";
import { OPENCLAW_PACKAGE_JSON } from "@/lib/server/openclaw/constants";
import { json } from "@/lib/server/openclaw/http";

type RawConfig = {
  acp?: {
    enabled?: boolean;
    backend?: string;
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

type AcpSummary = {
  enabled: boolean;
  pluginEnabled: boolean;
  backend: string | null;
  defaultAgent: string | null;
  allowedAgents: string[];
  customAgents: string[];
  selectableAgents: string[];
};

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
    const { stdout, stderr } = await runCommand(resolveAcpxBin(), ["config", "show"], {
      timeoutMs: 10_000,
    });
    const candidate = (stdout || stderr || "").trim();
    if (!candidate) return null;
    return JSON.parse(candidate) as RawAcpxConfig;
  } catch {
    return null;
  }
}

export async function getAcpSummary(): Promise<AcpSummary> {
  const config = readLocalConfig() as RawConfig;
  const acpConfig = config.acp ?? {};
  const acpxConfig = await readResolvedAcpxConfig();

  const enabled = acpConfig.enabled === true;
  const pluginEnabled = config.plugins?.entries?.acpx?.enabled !== false;
  const backend = normalizeId(acpConfig.backend) || null;
  const defaultAgent = normalizeId(acpConfig.defaultAgent) || normalizeId(acpxConfig?.defaultAgent) || null;
  const allowedAgents = uniqueStrings(Array.isArray(acpConfig.allowedAgents) ? acpConfig.allowedAgents : []);
  const customAgents = uniqueStrings(Object.keys(acpxConfig?.agents ?? {}));

  const selectableAgents = (
    allowedAgents.length > 0
      ? uniqueStrings([...allowedAgents, defaultAgent])
      : uniqueStrings([defaultAgent, ...customAgents])
  ).sort((a, b) => compareAgentIds(a, b, defaultAgent));

  return {
    enabled,
    pluginEnabled,
    backend,
    defaultAgent,
    allowedAgents,
    customAgents,
    selectableAgents: enabled && pluginEnabled ? selectableAgents : [],
  } satisfies AcpSummary;
}

export async function handleAcpSummary() {
  return json(await getAcpSummary());
}
