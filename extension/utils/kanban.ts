type VerifyConnectionResponse = {
  ok: true;
  user: {
    email: string;
    name?: string | null;
  };
  verifiedAt: number;
};

type ErrorResponse = {
  ok?: boolean;
  error?: string;
};

export type ExtensionBoard = {
  id: string;
  name: string;
  isOwner?: boolean;
};

export type ExtensionColumn = {
  id: string;
  name: string;
};

export type ExtensionAgent = {
  id: string;
  name: string;
  emoji?: string;
  avatarUrl?: string | null;
};

type ListBoardsResponse = {
  ok: true;
  boards: ExtensionBoard[];
  defaultBoardId: string | null;
};

type ListColumnsResponse = {
  ok: true;
  columns: ExtensionColumn[];
  defaultColumnId: string | null;
};

type ListAgentsResponse = {
  ok: true;
  agents: ExtensionAgent[];
};

type CreateCardResponse = {
  ok: true;
  card: {
    id: string;
    title: string;
  };
  board: {
    id: string;
    name: string;
  };
  column: {
    id: string;
    name: string;
  };
  sourceLabel?: string | null;
};

export type ExtensionCreateCardPayload = {
  url?: string;
  title?: string;
  boardId?: string;
  columnId?: string;
  agentId?: string;
  annotations: Array<{
    selector?: string;
    component?: string | null;
    text?: string;
    tag?: string;
    classes?: string;
    note?: string;
  }>;
};

function normalizeWithProtocol(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Kanban base URL is required");
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function normalizeKanbanBaseUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(normalizeWithProtocol(value));
  } catch {
    throw new Error("Kanban base URL must be a valid http(s) URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Kanban base URL must be a valid http(s) URL");
  }

  return parsed.origin;
}

export function normalizeExtensionCredential(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Extension credential is required");
  }

  return normalized;
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string) {
  let payload: (T & ErrorResponse) | undefined;

  try {
    payload = (await response.json()) as T & ErrorResponse;
  } catch {
    throw new Error("Kanban app returned an invalid response");
  }

  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error || fallbackMessage);
  }

  return payload as T;
}

async function fetchExtensionApi<T>(
  baseUrl: string,
  credential: string,
  path: string,
  init?: RequestInit,
) {
  const normalizedBaseUrl = normalizeKanbanBaseUrl(baseUrl);
  const normalizedCredential = normalizeExtensionCredential(credential);

  let response: Response;

  try {
    response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${normalizedCredential}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new Error("Could not reach the Kanban app");
  }

  return await parseJsonResponse<T>(response, "Request failed");
}

export async function verifyExtensionConnection(baseUrl: string, credential: string) {
  const normalizedBaseUrl = normalizeKanbanBaseUrl(baseUrl);
  const normalizedCredential = normalizeExtensionCredential(credential);

  let response: Response;

  try {
    response = await fetch(`${normalizedBaseUrl}/api/extension-auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        credential: normalizedCredential,
      }),
    });
  } catch {
    throw new Error("Could not reach the Kanban app");
  }

  const payload = await parseJsonResponse<VerifyConnectionResponse>(response, "Connection failed");

  return {
    baseUrl: normalizedBaseUrl,
    credential: normalizedCredential,
    user: payload.user,
    verifiedAt: payload.verifiedAt,
  };
}

export async function listExtensionBoards(baseUrl: string, credential: string) {
  const payload = await fetchExtensionApi<ListBoardsResponse>(
    baseUrl,
    credential,
    "/api/extension/boards",
    { method: "GET" },
  );

  return payload;
}

export async function listExtensionColumns(baseUrl: string, credential: string, boardId: string) {
  if (!boardId.trim()) {
    throw new Error("Board is required");
  }

  const payload = await fetchExtensionApi<ListColumnsResponse>(
    baseUrl,
    credential,
    `/api/extension/boards/${encodeURIComponent(boardId)}/columns`,
    { method: "GET" },
  );

  return payload;
}

export async function listExtensionAgents(baseUrl: string, credential: string, boardId: string) {
  if (!boardId.trim()) {
    throw new Error("Board is required");
  }

  const payload = await fetchExtensionApi<ListAgentsResponse>(
    baseUrl,
    credential,
    `/api/extension/boards/${encodeURIComponent(boardId)}/agents`,
    { method: "GET" },
  );

  return payload;
}

export async function createExtensionCard(
  baseUrl: string,
  credential: string,
  payload: ExtensionCreateCardPayload,
) {
  const response = await fetchExtensionApi<CreateCardResponse>(
    baseUrl,
    credential,
    "/api/extension/cards",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return response;
}
