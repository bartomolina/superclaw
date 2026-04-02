# SuperClaw

SuperClaw is the companion suite for OpenClaw.

It has three parts:
- **Dashboard** — inspect and manage OpenClaw
- **Kanban** — board and workflow app
- **Extension** — send UI feedback into Kanban

## Repo layout

```text
apps/superclaw/
├── README.md
├── AGENT_INSTALL.md
├── dashboard/
├── kanban/
├── extension/
└── skills/
```

## Defaults

- path: `~/.openclaw/workspace/apps/superclaw/`
- Dashboard port: `4000`
- Kanban port: `4100`
- services:
  - `superclaw-dashboard.service`
  - `superclaw-convex.service`
  - `superclaw-kanban.service`
- local-first
- dev mode by default
- `systemd` for long-running services
- Cloudflare Tunnel when public exposure is needed

## Commands

From `apps/superclaw/`:

```bash
pnpm test
pnpm lint
pnpm build
```

## Install

Use [`AGENT_INSTALL.md`](./AGENT_INSTALL.md).

## App docs

- [`dashboard/README.md`](./dashboard/README.md)
- [`kanban/README.md`](./kanban/README.md)
- [`extension/README.md`](./extension/README.md)

## Skills

Repo copies of the SuperClaw-related skills live in:
- [`skills/superclaw/`](./skills/superclaw/)
- [`skills/kanban/`](./skills/kanban/)
