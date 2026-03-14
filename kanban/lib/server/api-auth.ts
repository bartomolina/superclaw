import { api } from "@/convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

export async function isAuthorized() {
  if (!(await isAuthenticated())) {
    return false;
  }

  try {
    const viewer = await fetchAuthQuery(api.users.viewer, {});
    return viewer?.isMember === true;
  } catch {
    return false;
  }
}
