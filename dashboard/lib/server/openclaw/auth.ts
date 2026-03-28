import { timingSafeEqual } from "node:crypto";

import { NextRequest } from "next/server";

import { GATEWAY_TOKEN } from "@/lib/server/openclaw/constants";
import { json, parseBody } from "@/lib/server/openclaw/http";

function tokenMatches(candidate: string | null | undefined) {
  const expected = GATEWAY_TOKEN?.trim();
  const received = candidate?.trim();

  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  return tokenMatches(token);
}

export async function handleVerify(req: NextRequest) {
  const body = await parseBody(req);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return json({ ok: false }, 401);
  if (tokenMatches(token)) return json({ ok: true });
  return json({ ok: false }, 401);
}
