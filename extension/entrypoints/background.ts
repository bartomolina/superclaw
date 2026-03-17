import type { ExtensionMessage } from "@/utils/messaging";
import { extensionCredential, kanbanBaseUrl, selectedBoard } from "@/utils/storage";
import { createExtensionCard, listExtensionBoards, listExtensionColumns } from "@/utils/kanban";

export default defineBackground({
  main() {
    // Toggle annotation mode when extension icon is clicked
    browser.action.onClicked.addListener(async (tab) => {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, { type: "TOGGLE" });
      }
    });

    // Handle messages from content script and options page
    browser.runtime.onMessage.addListener(
      (message: ExtensionMessage, sender, sendResponse) => {
        if (message.type === "SUBMIT_ANNOTATIONS") {
          // Phase 2: wire up to real backend
          submitAnnotations(message.payload).then((result) => {
            sendResponse(result);
          });
          return true;
        }

        if (message.type === "UPDATE_BADGE") {
          const tabId = sender.tab?.id;
          if (tabId) {
            const count = message.count;
            browser.action.setBadgeText({
              text: count > 0 ? String(count) : "",
              tabId,
            });
            browser.action.setBadgeBackgroundColor({ color: "#3b82f6" });
          }
          return false;
        }

        if (message.type === "FETCH_BOARDS") {
          fetchBoards().then((result) => sendResponse(result));
          return true;
        }

        if (message.type === "FETCH_COLUMNS") {
          fetchColumns(message.boardId).then((result) => sendResponse(result));
          return true;
        }

        if (message.type === "FETCH_AGENTS") {
          fetchAgents().then((result) => sendResponse(result));
          return true;
        }

        if (message.type === "OPEN_SETTINGS") {
          browser.runtime.openOptionsPage();
          return false;
        }
      },
    );
  },
});

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function getConnectionSettings() {
  const [url, token] = await Promise.all([
    kanbanBaseUrl.getValue(),
    extensionCredential.getValue(),
  ]);

  if (!url.trim() || !token.trim()) {
    throw new Error("Set up and verify the Kanban connection in extension settings");
  }

  return {
    url,
    token,
  };
}

async function submitAnnotations(
  payload: Record<string, unknown>,
): Promise<{
  ok: boolean;
  error?: string;
  card?: { id: string; title: string };
  board?: { id: string; name: string };
  column?: { id: string; name: string };
}> {
  try {
    const { url, token } = await getConnectionSettings();
    const savedBoardId = await selectedBoard.getValue();
    const result = await createExtensionCard(url, token, {
      url: typeof payload.url === "string" ? payload.url : undefined,
      title: typeof payload.title === "string" ? payload.title : undefined,
      boardId:
        typeof payload.boardId === "string" && payload.boardId.trim()
          ? payload.boardId
          : savedBoardId || undefined,
      columnId: typeof payload.columnId === "string" ? payload.columnId : undefined,
      agentId: typeof payload.agentId === "string" ? payload.agentId : undefined,
      annotations: Array.isArray(payload.annotations)
        ? payload.annotations.map((annotation) => {
            const value = annotation as Record<string, unknown>;
            return {
              selector: typeof value.selector === "string" ? value.selector : undefined,
              component:
                typeof value.component === "string" ? value.component : undefined,
              text: typeof value.text === "string" ? value.text : undefined,
              tag: typeof value.tag === "string" ? value.tag : undefined,
              classes: typeof value.classes === "string" ? value.classes : undefined,
              note: typeof value.note === "string" ? value.note : undefined,
            };
          })
        : [],
    });

    return {
      ok: true,
      card: result.card,
      board: result.board,
      column: result.column,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create card",
    };
  }
}

async function fetchBoards(): Promise<{
  ok: boolean;
  boards?: Array<{ id: string; name: string; isOwner?: boolean }>;
  defaultBoardId?: string | null;
  error?: string;
}> {
  try {
    const { url, token } = await getConnectionSettings();
    const savedBoardId = await selectedBoard.getValue();
    const result = await listExtensionBoards(url, token);
    const hasSavedBoard = savedBoardId
      ? result.boards.some((board) => board.id === savedBoardId)
      : false;

    return {
      ok: true,
      boards: result.boards,
      defaultBoardId: hasSavedBoard ? savedBoardId : result.defaultBoardId,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load boards",
    };
  }
}

async function fetchColumns(
  boardId: string,
): Promise<{
  ok: boolean;
  columns?: Array<{ id: string; name: string }>;
  defaultColumnId?: string | null;
  error?: string;
}> {
  try {
    const { url, token } = await getConnectionSettings();
    const result = await listExtensionColumns(url, token, boardId);

    return {
      ok: true,
      columns: result.columns,
      defaultColumnId: result.defaultColumnId,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load columns",
    };
  }
}

async function fetchAgents(): Promise<{
  ok: boolean;
  agents?: unknown[];
  error?: string;
}> {
  console.log("[SuperClaw] fetchAgents stubbed");
  return { ok: true, agents: [] };
}
