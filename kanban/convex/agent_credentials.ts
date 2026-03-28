import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireMember } from "./access";

type Ctx = QueryCtx | MutationCtx;
type AgentCredentialDoc = Doc<"agentCredentials">;

function normalizeAgentIdForLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeAgentId(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Agent id is required");
  }

  return normalized;
}

export function normalizeAgentToken(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Agent token is required");
  }

  if (normalized.length < 24) {
    throw new Error("Agent token looks invalid");
  }

  return normalized;
}

function getCredentialPreview(token: string) {
  return `${token.slice(0, 4)}...${token.slice(-6)}`;
}

export async function hashAgentCredential(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function findDedicatedAgentCredential(
  ctx: Ctx,
  agentId: string,
): Promise<AgentCredentialDoc | null> {
  const normalizedAgentId = normalizeAgentIdForLookup(agentId);

  if (!normalizedAgentId) {
    return null;
  }

  return await ctx.db
    .query("agentCredentials")
    .withIndex("by_normalized_agent", (q) => q.eq("normalizedAgentId", normalizedAgentId))
    .unique();
}

async function requireSuperuser(ctx: Ctx) {
  const user = await requireMember(ctx);

  if (!user.isSuperuser) {
    throw new Error("Forbidden");
  }

  return user;
}

export const listCredentials = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperuser(ctx);

    const rows = await ctx.db.query("agentCredentials").collect();

    return rows
      .slice()
      .sort((a, b) => a.agentId.localeCompare(b.agentId))
      .map((row) => ({
        agentId: row.agentId,
        preview: row.tokenPreview,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastVerifiedAt: row.lastVerifiedAt ?? null,
      }));
  },
});

export const status = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSuperuser(ctx);

    const existing = await findDedicatedAgentCredential(ctx, args.agentId);

    return {
      agentId: normalizeAgentId(args.agentId),
      hasCredential: Boolean(existing),
      preview: existing?.tokenPreview ?? null,
      createdAt: existing?.createdAt ?? null,
      updatedAt: existing?.updatedAt ?? null,
      lastVerifiedAt: existing?.lastVerifiedAt ?? null,
    };
  },
});

export const saveCredential = mutation({
  args: {
    agentId: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireSuperuser(ctx);
    const agentId = normalizeAgentId(args.agentId);
    const normalizedAgentId = normalizeAgentIdForLookup(agentId);
    const token = normalizeAgentToken(args.token);
    const tokenHash = await hashAgentCredential(token);
    const tokenPreview = getCredentialPreview(token);
    const now = Date.now();

    const existing = await findDedicatedAgentCredential(ctx, agentId);

    if (existing) {
      await ctx.db.patch(existing._id, {
        agentId,
        normalizedAgentId,
        tokenHash,
        tokenPreview,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("agentCredentials", {
        agentId,
        normalizedAgentId,
        tokenHash,
        tokenPreview,
        createdAt: now,
        updatedAt: now,
        createdByUserId: user.userId,
        createdByEmail: user.email ?? undefined,
      });
    }

    return {
      agentId,
      preview: tokenPreview,
      updatedAt: now,
    };
  },
});

export const revokeCredential = mutation({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSuperuser(ctx);

    const existing = await findDedicatedAgentCredential(ctx, args.agentId);
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return null;
  },
});
