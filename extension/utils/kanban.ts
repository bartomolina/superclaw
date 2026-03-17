type VerifyConnectionResponse = {
  ok: true;
  user: {
    email: string;
    name?: string | null;
  };
  verifiedAt: number;
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

  let payload: Partial<VerifyConnectionResponse> & { ok?: boolean; error?: string };

  try {
    payload = (await response.json()) as Partial<VerifyConnectionResponse> & {
      ok?: boolean;
      error?: string;
    };
  } catch {
    throw new Error("Kanban app returned an invalid response");
  }

  if (!response.ok || payload.ok !== true || !payload.user || typeof payload.verifiedAt !== "number") {
    throw new Error(payload.error || "Connection failed");
  }

  return {
    baseUrl: normalizedBaseUrl,
    credential: normalizedCredential,
    user: payload.user,
    verifiedAt: payload.verifiedAt,
  };
}
