"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Cpu, FileText, Heart, Puzzle, Server, Settings, Shield } from "lucide-react";
import { toast } from "sonner";

import { authFetch, authHeaders } from "@/components/dashboard/auth";
import { type Agent, type Skill } from "@/components/dashboard/types";
import { AgentChips, buildAgentSections } from "./agent-chips";
import { AvatarImg } from "./avatar-img";
import { FileViewerModal, type ViewingFile } from "./file-viewer-modal";

interface AgentCardProps {
  agent: Agent;
  defaultPrimary: string;
  commonSkills: Set<string>;
  onModelChange: (agentId: string, model: string) => void;
  onConfigChange: () => Promise<void>;
  onRefreshData: () => Promise<void>;
}

export function AgentCard({
  agent,
  defaultPrimary,
  commonSkills,
  onModelChange,
  onConfigChange,
  onRefreshData,
}: AgentCardProps) {
  const uniqueSkills: Skill[] = agent.skills.filter((s) => s.eligible && !commonSkills.has(s.name));
  const [switching, setSwitching] = useState(false);
  const [sandboxSwitching, setSandboxSwitching] = useState(false);
  const [viewingFile, setViewingFile] = useState<ViewingFile | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [showSandboxKanbanModal, setShowSandboxKanbanModal] = useState(false);

  async function openFile(name: string) {
    setLoadingFile(name);
    try {
      const data = await authFetch(`/api/agents/${agent.id}/files/${name}`);
      setViewingFile({ name, content: data.file?.content || "(empty)", path: data.file?.path || "" });
    } catch {
      toast.error(`Failed to load ${name}`);
      setViewingFile({ name, content: "(failed to load)", path: "" });
    } finally {
      setLoadingFile(null);
    }
  }

  async function handleModelSwitch(newModel: string) {
    setSwitching(true);
    try {
      await onModelChange(agent.id, newModel);
    } finally {
      setSwitching(false);
    }
  }

  async function updateSandbox(nextSandboxed: boolean, nextWorkspaceAccess: "none" | "ro" | "rw") {
    setSandboxSwitching(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/sandbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ sandboxed: nextSandboxed, workspaceAccess: nextWorkspaceAccess }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to update sandbox settings");
      await onConfigChange();
      toast.success(nextSandboxed ? `Sandbox enabled for ${agent.id}` : `Sandbox disabled for ${agent.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update sandbox settings");
    } finally {
      setSandboxSwitching(false);
    }
  }

  const sections = buildAgentSections(agent, uniqueSkills.length);

  return (
    <>
      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
        <div className="p-5 flex items-start gap-4">
          {agent.avatarUrl ? (
            <AvatarImg url={agent.avatarUrl} alt={agent.name} />
          ) : (
            <div className="w-14 h-14 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-3xl border border-zinc-200 dark:border-zinc-700/40 shrink-0">
              {agent.emoji}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {agent.emoji && <span className="mr-1.5">{agent.emoji}</span>}
                {agent.name}
              </h2>
              {agent.isDefault && (
                <span className="text-[10px] uppercase tracking-wider bg-zinc-200 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-medium">
                  default
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono mt-1">{agent.id}</div>
          </div>
        </div>

        <div className="px-5 pb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Cpu size={13} className="text-zinc-400 shrink-0" />
            {agent.hasOwnModel ? (
              <select
                value={agent.modelFull}
                onChange={(e) => handleModelSwitch(e.target.value)}
                disabled={switching}
                className="flex-1 min-w-0 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-transparent focus:outline-none cursor-pointer disabled:opacity-50"
              >
                <option value="__default__">Inherit default ({defaultPrimary.split("/").pop()})</option>
                {agent.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">{agent.model}</span>
                <span className="text-[10px] uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 px-1.5 py-0.5 rounded">
                  inherited
                </span>
                <button
                  onClick={() => handleModelSwitch(agent.modelFull)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  Override
                </button>
              </div>
            )}
          </div>
          {agent.fallbacks.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 pl-5">
              <span>Fallbacks:</span>
              {agent.fallbacks.map((f, i) => (
                <span
                  key={i}
                  className="font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded text-[11px]"
                >
                  {f.split("/").slice(-1)[0]}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <Server size={11} className="shrink-0" />
            <span className="font-mono truncate">{agent.workspace}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Puzzle size={11} className="text-zinc-400 shrink-0" />
            <span className="text-zinc-700 dark:text-zinc-300 font-medium capitalize">{agent.toolsProfile || "all"}</span>
            {!agent.toolsProfile && (
              <span className="text-[10px] uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 px-1.5 py-0.5 rounded">
                inherited
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Shield size={11} className="text-zinc-400 shrink-0" />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agent.sandboxed}
                disabled={sandboxSwitching}
                onChange={(e) => updateSandbox(e.target.checked, (agent.workspaceAccess || "rw") as "none" | "ro" | "rw")}
                className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-700"
              />
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">Sandboxed</span>
            </label>
            <select
              value={agent.workspaceAccess || "rw"}
              disabled={!agent.sandboxed || sandboxSwitching}
              onChange={(e) => updateSandbox(true, e.target.value as "none" | "ro" | "rw")}
              className="text-xs bg-transparent text-zinc-600 dark:text-zinc-400 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              <option value="none">none</option>
              <option value="ro">read-only</option>
              <option value="rw">read-write</option>
            </select>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-zinc-950/40 px-3 py-2.5 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <Shield size={11} className="text-zinc-400 shrink-0" />
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">Sandbox Kanban</span>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      agent.sandboxKanban.configured
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
                    }`}
                  >
                    {agent.sandboxKanban.configured ? "configured" : "not set"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
                  For sandboxed agents, inject <span className="font-mono">KANBAN_BASE_URL</span> and{" "}
                  <span className="font-mono">KANBAN_AGENT_TOKEN</span> into sandbox env.
                </p>
              </div>
              <button
                onClick={() => setShowSandboxKanbanModal(true)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
              >
                <Settings size={12} />
                Configure
              </button>
            </div>
            {agent.sandboxKanban.configured ? (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {agent.sandboxKanban.baseUrl && (
                  <span className="rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 font-mono text-zinc-600 dark:text-zinc-300 max-w-full truncate">
                    {agent.sandboxKanban.baseUrl}
                  </span>
                )}
                <span className="rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-zinc-500 dark:text-zinc-400">
                  {agent.sandboxKanban.hasAgentToken ? "token stored" : "no token"}
                </span>
                {!agent.sandboxed && (
                  <span className="rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5">
                    sandbox off
                  </span>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                No per-agent sandbox Kanban config saved.
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Heart size={11} className="text-zinc-400 shrink-0" />
            {agent.heartbeat.active ? (
              <>
                <span className="text-green-600 dark:text-green-400 font-medium">Active</span>
                {agent.heartbeat.every && <span className="text-zinc-400 dark:text-zinc-500 font-mono">{agent.heartbeat.every}</span>}
                <span className="text-zinc-400 dark:text-zinc-500">·</span>
                <select
                  value={agent.heartbeat.model || "__default__"}
                  onChange={async (e) => {
                    const model = e.target.value === "__default__" ? null : e.target.value;
                    try {
                      const res = await fetch(`/api/agents/${agent.id}/heartbeat-model`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...authHeaders() },
                        body: JSON.stringify({ model }),
                      });
                      const data = await res.json();
                      if (!data.ok) throw new Error(data.error || "Failed to update heartbeat model");
                      await onConfigChange();
                      toast.success(model ? `Updated ${agent.id} heartbeat model` : `Reset ${agent.id} heartbeat model`);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to update heartbeat model");
                    }
                  }}
                  className="text-xs bg-transparent text-zinc-600 dark:text-zinc-400 focus:outline-none cursor-pointer"
                >
                  <option value="__default__">default model</option>
                  {agent.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className="text-zinc-400 dark:text-zinc-500">Disabled</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FileText size={11} className="text-zinc-400 shrink-0" />
            {agent.files.map((f) => (
              <button
                key={f.name}
                onClick={() => !f.missing && openFile(f.name)}
                disabled={f.missing || loadingFile === f.name}
                className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                  f.missing
                    ? "border-red-200 dark:border-red-800/40 text-red-400 dark:text-red-500 cursor-default line-through"
                    : loadingFile === f.name
                      ? "border-zinc-300 dark:border-zinc-600 text-zinc-500 animate-pulse"
                      : "border-zinc-200 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                }`}
              >
                {f.name.replace(".md", "")}
              </button>
            ))}
          </div>
        </div>

        <AgentChips agent={agent} uniqueSkills={uniqueSkills} sections={sections} onRefreshData={onRefreshData} />
      </div>

      {viewingFile &&
        createPortal(
          <FileViewerModal
            file={viewingFile}
            onClose={() => setViewingFile(null)}
            editable
            successMessage={`Saved ${viewingFile.name}.`}
            onSave={async (content) => {
              const res = await fetch(`/api/agents/${agent.id}/files/${viewingFile.name}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ content }),
              });
              const d = await res.json();
              if (!d.ok) throw new Error(d.error || "Failed to save");
            }}
          />,
          document.body
        )}

      {showSandboxKanbanModal &&
        createPortal(
          <SandboxKanbanModal
            agent={agent}
            onClose={() => setShowSandboxKanbanModal(false)}
            onSaved={onConfigChange}
          />,
          document.body
        )}
    </>
  );
}

interface SandboxKanbanModalProps {
  agent: Agent;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function SandboxKanbanModal({ agent, onClose, onSaved }: SandboxKanbanModalProps) {
  const [baseUrl, setBaseUrl] = useState(agent.sandboxKanban.baseUrl || "");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/sandbox-kanban`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          baseUrl,
          ...(token.trim() ? { token } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to save sandbox Kanban config");
      await onSaved();
      onClose();
      toast.success(agent.sandboxed ? `Updated ${agent.id} sandbox Kanban config` : `Saved ${agent.id} sandbox Kanban config`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save sandbox Kanban config");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/sandbox-kanban`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ clear: true }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to clear sandbox Kanban config");
      await onSaved();
      onClose();
      toast.success(`Cleared ${agent.id} sandbox Kanban config`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear sandbox Kanban config");
    } finally {
      setClearing(false);
    }
  }

  const saveDisabled = saving || clearing || (!baseUrl.trim() && !token.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-lg m-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Sandbox Kanban</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              For sandboxed agents, inject <span className="font-mono">KANBAN_BASE_URL</span> and{" "}
              <span className="font-mono">KANBAN_AGENT_TOKEN</span> into sandbox env.
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{agent.name}</div>
            <div className="text-xs font-mono text-zinc-400 dark:text-zinc-500">{agent.id}</div>
          </div>
        </div>

        {!agent.sandboxed && (
          <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Sandbox is currently off for this agent. Saving here keeps the config in <span className="font-mono">openclaw.json</span>, but env injection only happens when sandboxing is enabled.
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-1 block">Base URL</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://kanban.example.com"
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
            />
          </div>
          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-1 block">Agent Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={agent.sandboxKanban.hasAgentToken ? "Stored token will stay unless you replace it" : "Paste a token to save"}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
            />
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              {agent.sandboxKanban.hasAgentToken ? "A token is already stored. Leave this blank to keep it." : "No token is currently stored for this agent."}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={handleClear}
            disabled={clearing || saving || !agent.sandboxKanban.configured}
            className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {clearing ? "Clearing..." : "Clear config"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving || clearing}
              className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveDisabled}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
