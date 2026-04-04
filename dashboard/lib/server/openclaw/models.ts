/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";

import { optionalString, requiredString } from "@/lib/server/validate";
import { applyConfig, getConfigDocument, parseConfigRaw, readLocalConfig } from "@/lib/server/openclaw/config";
import { json, parseBody } from "@/lib/server/openclaw/http";
import { runOpenClawJson } from "@/lib/server/openclaw/cli";

let modelsCache: Record<string, any[]> | null = null;
let modelsCacheTime = 0;
let modelsCacheInFlight: Promise<Record<string, any[]>> | null = null;

const MODELS_CATALOG_TTL_MS = 300_000;

async function loadModelsCatalog() {
  const data = await runOpenClawJson<{ models?: Array<any> }>(["models", "list", "--all", "--json"], {}, { timeoutMs: 60_000 });
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
  const providerMap = config.models?.providers || {};
  const configuredProviders = Object.entries(providerMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([providerId, provider]: [string, any]) => ({
      id: providerId,
      configuredModelCount: Array.isArray(provider?.models) ? provider.models.length : 0,
      authMode: typeof provider?.auth === "string" ? provider.auth : null,
    }));
  const configuredModels = Object.keys(config.agents?.defaults?.models || {}).map((key) => {
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
    configuredModels: configuredModels.length > 0 ? configuredModels : inferAvailableModels(providerMap),
    defaultModel: {
      primary: config.agents?.defaults?.model?.primary ?? null,
      fallbacks: Array.isArray(config.agents?.defaults?.model?.fallbacks) ? config.agents.defaults.model.fallbacks : [],
    },
  });
}

export async function handleModelsCatalogProviders() {
  const catalog = await getModelsCatalog();
  const providers = Object.keys(catalog)
    .sort()
    .map((provider) => ({ id: provider, count: catalog[provider].length }));
  return json({ providers });
}

export async function handleModelsCatalogProvider(providerRaw: string) {
  const provider = decodeURIComponent(providerRaw);
  const catalog = await getModelsCatalog();
  return json({ provider, models: catalog[provider] || [] });
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
