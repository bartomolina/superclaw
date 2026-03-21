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

## Docs

- Human install: [`INSTALL.md`](./INSTALL.md)
- Agent install runbook: [`AGENT_INSTALL.md`](./AGENT_INSTALL.md)
- Dashboard details: [`dashboard/README.md`](./dashboard/README.md)
- Kanban details: [`kanban/README.md`](./kanban/README.md)
- Extension details: [`extension/README.md`](./extension/README.md)
