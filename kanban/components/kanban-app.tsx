"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConvexAuth, useMutation, useQueries, useQuery } from "convex/react";
import { Archive, Chrome, Clock3, ExternalLink, Eye, EyeOff, Hash, Menu, Moon, Play, Search, Send, Sun, UserRound, Users, X } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ActivitySheet } from "@/components/activity-sheet";
import { ArchiveSheet } from "@/components/archive-sheet";
import { ExtensionAccessSheet } from "@/components/extension-access-sheet";
import { InboxDebugSheet } from "@/components/inbox-debug-sheet";
import { UserManagementSheet } from "@/components/user-management-sheet";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildSessionChatUrl,
  cardMatchesSearch,
  describeCardRunState,
  formatColumnName,
  getColumnTone,
  getRunTone,
  maskEmail,
  normalizeColumnName,
  summarize,
} from "@/lib/kanban/card-formatting";

type BoardModel = {
  _id: Id<"boards">;
  _creationTime: number;
  ownerId?: string;
  isOwner?: boolean;
  name: string;
  description?: string;
  url?: string;
  sharedUserIds?: Id<"managedUsers">[];
  allowedAgentIds?: string[];
  createdAt: number;
  updatedAt: number;
  order: number;
};

type ManagedUserModel = {
  _id: Id<"managedUsers">;
  _creationTime: number;
  name: string;
  email: string;
  createdAt: number;
  updatedAt: number;
  order: number;
};

type CardModel = {
  _id: Id<"cards">;
  _creationTime: number;
  boardId: Id<"boards">;
  columnId: Id<"columns">;
  title: string;
  description?: string;
  extensionContext?: string;
  source?: string;
  agentId?: string;
  reviewerId?: string;
  priority?: string;
  size?: string;
  type?: string;
  acp?: string;
  model?: string;
  skills?: string[];
  isRunning?: boolean;
  lastSessionId?: string;
  lastSessionAgentId?: string;
  lastSessionUpdatedAt?: number;
  lastRunStatus?: "running" | "done" | "failed" | "aborted";
  order: number;
};

type CardMetaTag = {
  key: string;
  label: string;
  className: string;
  title?: string;
  icon?: ReactNode;
  iconOnly?: boolean;
  plainIcon?: boolean;
};

type CommentModel = {
  _id: Id<"comments">;
  _creationTime: number;
  boardId: Id<"boards">;
  cardId: Id<"cards">;
  body: string;
  createdAt: number;
  authorType: "agent" | "human" | "system";
  authorId?: string;
  authorEmail?: string;
  authorLabel?: string;
};

type ActivityEventModel = {
  _id: Id<"activityEvents">;
  _creationTime: number;
  boardId: Id<"boards">;
  cardId?: Id<"cards">;
  actorType: "agent" | "human" | "system";
  actorId?: string;
  eventType: string;
  message: string;
  details?: string;
  createdAt: number;
};

type ColumnModel = {
  _id: Id<"columns">;
  _creationTime: number;
  boardId: Id<"boards">;
  name: string;
  order: number;
  cards: CardModel[];
};

type BoardView = {
  board: BoardModel;
  columns: ColumnModel[];
} | null;

type AgentOption = {
  id: string;
  name: string;
  emoji?: string;
  avatarUrl?: string | null;
};

type SkillOption = {
  name: string;
  eligible?: boolean;
};

type ModelOption = {
  id: string;
  label: string;
  isPrimary?: boolean;
};

type AcpOption = {
  id: string;
  label: string;
  isDefault?: boolean;
};

async function getSkillsLoadError(response: Response | null) {
  if (!response) {
    return "Failed to load skills, network error.";
  }

  let apiError = "";
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data?.error === "string") {
      apiError = data.error.trim();
    }
  } catch {
    // Ignore JSON parse failures and fall back to status-based text.
  }

  if (apiError) {
    if (response.status === 401) {
      return `Failed to load skills, ${apiError}. Try signing in again.`;
    }
    return `Failed to load skills, ${apiError}.`;
  }

  if (response.status === 401) {
    return "Failed to load skills, unauthorized. Try signing in again.";
  }

  return `Failed to load skills (${response.status}).`;
}

type ChoiceOption = string | { value: string; label: string; title?: string };

const cardTypeOptions: ChoiceOption[] = [
  { value: "feature", label: "🧩", title: "Feature" },
  { value: "bug", label: "🐞", title: "Bug" },
  { value: "cosmetic", label: "🎨", title: "Cosmetic change" },
];

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[16px] text-zinc-900 outline-none placeholder:text-zinc-400 transition focus:ring-2 focus:ring-zinc-300 sm:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder:text-zinc-600 dark:focus:ring-zinc-700";
const textareaClass = `${inputClass} min-h-32 resize-y`;
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";


function resolveAgentName(agentId?: string) {
  const normalizedId = agentId?.trim();
  if (normalizedId) return normalizedId;
  return "Unassigned";
}

function resolveAgentAvatarUrl(agentId?: string) {
  const normalizedId = agentId?.trim();
  if (!normalizedId) return null;
  return `/api/agents/${encodeURIComponent(normalizedId)}/avatar`;
}

function filterBoardAgentOptions(options: AgentOption[], allowedAgentIds?: string[]) {
  const normalizedAllowedAgentIds = Array.from(
    new Set((allowedAgentIds ?? []).map((agentId) => agentId.trim()).filter(Boolean)),
  );

  if (normalizedAllowedAgentIds.length === 0) {
    return options;
  }

  return options.filter((agent) => normalizedAllowedAgentIds.includes(agent.id.trim()));
}

function AgentAvatar({
  agentName,
  avatarUrl,
  emoji,
  fallbackIcon,
  size = "md",
}: {
  agentName: string;
  avatarUrl?: string | null;
  emoji?: string;
  fallbackIcon?: "user";
  size?: "sm" | "md" | "lg";
}) {
  const [loadedAvatar, setLoadedAvatar] = useState<{ url: string; src: string } | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    if (!avatarUrl) return;

    fetch(avatarUrl)
      .then((response) => {
        if (!response.ok) throw new Error("avatar fetch failed");
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setLoadedAvatar({ url: avatarUrl, src: objectUrl });
      })
      .catch(() => {
        setLoadedAvatar(null);
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatarUrl]);

  const fallback = emoji?.trim() || agentName.trim().charAt(0).toUpperCase() || "?";
  const imageSrc = avatarUrl && loadedAvatar?.url === avatarUrl ? loadedAvatar.src : null;
  const dimension = size === "sm" ? 24 : size === "lg" ? 40 : 32;
  const sizeClass =
    size === "sm"
      ? "h-6 w-6 text-[11px]"
      : size === "lg"
        ? "h-10 w-10 text-base"
        : "h-8 w-8 text-xs";

  if (imageSrc) {
    return (
      <Image
        src={imageSrc}
        alt={agentName}
        width={dimension}
        height={dimension}
        unoptimized
        className={`${sizeClass} shrink-0 rounded-xl border border-zinc-200 object-cover dark:border-zinc-700`}
      />
    );
  }

  const iconSizeClass = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div
      className={`inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300`}
    >
      {fallbackIcon === "user" ? <UserRound className={iconSizeClass} aria-hidden="true" /> : fallback}
    </div>
  );
}

function AgentSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: AgentOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedAgent = options.find((agent) => agent.id === value);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-2">
        {selectedAgent ? (
          <AgentAvatar
            agentName={selectedAgent.name}
            avatarUrl={selectedAgent.avatarUrl ?? null}
            emoji={selectedAgent.emoji}
          />
        ) : null}

        <button
          type="button"
          className={`${inputClass} flex h-9 min-w-0 flex-1 items-center justify-between gap-2`}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate">{selectedAgent?.name ?? "Unassigned"}</span>
          <span className="text-xs text-zinc-500">▾</span>
        </button>
      </div>

      {open ? (
        <div className="hide-scrollbar absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
              value ? "text-zinc-600 dark:text-zinc-300" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span className="h-8 w-8 shrink-0" aria-hidden="true" />
            <span>Unassigned</span>
          </button>

          {options.map((agent) => {
            const isSelected = value === agent.id;

            return (
              <button
                key={agent.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  isSelected
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-200"
                }`}
                onClick={() => {
                  onChange(agent.id);
                  setOpen(false);
                }}
              >
                <AgentAvatar
                  agentName={agent.name}
                  avatarUrl={agent.avatarUrl ?? null}
                  emoji={agent.emoji}
                />
                <span className="truncate">{agent.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ModelSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ModelOption[];
  onChange: (value: string) => void;
}) {
  const normalizedOptions = useMemo(
    () =>
      Array.from(new Map(options.map((option) => [option.id, option] as const)).values()).sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return a.label.localeCompare(b.label);
      }),
    [options],
  );

  return (
    <select className={`${inputClass} h-9`} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Default model</option>
      {normalizedOptions.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
          {option.isPrimary ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}

function ChoiceChips({
  value,
  options,
  onChange,
  emptyLabel,
}: {
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  emptyLabel?: string;
}) {
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  );
  const renderedOptions = emptyLabel
    ? [{ label: emptyLabel, value: "" }, ...normalizedOptions]
    : normalizedOptions;

  return (
    <div className="flex flex-wrap gap-1.5">
      {renderedOptions.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={`${option.label}-${option.value || "empty"}`}
            type="button"
            title={option.title}
            aria-label={option.title ?? option.label}
            onClick={() => onChange(selected ? "" : option.value)}
            className={`inline-flex h-8 min-w-10 items-center justify-center rounded-full border px-2.5 text-xs font-medium transition-all ${
              selected
                ? "border-zinc-900 bg-zinc-900 text-white shadow-sm dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function cloneColumns(columns: ColumnModel[]) {
  return columns.map((column) => ({
    ...column,
    cards: [...column.cards],
  }));
}

function columnsSignature(columns: ColumnModel[]) {
  return columns
    .map((column) => `${column._id}:${column.cards.map((card) => card._id).join(",")}`)
    .join("|");
}

function renderCommentText(text: string, keyPrefix: string) {
  const inlineCodePattern = /`([^`]+)`/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineCodePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Fragment key={`${keyPrefix}-text-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>,
      );
    }

    parts.push(
      <code
        key={`${keyPrefix}-code-${match.index}`}
        className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[12px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {match[1]}
      </code>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <Fragment key={`${keyPrefix}-text-${lastIndex}`}>
        {text.slice(lastIndex)}
      </Fragment>,
    );
  }

  return parts.length > 0 ? parts : text;
}

function renderCommentBody(body: string) {
  const blockCodePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  const sections: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockCodePattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      const text = body.slice(lastIndex, match.index);
      if (text) {
        sections.push(
          <p
            key={`comment-text-${lastIndex}`}
            className="whitespace-pre-wrap text-[13px] leading-5 text-zinc-700 dark:text-zinc-200"
          >
            {renderCommentText(text, `comment-text-${lastIndex}`)}
          </p>,
        );
      }
    }

    const language = match[1].trim();
    const code = match[2].replace(/\n$/, "");

    sections.push(
      <div
        key={`comment-code-${match.index}`}
        className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 px-3 py-2 dark:border-zinc-800"
      >
        {language ? <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{language}</div> : null}
        <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-zinc-100">
          <code>{code}</code>
        </pre>
      </div>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    const text = body.slice(lastIndex);
    sections.push(
      <p
        key={`comment-text-${lastIndex}`}
        className="whitespace-pre-wrap text-[13px] leading-5 text-zinc-700 dark:text-zinc-200"
      >
        {renderCommentText(text, `comment-text-${lastIndex}`)}
      </p>,
    );
  }

  return sections.length > 0 ? sections : renderCommentText(body, "comment-inline");
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((current) => !current) };
}

