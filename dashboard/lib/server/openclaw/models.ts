/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";

import { optionalString, requiredString } from "@/lib/server/validate";
import { applyConfig, getConfigDocument, parseConfigRaw, readLocalConfig } from "@/lib/server/openclaw/config";
import { json, parseBody } from "@/lib/server/openclaw/http";
import { runOpenClawJson } from "@/lib/server/openclaw/cli";
import { OPENCLAW_PACKAGE_JSON } from "@/lib/server/openclaw/constants";

let modelsCache: Record<string, any[]> | null = null;
let modelsCacheTime = 0;
let modelsCacheInFlight: Promise<Record<string, any[]>> | null = null;

const MODELS_CATALOG_TTL_MS = 300_000;
const BUILT_IN_CATALOG_PROVIDER_IDS = [
  "google",
];

type ModelsStatus = {
  defaultModel?: string;
  fallbacks?: string[];
  allowed?: string[];
  auth?: {
    providers?: Array<{
      provider?: string;
      effective?: { kind?: string };
      profiles?: { count?: number; oauth?: number; token?: number; apiKey?: number };
    }>;
  };
};

function getKnownCatalogProviderIds() {
  const providers = new Set(BUILT_IN_CATALOG_PROVIDER_IDS);
  const packageRoot = path.dirname(OPENCLAW_PACKAGE_JSON);
  const extensionsDir = path.join(packageRoot, "dist", "extensions");

  try {
    for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const providerDir = path.join(extensionsDir, entry.name);
      if (fs.existsSync(path.join(providerDir, "provider-catalog.js")) || fs.existsSync(path.join(providerDir, "catalog-provider.js"))) {
        providers.add(entry.name);
      }
    }
  } catch {
    // Best-effort only. The actual provider model list still loads through the OpenClaw CLI per provider.
  }

  return Array.from(providers).sort();
}

async function loadModelCatalogRows(args: string[], timeoutMs: number) {
  const data = await runOpenClawJson<{ models?: Array<any> }>(args, {}, { timeoutMs });
  const byProvider = new Map<string, Map<string, { key: string; name: string; input: string | null; contextWindow: number; available: boolean }>>();

  for (const model of data.models || []) {
    const key = String(model.key || "");
    if (!key) continue;

    const provider = key.split("/")[0];
    if (!provider) continue;

    if (!byProvider.has(provider)) byProvider.set(provider, new Map());
    const providerModels = byProvider.get(provider)!;
    const existing = providerModels.get(key);

    if (!existing) {
      providerModels.set(key, {
        key,
        name: model.name || key,
        input: model.input || null,
        contextWindow: Number(model.contextWindow) || 0,
        available: model.available ?? true,
      });
      continue;
    }

    providerModels.set(key, {
      key,
      name: existing.name || model.name || key,
      input: existing.input || model.input || null,
      contextWindow: Math.max(existing.contextWindow, Number(model.contextWindow) || 0),
      available: existing.available || Boolean(model.available ?? true),
    });
  }

  return Object.fromEntries(
    Array.from(byProvider.entries()).map(([provider, models]) => [
      provider,
      Array.from(models.values()).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key)),
    ]),
  );
}

async function loadModelsCatalog() {
  try {
    const catalog = await loadModelCatalogRows(["models", "list", "--all", "--json"], 20_000);
    if (Object.keys(catalog).length > 0) return catalog;
  } catch (error) {
    console.warn("Full OpenClaw model catalog unavailable; falling back to configured models", error);
  }

  return loadModelCatalogRows(["models", "list", "--json"], 15_000);
}

export async function getModelsCatalog() {
  function refreshModelsCatalog() {
    if (!modelsCacheInFlight) {
      modelsCacheInFlight = loadModelsCatalog()
        .then((catalog) => {
          modelsCache = catalog;
          modelsCacheTime = Date.now();
          return catalog;
        })
        .catch(() => modelsCache || {})
        .finally(() => {
          modelsCacheInFlight = null;
        });
    }

    return modelsCacheInFlight;
  }

  const now = Date.now();
  if (modelsCache && now - modelsCacheTime < MODELS_CATALOG_TTL_MS) return modelsCache;

  if (modelsCache) {
    void refreshModelsCatalog();
    return modelsCache;
  }

  return refreshModelsCatalog();
}

async function getProviderModelsCatalog(provider: string) {
  const cached = modelsCache?.[provider];
  if (cached && cached.length > 0) return cached;

  const providerCatalog = await loadModelCatalogRows(["models", "list", "--all", "--provider", provider, "--json"], 35_000);
  let models = providerCatalog[provider] || [];

  if (models.length === 0) {
    const configuredCatalog = await loadModelCatalogRows(["models", "list", "--json"], 15_000);
    models = configuredCatalog[provider] || [];
  }

  if (models.length > 0) {
    modelsCache = {
      ...(modelsCache || {}),
      [provider]: models,
    };
    modelsCacheTime = Date.now();
  }

  return models;
}

