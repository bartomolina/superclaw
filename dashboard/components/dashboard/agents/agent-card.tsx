"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Cpu, Shield } from "lucide-react";
import { toast } from "sonner";

import { authFetch, authHeaders } from "@/components/dashboard/auth";
import { type Agent, type RunRestartOperation, type Skill } from "@/components/dashboard/types";
import { AgentChips, buildAgentSections } from "./agent-chips";
import { AvatarImg } from "./avatar-img";
import { FileViewerModal, type ViewingFile } from "./file-viewer-modal";

interface AgentCardProps {
  agent: Agent;
  defaultPrimary: string;
  commonSkills: Set<string>;
  skillsStable: boolean;
  runRestartOperation: RunRestartOperation;
  onRefreshData: () => Promise<void>;
}

function formatKanbanMissing(items: string[]) {
  return items.map((item) => {
    if (item === "skill:kanban") return "Copy kanban skill into workspace skills";
    if (item === "skill:superclaw") return "Copy superclaw skill into workspace skills";
    if (item === "env:KANBAN_BASE_URL") return "Set KANBAN_BASE_URL in sandbox env";
    if (item === "env:KANBAN_AGENT_TOKEN") return "Set KANBAN_AGENT_TOKEN in sandbox env";
    if (item === "credential:dedicated") return "Provision a dedicated Kanban credential for this agent";
    if (item === "credential:status") return "Unable to verify dedicated Kanban credential status right now";
    return item;
  });
}

function formatWorkspacePath(workspace: string) {
  if (/^\/(?:root|home\/[^/]+|Users\/[^/]+)$/.test(workspace)) {
    return "~";
  }

  const homePrefix = workspace.match(/^\/(?:root|home\/[^/]+|Users\/[^/]+)\//);
  if (homePrefix) {
    return `~/${workspace.slice(homePrefix[0].length)}`;
  }

  return workspace;
}

export function AgentCard({
  agent,
  defaultPrimary,
  commonSkills,
  skillsStable,
  runRestartOperation,
  onRefreshData,
}: AgentCardProps) {
  const uniqueSkills: Skill[] = skillsStable
    ? agent.skills.filter((s) => s.eligible && !commonSkills.has(s.name))
    : agent.skills.filter((s) => s.eligible);
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
      await runRestartOperation(
        {
          title: `Updating ${agent.name} model`,
          message:
            newModel === "__default__"
              ? "Restoring the agent to the default model and waiting for the gateway to come back."
              : "Applying the new model selection and waiting for the gateway to come back.",
          submittingLabel: "Saving model change...",
          restartingLabel: "Waiting for the gateway to restart...",
          refreshingLabel: "Refreshing agents...",
        },
        async () => {
          const res = await fetch(`/api/agents/${agent.id}/model`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ model: newModel }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || `Failed to update ${agent.id} model`);
          return data;
        },
      );
      toast.success(`Updated ${agent.id} model`);
    } catch (error) {
      console.error("Model switch failed:", error);
      toast.error(error instanceof Error ? error.message : `Failed to update ${agent.id} model`);
    } finally {
      setSwitching(false);
    }
  }

  async function updateSandbox(nextSandboxed: boolean, nextWorkspaceAccess: "none" | "ro" | "rw") {
    setSandboxSwitching(true);
    try {
      await runRestartOperation(
        {
          title: nextSandboxed ? `Enabling sandbox for ${agent.name}` : `Disabling sandbox for ${agent.name}`,
          message: "Saving sandbox settings and waiting for the gateway to come back.",
          submittingLabel: "Saving sandbox settings...",
          restartingLabel: "Waiting for the gateway to restart...",
          refreshingLabel: "Refreshing agents...",
        },
        async () => {
          const res = await fetch(`/api/agents/${agent.id}/sandbox`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ sandboxed: nextSandboxed, workspaceAccess: nextWorkspaceAccess }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to update sandbox settings");
          return data;
        },
      );
      toast.success(nextSandboxed ? `Sandbox enabled for ${agent.id}` : `Sandbox disabled for ${agent.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update sandbox settings");
    } finally {
      setSandboxSwitching(false);
    }
  }

  const sections = buildAgentSections(agent, uniqueSkills.length, skillsStable);
  const kanbanMissing = formatKanbanMissing(agent.kanbanReadiness.missing);
  const workspacePath = formatWorkspacePath(agent.workspace);

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
                {workspacePath}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Cpu size={13} className="text-zinc-400 shrink-0" />
              <select
                value={agent.hasOwnModel ? agent.modelFull : "__default__"}
                onChange={(e) => handleModelSwitch(e.target.value)}
                disabled={switching}
                className="w-auto max-w-[14rem] text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-transparent focus:outline-none cursor-pointer disabled:opacity-50"
              >
                <option value="__default__">Inherit default ({defaultPrimary.split("/").pop()})</option>
                {agent.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider})
                  </option>
                ))}
              </select>
              {agent.fallbacks.length > 0 && (
                <span
                  title={agent.fallbacks.map((fallback) => fallback.split("/").slice(-1)[0]).join("\n")}
                  className="text-[10px] uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded whitespace-nowrap cursor-default"
                >
                  +{agent.fallbacks.length}
                </span>
              )}
            </div>

          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Shield size={11} className="text-zinc-400 shrink-0" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agent.sandboxed}
                  disabled={sandboxSwitching}
                  onChange={(e) => updateSandbox(e.target.checked, (agent.workspaceAccess || "rw") as "none" | "ro" | "rw")}
                  className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-700"
                />
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">Sandbox</span>
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
              {(agent.kanbanReadiness.applicable || (agent.sandboxed && agent.kanbanState !== "ready")) && (
                <span
                  title={
                    agent.kanbanState === "loading"
                      ? "Checking sandbox Kanban readiness…"
                      : agent.kanbanState === "error"
                        ? "Kanban readiness unavailable right now."
                        : agent.kanbanReadiness.ready
                      ? "Sandbox workspace has kanban + superclaw skills copied, required Kanban env vars configured, and a dedicated Kanban credential for this agent."
                      : kanbanMissing.join("\n")
                  }
                  className={`inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[9px] font-medium tracking-normal whitespace-nowrap ${
                    agent.kanbanState === "loading"
                      ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      : agent.kanbanState === "error"
                        ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      : agent.kanbanReadiness.ready
                      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  }`}
                >
                  <span>Kanban</span>
                  {agent.kanbanState === "loading" ? "…" : agent.kanbanState === "error" ? "?" : agent.kanbanReadiness.ready ? <Check size={10} /> : <AlertTriangle size={10} />}
                </span>
              )}
            </div>

          </div>
        </div>

        <AgentChips
          agent={agent}
          uniqueSkills={uniqueSkills}
          sections={sections}
          onRefreshData={onRefreshData}
          onOpenFile={openFile}
          loadingFile={loadingFile}
        />
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
