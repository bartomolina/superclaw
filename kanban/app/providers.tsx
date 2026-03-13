"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useState } from "react";

import { AppToaster } from "@/components/ui/app-toaster";
import { authClient } from "@/lib/auth-client";

function getConvexUrl() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  }

  return convexUrl;
}

export function Providers({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  const [client] = useState(() => new ConvexReactClient(getConvexUrl()));

  return (
    <ConvexBetterAuthProvider client={client} authClient={authClient} initialToken={initialToken}>
      {children}
      <AppToaster />
    </ConvexBetterAuthProvider>
  );
}
