"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Heart, HeartCrack, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { authHeaders } from "@/components/dashboard/auth";
import { StateMessage } from "@/components/dashboard/state-message";
import { type Agent } from "@/components/dashboard/types";
import { AgentCard } from "./agent-card";
import { CreateAgentForm, ConfigModal, DeleteAgentModal } from "./agent-modals";

interface AgentsPageProps {
  agents: Agent[];
  defaultPrimary: string;
  onModelChange: (agentId: string, model: string) => void;
  onRefresh: () => Promise<void>;
  onRefreshQuick: () => Promise<void>;
}

export function AgentsPage({ agents, defaultPrimary, onModelChange, onRefresh, onRefreshQuick }: AgentsPageProps) {
  const commonSkills = (() => {
    if (agents.length === 0) return new Set<string>();
    const eligiblePerAgent = agents.map((a) => new Set(a.skills.filter((s) => s.eligible).map((s) => s.name)));
    const common = new Set<string>();
    for (const name of eligiblePerAgent[0]) {
      if (eligiblePerAgent.every((s) => s.has(name))) common.add(name);
    }
    return common;
  })();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirmAgentId, setDeleteConfirmAgentId] = useState<string | null>(null);
  const deleteConfirmAgent = deleteConfirmAgentId ? agents.find((a) => a.id === deleteConfirmAgentId) || null : null;

  async function handleDelete(agentId: string, deleteWorkspace: boolean) {
    try {
      const res = await fetch(`/api/agents/${agentId}${deleteWorkspace ? "?deleteWorkspace=true" : ""}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to delete agent");
      setDeleteConfirmAgentId(null);
      await onRefresh();
      toast.success(deleteWorkspace ? `Deleted ${agentId} and its workspace` : `Deleted ${agentId}`);
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error(e instanceof Error ? e.message : "Failed to delete agent");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Agents</h1>
        <div className="flex items-center gap-2">
          <ConfigModal onRefresh={onRefresh} />
          <button
            onClick={() => setShowCreate((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            <Plus size={14} />
            Add Agent
          </button>
        </div>
      </div>

      <CreateAgentForm onRefresh={onRefresh} open={showCreate} onClose={() => setShowCreate(false)} />

      {agents.length === 0 ? (
        <StateMessage>No agents configured</StateMessage>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="relative">
              <AgentCard
                agent={agent}
                defaultPrimary={defaultPrimary}
                commonSkills={commonSkills}
                onModelChange={onModelChange}
                onConfigChange={onRefresh}
                onRefreshData={onRefreshQuick}
              />
              <div className="absolute top-4 right-4 flex items-center gap-0.5">
                <span
                  className={`p-1 rounded-md ${
                    agent.heartbeat.active
                      ? "text-red-500"
                      : "text-zinc-300 dark:text-zinc-600"
                  }`}
                  title={agent.heartbeat.active ? "Heartbeat enabled" : "Heartbeat disabled"}
                >
                  {agent.heartbeat.active ? <Heart size={14} className="fill-current" /> : <HeartCrack size={14} />}
                </span>
                {!agent.isDefault && (
                  <button
                    onClick={() => setDeleteConfirmAgentId(agent.id)}
                    className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
                    title="Delete agent"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteConfirmAgent &&
        createPortal(
          <DeleteAgentModal
            agent={deleteConfirmAgent}
            onClose={() => setDeleteConfirmAgentId(null)}
            onDelete={handleDelete}
          />,
          document.body
        )}
    </div>
  );
}

export { AgentCard } from "./agent-card";
export { AgentChips } from "./agent-chips";
export { AvatarImg } from "./avatar-img";
export { FileViewerModal } from "./file-viewer-modal";
export { CreateAgentForm, ConfigModal, DeleteAgentModal } from "./agent-modals";
