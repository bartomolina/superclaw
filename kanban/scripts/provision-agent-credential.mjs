#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const envFile = path.join(rootDir, ".env.local");

function usage() {
  console.error("Usage: provision-agent-credential.mjs <agent-id> [--json|--exports]");
  process.exit(1);
}

function parseEnvValue(raw, key) {
  const line = raw
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));

  if (!line) return null;
  let value = line.slice(line.indexOf("=") + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value || null;
}

function run(command, args) {
  return execFileSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const agentId = process.argv[2]?.trim();
const mode = process.argv[3] || "plain";

if (!agentId) usage();
if (!["plain", "--json", "--exports"].includes(mode)) usage();

const envRaw = readFileSync(envFile, "utf8");
const siteUrl = parseEnvValue(envRaw, "NEXT_PUBLIC_CONVEX_SITE_URL");
if (!siteUrl) {
  throw new Error(`NEXT_PUBLIC_CONVEX_SITE_URL is missing in ${envFile}`);
}

const superuserEmail = run("pnpm", ["exec", "convex", "env", "get", "SUPERUSER_EMAIL"])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .at(-1);

if (!superuserEmail) {
  throw new Error("SUPERUSER_EMAIL is missing from the Convex deployment");
}

const token = randomBytes(24).toString("hex");
const identity = JSON.stringify({
  email: superuserEmail,
  subject: "openclaw-operator",
  name: "OpenClaw Operator",
});
const payload = JSON.stringify({ agentId, token });

run("pnpm", ["exec", "convex", "run", "agent_credentials:saveCredential", "--identity", identity, payload]);

const baseUrl = `${siteUrl.replace(/\/$/, "")}/agent/kanban`;
const sandboxEnv = {
  KANBAN_BASE_URL: baseUrl,
  KANBAN_AGENT_TOKEN: token,
};

if (mode === "--json") {
  process.stdout.write(
    `${JSON.stringify({
      agentId,
      baseUrl,
      token,
      sandboxEnv,
      openclawConfigPatch: {
        sandbox: {
          docker: {
            env: sandboxEnv,
          },
        },
      },
    }, null, 2)}\n`,
  );
  process.exit(0);
}

if (mode === "--exports") {
  process.stdout.write(`export KANBAN_BASE_URL=${JSON.stringify(baseUrl)}\n`);
  process.stdout.write(`export KANBAN_AGENT_TOKEN=${JSON.stringify(token)}\n`);
  process.exit(0);
}

process.stdout.write(`AGENT_ID=${agentId}\n`);
process.stdout.write(`KANBAN_BASE_URL=${baseUrl}\n`);
process.stdout.write(`KANBAN_AGENT_TOKEN=${token}\n`);
process.stdout.write(`OPENCLAW_SANDBOX_ENV_JSON=${JSON.stringify(sandboxEnv)}\n`);
