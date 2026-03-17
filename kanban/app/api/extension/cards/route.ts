import { fetchMutation } from "convex/nextjs";
import { NextResponse } from "next/server";

import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { getExtensionErrorStatus, jsonError, NO_STORE_HEADERS, readExtensionCredential } from "@/lib/server/extension-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateCardRequestBody = {
  boardId?: string;
  columnId?: string;
  agentId?: string;
  url?: string;
  title?: string;
  annotations?: Array<{
    note?: string;
    selector?: string;
    component?: string;
    text?: string;
    tag?: string;
    classes?: string;
  }>;
};

export async function POST(request: Request) {
  let credential: string;

  try {
    credential = readExtensionCredential(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extension credential is required";
    return jsonError(message, getExtensionErrorStatus(message));
  }

  let body: CreateCardRequestBody;

  try {
    body = (await request.json()) as CreateCardRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  const annotations = Array.isArray(body.annotations)
    ? body.annotations.map((annotation) => ({
        note: typeof annotation?.note === "string" ? annotation.note : undefined,
        selector: typeof annotation?.selector === "string" ? annotation.selector : undefined,
        component: typeof annotation?.component === "string" ? annotation.component : undefined,
        text: typeof annotation?.text === "string" ? annotation.text : undefined,
        tag: typeof annotation?.tag === "string" ? annotation.tag : undefined,
        classes: typeof annotation?.classes === "string" ? annotation.classes : undefined,
      }))
    : [];

  if (annotations.length === 0) {
    return jsonError("At least one annotation is required", 400);
  }

  try {
    const result = await fetchMutation(api.extension_api.createCard, {
      token: credential,
      boardId: body.boardId?.trim() ? (body.boardId.trim() as Id<"boards">) : undefined,
      columnId: body.columnId?.trim() ? (body.columnId.trim() as Id<"columns">) : undefined,
      agentId: body.agentId?.trim() || undefined,
      sourceTitle: body.title?.trim() || undefined,
      sourceUrl: body.url?.trim() || undefined,
      annotations,
    });

    return NextResponse.json(
      {
        ok: true,
        card: {
          id: result.cardId,
          title: result.title,
        },
        board: result.board,
        column: result.column,
        sourceLabel: result.sourceLabel,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create card";
    return jsonError(message, getExtensionErrorStatus(message));
  }
}
