"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Settings } from "lucide-react";
import { toast } from "sonner";

import { authFetch, authHeaders } from "@/components/dashboard/auth";
import { type Agent, type RunRestartOperation } from "@/components/dashboard/types";
import { FileViewerModal } from "./file-viewer-modal";

interface CreateAgentFormProps {
  runRestartOperation: RunRestartOperation;
  open: boolean;
  onClose: () => void;
}

export function CreateAgentForm({ runRestartOperation, open, onClose }: CreateAgentFormProps) {
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🤖");
  const [newTelegramToken, setNewTelegramToken] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  function resetForm() {
    setNewId("");
    setNewName("");
    setNewEmoji("🤖");
    setNewTelegramToken("");
    setNewDescription("");
  }

  async function handleCreate() {
    if (!newId.trim()) return;
    const agentId = newId.trim();
    setCreating(true);
    try {
      await runRestartOperation(
        {
          title: `Creating ${agentId}`,
          message: "Setting up the agent and waiting for the gateway to come back.",
          submittingLabel: "Creating agent...",
          restartingLabel: "Waiting for the gateway to restart...",
          refreshingLabel: "Refreshing agents...",
        },
        async () => {
          const res = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
              id: agentId,
              name: newName.trim() || agentId,
              emoji: newEmoji,
              telegramToken: newTelegramToken.trim() || undefined,
              description: newDescription.trim() || undefined,
            }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Failed to create agent");
          return data;
        },
      );
      resetForm();
      onClose();
      toast.success(`Created ${agentId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 shadow-sm dark:shadow-none">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">New Agent</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-1 block">ID</label>
          <input
            type="text"
            value={newId}
            onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="my-agent"
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
          />
        </div>
        <div>
          <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-1 block">Name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="My Agent"
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
          />
        </div>
        <div>
          <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-1 block">Emoji</label>
          <input
            type="text"
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-1 block">
          Avatar Description <span className="normal-case text-zinc-400/60">(optional — generates avatar image)</span>
        </label>
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="a creative game developer — young energetic guy with headphones, retro arcade machines behind"
          rows={2}
          className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 resize-none"
        />
      </div>
      <div className="mt-3">
        <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-1 block">
          Telegram Bot Token <span className="normal-case text-zinc-400/60">(optional)</span>
        </label>
        <input
          type="text"
          value={newTelegramToken}
          onChange={(e) => setNewTelegramToken(e.target.value)}
          placeholder="123456:ABC-DEF..."
          className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
        />
      </div>
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleCreate}
          disabled={creating || !newId.trim()}
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create"}
        </button>
        <button
          onClick={() => {
            resetForm();
            onClose();
          }}
          className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ConfigModal() {
  const [showConfig, setShowConfig] = useState(false);
  const [configRaw, setConfigRaw] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(false);

  async function openConfig() {
    setShowConfig(true);
    setLoadingConfig(true);
    setConfigRaw("Loading config...");

    try {
      const data = await authFetch("/api/config");
      setConfigRaw(data.raw || "{}");
    } catch {
      setConfigRaw("Failed to load config.");
      toast.error("Failed to load config");
    } finally {
      setLoadingConfig(false);
    }
  }

  return (
    <>
      <button
        onClick={openConfig}
        disabled={loadingConfig && showConfig}
        className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-60"
        title="View config (read-only)"
      >
        <Settings size={16} />
      </button>

      {showConfig &&
        createPortal(
          <FileViewerModal
            file={{ name: "openclaw.json", content: configRaw, path: "~/.openclaw/openclaw.json" }}
            onClose={() => setShowConfig(false)}
          />,
          document.body
        )}
    </>
  );
}

interface DeleteAgentModalProps {
  agent: Agent | null;
  onClose: () => void;
  onDelete: (agentId: string, deleteWorkspace: boolean) => Promise<void>;
}

export function DeleteAgentModal({ agent, onClose, onDelete }: DeleteAgentModalProps) {
  const [deleteWorkspace, setDeleteWorkspace] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteClick() {
    if (!agent || deleting) return;
    setDeleting(true);
    try {
      await onDelete(agent.id, deleteWorkspace);
    } finally {
      setDeleting(false);
    }
  }

  if (!agent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md m-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
          Delete agent &quot;{agent.name}&quot;?
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          This will remove the agent from your configuration, along with its sessions and internal state.
        </p>
        <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteWorkspace}
            disabled={deleting}
            onChange={(e) => setDeleteWorkspace(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Also delete workspace and session history</span>
        </label>
        {deleteWorkspace && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 mb-4">
            <p className="text-xs text-red-600 dark:text-red-400">
              This will permanently delete the workspace <span className="font-mono">({agent.workspace})</span> and all
              session history. This cannot be undone.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteClick}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "Deleting..." : deleteWorkspace ? "Delete agent & workspace" : "Delete agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
