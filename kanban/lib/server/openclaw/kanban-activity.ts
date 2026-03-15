import { join } from "node:path";
import { readFile } from "node:fs/promises";

import { runOpenClawJson } from "@/lib/server/openclaw/cli";

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const MAX_SESSIONS_TO_SCAN = 24;
const KANBAN_ACTIVITY_MARKERS = [
  "Read the kanban skill first. Run one cron-safe SuperClaw Kanban worker pass",
  "/agent/kanban/inbox",
  "/agent/kanban/transition",
  "/agent/kanban/comment",
] as const;

type OpenClawSession = {
  key?: string;
  updatedAt?: number;
  sessionId?: string;
  agentId?: string;
};

type OpenClawSessionsResponse = {
  sessions?: OpenClawSession[];
};

export type ActiveKanbanCardSession = {
  sessionId: string;
  sessionKey: string;
  agentId: string;
  updatedAt: number;
};

function resolveSessionFile(agentId: string, sessionId: string) {
  return join("/root/.openclaw/agents", agentId, "sessions", `${sessionId}.jsonl`);
}

function isRecentSession(session: OpenClawSession, now: number) {
  return Boolean(
    session.sessionId &&
      session.agentId &&
      session.key &&
      typeof session.updatedAt === "number" &&
      now - session.updatedAt <= ACTIVE_WINDOW_MS,
  );
}

function looksLikeKanbanWorkerTranscript(content: string) {
  return KANBAN_ACTIVITY_MARKERS.some((marker) => content.includes(marker));
}

function extractMatchingCardIds(content: string, cardIds: Set<string>) {
  const matches = new Set<string>();

  for (const match of content.matchAll(/"cardId":"([^"]+)"/g)) {
    const cardId = match[1]?.trim();
    if (cardId && cardIds.has(cardId)) {
      matches.add(cardId);
    }
  }

  return matches;
}

export async function listActiveKanbanCardSessions(cardIds: string[]) {
  const normalizedCardIds = Array.from(new Set(cardIds.map((cardId) => cardId.trim()).filter(Boolean)));

  if (normalizedCardIds.length === 0) {
    return {} as Record<string, ActiveKanbanCardSession[]>;
  }

  const now = Date.now();
  const recentMinutes = Math.max(1, Math.ceil(ACTIVE_WINDOW_MS / 60_000));
  const response = await runOpenClawJson<OpenClawSessionsResponse>(
    ["sessions", "--all-agents", "--active", String(recentMinutes), "--json"],
    { sessions: [] },
  );

  const cardIdSet = new Set(normalizedCardIds);
  const activeByCardId = new Map<string, ActiveKanbanCardSession[]>();
  const recentSessions = (response.sessions ?? [])
    .filter((session) => isRecentSession(session, now))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, MAX_SESSIONS_TO_SCAN);

  await Promise.all(
    recentSessions.map(async (session) => {
      const agentId = session.agentId!;
      const sessionId = session.sessionId!;
      const sessionKey = session.key!;
      const updatedAt = session.updatedAt!;

      let transcript = "";
      try {
        transcript = await readFile(resolveSessionFile(agentId, sessionId), "utf8");
      } catch {
        return;
      }

      if (!looksLikeKanbanWorkerTranscript(transcript)) {
        return;
      }

      const matchedCardIds = extractMatchingCardIds(transcript, cardIdSet);

      for (const cardId of matchedCardIds) {
        const entries = activeByCardId.get(cardId) ?? [];

        if (!entries.some((entry) => entry.sessionId === sessionId)) {
          entries.push({ sessionId, sessionKey, agentId, updatedAt });
          activeByCardId.set(cardId, entries);
        }
      }
    }),
  );

  return Object.fromEntries(
    Array.from(activeByCardId.entries()).map(([cardId, sessions]) => [
      cardId,
      sessions.sort((a, b) => b.updatedAt - a.updatedAt),
    ]),
  ) as Record<string, ActiveKanbanCardSession[]>;
}

export { ACTIVE_WINDOW_MS };
