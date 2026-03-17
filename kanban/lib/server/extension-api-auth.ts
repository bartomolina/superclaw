import { NextResponse } from "next/server";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const UNAUTHORIZED_MESSAGES = new Set([
  "Invalid extension credential",
  "Extension credential is no longer active",
]);

const BAD_REQUEST_MESSAGES = new Set([
  "No accessible boards are available",
  "Board has no columns",
  "Assigned agent is not allowed for this board",
]);

export function readExtensionCredential(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  const fromAuthorization = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const fromHeader = request.headers.get("x-extension-credential")?.trim();
  const credential = fromAuthorization || fromHeader;

  if (!credential) {
    throw new Error("Extension credential is required");
  }

  return credential;
}

export function getExtensionErrorStatus(message: string) {
  if (message === "Extension credential is required") {
    return 400;
  }

  if (UNAUTHORIZED_MESSAGES.has(message)) {
    return 401;
  }

  if (message === "Forbidden") {
    return 403;
  }

  if (message === "Board not found" || message === "Column not found" || message === "Column not found for board") {
    return 404;
  }

  if (BAD_REQUEST_MESSAGES.has(message)) {
    return 400;
  }

  return 500;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: NO_STORE_HEADERS });
}
