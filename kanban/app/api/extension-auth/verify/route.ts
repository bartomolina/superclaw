import { fetchMutation } from "convex/nextjs";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";

type VerifyRequestBody = {
  credential?: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  let body: VerifyRequestBody;

  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  const credential = body.credential?.trim() ?? "";

  if (!credential) {
    return jsonError("Extension credential is required", 400);
  }

  try {
    const result = await fetchMutation(api.extension_auth.verifyCredential, {
      token: credential,
    });

    return NextResponse.json({
      ok: true,
      user: result.user,
      verifiedAt: result.verifiedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    const isUnauthorized = message === "Invalid extension credential" || message === "Extension credential is no longer active";

    return jsonError(message, isUnauthorized ? 401 : 500);
  }
}
