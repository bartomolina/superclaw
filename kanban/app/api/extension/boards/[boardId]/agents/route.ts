import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";

import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { getExtensionErrorStatus, jsonError, NO_STORE_HEADERS, readExtensionCredential } from "@/lib/server/extension-api-auth";
import { fetchAgentOptions } from "@/lib/server/options-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ boardId: string }> },
) {
  let credential: string;

  try {
    credential = readExtensionCredential(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extension credential is required";
    return jsonError(message, getExtensionErrorStatus(message));
  }

  const { boardId } = await context.params;

  if (!boardId.trim()) {
    return jsonError("Board ID is required", 400);
  }

  try {
    const [access, agents] = await Promise.all([
      fetchQuery(api.extension_api.getBoardAgentAccess, {
        token: credential,
        boardId: boardId as Id<"boards">,
      }),
      fetchAgentOptions(),
    ]);

    const filteredAgents = access.restricted
      ? agents.filter((agent) => access.allowedAgentIds.includes(String(agent.id).trim()))
      : agents;

    return NextResponse.json(
      {
        ok: true,
        agents: filteredAgents,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load agents";
    return jsonError(message, getExtensionErrorStatus(message));
  }
}