export function aliasToFullModel(alias: string, providerMap: Record<string, any>) {
  for (const [providerId, provider] of Object.entries(providerMap || {})) {
    const models = Array.isArray((provider as any)?.models) ? (provider as any).models : [];
    for (const model of models) {
      if (typeof model === "string") {
        if (model === alias) return `${providerId}/${model}`;
        continue;
      }

      if (model?.alias === alias) {
        return `${providerId}/${model.id || alias}`;
      }

      if (model?.id === alias) {
        return `${providerId}/${alias}`;
      }
    }
  }

  return alias;
}

export function detectFallbacks(configuredModel: any, defaultModel: any) {
  const fromConfigured = Array.isArray(configuredModel?.fallbacks) ? configuredModel.fallbacks : [];
  if (fromConfigured.length > 0) return fromConfigured;
  return Array.isArray(defaultModel?.fallbacks) ? defaultModel.fallbacks : [];
}

export function inferAvailableModels(providerMap: Record<string, any>) {
  return Array.from(
    new Map(
      Object.entries(providerMap || {}).flatMap(([providerId, provider]) => {
        const models = Array.isArray((provider as any)?.models) ? (provider as any).models : [];
        return models
          .map((model: any) => {
            const id = typeof model === "string" ? model : model?.id || model?.alias;
            if (!id) return null;
            const name = typeof model === "object" && typeof model.alias === "string" ? model.alias : id;
            return [id, { id, name, provider: providerId }];
          })
          .filter(Boolean) as Array<[string, { id: string; name: string; provider: string }]>;
      }),
    ).values(),
  );
}

