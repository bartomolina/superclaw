/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "fs";
import path from "path";

import JSON5 from "json5";

import { gatewayCall } from "@/lib/server/openclaw/cli";
import { OPENCLAW_HOME } from "@/lib/server/openclaw/constants";
import { json } from "@/lib/server/openclaw/http";

export type ConfigDocument = {
  raw: string;
  hash: string;
};

function stringifyConfigFallback(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

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
    return parseConfigRaw(raw, { agents: { defaults: {}, list: [] }, models: { providers: {} } } as any);
  } catch {
    return { agents: { defaults: {}, list: [] }, models: { providers: {} } } as any;
  }
}

export async function getConfigDocument(): Promise<ConfigDocument> {
  const config =
    (await gatewayCall<{
      parsed?: unknown;
      hash?: string;
    }>("config.get", {})) || {};

  const raw = stringifyConfigFallback(config.parsed);

  return {
    raw,
    hash: typeof config.hash === "string" ? config.hash : "",
  };
}

export async function applyConfig(raw: string, baseHash: string) {
  await gatewayCall("config.apply", { raw, baseHash });
}

export async function handleConfigGet() {
  const config = await getConfigDocument();
  return json({ raw: config.raw, hash: config.hash });
}

