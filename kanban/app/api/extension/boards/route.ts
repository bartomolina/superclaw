import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import { getExtensionErrorStatus, jsonError, NO_STORE_HEADERS, readExtensionCredential } from "@/lib/server/extension-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let credential: string;

  try {
    credential = readExtensionCredential(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extension credential is required";
    return jsonError(message, getExtensionErrorStatus(message));
  }

  try {
    const result = await fetchQuery(api.extension_api.listBoards, {
      token: credential,
    });

    return NextResponse.json(
      {
        ok: true,
        boards: result.boards,
        defaultBoardId: result.defaultBoardId,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load boards";
    return jsonError(message, getExtensionErrorStatus(message));
  }
}
