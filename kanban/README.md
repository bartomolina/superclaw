# SuperClaw Kanban

Internal Kanban app built with Next.js App Router + Convex + Better Auth (magic-link).

For the suite-level install flow, see:
- `../README.md`
- `../INSTALL.md`
- `../AGENT_INSTALL.md`

For the repo copies of the SuperClaw/kanban agent skills, see:
- `../skills/superclaw/`
- `../skills/kanban/`

## Stack

- Next.js 16
- React 19
- Convex Cloud
- Better Auth (`@convex-dev/better-auth`)
- Resend (magic-link email delivery)

## Architecture (important)

- Backend functions live in `convex/*.ts` (`boards.ts`, `cards.ts`, `comments.ts`, `auth.ts`, etc.).
- These files are versioned in this repo.
- Convex schema/functions are synced from code via:

```bash
pnpm exec convex dev
# or
pnpm exec convex codegen
```

## Quickstart (share-ready)

1) Install deps

```bash
pnpm install
```

2) Copy env file

```bash
cp .env.local.example .env.local
```

3) Fill local env (`.env.local`)

Required keys:
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `GATEWAY_TOKEN` (used by runtime-backed kanban agent endpoints)

Optional local env:
- `OPENCLAW_HOME` (defaults to `~/.openclaw`)

4) Set Convex env vars

```bash
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm exec convex env set SITE_URL http://localhost:3000
pnpm exec convex env set SUPERUSER_EMAIL you@example.com
pnpm exec convex env set RESEND_API_KEY <your_resend_api_key>
pnpm exec convex env set AUTH_FROM_EMAIL "SuperClaw <noreply@mail.your-domain.com>"
pnpm exec convex env set KANBAN_AGENT_SHARED_TOKEN "$(openssl rand -hex 24)"
# optional (extra local/testing origins):
pnpm exec convex env set TRUSTED_ORIGINS "http://127.0.0.1:3000,http://localhost:3000"
# optional (magic-link throttling):
pnpm exec convex env set MAGIC_LINK_EMAIL_COOLDOWN_MS 120000
pnpm exec convex env set MAGIC_LINK_GLOBAL_COOLDOWN_MS 5000
```

5) Start Convex sync

```bash
pnpm exec convex dev
```

6) Start Next app

```bash
pnpm dev
```

7) Open `NEXT_PUBLIC_SITE_URL` and sign in with magic link.

## Auth status

- Passwordless magic-link login via Better Auth.
- Sign-in is invite-only: magic links are only sent to `SUPERUSER_EMAIL` or emails already present in the app's invited users list.
- Magic-link sending is throttled server-side with a per-email cooldown and a small global cooldown.
- Next route `/api/auth/[...all]` proxies to Convex Better Auth handlers.
- Board and user administration are superuser-only.
- `boards.list` is safe when auth is not ready yet.

## OpenClaw integration

- Kanban agent option/avatar loading now uses server-side OpenClaw adapters under `lib/server/openclaw/`.
- Agent list comes from `openclaw agents list --json`.
- Agent avatar resolution uses local OpenClaw config + workspace filesystem.
- Runtime-backed skill data uses a singleton server-side Gateway client with a short cache.
- Card modals reuse app-level agent and skill option state instead of refetching those lists on every open.

## Agent automation API (v1)

### Canonical runtime env for agents

Kanban workers now use exactly one runtime contract everywhere:

- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

The worker skill should never inspect the Kanban repo or call `convex env get ...` at runtime.
Resolve those two values once during install/bootstrap, then expose them through the OpenClaw runtime.

