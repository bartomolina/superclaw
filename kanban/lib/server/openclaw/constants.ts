import { homedir } from "os";
import path from "path";

export const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
export const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(homedir(), ".openclaw");
export const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;
