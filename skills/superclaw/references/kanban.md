# SuperClaw Kanban

## Purpose

Kanban is the task board and agent workflow app in the SuperClaw suite.

It combines:
- board/card UI
- agent assignment and review workflow
- agent automation endpoints
- auth/invite flow for human users

## Location and runtime

- App path: `apps/superclaw/kanban/`
- Canonical local port: `4100`
- Canonical pm2 process: `superclaw-kanban`
- Convex sync process: `convex`

Stack:
- Next.js App Router
- Convex Cloud
- Better Auth
- Resend

## Environment shape

Local app config lives in `.env.local`.

Important local env keys:
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `GATEWAY_TOKEN`

Important Convex env keys:
- `BETTER_AUTH_SECRET`
- `SITE_URL`
- `SUPERUSER_EMAIL`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- `KANBAN_AGENT_SHARED_TOKEN`

## Agent automation runtime modes

There are two supported runtime-config patterns for Kanban workers:

### Mode A — explicit runtime config

Use these env vars directly when present:
- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

This is the preferred mode for sandboxed or isolated agents.

### Mode B — local autodiscovery

For local/non-sandboxed agents:
- read `NEXT_PUBLIC_CONVEX_SITE_URL` from `apps/superclaw/kanban/.env.local`
- read `KANBAN_AGENT_SHARED_TOKEN` via `pnpm exec convex env get KANBAN_AGENT_SHARED_TOKEN`
- base URL becomes `<NEXT_PUBLIC_CONVEX_SITE_URL>/agent/kanban`

Do not invent fallback hosts, ports, or auth schemes.

## Worker API surface

Base URL:
- `https://<deployment>.convex.site/agent/kanban`

Endpoints:
- `GET /inbox`
- `GET /tasks?includeDone=1`
- `POST /comment`
- `POST /transition`
- `POST /session/finish`

Required headers:
- `X-Agent-Id: <agent-id>`
- `X-Agent-Token: <agent-token>`
- `X-Kanban-Session-Id: <session-id>` on tracked writes when the run is using explicit session state

## Workflow rules

High-level workflow assumptions:
- assignee workflow is `TODO -> In Progress -> Review`
- review follow-up may move `Review -> In Progress -> Review`
- reviewer is comment-only in `Review`
- human UI remains the override path

Use the dedicated `kanban` skill for narrow worker tasks such as:
- picking up inbox work
- leaving automation comments
- moving cards through workflow
- finishing tracked worker sessions

## Working rules

1. Keep app behavior, worker behavior, and docs aligned.
2. If you change agent API behavior, update the skill docs too.
3. If you change install/runtime assumptions, update:
   - `README.md`
   - `INSTALL.md`
   - `AGENT_INSTALL.md`
   - `kanban/README.md`
