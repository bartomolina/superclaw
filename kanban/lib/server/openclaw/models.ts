type RawConfig = {
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
      models?: Record<string, { alias?: string } | undefined>;
    };
  };
};

import { readLocalConfig } from "@/lib/server/openclaw/config";

export type ModelOption = {
  id: string;
  label: string;
  isPrimary?: boolean;
};

const MODEL_OPTIONS_TTL_MS = 10_000;

let modelOptionsCache:
  | {
      expiresAt: number;
      value: ModelOption[];
    }
  | null = null;

function normalizeModelKey(value: string | undefined) {
  return value?.trim() || "";
}

function buildModelLabel(modelId: string, alias?: string) {
  const normalizedAlias = alias?.trim();
  if (normalizedAlias) {
    return `${normalizedAlias} — ${modelId}`;
  }

  return modelId;
}

export async function fetchModelOptions(): Promise<ModelOption[]> {
  const now = Date.now();
  if (modelOptionsCache && modelOptionsCache.expiresAt > now) {
    return modelOptionsCache.value;
  }

  const config = readLocalConfig() as RawConfig;
  const configuredModels = config.agents?.defaults?.models ?? {};
  const primaryModel = normalizeModelKey(config.agents?.defaults?.model?.primary);

  const modelKeys = Array.from(
    new Set(
      [primaryModel, ...Object.keys(configuredModels)]
        .map((value) => normalizeModelKey(value))
        .filter(Boolean),
    ),
  );

  const value = modelKeys
    .map((modelId) => ({
      id: modelId,
      label: buildModelLabel(modelId, configuredModels[modelId]?.alias),
      isPrimary: modelId === primaryModel,
    }))
    .sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.label.localeCompare(b.label);
    });

  modelOptionsCache = {
    expiresAt: now + MODEL_OPTIONS_TTL_MS,
    value,
  };

  return value;
}
