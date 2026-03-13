import { json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json({ ok: true });
}
