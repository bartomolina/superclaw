"use client";

import { Providers } from "@/app/providers";
import { KanbanApp } from "@/components/kanban-app";
import { LoginScreen } from "@/components/login-screen";
import { authClient } from "@/lib/auth-client";

export function ProtectedKanbanApp({ initialToken }: { initialToken?: string | null }) {
  const { data: sessionData, isPending, error } = authClient.useSession();

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

  return (
    <Providers initialToken={initialToken}>
      <KanbanApp onLogout={handleLogout} />
    </Providers>
  );
}
