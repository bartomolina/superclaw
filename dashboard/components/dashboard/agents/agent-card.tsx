"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Cpu, FileText, Heart, Shield } from "lucide-react";
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
        <div className="p-4 space-y-3.5">
          <div className="flex items-center gap-3">
            {agent.avatarUrl ? (
              <AvatarImg url={agent.avatarUrl} alt={agent.name} />
            ) : (
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-2xl border border-zinc-200 dark:border-zinc-700/40 shrink-0">
                {agent.emoji}
              </div>
            )}

            <div className="min-w-0 flex-1 pr-8 py-0.5">
              <div className="flex flex-wrap items-center gap-1.5 leading-tight">
                <h2 className="text-base font-semibold leading-tight text-zinc-900 dark:text-zinc-100 truncate">
                  {agent.emoji && <span className="mr-1.5">{agent.emoji}</span>}
                  {agent.name}
                </h2>
                {agent.isDefault && (
                  <span className="text-[10px] uppercase tracking-wider bg-zinc-200 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-medium">
                    default
                  </span>
                )}
              </div>

              <div className="mt-0.5 text-xs leading-tight text-zinc-400 dark:text-zinc-500 font-mono">
                {agent.id}
              </div>
              <div className="mt-0.5 text-xs leading-tight text-zinc-400 dark:text-zinc-500 font-mono truncate">
                {agent.workspace}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Cpu size={13} className="text-zinc-400 shrink-0" />
              <select
                value={agent.hasOwnModel ? agent.modelFull : "__default__"}
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
              {!agent.hasOwnModel && (
                <span className="text-[10px] uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 px-1.5 py-0.5 rounded whitespace-nowrap">
                  inherited
                </span>
              )}
            </div>

            {agent.fallbacks.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 pl-5">
                <span>Fallbacks:</span>
                {agent.fallbacks.map((fallback, i) => (
                  <span
                    key={i}
                    className="font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded"
                  >
                    {fallback.split("/").slice(-1)[0]}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
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

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-zinc-950/40 px-3 py-2 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
              Kanban worker env is global now: <span className="font-mono">KANBAN_BASE_URL</span> and <span className="font-mono">KANBAN_AGENT_TOKEN</span> come from the OpenClaw runtime.
              {agent.sandboxed && (
                <span>
                  {" "}
                  Mirror them into <span className="font-mono">agents.defaults.sandbox.docker.env</span> if this agent needs them inside the sandbox.
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <FileText size={11} className="text-zinc-400 shrink-0" />
              {agent.files.map((file) => (
                <button
                  key={file.name}
                  onClick={() => !file.missing && openFile(file.name)}
                  disabled={file.missing || loadingFile === file.name}
                  className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                    file.missing
                      ? "border-red-200 dark:border-red-800/40 text-red-400 dark:text-red-500 cursor-default line-through"
                      : loadingFile === file.name
                        ? "border-zinc-300 dark:border-zinc-600 text-zinc-500 animate-pulse"
                        : "border-zinc-200 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                  }`}
                >
                  {file.name.replace(".md", "")}
                </button>
              ))}
            </div>
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
    </>
  );
}
