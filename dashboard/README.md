# Superclaw Dashboard (Next.js)

Operations dashboard for OpenClaw.

For the suite-level install flow, see:
- `../README.md`
- `../INSTALL.md`
- `../AGENT_INSTALL.md`

It provides a web UI to inspect and manage agents, models, skills, config files, cron jobs, and gateway status through a server-side API proxy.

## Stack

- Next.js App Router (React + TypeScript)
- Tailwind CSS + shadcn/ui primitives
- Server-side OpenClaw adapter layer under `lib/server/openclaw/`

## Runtime model

- Durable/local state uses CLI/filesystem-backed adapters where possible.
- Live/runtime state uses a singleton server-side Gateway client for fast status and channel reads.
- Per-agent effective skills on the Agents page use Gateway reads; the top-level Skills page uses CLI-backed inventory data for faster loading.
- The browser still talks only to the dashboard app; it does not connect directly to the Gateway WebSocket.
- Ops surfaces detected systemd services for the local host.
- If the dashboard is exposed externally, prefer **Cloudflare Tunnel** via `cloudflared.service`.

## Prerequisites

- Node.js 20+
- pnpm 10+
- OpenClaw installed and running locally
- A valid `GATEWAY_TOKEN`

## Setup

```bash
pnpm install
cp .env.example .env
# edit .env
pnpm dev
```

Open `http://localhost:3000`.

## Environment Variables

Required:

- `GATEWAY_TOKEN`: OpenClaw gateway token (also used as dashboard login password)

Optional:

- `OPENCLAW_HOME`: OpenClaw home directory (default `~/.openclaw`)
- `OPENCLAW_PACKAGE_JSON`: Override installed OpenClaw package metadata path if needed
- `GEMINI_API_KEY`: Enables avatar generation when creating an agent with description
- `DEBUG_RPC_ENABLED`: Enables raw debug RPC endpoint `/api/debug/ws` (default disabled)

## Scripts

- `pnpm dev`: start development server
- `pnpm build`: production build
- `pnpm start`: run production server
- `pnpm lint`: run ESLint

## Security Notes

- Gateway token is kept server-side in environment variables.
- Browser auth is via `Authorization: Bearer <token>` and stored in `localStorage` (`gw-token`) so it survives browser restarts.
- API routes are Node runtime only and protected except `/api/health` and `/api/auth/verify`.
- Debug RPC endpoint (`/api/debug/ws`) is feature-flagged and disabled by default (`DEBUG_RPC_ENABLED=false`).
- Login requires manual token entry (URL token bootstrap is disabled to avoid credential leakage in links/logs).

## API Design

Routes are split by domain under `app/api/*`, with shared server adapters in `lib/server/openclaw/`.

Main route groups:

- `/api/agents*`
- `/api/agents/:id/channels`
- `/api/agents/:id/skills`
- `/api/agents/:id/files*`
- `/api/models*`
- `/api/crons*`
- `/api/config`
- `/api/features`
- `/api/debug/ws` (feature-flagged)
- `/api/skills`
- `/api/performance`
- `/api/usage`

## Share Checklist

Before sharing publicly:

- Ensure `.env` is not committed
- Keep `.env.example` up to date when adding env vars
- Run `pnpm lint && pnpm build`
- Remove local-only hostnames/paths if your environment differs
- If you update OpenClaw, rerun `node scripts/probe-gateway-ws.mjs --device-identity --client-id gateway-client --mode backend --cap tool-events` to validate the runtime Gateway client path
