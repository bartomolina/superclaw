import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { getSuperuserEmail, requireMember } from "./access";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

type ExtensionCredentialDoc = Doc<"extensionCredentials">;

export function normalizeCredential(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Extension credential is required");
  }

  if (normalized.length < 24) {
    throw new Error("Extension credential looks invalid");
  }

  return normalized;
}

function getCredentialPreview(token: string) {
  return `${token.slice(0, 4)}...${token.slice(-6)}`;
}

export async function hashCredential(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function canEmailUseKanban(ctx: QueryCtx | MutationCtx, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const superuserEmail = getSuperuserEmail();

  if (superuserEmail && normalizedEmail === superuserEmail) {
    return true;
  }

  const invitedUser = await ctx.db
    .query("managedUsers")
    .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
    .first();

  return Boolean(invitedUser);
}

export async function requireActiveExtensionCredential(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<ExtensionCredentialDoc> {
  const normalizedToken = normalizeCredential(token);
  const tokenHash = await hashCredential(normalizedToken);
  const existing = await ctx.db
    .query("extensionCredentials")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();

  if (!existing) {
    throw new Error("Invalid extension credential");
  }

  if (!(await canEmailUseKanban(ctx, existing.ownerEmail))) {
    throw new Error("Extension credential is no longer active");
  }

  return existing;
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireMember(ctx);
    const existing = await ctx.db
      .query("extensionCredentials")
      .withIndex("by_owner", (q) => q.eq("ownerId", user.userId))
      .unique();

    return {
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
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireMember(ctx);
    const ownerEmail = user.email?.trim().toLowerCase();

    if (!ownerEmail) {
      throw new Error("Account email is unavailable");
    }

    const token = normalizeCredential(args.token);
    const tokenHash = await hashCredential(token);
    const tokenPreview = getCredentialPreview(token);
    const now = Date.now();

    const existing = await ctx.db
      .query("extensionCredentials")
      .withIndex("by_owner", (q) => q.eq("ownerId", user.userId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    await ctx.db.insert("extensionCredentials", {
      ownerId: user.userId,
      ownerEmail,
      ownerName: user.name?.trim() || undefined,
      tokenHash,
      tokenPreview,
      createdAt: now,
      updatedAt: now,
    });

    return {
      preview: tokenPreview,
      updatedAt: now,
    };
  },
});

export const revokeCredential = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireMember(ctx);
    const existing = await ctx.db
      .query("extensionCredentials")
      .withIndex("by_owner", (q) => q.eq("ownerId", user.userId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return null;
  },
});

export const verifyCredential = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await requireActiveExtensionCredential(ctx, args.token);

    const verifiedAt = Date.now();

    await ctx.db.patch(existing._id, {
      lastVerifiedAt: verifiedAt,
    });

    return {
      user: {
        email: existing.ownerEmail,
        name: existing.ownerName ?? null,
      },
      verifiedAt,
    };
  },
});
