# 🦞 SuperClaw — Companion suite for OpenClaw

<p align="center">
  <img src="./superclaw-logo.png" alt="SuperClaw" width="500">
</p>

<p align="center">
  <strong>Dashboard, Kanban, and browser extension for running OpenClaw day to day.</strong>
</p>

**SuperClaw** is the local companion suite for [OpenClaw](https://github.com/openclaw/openclaw).
It adds the practical surfaces around an OpenClaw install: a dashboard for visibility and ops, a Kanban app for tracked agent work, and a browser extension for sending UI feedback into the workflow.

[Install](./INSTALL.md) · [Recommended setup](./RECOMMENDED_SETUP.md) · [Dashboard docs](./dashboard/README.md) · [Kanban docs](./kanban/README.md) · [Extension docs](./extension/README.md) · [License](./LICENSE)

## Requirements

- **OpenClaw** already installed and working
- **Convex** — required for Kanban
- **Resend** — required for Kanban email/auth flows
- **Cloudflare Tunnel** — recommended for managing/exposing the apps

For the broader machine/bootstrap setup, see [`RECOMMENDED_SETUP.md`](./RECOMMENDED_SETUP.md).

## Installation

Installing SuperClaw sets up the suite inside your main OpenClaw workspace and syncs the related skills.

Expected result:

```text
~/.openclaw/workspace/
├── apps/
│   └── superclaw/
│       ├── dashboard/
│       ├── kanban/
│       └── extension/
└── skills/
    ├── superclaw/
    └── kanban/
```

For the full installation flow, see [`INSTALL.md`](./INSTALL.md).

## Skills

Repo copies of the SuperClaw-related skills live in:

- [`skills/superclaw/`](./skills/superclaw/)
- [`skills/kanban/`](./skills/kanban/)

When skill behavior changes, keep the repo copies aligned with the active installed copies under `~/.openclaw/skills/`.
