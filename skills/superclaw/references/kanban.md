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
- Canonical app service: `superclaw-kanban.service`
- Convex sync service: `superclaw-convex.service`

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
- `AUTH_FROM_EMAIL` (recommended for real/shared email delivery; if omitted, Kanban falls back to `SuperClaw <onboarding@resend.dev>` for limited self-email testing)
- `KANBAN_AGENT_SHARED_TOKEN`

Important exposure rule:
- keep the Kanban bind host, optional Cloudflare Tunnel ingress, `NEXT_PUBLIC_SITE_URL`, and Convex `SITE_URL` aligned
- changing only the service bind host or only the tunnel is not enough when magic-link auth is enabled
- private internal/Tailscale mode should use an internal origin for both `NEXT_PUBLIC_SITE_URL` and `SITE_URL`
- shared/public mode should use the public hostname for both `NEXT_PUBLIC_SITE_URL` and `SITE_URL`
- `SITE_URL` is the canonical auth origin; leave `TRUSTED_ORIGINS` unset by default
- only set `TRUSTED_ORIGINS` if you intentionally want multiple private/internal origins for the same Kanban
- use placeholders in docs/skills for private/internal hosts and IPs (for example `http://my-host:4100` or `http://100.x.y.z:4100`) instead of hardcoding user-specific values

## Agent automation runtime

Kanban workers use one canonical runtime contract everywhere:
- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

Resolve those values once during install/bootstrap. Do not make the worker skill inspect the repo or call `convex env get ...` at runtime.

Derive the canonical values from the app with:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/resolve-worker-env.sh
# or emit shell exports:
./scripts/resolve-worker-env.sh --exports
```

Runtime rules:
- unsandboxed/local agents should read `KANBAN_BASE_URL` and `KANBAN_AGENT_TOKEN` from the OpenClaw gateway service environment
- do **not** auto-mirror these values into `agents.defaults.sandbox.docker.env`
- sandboxed Kanban access should be configured manually per agent when needed under `agents.list[].sandbox.docker.env`
- `KANBAN_AGENT_SHARED_TOKEN` remains the default shared credential for trusted/local agents
- dedicated per-agent Kanban credentials are supported for isolation; if a dedicated credential exists for an agent id, the shared token is no longer accepted for that agent
- do not invent fallback hosts, ports, or auth schemes

Additional requirement for sandboxed agents:
- keep workspace-local copies of the required SuperClaw skills under `<agent-workspace>/skills/kanban/` and `<agent-workspace>/skills/superclaw/`
- do not assume the sandbox can read host skill paths like `~/.openclaw/skills/kanban/`, `~/.openclaw/skills/superclaw/`, or `/usr/lib/node_modules/openclaw/skills/...`
- to provision a dedicated token for a sandboxed agent, use:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/provision-agent-credential.mjs <agent-id> --json
```

This returns the dedicated `KANBAN_AGENT_TOKEN` plus the exact `agents.list[].sandbox.docker.env` payload to inject for that agent.

Example for an agent workspace:

```bash
mkdir -p ~/.openclaw/workspace-<agent>/skills
rsync -a ~/.openclaw/skills/kanban/ ~/.openclaw/workspace-<agent>/skills/kanban/
rsync -a ~/.openclaw/skills/superclaw/ ~/.openclaw/workspace-<agent>/skills/superclaw/
```

## Worker API surface

Base URL:
- `https://<deployment>.convex.site/agent/kanban`

Endpoints:
- `GET /inbox` — grouped actionable items plus card execution metadata (`description`, `source`, assignee/reviewer ids, `priority`, `size`, `type`, `acp`, `model`, `skills`, comment state)
- `GET /session/targets?sessionId=...` (tracked manual runs) — authoritative tracked target list with the same execution metadata plus comments
- `GET /tasks?includeDone=1` — raw/debug task list with role data, card execution metadata, and last-comment state
- `POST /comment`
- `POST /transition`
- `POST /session/finish`

Consumer model:
- live inbox / debug preview should continue to read from the shared inbox selector
- tracked manual runs should snapshot card ids once, then expose them through `/session/targets?sessionId=...`
- do not make tracked manual runs rediscover claimed cards through live `/inbox`

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
   - `AGENT_INSTALL.md`
   - `kanban/README.md`
