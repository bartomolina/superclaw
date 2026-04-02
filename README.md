# SuperClaw

SuperClaw is the local companion suite for OpenClaw.

It has three parts:
- **Dashboard** — manage and inspect OpenClaw
- **Kanban** — task board and agent workflow UI
- **Extension** — send UI feedback into Kanban

## Suite commands

From the repo root (`apps/superclaw/`):

```bash
pnpm test
pnpm lint
pnpm build
```

These run the app-level utility tests plus the suite-wide lint/build checks.

## Default install model

Keep it simple and opinionated:

- install inside the main OpenClaw workspace
- canonical path: `~/.openclaw/workspace/apps/superclaw/`
- run locally on the same machine as OpenClaw
- run in **dev mode** for hot reload
- manage long-running services with **systemd**
- when public exposure is needed, prefer **Cloudflare Tunnel** via `cloudflared.service`
- use fixed local ports:
  - Dashboard: `4000`
  - Kanban: `4100`
- build the extension locally and install it manually

SuperClaw assumes OpenClaw is already installed and working.

## Recommended systemd unit names

Use these names:
- `superclaw-dashboard.service`
- `superclaw-convex.service`
- `superclaw-kanban.service`

## Kanban exposure modes

Kanban has three separate knobs that need to stay aligned:
- the bind host in `superclaw-kanban.service`
- the optional Cloudflare Tunnel ingress entry
- the canonical app URL used by auth (`NEXT_PUBLIC_SITE_URL` + Convex `SITE_URL`)

Recommended modes:

1. **Single-machine local dev**
   - bind Kanban to `127.0.0.1`
   - keep tunnel ingress off
   - set `NEXT_PUBLIC_SITE_URL` and `SITE_URL` to the same local origin

2. **Private internal/Tailscale access**
   - bind Kanban to an internal IP (for example a Tailscale IP)
   - keep tunnel ingress off
   - set `NEXT_PUBLIC_SITE_URL` and `SITE_URL` to that same internal origin

3. **Shared/public mode**
   - keep Kanban bound somewhere the local tunnel process can reach
   - add Cloudflare Tunnel ingress for the public hostname
   - set `NEXT_PUBLIC_SITE_URL` and `SITE_URL` to the public URL used in magic-link emails

If auth emails point at the wrong place, the usual fix is updating `SITE_URL` and `NEXT_PUBLIC_SITE_URL`, not just the service bind host or tunnel.

## Skills

Repo copies of the SuperClaw-related agent skills live under:
- [`skills/superclaw/`](./skills/superclaw/)
- [`skills/kanban/`](./skills/kanban/)

These repo copies are for versioning and sharing.
Active OpenClaw skill copies should still live under `~/.openclaw/skills/`.

Typical sync command:

```bash
mkdir -p ~/.openclaw/skills
rsync -a ~/.openclaw/workspace/apps/superclaw/skills/ ~/.openclaw/skills/
```

## Kanban worker runtime

Kanban worker runs use one canonical runtime contract everywhere:
- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

Worker source-of-truth split:
- normal scheduled runs use live `GET /inbox`
- tracked manual runs use `GET /session/targets?sessionId=...` so claimed cards do not disappear after moving to `In Progress`

Derive them from the Kanban app with:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/resolve-worker-env.sh --exports
```

Persist those values in the OpenClaw gateway service runtime.

Sandboxed Kanban workers are manual on purpose:
- do **not** auto-mirror these values into `agents.defaults.sandbox.docker.env`
- when a sandboxed agent needs Kanban access, set `KANBAN_BASE_URL` / `KANBAN_AGENT_TOKEN` explicitly for that agent under `agents.list[].sandbox.docker.env`
- `KANBAN_AGENT_SHARED_TOKEN` remains the default shared credential for trusted/local agents
- dedicated per-agent credentials are supported for isolation; if an agent has a dedicated Kanban credential, the shared token is no longer accepted for that agent id
- helper for provisioning a dedicated per-agent credential locally:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/provision-agent-credential.mjs <agent-id> --json
```

## Docs

- Human install: [`INSTALL.md`](./INSTALL.md)
- Agent install runbook: [`AGENT_INSTALL.md`](./AGENT_INSTALL.md)
- Dashboard details: [`dashboard/README.md`](./dashboard/README.md)
- Kanban details: [`kanban/README.md`](./kanban/README.md)
- Extension details: [`extension/README.md`](./extension/README.md)
