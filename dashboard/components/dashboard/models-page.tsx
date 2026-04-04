/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { authFetch, authHeaders } from "@/components/dashboard/auth";
import { type Model, type ProviderSummary, type RunRestartOperation } from "@/components/dashboard/types";

export function ModelsPage({
  configuredProviders,
  configuredModels,
  defaultModel,
  runRestartOperation,
}: {
  configuredProviders: ProviderSummary[];
  configuredModels: Model[];
  defaultModel: { primary: string | null; fallbacks: string[] };
  runRestartOperation: RunRestartOperation;
}) {
  const primaryModel = defaultModel.primary || "—";
  const fallbacks = defaultModel.fallbacks || [];
  const primaryModelIndex = configuredModels.findIndex((model) => model.id === primaryModel);
  const orderedConfiguredModels =
    primaryModelIndex <= 0
      ? configuredModels
      : [
          configuredModels[primaryModelIndex],
          ...configuredModels.slice(0, primaryModelIndex),
          ...configuredModels.slice(primaryModelIndex + 1),
        ];

  const [providers, setProviders] = useState<{ id: string; count: number }[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providersError, setProvidersError] = useState(false);
  const [addingModelKey, setAddingModelKey] = useState<string | null>(null);
  const [removingModelKey, setRemovingModelKey] = useState<string | null>(null);
  const [removingFallbacks, setRemovingFallbacks] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoadingProviders(true);
    setProvidersError(false);
    authFetch("/api/models/catalog")
      .then((d) => setProviders(d.providers || []))
      .catch(() => {
        setProviders([]);
        setProvidersError(true);
      })
      .finally(() => setLoadingProviders(false));
  }, []);

  async function loadProviderModels(provider: string) {
    setSelectedProvider(provider);
    setSearch("");
    setLoadingCatalog(true);
    try {
      const data = await authFetch(`/api/models/catalog/${provider}`);
      setProviderModels(data.models || []);
    } catch {
      setProviderModels([]);
      toast.error(`Failed to load ${provider} models`);
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function handleAdd(modelKey: string) {
    if (addingModelKey) return;

    setAddingModelKey(modelKey);
    try {
      await runRestartOperation(
        {
          title: `Adding ${modelKey}`,
          message: "Updating configured models and waiting for the gateway to come back.",
          submittingLabel: "Adding model...",
          restartingLabel: "Waiting for the gateway to restart...",
          refreshingLabel: "Refreshing models...",
        },
        async () => {
          const res = await fetch("/api/models/add", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ model: modelKey }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to add model");
          return data;
        },
      );
      toast.success(`Added ${modelKey}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add model");
    } finally {
      setAddingModelKey(null);
    }
  }

  async function handleRemove(modelKey: string) {
    if (removingModelKey) return;

    setRemovingModelKey(modelKey);
    try {
      await runRestartOperation(
        {
          title: `Removing ${modelKey}`,
          message: "Updating configured models and waiting for the gateway to come back.",
          submittingLabel: "Removing model...",
          restartingLabel: "Waiting for the gateway to restart...",
          refreshingLabel: "Refreshing models...",
        },
        async () => {
          const res = await fetch("/api/models/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ model: modelKey }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to remove model");
          return data;
        },
      );
      toast.success(`Removed ${modelKey}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove model");
    } finally {
      setRemovingModelKey(null);
    }
  }

  async function handleSetPrimary(modelKey: string) {
    setSettingPrimary(modelKey);
    try {
      await runRestartOperation(
        {
          title: "Setting primary model",
          message: `Promoting ${modelKey} to the default primary model and waiting for the gateway to come back.`,
          submittingLabel: "Saving primary model...",
          restartingLabel: "Waiting for the gateway to restart...",
          refreshingLabel: "Refreshing models...",
        },
        async () => {
          const res = await fetch("/api/models/set-primary", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ model: modelKey }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to set primary model");
          return data;
        },
      );
      toast.success(`Set ${modelKey} as primary`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to set primary model");
    } finally {
      setSettingPrimary(null);
    }
  }

  async function handleClearFallbacks() {
    if (removingFallbacks || fallbacks.length === 0) return;

    setRemovingFallbacks(true);
    try {
      const data = await runRestartOperation(
        {
          title: "Clearing fallback models",
          message: "Removing fallback status from the default model configuration and waiting for the gateway to come back.",
          submittingLabel: "Clearing fallbacks...",
          restartingLabel: "Waiting for the gateway to restart...",
          refreshingLabel: "Refreshing models...",
        },
        async () => {
          const res = await fetch("/api/models/clear-fallbacks", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
          });
          const next = await res.json();
          if (!next.ok) throw new Error(next.error || "Failed to clear fallback models");
          return next;
        },
      );
      toast.success(data.cleared > 0 ? `Cleared fallback status from ${data.cleared} model${data.cleared === 1 ? "" : "s"}` : "No fallback models to clear");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear fallback models");
    } finally {
      setRemovingFallbacks(false);
    }
  }

  const configuredKeys = new Set(configuredModels.map((m) => m.id));

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Configured Models</h2>
          <button
            onClick={handleClearFallbacks}
            disabled={fallbacks.length === 0 || removingFallbacks}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {removingFallbacks ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {removingFallbacks ? "Clearing..." : `Clear fallbacks${fallbacks.length > 0 ? ` (${fallbacks.length})` : ""}`}
          </button>
        </div>
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
          {configuredModels.length === 0 ? (
            <div className="p-5 text-sm text-zinc-400 dark:text-zinc-500">No models configured</div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {orderedConfiguredModels.map((m) => {
                const isPrimary = m.id === primaryModel;
                const fallbackIndex = fallbacks.indexOf(m.id);
                const isFallback = fallbackIndex !== -1;
                return (
                  <div key={m.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{m.name}</span>
                        {isPrimary && <span className="text-[10px] uppercase tracking-wider bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">primary</span>}
                        {isFallback && <span className="text-[10px] uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">fallback #{fallbackIndex + 1}</span>}
                      </div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">{m.id}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isPrimary && (
                        <>
                          <button onClick={() => handleSetPrimary(m.id)} disabled={settingPrimary === m.id} className="text-xs px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                            {settingPrimary === m.id ? "Setting..." : "Set primary"}
                          </button>
                          <button onClick={() => handleRemove(m.id)} disabled={removingModelKey === m.id} className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50" title={removingModelKey === m.id ? "Removing..." : "Remove"}>
                            {removingModelKey === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Providers</h2>
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
          {configuredProviders.length === 0 ? (
            <div className="p-5 text-sm text-zinc-400 dark:text-zinc-500">No providers detected from the current model/auth config.</div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {configuredProviders.map((provider) => (
                <div key={provider.id} className="px-5 py-4">
                  <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{provider.id}</div>
                  {provider.models.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {provider.models.map((model) => (
                        <div key={`${provider.id}-${model}`} className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                          {model}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">No models listed</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Add from Catalog</h2>
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm dark:shadow-none p-5 space-y-4">
          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-2 block">Provider</label>
            {loadingProviders ? (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">Loading provider catalog…</div>
            ) : providersError ? (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">Provider catalog unavailable right now.</div>
            ) : providers.length === 0 ? (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">No catalog providers returned.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => loadProviderModels(p.id)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      selectedProvider === p.id
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
                        : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {p.id} ({p.count})
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedProvider && (
            <div>
              <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-2 block">
                {selectedProvider} models {loadingCatalog && "(loading...)"}
              </label>
              {!loadingCatalog && (
                <>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search models..."
                    className="w-full mb-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
                  />
                  <div className="max-h-80 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {providerModels
                      .filter((m) => {
                        if (!search.trim()) return true;
                        const q = search.toLowerCase();
                        return m.name.toLowerCase().includes(q) || m.key.toLowerCase().includes(q);
                      })
                      .map((m) => {
                        const alreadyAdded = configuredKeys.has(m.key);
                        return (
                          <div key={m.key} className="flex items-center justify-between px-4 py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-zinc-700 dark:text-zinc-300">{m.name}</div>
                              <div className="text-[11px] text-zinc-400 font-mono">
                                {m.key} · {m.input} · {Math.round(m.contextWindow / 1024)}k ctx
                              </div>
                            </div>
                            <button
                              onClick={() => handleAdd(m.key)}
                              disabled={alreadyAdded || addingModelKey !== null}
                              className={`text-xs px-2.5 py-1 rounded-md shrink-0 transition-colors ${
                                alreadyAdded
                                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-default"
                                  : "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                              }`}
                            >
                              {alreadyAdded ? "Added" : addingModelKey === m.key ? "Adding..." : "Add"}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