function boardOrderSignature(boards: BoardModel[] | null | undefined) {
  return (boards ?? []).map((board) => String(board._id)).join("|");
}

export function KanbanApp({ onLogout }: { onLogout?: () => void }) {
  const { dark, toggle: toggleTheme } = useTheme();
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const boards = useQuery(api.boards.list, isConvexAuthenticated ? {} : "skip") as
    | BoardModel[]
    | undefined;
  const viewer = useQuery(api.users.viewer, isConvexAuthenticated ? {} : "skip") as
    | { isSuperuser?: boolean; email?: string | null; name?: string | null; userId?: string | null }
    | null
    | undefined;
  const createBoard = useMutation(api.boards.create);
  const ensureFixedColumns = useMutation(api.boards.ensureFixedColumns);
  const renameBoard = useMutation(api.boards.rename);
  const deleteBoard = useMutation(api.boards.remove);
  const reorderBoards = useMutation(api.boards.reorder);
  const applyCardLayout = useMutation(api.cards.applyLayout);
  const archiveDoneCards = useMutation(api.cards.archiveDoneCards);
  const [optimisticBoards, setOptimisticBoards] = useState<BoardModel[] | null>(null);
  const boardReorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const cardLayoutQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestCardLayoutRequestRef = useRef(0);
  const [selectedBoardId, setSelectedBoardId] = useState<Id<"boards"> | null>(null);
  const [newBoardName, setNewBoardName] = useState("");
  const [showNewBoardForm, setShowNewBoardForm] = useState(false);
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isInboxDebugOpen, setIsInboxDebugOpen] = useState(false);
  const [debugAgentId, setDebugAgentId] = useState<string | null>(null);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isArchivingDone, setIsArchivingDone] = useState(false);
  const [isExtensionAccessOpen, setIsExtensionAccessOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [allAgentOptions, setAllAgentOptions] = useState<AgentOption[]>([]);
  const [sidebarAgentOptions, setSidebarAgentOptions] = useState<AgentOption[]>([]);
  const [isSidebarAgentsLoading, setIsSidebarAgentsLoading] = useState(false);
  const [isSidebarSkillsLoading, setIsSidebarSkillsLoading] = useState(false);
  const [sidebarSkillOptions, setSidebarSkillOptions] = useState<SkillOption[]>([]);
  const [sidebarSkillError, setSidebarSkillError] = useState<string | null>(null);
  const [sidebarModelOptions, setSidebarModelOptions] = useState<ModelOption[]>([]);
  const [sidebarAcpOptions, setSidebarAcpOptions] = useState<AcpOption[]>([]);
  const [isSidebarAcpLoading, setIsSidebarAcpLoading] = useState(false);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<Id<"cards"> | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<Id<"boards"> | null>(null);
  const [activeDragCardId, setActiveDragCardId] = useState<Id<"cards"> | null>(null);
  const [dragColumns, setDragColumns] = useState<ColumnModel[] | null>(null);
  const [editingBoard, setEditingBoard] = useState<BoardModel | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const ensuredFixedColumnsRef = useRef<Set<string>>(new Set());

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const boardParam = searchParams.get("board");

  const displayBoards = useMemo(() => {
    if (!boards) return boards;
    if (!optimisticBoards || optimisticBoards.length === 0) return boards;

    const latestById = new Map(boards.map((board) => [String(board._id), board]));
    const optimisticIds = optimisticBoards.map((board) => String(board._id));

    if (optimisticIds.length !== boards.length || optimisticIds.some((boardId) => !latestById.has(boardId))) {
      return boards;
    }

    return optimisticIds.flatMap((boardId) => {
      const board = latestById.get(boardId);
      return board ? [board] : [];
    });
  }, [boards, optimisticBoards]);

  const effectiveSelectedBoardId = useMemo(() => {
    if (!displayBoards || displayBoards.length === 0) return null;

    if (boardParam && displayBoards.some((board) => board._id === boardParam)) {
      return boardParam as Id<"boards">;
    }

    if (selectedBoardId && displayBoards.some((board) => board._id === selectedBoardId)) {
      return selectedBoardId;
    }

    return displayBoards[0]._id;
  }, [displayBoards, selectedBoardId, boardParam]);

  const navigateToBoard = useCallback(
    (boardId: Id<"boards"> | null, mode: "push" | "replace" = "replace") => {
      const params = new URLSearchParams(searchParams.toString());

      if (boardId) {
        params.set("board", boardId);
      } else {
        params.delete("board");
      }

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      if (mode === "push") {
        router.push(url, { scroll: false });
      } else {
        router.replace(url, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  const boardView = useQuery(
    api.boards.get,
    effectiveSelectedBoardId ? { boardId: effectiveSelectedBoardId } : "skip",
  ) as BoardView | undefined;

  const boardActivity = useQuery(
    api.activity.listByBoard,
    effectiveSelectedBoardId ? { boardId: effectiveSelectedBoardId, limit: 14 } : "skip",
  ) as ActivityEventModel[] | undefined;

  const selectedBoard = useMemo(() => {
    if (!displayBoards || displayBoards.length === 0) return null;
    if (!effectiveSelectedBoardId) return displayBoards[0] ?? null;

    return displayBoards.find((board) => board._id === effectiveSelectedBoardId) ?? displayBoards[0] ?? null;
  }, [displayBoards, effectiveSelectedBoardId]);

  const selectedBoardName = selectedBoard?.name ?? "Kanban";
  const selectedBoardUrl = selectedBoard?.url;

  useEffect(() => {
    if (!boardView?.board?._id || !boardView.board.isOwner) {
      return;
    }

    const boardId = String(boardView.board._id);
    const hasArchiveColumn = boardView.columns.some(
      (column) => normalizeColumnName(column.name) === "archive",
    );

    if (hasArchiveColumn || ensuredFixedColumnsRef.current.has(boardId)) {
      return;
    }

    ensuredFixedColumnsRef.current.add(boardId);

    void ensureFixedColumns({ boardId: boardView.board._id }).catch((error) => {
      ensuredFixedColumnsRef.current.delete(boardId);
      toast.error(error instanceof Error ? error.message : "Failed to prepare board columns");
    });
  }, [boardView, ensureFixedColumns]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const title = selectedBoard?.name?.trim()
      ? `Kanban - ${selectedBoard.name}`
      : "Kanban";

    const applyTitle = () => {
      document.title = title;
    };

    applyTitle();
    const frameId = window.requestAnimationFrame(applyTitle);
    const timeoutId = window.setTimeout(applyTitle, 150);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [selectedBoard?.name, pathname, searchParams]);
  const selectedBoardAgentPolicyKey = JSON.stringify(
    (boardView?.board.allowedAgentIds ?? selectedBoard?.allowedAgentIds ?? []).slice().sort(),
  );
  const isSuperuser = viewer?.isSuperuser === true;
  const isFullScreenModalOpen = Boolean(editingBoard || activeCardId);


  useEffect(() => {
    if (!optimisticBoards || !boards) return;
    if (boardOrderSignature(optimisticBoards) !== boardOrderSignature(boards)) return;

    setOptimisticBoards(null);
  }, [boards, optimisticBoards]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(searchDraft.trim().toLowerCase());
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  useEffect(() => {
    if (!isSearchOpen) return;

    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSidebarOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    if (!isFullScreenModalOpen) return;

    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isFullScreenModalOpen]);

  useEffect(() => {
    if (!displayBoards) return;
    if (displayBoards.length > 0) return;

    if (boardParam) {
      navigateToBoard(null, "replace");
    }
  }, [displayBoards, boardParam, navigateToBoard]);

  useEffect(() => {
    if (!displayBoards || displayBoards.length === 0) return;
    if (!effectiveSelectedBoardId) return;
    if (boardParam === effectiveSelectedBoardId) return;

    navigateToBoard(effectiveSelectedBoardId, "replace");
  }, [displayBoards, boardParam, effectiveSelectedBoardId, navigateToBoard]);

  useEffect(() => {
    if (!isConvexAuthenticated || !effectiveSelectedBoardId) {
      setIsSidebarAgentsLoading(false);
      setIsSidebarAcpLoading(false);
      setSidebarAgentOptions([]);
      setSidebarModelOptions([]);
      setSidebarAcpOptions([]);
      return;
    }

    let cancelled = false;
    setIsSidebarAgentsLoading(true);
    setIsSidebarSkillsLoading(true);
    setIsSidebarAcpLoading(true);
    setSidebarAgentOptions([]);
    setSidebarSkillError(null);
    setSidebarAcpOptions([]);

    async function loadSidebarOptions() {
      try {
        const [agentsResponse, skillsResponse, modelsResponse, acpResponse] = await Promise.all([
          fetch(`/api/agents?boardId=${encodeURIComponent(String(effectiveSelectedBoardId))}`, { cache: "no-store" }).catch(() => null),
          fetch("/api/skills", { cache: "no-store" }).catch(() => null),
          fetch("/api/models", { cache: "no-store" }).catch(() => null),
          fetch("/api/acp", { cache: "no-store" }).catch(() => null),
        ]);
        if (cancelled) return;

        const agentsData = agentsResponse && agentsResponse.ok ? ((await agentsResponse.json()) as { agents?: AgentOption[] }) : null;
        const skillsData = skillsResponse && skillsResponse.ok ? ((await skillsResponse.json()) as { skills?: SkillOption[] }) : null;
        const skillError = skillsResponse?.ok ? null : await getSkillsLoadError(skillsResponse);
        const modelsData = modelsResponse && modelsResponse.ok ? ((await modelsResponse.json()) as { models?: ModelOption[] }) : null;
        const acpData = acpResponse && acpResponse.ok ? ((await acpResponse.json()) as { acp?: AcpOption[] }) : null;
        if (cancelled) return;

        const normalizedAgents = (agentsData?.agents ?? [])
          .map((agent) => ({
            id: String(agent.id),
            name: String(agent.name),
            emoji: agent.emoji,
            avatarUrl: agent.avatarUrl ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const normalizedSkills = (skillsData?.skills ?? [])
          .filter((skill) => skill?.name && skill.eligible === true)
          .map((skill) => ({ name: String(skill.name), eligible: true }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const normalizedModels = (modelsData?.models ?? [])
          .filter((model) => model?.id && model?.label)
          .map((model) => ({
            id: String(model.id),
            label: String(model.label),
            isPrimary: model.isPrimary === true,
          }))
          .sort((a, b) => {
            if (a.isPrimary && !b.isPrimary) return -1;
            if (!a.isPrimary && b.isPrimary) return 1;
            return a.label.localeCompare(b.label);
          });

        const normalizedAcp = (acpData?.acp ?? [])
          .filter((option) => option?.id && option?.label)
          .map((option) => ({
            id: String(option.id),
            label: String(option.label),
            isDefault: option.isDefault === true,
          }))
          .sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.label.localeCompare(b.label);
          });

        setSidebarAgentOptions(normalizedAgents);
        setSidebarSkillOptions(normalizedSkills);
        setSidebarSkillError(skillError);
        setSidebarModelOptions(normalizedModels);
        setSidebarAcpOptions(normalizedAcp);
      } catch {
        // Ignore sidebar option loading failures.
      } finally {
        if (!cancelled) {
          setIsSidebarAgentsLoading(false);
          setIsSidebarSkillsLoading(false);
          setIsSidebarAcpLoading(false);
        }
      }
    }

    void loadSidebarOptions();

    return () => {
      cancelled = true;
    };
  }, [effectiveSelectedBoardId, isConvexAuthenticated, selectedBoardAgentPolicyKey]);

  useEffect(() => {
    if (activeCardId && boardView) {
      const cardStillExists = boardView.columns.some((column) =>
        column.cards.some((candidate) => candidate._id === activeCardId),
      );

      if (!cardStillExists) {
        setActiveCardId(null);
      }
    }
  }, [activeCardId, boardView]);

  useEffect(() => {
    if (!isConvexAuthenticated || !isSuperuser) return;

    let cancelled = false;

    async function loadAllAgentOptions() {
      try {
        const response = await fetch("/api/agents", { cache: "no-store" }).catch(() => null);
        if (!response || !response.ok || cancelled) return;

        const data = (await response.json()) as { agents?: AgentOption[] };
        if (cancelled) return;

        const normalizedAgents = (data.agents ?? [])
          .map((agent) => ({
            id: String(agent.id),
            name: String(agent.name),
            emoji: agent.emoji,
            avatarUrl: agent.avatarUrl ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setAllAgentOptions(normalizedAgents);
      } catch {
        // Ignore full agent option loading failures.
      }
    }

    void loadAllAgentOptions();

    return () => {
      cancelled = true;
    };
  }, [isConvexAuthenticated, isSuperuser]);

  const activeCard = useMemo(() => {
    if (!boardView || !activeCardId) return null;

    for (const column of boardView.columns) {
      const card = column.cards.find((candidate) => candidate._id === activeCardId);
      if (card) return card;
    }

    return null;
  }, [boardView, activeCardId]);

  const visibleBoardColumns = useMemo(
    () => (boardView?.columns ?? []).filter((column) => normalizeColumnName(column.name) !== "archive"),
    [boardView],
  );
  const archiveColumn = useMemo(
    () => (boardView?.columns ?? []).find((column) => normalizeColumnName(column.name) === "archive") ?? null,
    [boardView],
  );
  const archivedCards = useMemo(
    () =>
      (archiveColumn?.cards ?? []).map((card) => ({
        ...card,
        updatedAt: card.lastSessionUpdatedAt ?? card._creationTime,
      })),
    [archiveColumn],
  );
  const dndColumns = useMemo(() => dragColumns ?? visibleBoardColumns, [dragColumns, visibleBoardColumns]);
  const hasSearchInput = searchDraft.trim().length > 0;
  const isSearchActive = searchQuery.length >= 2;
  const visibleColumns = useMemo(() => {
    if (!isSearchActive) return dndColumns;

    return visibleBoardColumns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => cardMatchesSearch(card, searchQuery)),
    }));
  }, [dndColumns, isSearchActive, searchQuery, visibleBoardColumns]);
  const boardColumnsSig = useMemo(() => columnsSignature(visibleBoardColumns), [visibleBoardColumns]);
  const dragColumnsSig = useMemo(() => columnsSignature(dragColumns ?? []), [dragColumns]);
  const runningAgentIdsForBoard = useMemo(() => {
    return new Set(
      boardView?.columns
        .flatMap((column) => column.cards)
        .filter((card) => card.isRunning && card.lastSessionAgentId)
        .map((card) => card.lastSessionAgentId as string) ?? [],
    );
  }, [boardView]);

  const sidebarInboxResults = useQueries(
    useMemo(() => {
      if (!isConvexAuthenticated || !effectiveSelectedBoardId || sidebarAgentOptions.length === 0) {
        return {};
      }

      return Object.fromEntries(
        sidebarAgentOptions.map((agent) => [
          agent.id,
          {
            query: api.agent_automation.debugAgentInbox,
            args: { agentId: agent.id, boardId: effectiveSelectedBoardId, refreshKey: 0 },
          },
        ]),
      );
    }, [effectiveSelectedBoardId, isConvexAuthenticated, sidebarAgentOptions]),
  );

  const pendingCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();

    for (const agent of sidebarAgentOptions) {
      const result = sidebarInboxResults[agent.id] as { totalCount?: number } | undefined;
      counts.set(agent.id, typeof result?.totalCount === "number" ? result.totalCount : 0);
    }

    return counts;
  }, [sidebarAgentOptions, sidebarInboxResults]);

  const activeDragCard = useMemo(() => {
    if (!activeDragCardId) return null;

    for (const column of dndColumns) {
      const card = column.cards.find((candidate) => candidate._id === activeDragCardId);
      if (card) return card;
    }

    return null;
  }, [dndColumns, activeDragCardId]);

  useEffect(() => {
    if (activeDragCardId) return;
    if (!dragColumns) return;
    if (dragColumnsSig !== boardColumnsSig) return;

    const timeout = window.setTimeout(() => setDragColumns(null), 0);
    return () => window.clearTimeout(timeout);
  }, [activeDragCardId, dragColumns, dragColumnsSig, boardColumnsSig]);

  useEffect(() => {
    if (!isSearchActive) return;
    if (activeDragCardId) {
      setActiveDragCardId(null);
    }
    if (dragColumns) {
      setDragColumns(null);
    }
  }, [activeDragCardId, dragColumns, isSearchActive]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 10 } }),
    useSensor(KeyboardSensor),
  );

  const boardSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 12 } }),
  );

  async function handleCreateBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isCreatingBoard || !newBoardName.trim()) {
      return;
    }

    setIsCreatingBoard(true);

    try {
      const boardId = await createBoard({ name: newBoardName });
      setNewBoardName("");
      setShowNewBoardForm(false);
      setSelectedBoardId(boardId);
      setIsMobileSidebarOpen(false);
      navigateToBoard(boardId, "push");
    } finally {
      setIsCreatingBoard(false);
    }
  }

  async function handleRenameBoard({
    boardId,
    currentName,
    currentDescription,
    currentUrl,
    currentSharedUserIds,
    currentAllowedAgentIds,
    nextName,
    nextDescription,
    nextUrl,
    nextSharedUserIds,
    nextAllowedAgentIds,
  }: {
    boardId: Id<"boards">;
    currentName: string;
    currentDescription?: string;
    currentUrl?: string;
    currentSharedUserIds?: Id<"managedUsers">[];
    currentAllowedAgentIds?: string[];
    nextName: string;
    nextDescription: string;
    nextUrl: string;
    nextSharedUserIds: Id<"managedUsers">[];
    nextAllowedAgentIds: string[];
  }) {
    const normalizedName = nextName.trim();
    if (!normalizedName) return;

    const normalizedDescription = nextDescription.trim();
    const normalizedUrl = nextUrl.trim();
    const normalizedSharedUserIds = Array.from(new Set(nextSharedUserIds.map((userId) => String(userId)))) as Id<"managedUsers">[];
    const normalizedAllowedAgentIds = Array.from(
      new Set(nextAllowedAgentIds.map((agentId) => agentId.trim()).filter(Boolean)),
    );
    const currentSharedSig = JSON.stringify((currentSharedUserIds ?? []).map((userId) => String(userId)).sort());
    const nextSharedSig = JSON.stringify(normalizedSharedUserIds.map((userId) => String(userId)).sort());
    const currentAllowedAgentsSig = JSON.stringify((currentAllowedAgentIds ?? []).map((agentId) => agentId.trim()).filter(Boolean).sort());
    const nextAllowedAgentsSig = JSON.stringify(normalizedAllowedAgentIds.slice().sort());
    const didChange =
      normalizedName !== currentName ||
      normalizedDescription !== (currentDescription ?? "") ||
      normalizedUrl !== (currentUrl ?? "") ||
      currentSharedSig !== nextSharedSig ||
      currentAllowedAgentsSig !== nextAllowedAgentsSig;

    if (!didChange) {
      setEditingBoard(null);
      return;
    }

    await renameBoard({
      boardId,
      name: normalizedName,
      description: normalizedDescription,
      url: normalizedUrl,
      sharedUserIds: normalizedSharedUserIds,
      allowedAgentIds: normalizedAllowedAgentIds,
    });

    setEditingBoard(null);
  }

  async function handleDeleteBoard(boardId: Id<"boards">, boardName: string) {
    const confirmed = window.confirm(`Delete "${boardName}" and all of its cards?`);
    if (!confirmed) return;

    await deleteBoard({ boardId });

    if (selectedBoardId === boardId) {
      setSelectedBoardId(null);
      setActiveCardId(null);
    }
  }

  async function handleBoardReorder(sourceBoardId: Id<"boards">, targetBoardId: Id<"boards">) {
    if (!displayBoards || sourceBoardId === targetBoardId) return;

    const sourceBoard = displayBoards.find((board) => board._id === sourceBoardId);
    const targetBoard = displayBoards.find((board) => board._id === targetBoardId);

    if (!sourceBoard?.isOwner || !targetBoard?.isOwner) {
      return;
    }

    const ownedBoards = displayBoards.filter((board) => board.isOwner);
    const orderedIds = ownedBoards.map((board) => board._id);
    const sourceIndex = orderedIds.indexOf(sourceBoardId);
    const targetIndex = orderedIds.indexOf(targetBoardId);

    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextOrderedIds = arrayMove(orderedIds, sourceIndex, targetIndex);
    const ownedBoardById = new Map(ownedBoards.map((board) => [String(board._id), board]));
    let ownedIndex = 0;
    const nextBoards = displayBoards.map((board) => {
      if (!board.isOwner) {
        return board;
      }

      const nextBoard = ownedBoardById.get(String(nextOrderedIds[ownedIndex]));
      ownedIndex += 1;
      return nextBoard ?? board;
    });

    setOptimisticBoards(nextBoards);

    const run = boardReorderQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await reorderBoards({ boardIds: nextOrderedIds });
      });

    boardReorderQueueRef.current = run;

    try {
      await run;
    } catch (error) {
      setOptimisticBoards(null);
      toast.error(error instanceof Error ? error.message : "Failed to save board order");
    }
  }

  function handleBoardDragStart(event: DragStartEvent) {
    setActiveBoardId(String(event.active.id) as Id<"boards">);
  }

  function handleBoardDragEnd(event: DragEndEvent) {
    const sourceBoardId = String(event.active.id) as Id<"boards">;
    const targetBoardId = event.over ? (String(event.over.id) as Id<"boards">) : null;

    setActiveBoardId(null);

    if (!targetBoardId || sourceBoardId === targetBoardId) return;
    void handleBoardReorder(sourceBoardId, targetBoardId);
  }

  function handleBoardDragCancel() {
    setActiveBoardId(null);
  }

  function getContainerId(overId: string, columns: ColumnModel[]) {
    if (overId.startsWith("column-")) {
      const parsed = overId.slice("column-".length) as Id<"columns">;
      return columns.some((column) => column._id === parsed) ? parsed : null;
    }

    const parent = columns.find((column) =>
      column.cards.some((card) => card._id === (overId as Id<"cards">)),
    );
    return parent?._id ?? null;
  }

  function shouldInsertAfterOverCard(
    activeRect: { top: number; height: number } | null | undefined,
    overRect: { top: number; height: number } | null | undefined,
    overId: string,
  ) {
    if (overId.startsWith("column-") || !activeRect || !overRect) {
      return false;
    }

    const activeCenterY = activeRect.top + activeRect.height / 2;
    const overCenterY = overRect.top + overRect.height / 2;
    return activeCenterY > overCenterY;
  }

  function applyOverMove(
    columns: ColumnModel[],
    cardId: Id<"cards">,
    overId: string,
    insertAfterOverCard = false,
  ) {
    const activeContainerId = getContainerId(cardId, columns);
    const overContainerId = getContainerId(overId, columns);

    if (!activeContainerId || !overContainerId) return false;

    const activeContainer = columns.find((column) => column._id === activeContainerId);
    const overContainer = columns.find((column) => column._id === overContainerId);

    if (!activeContainer || !overContainer) return false;

    const activeIndex = activeContainer.cards.findIndex((card) => card._id === cardId);
    if (activeIndex < 0) return false;

    if (activeContainerId === overContainerId) {
      const overIndex = overId.startsWith("column-")
        ? overContainer.cards.length - 1
        : overContainer.cards.findIndex((card) => card._id === (overId as Id<"cards">));

      if (overIndex < 0 || overIndex === activeIndex) return false;

      overContainer.cards = arrayMove(overContainer.cards, activeIndex, overIndex);
      return true;
    }

    const [movingCard] = activeContainer.cards.splice(activeIndex, 1);
    if (!movingCard) return false;

    const overIndex = overId.startsWith("column-")
      ? overContainer.cards.length
      : overContainer.cards.findIndex((card) => card._id === (overId as Id<"cards">));

    const insertIndex = overIndex >= 0
      ? Math.min(overIndex + (insertAfterOverCard ? 1 : 0), overContainer.cards.length)
      : overContainer.cards.length;

    overContainer.cards.splice(insertIndex, 0, {
      ...movingCard,
      columnId: overContainer._id,
    });

    return true;
  }

  function handleCardDragStart(event: DragStartEvent) {
    const cardId = String(event.active.id) as Id<"cards">;

    setActiveDragCardId(cardId);

    if (dndColumns.length > 0) {
      setDragColumns(cloneColumns(dndColumns));
    }
  }

  function handleCardDragOver(event: DragOverEvent) {
    if (!boardView || !event.over) return;

    const cardId = String(event.active.id) as Id<"cards">;
    const overId = String(event.over.id);
    const insertAfterOverCard = shouldInsertAfterOverCard(
      event.active.rect.current.translated ?? event.active.rect.current.initial,
      event.over.rect,
      overId,
    );

    setDragColumns((current) => {
      const working = cloneColumns(current ?? visibleBoardColumns);
      const changed = applyOverMove(working, cardId, overId, insertAfterOverCard);
      if (!changed) return current;

      const previousSig = columnsSignature(current ?? visibleBoardColumns);
      const nextSig = columnsSignature(working);
      if (previousSig === nextSig) return current;

      return working;
    });
  }

  function handleCardDragCancel() {
    setActiveDragCardId(null);
    setDragColumns(null);
  }

  async function handleRunAgentNow(agentId: string) {
    if (!agentId || runningAgentId || !effectiveSelectedBoardId) return;

    setRunningAgentId(agentId);

    try {
      const response = await fetch("/api/agent-workers/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentId, boardId: effectiveSelectedBoardId }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to trigger worker");
      }

      toast(`Running ${agentId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to trigger worker");
    } finally {
      setRunningAgentId(null);
    }
  }

  function handleCardDragEnd(event: DragEndEvent) {
    const cardId = String(event.active.id) as Id<"cards">;

    if (!boardView) {
      setActiveDragCardId(null);
      setDragColumns(null);
      return;
    }

    let finalColumns = dragColumns;

    if (!finalColumns && event.over) {
      const fallback = cloneColumns(visibleBoardColumns);
      const overId = String(event.over.id);
      const insertAfterOverCard = shouldInsertAfterOverCard(
        event.active.rect.current.translated ?? event.active.rect.current.initial,
        event.over.rect,
        overId,
      );
      const changed = applyOverMove(fallback, cardId, overId, insertAfterOverCard);
      if (changed) {
        finalColumns = fallback;
      }
    }

    if (!finalColumns || columnsSignature(finalColumns) === boardColumnsSig) {
      setActiveDragCardId(null);
      setDragColumns(null);
      return;
    }

    const layoutPayload = {
      boardId: boardView.board._id,
      columns: finalColumns.map((column) => ({
        columnId: column._id,
        cardIds: column.cards.map((card) => card._id),
      })),
    };

    setActiveDragCardId(null);

    const requestId = latestCardLayoutRequestRef.current + 1;
    latestCardLayoutRequestRef.current = requestId;

    const run = cardLayoutQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await applyCardLayout(layoutPayload);
      });

    cardLayoutQueueRef.current = run;

    void run.catch((error) => {
      if (latestCardLayoutRequestRef.current === requestId) {
        setDragColumns(null);
      }

      toast.error(error instanceof Error ? error.message : "Failed to save card order");
    });
  }

  async function handleArchiveAllDoneCards() {
    if (!effectiveSelectedBoardId || !archiveColumn || isArchivingDone) {
      return;
    }

    setIsArchivingDone(true);

    try {
      const result = await archiveDoneCards({ boardId: effectiveSelectedBoardId });
      toast.success(
        result.movedCount > 0
          ? `Archived ${result.movedCount} done ${result.movedCount === 1 ? "card" : "cards"}`
          : "No done cards to archive",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive done cards");
    } finally {
      setIsArchivingDone(false);
    }
  }

  return (
      <div className="flex h-[100dvh] min-h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-20 h-12 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/90">
        <div className="flex h-full w-full">
          <div
            className={`hidden shrink-0 items-center border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex ${
              isSidebarCollapsed ? "w-12 justify-center px-2" : "w-48 justify-between px-3"
            }`}
          >
            {!isSidebarCollapsed ? (
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🦞</span>
                <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">SuperClaw</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              aria-label={isSidebarCollapsed ? "Expand menu" : "Collapse menu"}
              title={isSidebarCollapsed ? "Expand menu" : "Collapse menu"}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                {isSidebarCollapsed ? <path d="m14 9 3 3-3 3" /> : <path d="m16 15-3-3 3-3" />}
              </svg>
            </button>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-between px-3 lg:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen((value) => !value)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200 lg:hidden"
                aria-label={isMobileSidebarOpen ? "Close navigation" : "Open navigation"}
                title={isMobileSidebarOpen ? "Close navigation" : "Open navigation"}
              >
                {isMobileSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>

              <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{selectedBoardName}</div>
              {selectedBoardUrl ? (
                <a
                  href={selectedBoardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-300"
                  aria-label={`Open ${selectedBoardName} link`}
                  title={selectedBoardUrl}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              {isSearchOpen ? (
                <div className="flex h-8 items-center gap-1 rounded-full border border-zinc-200 bg-white/95 pl-2 pr-1 shadow-sm shadow-zinc-950/5 transition dark:border-zinc-800 dark:bg-zinc-950/95">
                  <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <input
                    ref={searchInputRef}
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        if (searchDraft.trim()) {
                          setSearchDraft("");
                          setSearchQuery("");
                        } else {
                          setIsSearchOpen(false);
                        }
                      }
                    }}
                    placeholder="Search cards"
                    aria-label="Search cards in this board"
                    className="h-full w-28 bg-transparent text-[16px] text-zinc-900 outline-none placeholder:text-zinc-400 sm:w-56 sm:text-sm dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                  {hasSearchInput ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchDraft("");
                        setSearchQuery("");
                        searchInputRef.current?.focus();
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-200"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsSearchOpen(false)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-200"
                      title="Close search"
                      aria-label="Close search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-300"
                  title="Search cards"
                  aria-label="Search cards"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsExtensionAccessOpen(true)}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-300"
                title="Connect extension"
                aria-label="Connect extension"
              >
                <Chrome className="h-4 w-4" />
              </button>

              {isSuperuser ? (
                <button
                  type="button"
                  onClick={() => setIsUserManagementOpen(true)}
                  className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-300"
                  title="Manage users"
                  aria-label="Manage users"
                >
                  <Users className="h-4 w-4" />
                </button>
              ) : null}

              <button
                type="button"
                onClick={toggleTheme}
                className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  title="Log out"
                  aria-label="Log out"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 w-full flex-col overflow-hidden lg:flex-row">
        {isMobileSidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-x-0 bottom-0 top-[calc(3rem+env(safe-area-inset-top))] z-20 bg-zinc-950/40 backdrop-blur-[1px] lg:top-12 lg:hidden"
          />
        ) : null}

        <aside
          className={`hide-scrollbar fixed bottom-0 left-0 top-[calc(3rem+env(safe-area-inset-top))] z-30 min-h-0 w-[min(18rem,100vw)] overflow-y-auto overscroll-contain border-r border-zinc-200 bg-white py-3 shadow-xl transition-transform dark:border-zinc-800 dark:bg-zinc-950 lg:static lg:inset-auto lg:z-auto lg:flex lg:translate-x-0 lg:flex-col lg:shrink-0 lg:border-b-0 lg:shadow-none ${
            isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${isSidebarCollapsed ? "px-3 lg:w-12 lg:px-2" : "px-3 lg:w-48"}`}
        >
          <div className="mb-3 flex items-center justify-between border-b border-zinc-200 px-1 pb-3 dark:border-zinc-800 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🦞</span>
              <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">SuperClaw</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className={`${isSidebarCollapsed ? "lg:hidden" : ""} flex h-full min-h-0 flex-col`}>
            <div className="hide-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {displayBoards === undefined ? (
                <div className="px-1 py-1 text-xs text-zinc-500 dark:text-zinc-400">Loading boards...</div>
              ) : null}

              {displayBoards && displayBoards.length > 0 ? (
                <DndContext
                  sensors={boardSensors}
                  collisionDetection={closestCorners}
                  onDragStart={handleBoardDragStart}
                  onDragEnd={handleBoardDragEnd}
                  onDragCancel={handleBoardDragCancel}
                >
                  <SortableContext items={displayBoards.map((board) => String(board._id))} strategy={verticalListSortingStrategy}>
                    {displayBoards.map((board) => (
                      <BoardSidebarItem
                        key={board._id}
                        board={board}
                        isActive={board._id === effectiveSelectedBoardId}
                        isDragging={activeBoardId === board._id}
                        onSelect={() => {
                          setSelectedBoardId(board._id);
                          setIsMobileSidebarOpen(false);
                          navigateToBoard(board._id, "push");
                        }}
                        onRename={() => setEditingBoard(board)}
                        onDelete={() => void handleDeleteBoard(board._id, board.name)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : null}

              {displayBoards && displayBoards.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  No boards yet.
                </div>
              ) : null}
            </div>

            {isSuperuser ? (
              !showNewBoardForm ? (
                <button
                  type="button"
                  onClick={() => setShowNewBoardForm(true)}
                  className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg bg-zinc-900 px-2.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <span className="text-sm leading-none">+</span>
                  Add Board
                </button>
              ) : (
                <form onSubmit={handleCreateBoard} className="mt-2 space-y-1.5">
                  <input
                    id="new-board"
                    className={`${inputClass} h-8 px-2.5 text-xs`}
                    value={newBoardName}
                    onChange={(event) => setNewBoardName(event.target.value)}
                    placeholder="Board name"
                    autoFocus
                    disabled={isCreatingBoard}
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewBoardForm(false);
                        setNewBoardName("");
                      }}
                      className="inline-flex h-7 items-center justify-center px-1.5 text-xs text-zinc-500 transition hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-300"
                      disabled={isCreatingBoard}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="inline-flex h-7 items-center justify-center rounded-md bg-zinc-900 px-2.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      disabled={!newBoardName.trim() || isCreatingBoard}
                    >
                      {isCreatingBoard ? "Creating…" : "Create"}
                    </button>
                  </div>
                </form>
              )
            ) : null}

            <div className="pt-3">
              <div className="hide-scrollbar max-h-[220px] space-y-2 overflow-y-auto px-1 pr-2">
                {isSidebarAgentsLoading ? (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading agents...</div>
                ) : sidebarAgentOptions.length > 0 ? (
                  sidebarAgentOptions.map((agent) => {
                    const isRunning = runningAgentId === agent.id || runningAgentIdsForBoard.has(agent.id);
                    const pendingCount = pendingCountByAgent.get(agent.id) ?? 0;

                    return (
                      <div
                        key={agent.id}
                        className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60"
                      >
                        <div className="relative shrink-0">
                          <AgentAvatar
                            agentName={agent.name}
                            avatarUrl={agent.avatarUrl ?? null}
                            emoji={agent.emoji}
                            size="sm"
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white dark:border-zinc-900 ${
                              isRunning ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1 pr-1">
                          <button
                            type="button"
                            onClick={() => {
                              setDebugAgentId(agent.id);
                              setIsInboxDebugOpen(true);
                            }}
                            className="block max-w-full truncate text-left text-sm font-medium text-zinc-800 transition hover:text-zinc-950 dark:text-zinc-100 dark:hover:text-white"
                            title={pendingCount > 0 ? `${agent.name} · ${pendingCount} pending task${pendingCount === 1 ? "" : "s"}` : agent.name}
                          >
                            {agent.name}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRunAgentNow(agent.id)}
                          disabled={Boolean(runningAgentId)}
                          title={isRunning ? `${agent.name} is running` : `Run ${agent.name} now`}
                          className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
                        >
                          <Play className="h-3.5 w-3.5" />
                          {pendingCount > 0 ? (
                            <span className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-semibold leading-4 text-white dark:bg-zinc-100 dark:text-zinc-900">
                              {pendingCount}
                            </span>
                          ) : null}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">No agents.</div>
                )}
              </div>
            </div>
          </div>

        </aside>

        <main className="hide-scrollbar relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-zinc-50 p-3 dark:bg-zinc-900 lg:p-4">
          {!displayBoards || (displayBoards.length > 0 && boardView === undefined) ? (
            <div className="px-1 py-2 text-sm text-zinc-500 dark:text-zinc-400">Loading board...</div>
          ) : null}

          {displayBoards?.length === 0 ? (
            <EmptyState
              title="Create your first board"
              description="Once a board exists, you can add cards and start moving work between stages."
            />
          ) : null}

          {boardView?.board ? (
            <div>
              {dndColumns.length === 0 ? (
                <EmptyState
                  title="No columns found"
                  description="This board has no fixed columns. Delete it and recreate the board."
                />
              ) : (
                <>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleCardDragStart}
                    onDragOver={handleCardDragOver}
                    onDragEnd={handleCardDragEnd}
                    onDragCancel={handleCardDragCancel}
                  >
                    <div className="flex min-w-max items-start gap-2.5 pb-16 pr-3">
                      {visibleColumns.map((column) => (
                        <KanbanColumn
                          key={column._id}
                          column={column}
                          accentClass={getColumnTone(column.name)}
                          onOpenCard={(cardId) => setActiveCardId(cardId)}
                          draggable={!isSearchActive}
                          hideComposer={isSearchActive}
                          archiveAvailable={Boolean(archiveColumn)}
                          onArchiveAll={handleArchiveAllDoneCards}
                          archiveAllPending={isArchivingDone}
                        />
                      ))}
                    </div>

                    <DragOverlay>
                      {!isSearchActive && activeDragCard ? (
                        <div className="w-[220px] rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                          <div className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">{activeDragCard.title}</div>
                          {summarize(activeDragCard.description) ? (
                            <div className="mt-1 whitespace-pre-line break-words text-xs text-zinc-500 dark:text-zinc-400">
                              {summarize(activeDragCard.description)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                </>
              )}
            </div>
          ) : null}

          {effectiveSelectedBoardId ? (
            <div className="pointer-events-none fixed bottom-4 right-4 z-20 flex justify-end">
              <div className="pointer-events-auto flex items-center gap-2">
                {archiveColumn ? (
                  <button
                    type="button"
                    onClick={() => setIsArchiveOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/95 px-3 py-2 text-sm font-medium text-zinc-600 shadow-lg shadow-zinc-950/5 backdrop-blur transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    Archive
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsActivityOpen(true)}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white/95 px-3 py-2 text-sm font-medium text-zinc-600 shadow-lg shadow-zinc-950/5 backdrop-blur transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
                >
                  Activity
                </button>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <ActivitySheet
        open={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        boardName={selectedBoardName}
        events={boardActivity as Array<{ _id: string; actorId?: string; message: string; details?: string; createdAt: number; }> | undefined}
        loading={effectiveSelectedBoardId ? boardActivity === undefined : false}
      />

      <ArchiveSheet
        open={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        boardName={selectedBoardName}
        cards={archivedCards}
        onOpenCard={(cardId) => setActiveCardId(cardId)}
      />

      <InboxDebugSheet
        key={`${effectiveSelectedBoardId ?? "board"}:${debugAgentId ?? "agent"}:${isInboxDebugOpen ? "open" : "closed"}`}
        open={isInboxDebugOpen}
        boardId={effectiveSelectedBoardId}
        initialAgentId={debugAgentId}
        onClose={() => {
          setIsInboxDebugOpen(false);
          setDebugAgentId(null);
        }}
      />

      <UserManagementSheet
        open={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
      />

      <ExtensionAccessSheet
        open={isExtensionAccessOpen}
        onClose={() => setIsExtensionAccessOpen(false)}
      />

      {editingBoard ? (
        <BoardEditModal
          key={editingBoard._id}
          board={editingBoard}
          allAgentOptions={allAgentOptions}
          onClose={() => {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            setEditingBoard(null);
          }}
          onSave={(values) =>
            handleRenameBoard({
              boardId: editingBoard._id,
              currentName: editingBoard.name,
              currentDescription: editingBoard.description,
              currentUrl: editingBoard.url,
              currentSharedUserIds: editingBoard.sharedUserIds,
              currentAllowedAgentIds: editingBoard.allowedAgentIds,
              nextName: values.name,
              nextDescription: values.description,
              nextUrl: values.url,
              nextSharedUserIds: values.sharedUserIds,
              nextAllowedAgentIds: values.allowedAgentIds,
            })
          }
        />
      ) : null}

      {activeCard && boardView ? (
        <CardModal
          key={activeCard._id}
          card={activeCard}
          columns={boardView.columns}
          boards={displayBoards ?? []}
          agentOptions={filterBoardAgentOptions(sidebarAgentOptions, boardView.board.allowedAgentIds)}
          skillOptions={sidebarSkillOptions}
          skillError={sidebarSkillError}
          skillsLoading={isSidebarSkillsLoading}
          modelOptions={sidebarModelOptions}
          acpOptions={sidebarAcpOptions}
          acpLoading={isSidebarAcpLoading}
          onClose={() => {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            setActiveCardId(null);
          }}
        />
      ) : null}
      </div>
  );
}

function BoardEditModal({
  board,
  allAgentOptions,
  onClose,
  onSave,
}: {
  board: BoardModel;
  allAgentOptions: AgentOption[];
  onClose: () => void;
  onSave: (values: {
    name: string;
    description: string;
    url: string;
    sharedUserIds: Id<"managedUsers">[];
    allowedAgentIds: string[];
  }) => Promise<void> | void;
}) {
  const managedUsers = useQuery(api.users.list, {}) as ManagedUserModel[] | undefined;
  const [nameDraft, setNameDraft] = useState(board.name);
  const [descriptionDraft, setDescriptionDraft] = useState(board.description ?? "");
  const [urlDraft, setUrlDraft] = useState(board.url ?? "");
  const [sharedUserIdsDraft, setSharedUserIdsDraft] = useState<Id<"managedUsers">[]>(
    board.sharedUserIds ?? [],
  );
  const [allowedAgentIdsDraft, setAllowedAgentIdsDraft] = useState<string[]>(board.allowedAgentIds ?? []);
  const [revealedBoardAccessUserIds, setRevealedBoardAccessUserIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    setRevealedBoardAccessUserIds([]);
  }, [board._id]);

  function toggleBoardAccessEmail(userId: Id<"managedUsers">) {
    const key = String(userId);
    setRevealedBoardAccessUserIds((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  function handleEditorSubmitShortcut(
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function toggleSharedUser(userId: Id<"managedUsers">) {
    setSharedUserIdsDraft((current) => {
      const key = String(userId);
      if (current.some((value) => String(value) === key)) {
        return current.filter((value) => String(value) !== key);
      }

      return [...current, userId];
    });
  }

  function toggleAllowedAgent(agentId: string) {
    setAllowedAgentIdsDraft((current) => {
      const normalizedAgentId = agentId.trim();
      if (!normalizedAgentId) {
        return current;
      }

      if (current.some((value) => value.trim() === normalizedAgentId)) {
        return current.filter((value) => value.trim() !== normalizedAgentId);
      }

      return [...current, normalizedAgentId];
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nameDraft.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await onSave({
        name: nameDraft,
        description: descriptionDraft,
        url: urlDraft,
        sharedUserIds: sharedUserIdsDraft,
        allowedAgentIds: allowedAgentIdsDraft,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update board");
      return;
    } finally {
      setIsSaving(false);
    }
  }

  const sortedManagedUsers = useMemo(
    () =>
      [...(managedUsers ?? [])].sort((a, b) => {
        const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (byName !== 0) return byName;
        return a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
      }),
    [managedUsers],
  );

  const sortedAgentOptions = useMemo(
    () => [...allAgentOptions].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [allAgentOptions],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[1px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-zinc-900 sm:h-auto sm:w-[min(96vw,560px)] sm:rounded-2xl sm:border sm:border-zinc-200 dark:sm:border-zinc-800"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] sm:max-h-[min(90vh,760px)] sm:pt-0">
          <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit board</div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Title</label>
              <input
                autoFocus
                className={`${inputClass} h-10`}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={handleEditorSubmitShortcut}
                placeholder="Board title"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Description</label>
              <textarea
                className={`${textareaClass} min-h-28`}
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                onKeyDown={handleEditorSubmitShortcut}
                placeholder="Add board context for agents..."
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">URL</label>
              <input
                className={`${inputClass} h-10`}
                type="url"
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                onKeyDown={handleEditorSubmitShortcut}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Board access</div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Select saved users who should be able to open and work inside this board.
                </div>
              </div>

              {managedUsers === undefined ? (
                <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Loading saved users…
                </div>
              ) : sortedManagedUsers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Add users from the gear menu first, then assign board access here.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {sortedManagedUsers.map((user, index) => {
                    const checked = sharedUserIdsDraft.some(
                      (value) => String(value) === String(user._id),
                    );

                    return (
                      <label
                        key={user._id}
                        className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/70 ${
                          index > 0 ? "border-t border-zinc-200 dark:border-zinc-800" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          checked={checked}
                          onChange={() => toggleSharedUser(user._id)}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {user.name}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="min-w-0 flex-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
                              {revealedBoardAccessUserIds.includes(String(user._id)) ? user.email : maskEmail(user.email)}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleBoardAccessEmail(user._id);
                              }}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
                              aria-label={
                                revealedBoardAccessUserIds.includes(String(user._id))
                                  ? `Hide email for ${user.name}`
                                  : `Show email for ${user.name}`
                              }
                              aria-pressed={revealedBoardAccessUserIds.includes(String(user._id))}
                            >
                              {revealedBoardAccessUserIds.includes(String(user._id)) ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Allowed agents</div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Leave empty to allow all agents on this board. Once you select any agents here, everyone using this board only sees and runs those specific agents.
                </div>
              </div>

              {sortedAgentOptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  No agents available.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {sortedAgentOptions.map((agent, index) => {
                    const checked = allowedAgentIdsDraft.some((value) => value.trim() === agent.id);

                    return (
                      <label
                        key={agent.id}
                        className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/70 ${
                          index > 0 ? "border-t border-zinc-200 dark:border-zinc-800" : ""
                        }`}
                      >
                        <AgentAvatar
                          agentName={agent.name}
                          avatarUrl={agent.avatarUrl ?? null}
                          emoji={agent.emoji}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {agent.name}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          checked={checked}
                          onChange={() => toggleAllowedAgent(agent.id)}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:px-6 sm:pb-3">
            <button
              type="button"
              className="px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={!nameDraft.trim() || isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BoardSidebarItem({
  board,
  isActive,
  isDragging,
  onSelect,
  onRename,
  onDelete,
}: {
  board: BoardModel;
  isActive: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: String(board._id),
    disabled: !board.isOwner,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`group w-full touch-pan-y select-none [-webkit-touch-callout:none] [-webkit-user-select:none] flex items-center gap-0 overflow-hidden rounded-lg transition-colors ${
        isActive ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
      } ${isDragging ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`min-w-0 flex-1 appearance-none border-0 bg-transparent rounded-none px-2.5 py-2 text-left text-sm font-medium transition-colors ${
          isActive
            ? "text-zinc-900 dark:text-zinc-100"
            : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        }`}
      >
        <div className="truncate">{board.name}</div>
      </button>

      {board.isOwner ? (
        <div className="flex items-center gap-0.5 px-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRename();
            }}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            aria-label={`Edit ${board.name}`}
            title="Edit board"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            aria-label={`Delete ${board.name}`}
            title="Delete board"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function KanbanColumn({
  column,
  accentClass,
  onOpenCard,
  draggable,
  hideComposer,
  archiveAvailable,
  onArchiveAll,
  archiveAllPending,
}: {
  column: ColumnModel;
  accentClass: string;
  onOpenCard: (cardId: Id<"cards">) => void;
  draggable: boolean;
  hideComposer?: boolean;
  archiveAvailable: boolean;
  onArchiveAll: () => void;
  archiveAllPending: boolean;
}) {
  const createCard = useMutation(api.cards.create);
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column._id}`,
    data: { type: "column", columnId: column._id },
  });

  const [showComposer, setShowComposer] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const trimmedNewCardTitle = newCardTitle.trim();
  const isDoneColumn = normalizeColumnName(column.name) === "done";

  async function handleCreateCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isCreatingCard || !trimmedNewCardTitle) {
      return;
    }

    setIsCreatingCard(true);

    try {
      await createCard({
        columnId: column._id,
        title: trimmedNewCardTitle,
      });

      setNewCardTitle("");
      setShowComposer(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add card");
    } finally {
      setIsCreatingCard(false);
    }
  }

  return (
    <section
      ref={setNodeRef}
      className={`w-[220px] flex-none rounded-lg border p-2 transition-colors ${
        isOver
          ? "border-zinc-400 bg-zinc-100/80 dark:border-zinc-600 dark:bg-zinc-900/80"
          : "border-zinc-200 bg-white/90 dark:border-zinc-800 dark:bg-zinc-950/50"
      }`}
    >
      <header className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${accentClass}`}>
            {formatColumnName(column.name)}
          </h3>
          {hideComposer ? (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
              {column.cards.length}
            </span>
          ) : null}
        </div>
        {isDoneColumn && archiveAvailable ? (
          <button
            type="button"
            onClick={onArchiveAll}
            disabled={archiveAllPending}
            className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200"
          >
            {archiveAllPending ? "Archiving…" : "Archive All"}
          </button>
        ) : null}
      </header>

      <SortableContext items={column.cards.map((card) => String(card._id))} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {column.cards.map((card) => (
            <KanbanCard
              key={card._id}
              card={card}
              columnId={column._id}
              onOpenCard={onOpenCard}
              draggable={draggable}
              canArchive={archiveAvailable && normalizeColumnName(column.name) !== "archive"}
            />
          ))}

          {hideComposer ? null : !showComposer ? (
            <button
              type="button"
              onClick={() => setShowComposer(true)}
              className="inline-flex h-7 items-center rounded-md px-2 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200"
            >
              + Add card
            </button>
          ) : (
            <form onSubmit={handleCreateCard} className="space-y-1.5">
              <input
                className={`${inputClass} h-8 px-2.5 text-xs`}
                value={newCardTitle}
                onChange={(event) => setNewCardTitle(event.target.value)}
                placeholder="Card title"
                autoFocus
                disabled={isCreatingCard}
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  className="inline-flex h-7 items-center justify-center px-1.5 text-xs text-zinc-500 transition hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-300"
                  onClick={() => {
                    setShowComposer(false);
                    setNewCardTitle("");
                  }}
                  disabled={isCreatingCard}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-7 items-center justify-center rounded-md bg-zinc-900 px-2.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  disabled={!trimmedNewCardTitle || isCreatingCard}
                >
                  {isCreatingCard ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function KanbanCard({
  card,
  columnId,
  onOpenCard,
  draggable,
  canArchive,
}: {
  card: CardModel;
  columnId: Id<"columns">;
  onOpenCard: (cardId: Id<"cards">) => void;
  draggable: boolean;
  canArchive: boolean;
}) {
  const archiveCard = useMutation(api.cards.archiveCard);
  const deleteCard = useMutation(api.cards.remove);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(card._id),
    data: { type: "card", columnId },
    disabled: !draggable,
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const summary = summarize(card.description);
  const isActive = card.isRunning === true;
  const activeSessionSummary = describeCardRunState(card);
  const assigneeName = resolveAgentName(card.agentId);
  const reviewerName = resolveAgentName(card.reviewerId);
  const assigneeAvatarUrl = resolveAgentAvatarUrl(card.agentId);
  const reviewerAvatarUrl = resolveAgentAvatarUrl(card.reviewerId);
  const hasAssignee = Boolean(card.agentId);
  const hasReviewer = Boolean(card.reviewerId);
  const cardMetaTags = ([
    card.priority
      ? {
          key: `priority-${card.priority}`,
          label: card.priority,
          className:
            card.priority === "High"
              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
              : card.priority === "Medium"
                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200",
        }
      : null,
    card.size
      ? {
          key: `size-${card.size}`,
          label: card.size,
          className:
            card.size === "L"
              ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-200"
              : card.size === "M"
                ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300",
        }
      : null,
    card.type
      ? {
          key: `type-${card.type}`,
          label: card.type === "feature" ? "🧩" : card.type === "bug" ? "🐞" : "🎨",
          title:
            card.type === "feature" ? "Feature" : card.type === "bug" ? "Bug" : "Cosmetic change",
          className:
            card.type === "feature"
              ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/70 dark:bg-fuchsia-950/40 dark:text-fuchsia-200"
              : card.type === "bug"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
                : "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900/70 dark:bg-pink-950/40 dark:text-pink-200",
        }
      : null,
    card.source === "extension"
      ? {
          key: "source-extension",
          label: "Extension",
          title: "Created from extension",
          icon: <Chrome className="h-4 w-4" aria-hidden="true" />,
          iconOnly: true,
          plainIcon: true,
          className: "text-indigo-600 dark:text-indigo-300",
        }
      : null,
    card.acp
      ? {
          key: `acp-${card.acp}`,
          label: `${card.acp}`,
          className:
            "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200",
        }
      : null,
  ] as Array<CardMetaTag | null>).filter((tag): tag is CardMetaTag => Boolean(tag));

  useEffect(() => {
    if (!menuPosition) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuPosition(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuPosition(null);
      }
    };

    const handleViewportChange = () => {
      setMenuPosition(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [menuPosition]);

  async function handleDeleteCard() {
    setMenuPosition(null);

    const confirmed = window.confirm(`Delete "${card.title}"?`);
    if (!confirmed) return;

    try {
      await deleteCard({ cardId: card._id });
      toast.success("Card deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete card");
    }
  }

  async function handleArchiveCard() {
    setMenuPosition(null);

    try {
      await archiveCard({ cardId: card._id });
      toast.success("Card archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive card");
    }
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 184;
    const menuHeight = canArchive ? 124 : 92;

    setMenuPosition({
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth - 12)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - menuHeight - 12)),
    });
  }

  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        title={activeSessionSummary || undefined}
        {...attributes}
        {...listeners}
        onClick={() => onOpenCard(card._id)}
        onContextMenu={handleContextMenu}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={`group relative w-full touch-pan-y select-none [-webkit-touch-callout:none] [-webkit-user-select:none] ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} overflow-hidden rounded-xl border bg-white px-3 py-2 text-left transition duration-200 dark:bg-zinc-900 ${
          isActive
            ? "border-transparent shadow-[0_10px_26px_-22px_rgba(56,189,248,0.5)] hover:shadow-[0_12px_30px_-20px_rgba(56,189,248,0.7)]"
            : "border-zinc-200 hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700"
        } ${isDragging ? "opacity-0" : ""}`}
      >
        {isActive ? (
          <>
            <span className="pointer-events-none absolute inset-[-140%] animate-[spin_2.6s_linear_infinite] opacity-95 transition-opacity duration-200 group-hover:opacity-100 bg-[conic-gradient(from_0deg,rgba(56,189,248,0)_0deg,rgba(56,189,248,0)_245deg,rgba(56,189,248,1)_292deg,rgba(110,231,255,1)_322deg,rgba(16,185,129,0.92)_346deg,rgba(56,189,248,0)_360deg)]" />
            <span className="pointer-events-none absolute inset-[1px] rounded-[calc(theme(borderRadius.xl)-1px)] bg-white dark:bg-zinc-900" />
            <span className="pointer-events-none absolute inset-0 rounded-[inherit] transition-shadow duration-200 shadow-[0_0_0_1px_rgba(56,189,248,0.34),0_0_18px_-16px_rgba(56,189,248,0.7)] group-hover:shadow-[0_0_0_1px_rgba(56,189,248,0.56),0_0_28px_-14px_rgba(56,189,248,0.95)]" />
          </>
        ) : null}
        <div className="relative min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">{card.title}</div>
        </div>
        {summary ? <div className="mt-1 whitespace-pre-line break-words text-xs text-zinc-500 dark:text-zinc-400">{summary}</div> : null}
        {cardMetaTags.length > 0 || hasAssignee || hasReviewer ? (
          <div className="mt-2 flex items-start justify-between gap-2">
            {cardMetaTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {cardMetaTags.map((tag) => (
                  <span
                    key={tag.key}
                    title={tag.title}
                    className={
                      tag.plainIcon
                        ? `inline-flex h-6 w-6 items-center justify-center ${tag.className}`
                        : `inline-flex h-6 items-center rounded-full border text-[10px] font-medium ${tag.iconOnly ? "w-6 justify-center px-0" : "px-2"} ${tag.className}`
                    }
                  >
                    {tag.icon ? (
                      <>
                        <span className="sr-only">{tag.label}</span>
                        {tag.icon}
                      </>
                    ) : (
                      tag.label
                    )}
                  </span>
                ))}
              </div>
            ) : null}
            {hasAssignee || hasReviewer ? (
              <div className="ml-auto flex shrink-0 items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {hasAssignee ? (
                  <div className="inline-flex items-center" title={`Assignee: ${assigneeName}`}>
                    <span className="sr-only">Assignee: {assigneeName}</span>
                    <AgentAvatar agentName={assigneeName} avatarUrl={assigneeAvatarUrl} size="sm" />
                  </div>
                ) : null}
                {hasReviewer ? (
                  <div className="inline-flex items-center" title={`Reviewer: ${reviewerName}`}>
                    <span className="sr-only">Reviewer: {reviewerName}</span>
                    <AgentAvatar agentName={reviewerName} avatarUrl={reviewerAvatarUrl} size="sm" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        </div>
      </button>

      {menuPosition ? (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-36 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: menuPosition.x, top: menuPosition.y }}
        >
          {canArchive ? (
            <button
              type="button"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={handleArchiveCard}
            >
              Archive card
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            onClick={handleDeleteCard}
          >
            Delete card
          </button>
        </div>
      ) : null}
    </>
  );
}

function CardModal({
  card,
  columns,
  boards,
  agentOptions,
  skillOptions,
  skillError,
  skillsLoading,
  modelOptions,
  acpOptions,
  acpLoading,
  onClose,
}: {
  card: CardModel;
  columns: ColumnModel[];
  boards: BoardModel[];
  agentOptions: AgentOption[];
  skillOptions: SkillOption[];
  skillError?: string | null;
  skillsLoading?: boolean;
  modelOptions: ModelOption[];
  acpOptions: AcpOption[];
  acpLoading: boolean;
  onClose: () => void;
}) {
  const updateCard = useMutation(api.cards.update);
  const deleteCard = useMutation(api.cards.remove);
  const moveCard = useMutation(api.cards.moveToColumn);
  const moveToBoard = useMutation(api.cards.moveToBoard);
  const addComment = useMutation(api.comments.add);
  const comments = useQuery(api.comments.listByCard, {
    cardId: card._id,
  }) as CommentModel[] | undefined;

  const [titleDraft, setTitleDraft] = useState(card.title);
  const [descriptionDraft, setDescriptionDraft] = useState(card.description ?? "");
  const [columnDraft, setColumnDraft] = useState<Id<"columns">>(card.columnId);
  const [moveBoardDraft, setMoveBoardDraft] = useState<"current" | Id<"boards">>("current");
  const [agentDraft, setAgentDraft] = useState(card.agentId ?? "");
  const [reviewerDraft, setReviewerDraft] = useState(card.reviewerId ?? "");
  const [priorityDraft, setPriorityDraft] = useState(
    card.priority === "Low" || card.priority === "Medium" || card.priority === "High"
      ? card.priority
      : "",
  );
  const [sizeDraft, setSizeDraft] = useState(
    card.size === "S" || card.size === "M" || card.size === "L" ? card.size : "",
  );
  const [typeDraft, setTypeDraft] = useState(
    card.type === "feature" || card.type === "bug" || card.type === "cosmetic" ? card.type : "",
  );
  const [acpDraft, setAcpDraft] = useState(card.acp?.trim() ?? "");
  const [modelDraft, setModelDraft] = useState(card.model?.trim() ?? "");
  const [skillsDraft, setSkillsDraft] = useState<string[]>(card.skills ?? []);
  const [commentDraft, setCommentDraft] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [isDeletingCard, setIsDeletingCard] = useState(false);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  function handleEditorSubmitShortcut(
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const agentOptionsById = useMemo(
    () => new Map(agentOptions.map((agent) => [agent.id, agent] as const)),
    [agentOptions],
  );

  const availableSkillOptions = useMemo(() => {
    const seen = new Set<string>();

    return skillOptions.filter((option) => {
      const key = option.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [skillOptions]);

  const availableAcpOptions = useMemo(() => {
    const seen = new Set<string>();
    const normalizedCurrent = acpDraft.trim();
    const baseOptions = [...acpOptions];
    const currentIndex = normalizedCurrent
      ? baseOptions.findIndex((option) => option.id.trim().toLowerCase() === normalizedCurrent.toLowerCase())
      : -1;

    if (currentIndex >= 0) {
      baseOptions[currentIndex] = {
        ...baseOptions[currentIndex],
        id: normalizedCurrent,
        label: normalizedCurrent,
      };
    } else if (normalizedCurrent) {
      baseOptions.push({ id: normalizedCurrent, label: normalizedCurrent });
    }

    return baseOptions.filter((option) => {
      const key = option.id.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [acpDraft, acpOptions]);

  const currentBoard = useMemo(
    () => boards.find((board) => board._id === card.boardId) ?? null,
    [boards, card.boardId],
  );
  const canMoveAcrossBoards = currentBoard?.isOwner === true;
  const runStatus = card.isRunning ? "running" : card.lastRunStatus;
  const cardIdTitle = String(card._id);
  const sessionTitle = card.lastSessionId ? card.lastSessionId : "No worker run recorded yet";
  const sessionChatUrl = buildSessionChatUrl(card.lastSessionId, card.lastSessionAgentId ?? card.agentId);
  const normalizedSavedDescription = (card.description ?? "").trim();
  const normalizedDescriptionDraft = descriptionDraft.trim();
  const hasDescriptionChanges = normalizedDescriptionDraft !== normalizedSavedDescription;

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  }

  useEffect(() => {
    if (availableSkillOptions.length === 0) return;

    const eligibleSkillNames = new Set(availableSkillOptions.map((skill) => skill.name.toLowerCase()));

    setSkillsDraft((current) =>
      current.filter((skill) => eligibleSkillNames.has(skill.trim().toLowerCase())),
    );
  }, [availableSkillOptions]);

  function toggleSkill(skillName: string) {
    setSkillsDraft((current) => {
      const hasSkill = current.some((skill) => skill.toLowerCase() === skillName.toLowerCase());
      if (hasSkill) {
        return current.filter((skill) => skill.toLowerCase() !== skillName.toLowerCase());
      }

      return [...current, skillName];
    });
  }

  function handleModelChange(value: string) {
    setModelDraft(value);
    if (value) {
      setAcpDraft("");
    }
  }

  function handleAcpChange(value: string) {
    setAcpDraft(value);
    if (value) {
      setModelDraft("");
    }
  }

  async function submitComment() {
    const body = commentDraft.trim();
    if (!body || isSavingComment) return;

    setIsSavingComment(true);
    try {
      await addComment({
        cardId: card._id,
        body,
      });
      setCommentDraft("");
    } finally {
      setIsSavingComment(false);
    }
  }

  async function handleCommentSend() {
    await submitComment();
  }

  async function handleDescriptionSave() {
    if (!hasDescriptionChanges || isSavingDescription || isSavingCard || isDeletingCard) {
      return;
    }

    setIsSavingDescription(true);

    try {
      await updateCard({
        cardId: card._id,
        title: card.title,
        description: descriptionDraft,
        agentId: card.agentId ?? "",
        reviewerId: card.reviewerId ?? "",
        priority: card.priority ?? "",
        size: card.size ?? "",
        type: card.type ?? "",
        acp: card.acp ?? "",
        model: card.model ?? "",
        skills: card.skills ?? [],
      });
      toast.success("Description updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update description");
    } finally {
      setIsSavingDescription(false);
    }
  }

  async function handleCommentKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await submitComment();
  }

  function formatCommentTime(timestamp: number) {
    const elapsedMs = Date.now() - timestamp;

    if (elapsedMs < 60_000) {
      return "just now";
    }

    const ranges = [
      { maxMs: 3_600_000, unitMs: 60_000, suffix: "m" },
      { maxMs: 86_400_000, unitMs: 3_600_000, suffix: "h" },
      { maxMs: 2_592_000_000, unitMs: 86_400_000, suffix: "d" },
      { maxMs: 31_536_000_000, unitMs: 2_592_000_000, suffix: "mo" },
    ];

    for (const range of ranges) {
      if (elapsedMs < range.maxMs) {
        return `${Math.max(1, Math.floor(elapsedMs / range.unitMs))}${range.suffix} ago`;
      }
    }

    return `${Math.max(1, Math.floor(elapsedMs / 31_536_000_000))}y ago`;
  }

  function resolveCommentAuthor(comment: CommentModel) {
    const normalizedAuthorId = comment.authorId?.trim();
    const agent = normalizedAuthorId ? agentOptionsById.get(normalizedAuthorId) : undefined;

    if (comment.authorType === "agent") {
      return {
        name: agent?.name ?? resolveAgentName(normalizedAuthorId),
        avatarUrl: agent?.avatarUrl ?? resolveAgentAvatarUrl(normalizedAuthorId),
        emoji: agent?.emoji,
      };
    }

    const fallbackName = comment.authorType === "system" ? "System" : "Human";
    const humanLabel = comment.authorLabel?.trim() || comment.authorEmail?.trim() || fallbackName;

    return {
      name: humanLabel,
      avatarUrl: null,
      emoji: undefined,
      fallbackIcon: comment.authorType === "human" ? ("user" as const) : undefined,
    };
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSavingCard || isDeletingCard) {
      return;
    }

    const parsedSkills = skillsDraft.map((skill) => skill.trim()).filter(Boolean);

    setIsSavingCard(true);

    try {
      await updateCard({
        cardId: card._id,
        title: titleDraft,
        description: descriptionDraft,
        agentId: agentDraft,
        reviewerId: reviewerDraft,
        priority: priorityDraft,
        size: sizeDraft,
        type: typeDraft,
        acp: acpDraft,
        model: modelDraft,
        skills: parsedSkills,
      });

      const selectedColumnName = columns.find((column) => column._id === columnDraft)?.name;

      if (moveBoardDraft !== "current" && moveBoardDraft !== card.boardId) {
        await moveToBoard({
          cardId: card._id,
          targetBoardId: moveBoardDraft,
          targetColumnName: selectedColumnName,
        });
        onClose();
        return;
      }

      if (columnDraft !== card.columnId) {
        await moveCard({
          cardId: card._id,
          targetColumnId: columnDraft,
        });
      }

      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save card");
    } finally {
      setIsSavingCard(false);
    }
  }

  async function handleDelete() {
    if (isDeletingCard || isSavingCard) {
      return;
    }

    const confirmed = window.confirm(`Delete "${card.title}"?`);
    if (!confirmed) return;

    setIsDeletingCard(true);

    try {
      await deleteCard({ cardId: card._id });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete card");
    } finally {
      setIsDeletingCard(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[1px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-zinc-900 sm:h-[min(92vh,760px)] sm:w-[min(96vw,920px)] sm:rounded-2xl sm:border sm:border-zinc-200 dark:sm:border-zinc-800"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] sm:pt-0">
          <div className="hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:overflow-hidden">
            <div className="hide-scrollbar shrink-0 space-y-5 p-4 pb-6 sm:p-5 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit card</div>
                  {card.source === "extension" ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center text-indigo-600 dark:text-indigo-300" title="Created from extension">
                      <span className="sr-only">Extension</span>
                      <Chrome className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
                    onClick={() => void copyValue(String(card._id), "Card ID")}
                    title={cardIdTitle}
                    aria-label="Copy card ID"
                  >
                    <Hash className="h-4 w-4" />
                  </button>
                  {sessionChatUrl ? (
                    <a
                      href={sessionChatUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white transition dark:bg-zinc-900 border-zinc-200 ${getRunTone(runStatus)} hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600`}
                      title={sessionTitle}
                      aria-label="Open worker session chat"
                    >
                      <Clock3 className="h-4 w-4" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={!card.lastSessionId}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white transition dark:bg-zinc-900 ${
                        card.lastSessionId
                          ? `border-zinc-200 ${getRunTone(runStatus)} hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600`
                          : "cursor-not-allowed border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700"
                      }`}
                      onClick={() => (card.lastSessionId ? void copyValue(card.lastSessionId, "Session ID") : undefined)}
                      title={sessionTitle}
                      aria-label="Copy session ID"
                    >
                      <Clock3 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Title</label>
                <input
                  autoFocus
                  className={`${inputClass} h-10`}
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={handleEditorSubmitShortcut}
                  placeholder="Card title"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Description</label>
                  <div className="relative h-4 min-w-[64px]">
                    {hasDescriptionChanges ? (
                      <button
                        type="button"
                        className="absolute right-0 top-1/2 inline-flex h-5 -translate-y-1/2 items-center justify-center rounded border border-zinc-300 bg-white/90 px-1.5 text-[10px] font-medium leading-none text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        onClick={() => void handleDescriptionSave()}
                        disabled={isSavingDescription || isSavingCard || isDeletingCard}
                      >
                        {isSavingDescription ? "Updating…" : "Update"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <textarea
                  className={`${textareaClass} min-h-40`}
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  onKeyDown={handleEditorSubmitShortcut}
                  placeholder="Add a description..."
                />
              </div>

              {card.extensionContext ? (
                <div>
                  <div className="mb-2">
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Extension context</label>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
                    <p className="whitespace-pre-wrap">{card.extensionContext}</p>
                  </div>
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Discussion</label>
                <div className="space-y-2">
                  {comments === undefined ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading comments...</p>
                  ) : comments.length > 0 ? (
                    <div className="hide-scrollbar max-h-48 space-y-3 overflow-y-auto pr-1">
                      {comments.map((comment) => {
                        const author = resolveCommentAuthor(comment);

                        return (
                          <div key={comment._id} className="flex items-start gap-3">
                            <AgentAvatar
                              agentName={author.name}
                              avatarUrl={author.avatarUrl}
                              emoji={author.emoji}
                              fallbackIcon={author.fallbackIcon}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">{author.name}</span>
                                <span>{formatCommentTime(comment.createdAt)}</span>
                              </div>
                              <div className="space-y-2">{renderCommentBody(comment.body)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <input
                      className={inputClass}
                      placeholder="Add a comment..."
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      onKeyDown={handleCommentKeyDown}
                    />
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      onClick={handleCommentSend}
                      disabled={!commentDraft.trim() || isSavingComment}
                      aria-label="Send comment"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <aside className="hide-scrollbar shrink-0 space-y-3 border-t border-zinc-200 bg-zinc-50/60 p-4 pb-6 dark:border-zinc-800 dark:bg-zinc-950/60 lg:min-h-0 lg:overflow-y-auto lg:border-t-0">

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Agent</label>
                <AgentSelect value={agentDraft} options={agentOptions} onChange={setAgentDraft} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Reviewer</label>
                <AgentSelect value={reviewerDraft} options={agentOptions} onChange={setReviewerDraft} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Priority</label>
                <ChoiceChips value={priorityDraft} options={["Low", "Medium", "High"]} onChange={setPriorityDraft} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Size</label>
                <ChoiceChips value={sizeDraft} options={["S", "M", "L"]} onChange={setSizeDraft} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Type</label>
                <ChoiceChips value={typeDraft} options={cardTypeOptions} onChange={setTypeDraft} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Model</label>
                <ModelSelect value={modelDraft} options={modelOptions} onChange={handleModelChange} />
                {modelDraft ? (
                  <div className="mt-1 break-all text-[11px] text-zinc-500 dark:text-zinc-400">{modelDraft}</div>
                ) : null}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">ACP</label>
                {availableAcpOptions.length === 0 ? (
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">
                    {acpLoading ? "Loading ACP agents..." : "No ACP agents detected from the current config."}
                  </div>
                ) : (
                  <ChoiceChips
                    value={acpDraft}
                    options={availableAcpOptions.map((option) => ({ value: option.id, label: option.label }))}
                    onChange={handleAcpChange}
                  />
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Column</label>
                <select
                  className={`${inputClass} h-9`}
                  value={columnDraft}
                  onChange={(event) => setColumnDraft(event.target.value as Id<"columns">)}
                >
                  {columns.map((column) => (
                    <option key={column._id} value={column._id}>
                      {formatColumnName(column.name)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Move to board</label>
                <select
                  className={`${inputClass} h-9`}
                  value={moveBoardDraft}
                  disabled={!canMoveAcrossBoards}
                  onChange={(event) =>
                    setMoveBoardDraft(
                      event.target.value === 'current' ? 'current' : (event.target.value as Id<'boards'>),
                    )
                  }
                >
                  <option value="current">Current board</option>
                  {boards
                    .filter((board) => board._id !== card.boardId && board.isOwner)
                    .map((board) => (
                      <option key={board._id} value={board._id}>
                        {board.name}
                      </option>
                    ))}
                </select>
                {!canMoveAcrossBoards ? (
                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Only board owners can move cards across boards.
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Skills</label>
                <div className="flex flex-wrap gap-1.5">
                  {availableSkillOptions.length === 0 ? (
                    <span className={`text-xs ${skillError ? "text-amber-600 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"}`}>
                      {skillsLoading ? "Loading skills..." : skillError ?? "No skills available"}
                    </span>
                  ) : (
                    availableSkillOptions.map((skill) => {
                      const selected = skillsDraft.some(
                        (currentSkill) => currentSkill.toLowerCase() === skill.name.toLowerCase(),
                      );

                      return (
                        <button
                          key={skill.name}
                          type="button"
                          onClick={() => toggleSkill(skill.name)}
                          className={`rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
                            selected
                              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {skill.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-200 bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:px-6 sm:pb-3">
            <button
              type="button"
              className="text-sm text-zinc-500 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-rose-400"
              onClick={handleDelete}
              disabled={isSavingDescription || isSavingCard || isDeletingCard}
            >
              {isDeletingCard ? "Deleting…" : "Delete card"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-300"
                onClick={onClose}
                disabled={isSavingDescription || isSavingCard || isDeletingCard}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={!titleDraft.trim() || isSavingDescription || isSavingCard || isDeletingCard}
              >
                {isSavingCard ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/70">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">{description}</p>
    </section>
  );
}
