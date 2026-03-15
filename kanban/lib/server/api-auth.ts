import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

export async function getAuthorizedViewer() {
  if (!(await isAuthenticated())) {
    return null;
  }

  try {
    return await fetchAuthQuery(api.users.viewer, {});
  } catch {
    return null;
  }
}

export async function isAuthorized() {
  const viewer = await getAuthorizedViewer();
  return viewer?.isMember === true;
}

export async function getAuthorizedBoardAgentAccess(boardId: Id<"boards">) {
  const viewer = await getAuthorizedViewer();
  if (viewer?.isMember !== true) {
    return null;
  }

  try {
    return await fetchAuthQuery(api.boards.agentAccess, { boardId });
  } catch {
    return null;
  }
}
