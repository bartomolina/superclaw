import { NextRequest } from "next/server";

import { ApiError } from "@/lib/server/errors";
import { requiredString } from "@/lib/server/validate";
import { gatewayCall } from "@/lib/server/openclaw/cli";
import { json, parseBody } from "@/lib/server/openclaw/http";

export function isDebugRpcEnabled() {
  const raw = String(process.env.DEBUG_RPC_ENABLED || "false").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function handleFeatures() {
  return json({ debugRpcEnabled: isDebugRpcEnabled() });
}

export async function handleDebugWs(req: NextRequest) {
  if (!isDebugRpcEnabled()) {
    return json({ error: "debug rpc disabled" }, 403);
  }

  const body = await parseBody(req);
  const wsMethod = requiredString(body.method, "method", 120);
  if (!/^[a-zA-Z0-9._-]+$/.test(wsMethod)) {
    throw new ApiError("invalid method", 400);
  }

  const params = typeof body.params === "object" && body.params !== null ? body.params : {};
  const result = await gatewayCall(wsMethod, params as Record<string, unknown>);
  return json({ ok: true, method: wsMethod, result });
}
