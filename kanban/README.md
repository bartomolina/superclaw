# SuperClaw Kanban

Internal Kanban app built with Next.js App Router + Convex + Better Auth (magic-link).

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

Convex HTTP endpoints:

- `GET <NEXT_PUBLIC_CONVEX_SITE_URL>/agent/kanban/tasks?includeDone=1`
- `GET <NEXT_PUBLIC_CONVEX_SITE_URL>/agent/kanban/inbox`
- `POST <NEXT_PUBLIC_CONVEX_SITE_URL>/agent/kanban/comment`
- `POST <NEXT_PUBLIC_CONVEX_SITE_URL>/agent/kanban/transition`

`/agent/kanban/inbox` returns grouped actionable items for the current agent and now includes each card's full discussion comment history in `comments` so workers can act with full context.

Required headers:

- `X-Agent-Id: <agent-id>`
- `X-Agent-Token: <agent-token>`

Example:

```bash
curl -s \
  -H "X-Agent-Id: main" \
  -H "X-Agent-Token: $KANBAN_AGENT_SHARED_TOKEN" \
  "${NEXT_PUBLIC_CONVEX_SITE_URL}/agent/kanban/tasks"
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
