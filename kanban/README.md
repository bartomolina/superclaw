# SuperClaw Kanban

Kanban is the board and workflow app in the SuperClaw suite.

For suite-level setup, see:
- `../README.md`
- `../INSTALL.md`

## Basics

- path: `apps/superclaw/kanban/`
- preferred default port if free: `19831`
- services:
  - `superclaw-kanban.service`
  - `superclaw-convex.service`
- stack:
  - Next.js
  - Convex
  - Better Auth
  - Resend

## Commands

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

Other commands:

```bash
pnpm lint
pnpm build
pnpm exec convex dev
pnpm exec convex codegen
```

## Local env

Required:
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `GATEWAY_TOKEN`

Optional:
- `OPENCLAW_HOME`

## Convex env

Required:
- `BETTER_AUTH_SECRET`
- `SITE_URL`
- `SUPERUSER_EMAIL`
- `RESEND_API_KEY`
- `KANBAN_AGENT_SHARED_TOKEN`

Recommended:
- `AUTH_FROM_EMAIL`

Optional:
- `TRUSTED_ORIGINS`
- `MAGIC_LINK_EMAIL_COOLDOWN_MS`
- `MAGIC_LINK_GLOBAL_COOLDOWN_MS`

If `AUTH_FROM_EMAIL` is unset, Kanban falls back to `SuperClaw <onboarding@resend.dev>` for limited self-email testing.

## URL model

Keep these aligned:
- Kanban bind host
- optional Cloudflare Tunnel ingress
- `NEXT_PUBLIC_SITE_URL`
- Convex `SITE_URL`

If `19831` is already taken on the host, choose a nearby free port and keep those values aligned to the replacement.

`SITE_URL` is the canonical auth origin.
Leave `TRUSTED_ORIGINS` unset unless you intentionally want extra private/internal origins.

## Worker runtime

Kanban workers use:
- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

Resolve them from the local app with:

```bash
./scripts/resolve-worker-env.sh
./scripts/resolve-worker-env.sh --exports
```

Provision a dedicated sandbox-friendly credential with:

```bash
./scripts/provision-agent-credential.mjs <agent-id> --json
```

## Notes

- OpenClaw adapters live under `lib/server/openclaw/`.
- Columns are fixed: Ideas, TODO, In Progress, Review, Done.
- Reviewer is comment-only in `Review`.
- Assignee flow is `TODO -> In Progress -> Review`.
