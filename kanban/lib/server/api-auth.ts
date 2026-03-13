import { isAuthenticated } from "@/lib/auth-server";

export async function isAuthorized() {
  return await isAuthenticated();
}
