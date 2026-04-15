export type CardRunStatus = "running" | "done" | "failed" | "aborted";

export type SearchableCard = {
  title: string;
  description?: string;
};

export type CardRunState = {
  isRunning?: boolean;
  lastSessionId?: string;
  lastSessionAgentId?: string;
  lastSessionUpdatedAt?: number;
  lastRunStatus?: CardRunStatus;
};

const columnToneByName: Record<string, string> = {
  ideas: "text-violet-700 dark:text-violet-300",
  todo: "text-zinc-700 dark:text-zinc-200",
  inprogress: "text-sky-700 dark:text-sky-300",
  review: "text-amber-700 dark:text-amber-300",
  done: "text-emerald-700 dark:text-emerald-300",
  archive: "text-zinc-500 dark:text-zinc-400",
};

export function normalizeColumnName(columnName: string) {
  return columnName.toLowerCase().replace(/\s+/g, "");
}

export function getColumnTone(columnName: string) {
  const normalized = normalizeColumnName(columnName);
  return columnToneByName[normalized] || "text-zinc-700 dark:text-zinc-200";
}

export function formatColumnName(columnName: string) {
  const normalized = normalizeColumnName(columnName);

  if (normalized === "todo") return "TODO";
  if (normalized === "ideas") return "Ideas";
  if (normalized === "inprogress") return "In Progress";
  if (normalized === "review") return "Review";
  if (normalized === "done") return "Done";
  if (normalized === "archive") return "Archive";

  return columnName.trim();
}

export function summarize(text?: string) {
  const normalized = text?.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalized.length > 120 ? `${normalized.slice(0, 117).trimEnd()}...` : normalized;
}

export function cardMatchesSearch(card: SearchableCard, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return true;

  const haystack = `${card.title}\n${card.description ?? ""}`.toLowerCase();
  return haystack.includes(normalizedQuery);
}

export function maskEmail(email: string) {
  void email;
  // Always fully redact email addresses in the UI.
  return "••••••••";
}

export function buildSessionKey(sessionId?: string, agentId?: string) {
  const normalizedSessionId = sessionId?.trim();
  const normalizedAgentId = agentId?.trim();

  if (!normalizedSessionId || !normalizedAgentId) {
    return null;
  }

  const expectedPrefix = `kanban-manual-${normalizedAgentId}-`;
  if (!normalizedSessionId.startsWith(expectedPrefix)) {
    return null;
  }

  const runUuid = normalizedSessionId.slice(expectedPrefix.length).trim();
  if (!runUuid) {
    return null;
  }

  return `agent:${normalizedAgentId}:kanban-manual:${runUuid}`;
}

export function buildSessionChatUrl(sessionId?: string, agentId?: string) {
  const sessionKey = buildSessionKey(sessionId, agentId);
  if (!sessionKey) {
    return null;
  }

  return `http://localhost:18789/chat?session=${encodeURIComponent(sessionKey)}`;
}

export function formatRelativeActivityTime(timestamp: number) {
  const elapsedMs = Math.max(0, Date.now() - timestamp);

  if (elapsedMs < 60_000) {
    return "just now";
  }

  if (elapsedMs < 3_600_000) {
    return `${Math.max(1, Math.floor(elapsedMs / 60_000))}m ago`;
  }

  if (elapsedMs < 86_400_000) {
    return `${Math.max(1, Math.floor(elapsedMs / 3_600_000))}h ago`;
  }

  return `${Math.max(1, Math.floor(elapsedMs / 86_400_000))}d ago`;
}

export function formatRunStatusLabel(status?: CardRunStatus) {
  if (status === "running") return "Running";
  if (status === "done") return "Done";
  if (status === "failed") return "Failed";
  if (status === "aborted") return "Aborted";
  return "Idle";
}

export function getRunTone(status?: CardRunStatus) {
  if (status === "running") {
    return "text-sky-600 dark:text-sky-300";
  }

  if (status === "done") {
    return "text-emerald-600 dark:text-emerald-300";
  }

  if (status === "failed") {
    return "text-rose-600 dark:text-rose-300";
  }

  if (status === "aborted") {
    return "text-amber-600 dark:text-amber-300";
  }

  return "text-zinc-500 dark:text-zinc-400";
}

export function describeCardRunState(card: CardRunState) {
  const status = card.isRunning ? "running" : card.lastRunStatus;

  if (!status || !card.lastSessionId) {
    return "";
  }

  const details = [formatRunStatusLabel(status)];

  if (card.lastSessionAgentId) {
    details.push(card.lastSessionAgentId);
  }

  if (typeof card.lastSessionUpdatedAt === "number") {
    details.push(formatRelativeActivityTime(card.lastSessionUpdatedAt));
  }

  details.push(card.lastSessionId);
  return details.join(" · ");
}
