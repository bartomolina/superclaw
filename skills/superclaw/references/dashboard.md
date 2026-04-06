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
- Preferred default local port if free: `19830`
- Canonical service: `superclaw-dashboard.service`

## Runtime shape

- Next.js App Router app
- server-side OpenClaw adapter layer under `lib/server/openclaw/`
- browser talks to the dashboard app, not directly to the Gateway WebSocket
- required env includes `GATEWAY_TOKEN`
- external exposure should prefer Cloudflare Tunnel via `cloudflared.service`

## Working rules

1. Prefer server-side adapters for OpenClaw integration and keep secrets server-side.
2. If dashboard install/runtime assumptions change, update:
   - `README.md`
   - `INSTALL.md`
   - `dashboard/README.md`
3. If dashboard changes depend on OpenClaw API/runtime behavior, document the assumption in code or docs near the integration point.

## Quick reference

Typical local dev command inside the systemd unit (or the same command with a nearby free port if `19830` is already taken):

```bash
pnpm exec next dev --hostname 127.0.0.1 --port 19830
```
