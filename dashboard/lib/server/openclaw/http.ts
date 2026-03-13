import { NextRequest } from "next/server";

import { toApiError } from "@/lib/server/errors";

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(error: unknown) {
  const apiError = toApiError(error);
  return json({ error: apiError.message }, apiError.status);
}

export async function parseBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
