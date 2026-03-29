/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { authFetch, authHeaders } from "@/components/dashboard/auth";
import { type Model } from "@/components/dashboard/types";

export function ModelsPage({
  configuredModels,
  defaultModel,
  onRefresh,
}: {
  configuredModels: Model[];
  defaultModel: { primary: string | null; fallbacks: string[] };
  onRefresh: () => Promise<void>;
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
  const [addingModelKey, setAddingModelKey] = useState<string | null>(null);
  const [removingModelKey, setRemovingModelKey] = useState<string | null>(null);
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    authFetch("/api/models/catalog")
      .then((d) => setProviders(d.providers || []))
      .catch(() => {});
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
      const res = await fetch("/api/models/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ model: modelKey }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to add model");
      await onRefresh();
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
      const res = await fetch("/api/models/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ model: modelKey }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to remove model");
      await onRefresh();
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
      const res = await fetch("/api/models/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ model: modelKey }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to set primary model");
      await onRefresh();
      toast.success(`Set ${modelKey} as primary`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to set primary model");
    } finally {
      setSettingPrimary(null);
    }
  }

  const configuredKeys = new Set(configuredModels.map((m) => m.id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Configured Models</h2>
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
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Add from Catalog</h2>
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm dark:shadow-none p-5 space-y-4">
          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-2 block">Provider</label>
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
