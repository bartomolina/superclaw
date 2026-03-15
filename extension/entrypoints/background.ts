import type { ExtensionMessage } from "@/utils/messaging";
import { apiUrl, apiToken, selectedBoard } from "@/utils/storage";

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
// API helpers (stubbed for Phase 1 — will wire to real backend in Phase 2)
// ---------------------------------------------------------------------------

async function submitAnnotations(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const url = await apiUrl.getValue();
  const token = await apiToken.getValue();
  const board = await selectedBoard.getValue();

  console.log("[SuperClaw] Would submit annotations to:", url, {
    ...payload,
    boardId: (payload.boardId as string) || board || undefined,
  });

  // Stubbed — return success without actually calling the backend
  void token; // will be used in Phase 2
  return { ok: true };
}

async function fetchBoards(): Promise<{
  ok: boolean;
  boards?: unknown[];
  error?: string;
}> {
  console.log("[SuperClaw] fetchBoards stubbed");
  return { ok: true, boards: [] };
}

async function fetchColumns(
  boardId: string,
): Promise<{ ok: boolean; columns?: unknown[]; error?: string }> {
  console.log("[SuperClaw] fetchColumns stubbed for board:", boardId);
  return { ok: true, columns: [] };
}

async function fetchAgents(): Promise<{
  ok: boolean;
  agents?: unknown[];
  error?: string;
}> {
  console.log("[SuperClaw] fetchAgents stubbed");
  return { ok: true, agents: [] };
}
