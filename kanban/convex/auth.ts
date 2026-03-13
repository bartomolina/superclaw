import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins";

import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL;
const resendApiKey = process.env.RESEND_API_KEY;
const authFromEmail = process.env.AUTH_FROM_EMAIL || "SuperClaw <noreply@mail.bartomolina.io>";
const trustedOriginsEnv = process.env.TRUSTED_ORIGINS || "";

export const authComponent = createClient<DataModel>(components.betterAuth);

function resolveTrustedOrigins(primarySiteUrl: string) {
  const origins = [primarySiteUrl, ...trustedOriginsEnv.split(",")]
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(origins));
}

async function sendMagicLinkEmail(email: string, url: string) {
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is required for magic-link login");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: authFromEmail,
      to: [email],
      subject: "Your SuperClaw Kanban sign-in link",
      html: `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.5; color: #18181b;">
          <h2 style="margin: 0 0 12px;">Sign in to SuperClaw Kanban</h2>
          <p style="margin: 0 0 16px;">Use the secure link below to sign in:</p>
          <p style="margin: 0 0 16px;"><a href="${url}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#18181b;color:#fff;text-decoration:none;">Sign in</a></p>
          <p style="margin: 0; color: #71717a; font-size: 12px;">If you did not request this email, you can safely ignore it.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to send magic link email: ${message}`);
  }
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  if (!siteUrl) {
    throw new Error("SITE_URL is required for Better Auth (set via `npx convex env set SITE_URL ...`)");
  }

  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    trustedOrigins: resolveTrustedOrigins(siteUrl),
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail(email, url);
        },
      }),
      convex({ authConfig }),
    ],
  });
};

export const { getAuthUser } = authComponent.clientApi();
