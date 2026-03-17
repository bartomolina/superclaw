import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";

import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { getExtensionErrorStatus, jsonError, NO_STORE_HEADERS, readExtensionCredential } from "@/lib/server/extension-api-auth";

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
    const result = await fetchQuery(api.extension_api.listColumns, {
      token: credential,
      boardId: boardId as Id<"boards">,
    });

    return NextResponse.json(
      {
        ok: true,
        columns: result.columns,
        defaultColumnId: result.defaultColumnId,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load columns";
    return jsonError(message, getExtensionErrorStatus(message));
  }
}
