"use client";

import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type AgentOption = {
  id: string;
  name: string;
};

type InboxTask = {
  cardId: string;
  title: string;
  columnName: string;
  lastCommentAt: number | null;
  lastCommentByLabel: string | null;
  lastCommentBy: string | null;
  lastCommentByType: "agent" | "human" | "system" | null;
};

type InboxBoard = {
  boardId: string;
  boardName: string;
  boardDescription?: string;
  ideas: InboxTask[];
  todos: InboxTask[];
  review: InboxTask[];
  totalCount: number;
};

type InboxData = {
  agentId: string;
  boards: InboxBoard[];
  totalCount: number;
};

function formatLast(item: InboxTask) {
  const who = item.lastCommentByLabel ?? item.lastCommentBy ?? item.lastCommentByType ?? "none";
  if (!item.lastCommentAt) return `last: ${who}`;

  const when = new Date(item.lastCommentAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `last: ${who} · ${when}`;
}

function TaskList({ items }: { items: InboxTask[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.cardId} className="rounded-md px-2 py-1.5 text-sm text-zinc-700 dark:text-zinc-200">
          <div>{item.title}</div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{formatLast(item)}</div>
        </li>
      ))}
    </ul>
  );
}

function Section({ label, items }: { label: string; items: InboxTask[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label} ({items.length})
      </div>
      <TaskList items={items} />
    </section>
  );
}

export function InboxDebugSheet({
  open,
  boardId,
  initialAgentId,
  onClose,
}: {
  open: boolean;
  boardId?: string | null;
  initialAgentId?: string | null;
  onClose: () => void;
}) {
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const selectedAgentId = initialAgentId ?? "main";
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadAgents() {
      try {
        const query = boardId ? `?boardId=${encodeURIComponent(boardId)}` : "";
        const response = await fetch(`/api/agents${query}`, { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as { agents?: AgentOption[] };
        if (cancelled) return;

        const normalized = (data.agents ?? [])
          .map((agent) => ({ id: String(agent.id), name: String(agent.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setAgentOptions(normalized);
      } catch {
        // Ignore failures in debug UI.
      }
    }

    void loadAgents();

    return () => {
      cancelled = true;
    };
  }, [boardId, open]);

  const inbox = useQuery(
    api.agent_automation.debugAgentInbox,
    open && selectedAgentId
      ? { agentId: selectedAgentId, ...(boardId ? { boardId: boardId as Id<"boards"> } : {}) }
      : "skip",
  ) as InboxData | undefined;

  const prettyJson = useMemo(() => JSON.stringify(inbox ?? null, null, 2), [inbox]);
  const selectedAgentName =
    agentOptions.find((agent) => agent.id === selectedAgentId)?.name ?? selectedAgentId;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/20" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Agent tasks</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{selectedAgentName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setShowRaw((current) => !current)}
            className="text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            {showRaw ? "Hide raw" : "Raw"}
          </button>

          <div className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
            {inbox ? `${inbox.totalCount} item${inbox.totalCount === 1 ? "" : "s"}` : "Loading..."}
          </div>
        </div>

        {showRaw ? (
          <pre className="mb-4 whitespace-pre-wrap break-all rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {prettyJson}
          </pre>
        ) : null}

        {inbox === undefined ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>
        ) : inbox.boards.length === 0 ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">No actionable items.</div>
        ) : (
          <div className="space-y-5">
            {inbox.boards.map((board) => (
              <section key={board.boardId} className="space-y-3 border-t border-zinc-200 pt-4 first:border-t-0 first:pt-0 dark:border-zinc-800">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{board.boardName}</div>
                  {board.boardDescription ? (
                    <div className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {board.boardDescription}
                    </div>
                  ) : null}
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{board.totalCount} item{board.totalCount === 1 ? "" : "s"}</div>
                </div>

                <Section label="Ideas" items={board.ideas} />
                <Section label="TODO" items={board.todos} />
                <Section label="Review" items={board.review} />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
