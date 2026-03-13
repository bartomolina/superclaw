import { ProtectedKanbanApp } from "@/components/protected-kanban-app";
import { getToken } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialToken = await getToken();

  return <ProtectedKanbanApp initialToken={initialToken ?? null} />;
}
