# 🦞 SuperClaw — Companion suite for OpenClaw

<p align="center">
  <img src="./superclaw-logo.png" alt="SuperClaw" width="500">
</p>

<p align="center">
  <strong>Dashboard, Kanban, and browser extension for running OpenClaw day to day.</strong>
</p>

**SuperClaw** is the local companion suite for [OpenClaw](https://github.com/openclaw/openclaw).
It gives you a dashboard for managing agents and seeing useful info from your VPS, plus a Kanban app for coordinating work between agents and humans.

[Install](./INSTALL.md) · [Dashboard docs](./dashboard/README.md) · [Kanban docs](./kanban/README.md) · [Extension docs](./extension/README.md) · [License](./LICENSE)

## Requirements

- **[Convex](https://www.convex.dev/)** — remote backend/database for Kanban tasks, boards, and workflow state
- **[Resend](https://resend.com/)** — for Kanban auth emails

### Optional

- **[Gemini API key](https://aistudio.google.com/)** — optional for dashboard avatar generation during the agent creation flow
- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** — recommended for exposing/managing apps cleanly

## Installation

SuperClaw will install the suite into your main OpenClaw workspace:

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
