# 🦞 SuperClaw — Companion suite for OpenClaw

<p align="center">
  <img src="./superclaw-logo.png" alt="SuperClaw" width="500">
</p>

<p align="center">
  <strong>Dashboard, Kanban, and browser extension for running OpenClaw day to day.</strong>
</p>

**SuperClaw** is the local companion suite for [OpenClaw](https://github.com/openclaw/openclaw).
It adds the practical surfaces around an OpenClaw install: a dashboard for visibility and ops, a Kanban app for tracked agent work, and a browser extension for sending UI feedback into the workflow.

[Install](./INSTALL.md) · [Dashboard docs](./dashboard/README.md) · [Kanban docs](./kanban/README.md) · [Extension docs](./extension/README.md) · [License](./LICENSE)

## Requirements

- **Convex** — remote backend/database for Kanban tasks, boards, and workflow state
- **Resend** — for Kanban auth emails

### Optional

- **Cloudflare Tunnel** — recommended for exposing/managing the apps cleanly
- **Gemini API key** — optional for dashboard avatar generation during the agent creation flow

## Installation

SuperClaw will install the suite into your main OpenClaw workspace and sync the related skills:

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

Take a look at [`INSTALL.md`](./INSTALL.md), or point your OpenClaw agent at it and have it run the setup for you.
