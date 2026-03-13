/* eslint-disable @typescript-eslint/no-explicit-any */
const TOKEN_KEY = "gw-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function authFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401) throw new Error("unauthorized");
  return res.json();
}
