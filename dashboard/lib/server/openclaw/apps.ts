import { promises as fs } from "node:fs";
import path from "node:path";

import { json } from "@/lib/server/openclaw/http";

type DashboardAppBookmark = {
  name: string;
  url: string;
  category: string;
  image?: string;
  icon?: string;
};

const APPS_FILE = path.join(process.cwd(), "apps.local.json");

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown) {
  return isString(value) ? value.trim() : undefined;
}

function normalizeAppBookmark(value: unknown): DashboardAppBookmark | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  if (!isString(raw.name) || !isString(raw.url) || !isString(raw.category)) return null;

  return {
    name: raw.name.trim(),
    url: raw.url.trim(),
    category: raw.category.trim(),
    image: optionalString(raw.image),
    icon: optionalString(raw.icon),
  };
}

export async function readAppBookmarks() {
  let raw: string;

  try {
    raw = await fs.readFile(APPS_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("apps.local.json must contain an array");
  }

  return parsed.map(normalizeAppBookmark).filter((app): app is DashboardAppBookmark => Boolean(app));
}

export async function handleAppsList() {
  return json({ apps: await readAppBookmarks() });
}
