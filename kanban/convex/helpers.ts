import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const ORDER_STEP = 1_000;

export function getNextOrder(items: Array<{ order: number }>) {
  const lastItem = items.at(-1);
  return lastItem ? lastItem.order + ORDER_STEP : ORDER_STEP;
}

export function normalizeText(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function optionalUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Board URL must be a valid http(s) URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Board URL must be a valid http(s) URL.");
  }

  return parsed.toString();
}

export async function touchBoard(
  ctx: MutationCtx,
  boardId: Id<"boards">,
  updatedAt: number,
) {
  await ctx.db.patch(boardId, { updatedAt });
}
