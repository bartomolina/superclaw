<p align="center">
  <img src="./superclaw-logo.png" alt="SuperClaw" width="220">
</p>

# 🦞 SuperClaw — Companion suite for OpenClaw

<p align="center">
  <strong>Dashboard, Kanban, and browser tooling for running OpenClaw day to day.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenClaw-companion-7C3AED?style=for-the-badge" alt="OpenClaw companion">
  <img src="https://img.shields.io/badge/Runtime-local--first-111827?style=for-the-badge" alt="Local first runtime">
  <img src="https://img.shields.io/badge/Services-systemd-2563EB?style=for-the-badge" alt="Systemd services">
</p>

**SuperClaw** is the local companion suite for [OpenClaw](https://github.com/openclaw/openclaw).
It adds the practical surfaces around an OpenClaw install: a dashboard for visibility and ops, a Kanban app for tracked agent work, and a browser extension for sending UI feedback into the workflow.

It is designed to live on the same machine as OpenClaw, stay local-first by default, and run comfortably in dev mode with long-lived services managed by `systemd`.

[Install runbook](./AGENT_INSTALL.md) · [Dashboard docs](./dashboard/README.md) · [Kanban docs](./kanban/README.md) · [Extension docs](./extension/README.md)

## What’s in the suite

- **Dashboard** — inspect and manage OpenClaw from a local web UI
- **Kanban** — track ideas, tasks, and agent workflow in a dedicated board app
- **Extension** — capture UI feedback and send it straight into Kanban

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

Use the root docs for suite-wide conventions and the per-app READMEs for app-specific setup.

## Default runtime model

Unless you intentionally choose something else, SuperClaw assumes:

- install path: `~/.openclaw/workspace/apps/superclaw/`
- **Dashboard** on port `4000`
- **Kanban** on port `4100`
- long-running services managed by `systemd`
- dev mode is acceptable and often preferred
- public/shared exposure, when needed, goes through `cloudflared.service` / Cloudflare Tunnel

Canonical service names:

- `superclaw-dashboard.service`
- `superclaw-convex.service`
- `superclaw-kanban.service`

## Development

From `apps/superclaw/`:

```bash
pnpm lint
pnpm test
pnpm build
```

## Installation

SuperClaw assumes OpenClaw is already installed and working.

For a fresh local setup, follow [`AGENT_INSTALL.md`](./AGENT_INSTALL.md).

## Skills

Repo copies of the SuperClaw-related skills live in:

- [`skills/superclaw/`](./skills/superclaw/)
- [`skills/kanban/`](./skills/kanban/)

When skill behavior changes, keep the repo copies aligned with the active installed copies under `~/.openclaw/skills/`.
