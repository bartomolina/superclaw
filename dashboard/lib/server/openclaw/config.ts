/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "fs";
import path from "path";

import JSON5 from "json5";
import { NextRequest } from "next/server";

import { requiredString } from "@/lib/server/validate";
import { gatewayCall } from "@/lib/server/openclaw/cli";
import { OPENCLAW_HOME } from "@/lib/server/openclaw/constants";
import { json, parseBody } from "@/lib/server/openclaw/http";

export type ConfigDocument = {
  raw: string;
  hash: string;
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
    return parseConfigRaw(raw, { agents: { defaults: {}, list: [] }, models: { providers: {} } } as any);
  } catch {
    return { agents: { defaults: {}, list: [] }, models: { providers: {} } } as any;
  }
}

export async function getConfigDocument(): Promise<ConfigDocument> {
  const config = (await gatewayCall<{ raw?: string; hash?: string }>("config.get", {})) || {};

  return {
    raw: typeof config.raw === "string" ? config.raw : "{}",
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

export async function handleConfigPut(req: NextRequest) {
  const body = await parseBody(req);
  const raw = requiredString(body.raw, "raw", 2_000_000);
  const baseHash = requiredString(body.baseHash, "baseHash", 256);
  await applyConfig(raw, baseHash);
  return json({ ok: true });
}
