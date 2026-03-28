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
- sandboxed Kanban access should be configured manually per agent when needed
- do not invent fallback hosts, ports, or auth schemes

Additional requirement for sandboxed agents:
- keep a workspace-local copy of the kanban skill under `<agent-workspace>/skills/kanban/`
- do not assume the sandbox can read host skill paths like `~/.openclaw/skills/kanban/` or `/usr/lib/node_modules/openclaw/skills/kanban/`

Example for an agent workspace:

```bash
mkdir -p ~/.openclaw/workspace-<agent>/skills
rsync -a ~/.openclaw/skills/kanban/ ~/.openclaw/workspace-<agent>/skills/kanban/
```

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
