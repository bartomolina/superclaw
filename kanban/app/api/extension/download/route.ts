import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const extensionBuildDir = path.resolve(
  process.cwd(),
  "..",
  "extension",
  ".output",
  "chrome-mv3",
);

function zipDirectory(cwd: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn("zip", ["-qr", "-", "."], { cwd });
    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
        return;
      }

      reject(new Error(stderr.trim() || `zip exited with code ${code}`));
    });
  });
}

export async function GET() {
  try {
    await access(extensionBuildDir);
  } catch {
    return NextResponse.json(
      { error: "Extension build not found. Build apps/superclaw/extension first." },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const archive = await zipDirectory(extensionBuildDir);

    return new NextResponse(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="superclaw-extension-chrome-mv3.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not package the extension download.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
