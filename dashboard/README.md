# Superclaw Dashboard (Next.js)

Operations dashboard for OpenClaw.

It provides a web UI to inspect and manage agents, models, skills, config files, cron jobs, and gateway status through a server-side API proxy.

## Stack

- Next.js App Router (React + TypeScript)
- Tailwind CSS + shadcn/ui primitives
- Server-side gateway client over WebSocket (`ws`)

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

- `GATEWAY_URL`: Gateway WebSocket URL (default `ws://127.0.0.1:18789`)
- `OPENCLAW_HOME`: OpenClaw home directory (default `~/.openclaw`)
- `GEMINI_API_KEY`: Enables avatar generation when creating an agent with description
- `UV_PATH`: Path prefix for `uv` binary (default `~/.local/bin`)
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

Routes are split by domain (agents/models/config/debug) under `app/api/*`, with shared server handlers in `lib/server/dashboard-api.ts`.

Main route groups:

- `/api/agents*`
- `/api/models*`
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
