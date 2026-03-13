import { readFileSync } from "fs";
import path from "path";

import JSON5 from "json5";

import { OPENCLAW_HOME } from "@/lib/server/openclaw/constants";

export type RawConfig = {
  agents?: {
    defaults?: {
      workspace?: string;
    };
    list?: Array<{
      id?: string;
      workspace?: string;
    }>;
  };
};

export function parseConfigRaw<T>(raw: string, fallback: T): T {
  try {
    return JSON5.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readLocalConfig() {
  try {
    const raw = readFileSync(path.join(OPENCLAW_HOME, "openclaw.json"), "utf8");
    return parseConfigRaw(raw, {} as RawConfig);
  } catch {
    return {} as RawConfig;
  }
}

export function getAgentWorkspace(config: RawConfig, agentId: string) {
  const defaultsWorkspace = String(config.agents?.defaults?.workspace ?? "");
  const configuredAgents = Array.isArray(config.agents?.list) ? config.agents.list : [];
  const configuredAgent = configuredAgents.find((agent) => agent?.id === agentId);
  return String(configuredAgent?.workspace ?? defaultsWorkspace);
}
