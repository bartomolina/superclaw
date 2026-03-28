# SuperClaw

SuperClaw is the local companion suite for OpenClaw.

It has three parts:
- **Dashboard** — manage and inspect OpenClaw
- **Kanban** — task board and agent workflow UI
- **Extension** — send UI feedback into Kanban

## Default install model

Keep it simple and opinionated:

- install inside the main OpenClaw workspace
- canonical path: `~/.openclaw/workspace/apps/superclaw/`
- run locally on the same machine as OpenClaw
- run in **dev mode** for hot reload
- manage processes with **pm2**
- use fixed local ports:
  - Dashboard: `4000`
  - Kanban: `4100`
- build the extension locally and install it manually

SuperClaw assumes OpenClaw is already installed and working.

## Fixed pm2 names

Use these names:
- `superclaw-dashboard`
- `convex`
- `superclaw-kanban`

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
- when a sandboxed agent needs Kanban access, set `KANBAN_BASE_URL` / `KANBAN_AGENT_TOKEN` explicitly for that agent

## Docs

- Human install: [`INSTALL.md`](./INSTALL.md)
- Agent install runbook: [`AGENT_INSTALL.md`](./AGENT_INSTALL.md)
- Dashboard details: [`dashboard/README.md`](./dashboard/README.md)
- Kanban details: [`kanban/README.md`](./kanban/README.md)
- Extension details: [`extension/README.md`](./extension/README.md)