Derive the canonical values from the local Kanban setup with:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/resolve-worker-env.sh
# or ready-to-source shell exports:
./scripts/resolve-worker-env.sh --exports
```

Use the resolved values in the OpenClaw gateway service environment:

1. **OpenClaw gateway service env**
   - unsandboxed/local agents read `KANBAN_BASE_URL` and `KANBAN_AGENT_TOKEN` from the running gateway service environment
   - the underlying trusted secret on the Kanban/Convex side is `KANBAN_AGENT_SHARED_TOKEN`

2. **Sandboxed agents (manual)**
   - do **not** mirror these values globally by default
   - when a sandboxed agent needs Kanban access, set `KANBAN_BASE_URL` and `KANBAN_AGENT_TOKEN` explicitly for that agent under `agents.list[].sandbox.docker.env`
   - dedicated per-agent credentials are supported and preferred for sandboxed agents; when a dedicated credential exists for an agent id, the shared token is no longer accepted for that agent

Sandboxed-agent setup should keep the required SuperClaw skills locally in the agent workspace:

```bash
mkdir -p ~/.openclaw/workspace-<agent>/skills
rsync -a ~/.openclaw/skills/kanban/ ~/.openclaw/workspace-<agent>/skills/kanban/
rsync -a ~/.openclaw/skills/superclaw/ ~/.openclaw/workspace-<agent>/skills/superclaw/
```

Agent HTTP endpoints:

- `GET ${KANBAN_BASE_URL}/inbox`
- `GET ${KANBAN_BASE_URL}/session/targets?sessionId=...` (tracked manual runs)
- `GET ${KANBAN_BASE_URL}/tasks?includeDone=1`
- `POST ${KANBAN_BASE_URL}/comment`
- `POST ${KANBAN_BASE_URL}/transition`
- `POST ${KANBAN_BASE_URL}/session/finish`

`/agent/kanban/tasks`, `/agent/kanban/inbox`, and `/agent/kanban/session/targets` include each card's `extensionContext` when present. `/agent/kanban/inbox` and `/agent/kanban/session/targets` also include each card's full discussion comment history in `comments` so workers can act with full context.

Required headers:

- `X-Agent-Id: <agent-id>`
- `X-Agent-Token: <agent-token>`
- `X-Kanban-Session-Id: <session-id>` on `comment` and `transition` when the worker pass is tracking explicit card run state

Manual board-scoped runs from the Kanban UI now pre-mark the board's current actionable cards with explicit run state on the card itself:

- `isRunning`
- `lastSessionId`
- `lastSessionAgentId`
- `lastSessionUpdatedAt`
- `lastRunStatus`

Worker contract for explicit run state:

- Manual run prompts now include the `sessionId` and the exact board/card scope for that pass.
- Tracked manual runs should fetch `GET /agent/kanban/session/targets?sessionId=...` and use that response as the source of truth instead of re-checking live `/inbox`.
- Every worker write to Kanban should send `X-Kanban-Session-Id` so touched cards stay associated with the active session.
- When the pass finishes, call `POST /agent/kanban/session/finish` with JSON like `{"sessionId":"...","status":"done"}`.
- Use `status: "failed"` or `status: "aborted"` when the pass does not complete normally.
- The card keeps `lastSessionId` after completion for debugging; only `isRunning` is cleared.

Example:

```bash
curl -s \
  -H "X-Agent-Id: main" \
  -H "X-Agent-Token: $KANBAN_AGENT_TOKEN" \
  "${KANBAN_BASE_URL}/tasks"
```

Policy enforced by API:

- Reviewer is comment-only in `Review`.
- Assignee transitions: `TODO -> In Progress -> Review` and `Review -> In Progress`.
- Human remains override authority via UI.

## Production deploy

When moving from dev to shared/prod:

1) Use real public URL for both:
- `NEXT_PUBLIC_SITE_URL` (Next env)
- `SITE_URL` (Convex env)

2) Use verified sender domain in Resend:
- `AUTH_FROM_EMAIL="SuperClaw <noreply@mail.your-domain.com>"`

3) Set production Convex env values (same keys as dev).

4) Deploy Convex functions/schema to production deployment:

```bash
pnpm exec convex deploy
```

5) Deploy Next app with matching public env vars.

## Notes

- Legacy pre-auth board claiming support has been removed.
- Columns are fixed: Ideas, TODO, In Progress, Review, Done.
- Column create/rename/delete is intentionally disabled.

## Verify

```bash
pnpm lint
pnpm build
```

## Troubleshooting

- **"Could not send magic link" + Resend 403 domain not verified**
  - Verify the sender domain in Resend.
  - Ensure `AUTH_FROM_EMAIL` uses that verified domain.

- **Invalid origin**
  - Ensure `SITE_URL` matches the actual app origin.
  - Add additional origins in `TRUSTED_ORIGINS` only if you intentionally support multiple URLs for the same app.
URLs.
