# SuperClaw Dashboard

## Purpose

Dashboard is the operator-facing web UI for inspecting and managing OpenClaw.

It covers areas like:
- agents
- models
- skills
- config files
- cron jobs
- gateway/runtime status

## Location

- App path: `apps/superclaw/dashboard/`
- Canonical local port: `4000`
- Canonical pm2 process: `superclaw-dashboard`

## Runtime shape

- Next.js App Router app
- server-side OpenClaw adapter layer under `lib/server/openclaw/`
- browser talks to the dashboard app, not directly to the Gateway WebSocket
- required env includes `GATEWAY_TOKEN`

## Working rules

1. Prefer server-side adapters for OpenClaw integration and keep secrets server-side.
2. If dashboard install/runtime assumptions change, update:
   - `README.md`
   - `INSTALL.md`
   - `AGENT_INSTALL.md`
   - `dashboard/README.md`
3. If dashboard changes depend on OpenClaw API/runtime behavior, document the assumption in code or docs near the integration point.

## Quick reference

Typical local dev start:

```bash
pm2 start bash --name superclaw-dashboard --cwd ~/.openclaw/workspace/apps/superclaw/dashboard -- -lc 'pnpm exec next dev --hostname 127.0.0.1 --port 4000'
```
