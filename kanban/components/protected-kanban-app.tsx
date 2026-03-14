"use client";

import { useQuery } from "convex/react";

import { Providers } from "@/app/providers";
import { KanbanApp } from "@/components/kanban-app";
import { LoginScreen } from "@/components/login-screen";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

function ProtectedKanbanAppInner() {
  const { data: sessionData, isPending, error } = authClient.useSession();
  const viewer = useQuery(api.users.viewer, sessionData?.session ? {} : "skip") as
    | { isMember?: boolean }
    | null
    | undefined;

  async function handleLogout() {
    await authClient.signOut();
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
        Checking session...
      </div>
    );
  }

  if (!sessionData?.session) {
    return <LoginScreen errorMessage={error?.message} />;
  }

  if (viewer === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
        Checking access...
      </div>
    );
  }

  if (viewer?.isMember !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
        <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Access denied</div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            This account is not currently allowed to use this kanban.
          </p>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <KanbanApp onLogout={handleLogout} />;
}

export function ProtectedKanbanApp({ initialToken }: { initialToken?: string | null }) {
  return (
    <Providers initialToken={initialToken}>
      <ProtectedKanbanAppInner />
    </Providers>
  );
}
