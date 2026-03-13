import { NextRequest } from "next/server";

import { GATEWAY_TOKEN } from "@/lib/server/openclaw/constants";
import { json, parseBody } from "@/lib/server/openclaw/http";

export function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  return !!token && token === GATEWAY_TOKEN;
}

export async function handleVerify(req: NextRequest) {
  const body = await parseBody(req);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return json({ ok: false }, 401);
  if (token === GATEWAY_TOKEN) return json({ ok: true });
  return json({ ok: false }, 401);
}