export async function handleModelsGet() {
  const config = readLocalConfig();
  const status = await runOpenClawJson<ModelsStatus | null>(["models", "--status-json"], null, { timeoutMs: 15_000 });
  const providerMap = config.models?.providers || {};
  const primaryModel = status?.defaultModel ?? config.agents?.defaults?.model?.primary ?? null;
  const fallbackModels = Array.isArray(status?.fallbacks)
    ? status.fallbacks
    : Array.isArray(config.agents?.defaults?.model?.fallbacks)
      ? config.agents.defaults.model.fallbacks
      : [];
  const allowedModelKeys = Array.isArray(status?.allowed) ? status.allowed : Object.keys(config.agents?.defaults?.models || {});

  const providerSummary = new Map<string, {
    id: string;
    configuredModelCount: number;
    authModes: Set<string>;
    authProfileCount: number;
    hasProviderConfig: boolean;
    providerConfigModelCount: number;
    sources: Set<string>;
    models: Set<string>;
  }>();

  function ensureProvider(providerId: string) {
    if (!providerSummary.has(providerId)) {
      providerSummary.set(providerId, {
        id: providerId,
        configuredModelCount: 0,
        authModes: new Set<string>(),
        authProfileCount: 0,
        hasProviderConfig: false,
        providerConfigModelCount: 0,
        sources: new Set<string>(),
        models: new Set<string>(),
      });
    }

    return providerSummary.get(providerId)!;
  }

  for (const [providerId, provider] of Object.entries(providerMap) as Array<[string, any]>) {
    const summary = ensureProvider(providerId);
    summary.hasProviderConfig = true;
    summary.providerConfigModelCount = Array.isArray(provider?.models) ? provider.models.length : 0;
    if (typeof provider?.auth === "string") summary.authModes.add(provider.auth);
    summary.sources.add("provider config");

    const providerModels = Array.isArray(provider?.models) ? provider.models : [];
    for (const model of providerModels) {
      const modelId = typeof model === "string" ? model : model?.id || model?.alias || model?.name;
      if (typeof modelId === "string" && modelId.length > 0) summary.models.add(modelId);
    }
  }

  for (const authProvider of status?.auth?.providers || []) {
    const providerId = typeof authProvider?.provider === "string" ? authProvider.provider : "";
    if (!providerId) continue;
    const summary = ensureProvider(providerId);
    summary.authProfileCount += Number(authProvider.profiles?.count) || 0;
    const effectiveKind = typeof authProvider.effective?.kind === "string" ? authProvider.effective.kind : "auth";
    summary.authModes.add(effectiveKind);
    summary.sources.add("auth");
  }

  for (const modelKey of allowedModelKeys) {
    const providerId = modelKey.split("/")[0];
    if (!providerId) continue;
    const summary = ensureProvider(providerId);
    summary.configuredModelCount += 1;
    summary.sources.add("model allow-list");
    summary.models.add(modelKey.split("/").slice(1).join("/") || modelKey);
  }

  for (const modelKey of [primaryModel, ...fallbackModels].filter((value): value is string => typeof value === "string" && value.length > 0)) {
    const providerId = modelKey.split("/")[0];
    if (!providerId) continue;
    const summary = ensureProvider(providerId);
    summary.sources.add(modelKey === primaryModel ? "default model" : "fallback model");
    summary.models.add(modelKey.split("/").slice(1).join("/") || modelKey);
  }

  const configuredProviders = Array.from(providerSummary.values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((provider) => ({
      id: provider.id,
      configuredModelCount: provider.configuredModelCount,
      authMode: provider.authModes.size > 0 ? Array.from(provider.authModes).sort().join(", ") : null,
      authProfileCount: provider.authProfileCount,
      hasProviderConfig: provider.hasProviderConfig,
      providerConfigModelCount: provider.providerConfigModelCount,
      sources: Array.from(provider.sources).sort(),
      models: Array.from(provider.models).sort((a, b) => a.localeCompare(b)),
    }));

  const configuredModels = allowedModelKeys.map((key) => {
    const provider = key.split("/")[0];
    const name = key.split("/").pop() || key;
    return {
      id: key,
      name,
      provider,
    };
  });

  return json({
    configuredProviders,
    configuredModels,
    defaultModel: {
      primary: primaryModel,
      fallbacks: fallbackModels,
    },
  });
}

export async function handleModelsCatalogProviders() {
  const catalog = await getModelsCatalog();
  const providers = Array.from(new Set([...getKnownCatalogProviderIds(), ...Object.keys(catalog)]))
    .sort()
    .map((provider) => ({ id: provider, count: catalog[provider]?.length ?? null }));
  return json({ providers });
}

export async function handleModelsCatalogProvider(providerRaw: string) {
  const provider = decodeURIComponent(providerRaw);
  const models = await getProviderModelsCatalog(provider);
  return json({ provider, models });
}

export async function handleModelsAdd(req: NextRequest) {
  const body = await parseBody(req);
  const modelKey = requiredString(body.model, "model", 256);
  const alias = optionalString(body.alias, 120);

  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
  if (!raw.agents) raw.agents = {};
  if (!raw.agents.defaults) raw.agents.defaults = {};
  if (!raw.agents.defaults.models) raw.agents.defaults.models = {};

  const entry: Record<string, string> = {};
  if (alias) entry.alias = alias;
  raw.agents.defaults.models[modelKey] = entry;

  await applyConfig(JSON.stringify(raw, null, 2), config.hash);
  return json({ ok: true });
}

export async function handleModelsRemove(req: NextRequest) {
  const body = await parseBody(req);
  const modelKey = requiredString(body.model, "model", 256);

  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
  const models = raw.agents?.defaults?.models;

  if (!models || !models[modelKey]) return json({ error: "model not in catalog" }, 404);
  const primary = raw.agents?.defaults?.model?.primary;
  if (modelKey === primary) return json({ error: "cannot remove the primary model" }, 400);

  delete models[modelKey];

  const fallbacks = raw.agents?.defaults?.model?.fallbacks;
  if (Array.isArray(fallbacks)) {
    raw.agents.defaults.model.fallbacks = fallbacks.filter((fallback: string) => fallback !== modelKey);
  }

  await applyConfig(JSON.stringify(raw, null, 2), config.hash);
  return json({ ok: true });
}

export async function handleModelsClearFallbacks() {
  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
  const fallbackModels = Array.isArray(raw.agents?.defaults?.model?.fallbacks)
    ? raw.agents.defaults.model.fallbacks.filter((modelKey: string) => Boolean(modelKey))
    : [];

  if (fallbackModels.length === 0) {
    return json({ ok: true, cleared: 0 });
  }

  if (!raw.agents) raw.agents = {};
  if (!raw.agents.defaults) raw.agents.defaults = {};
  if (!raw.agents.defaults.model) raw.agents.defaults.model = {};

  raw.agents.defaults.model.fallbacks = [];

  await applyConfig(JSON.stringify(raw, null, 2), config.hash);
  return json({ ok: true, cleared: fallbackModels.length });
}

export async function handleModelsSetPrimary(req: NextRequest) {
  const body = await parseBody(req);
  const modelKey = requiredString(body.model, "model", 256);

  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
  if (!raw.agents) raw.agents = {};
  if (!raw.agents.defaults) raw.agents.defaults = {};
  if (!raw.agents.defaults.model) raw.agents.defaults.model = {};

  raw.agents.defaults.model.primary = modelKey;
  if (!raw.agents.defaults.models) raw.agents.defaults.models = {};
  if (!raw.agents.defaults.models[modelKey]) raw.agents.defaults.models[modelKey] = {};

  await applyConfig(JSON.stringify(raw, null, 2), config.hash);
  return json({ ok: true });
}
