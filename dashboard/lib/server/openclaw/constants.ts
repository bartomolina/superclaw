import { homedir } from "os";
import path from "path";

export const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
export const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(homedir(), ".openclaw");
export const OPENCLAW_PACKAGE_JSON = process.env.OPENCLAW_PACKAGE_JSON || "/usr/lib/node_modules/openclaw/package.json";
export const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;
