# 🦞 SuperClaw — Companion suite for OpenClaw

<p align="center">
  <img src="./assets/superclaw-logo.png" alt="SuperClaw" width="500">
</p>

<p align="center">
  <strong>Dashboard, Kanban, and browser extension for running OpenClaw day to day.</strong>
</p>

**SuperClaw** is the local companion suite for [OpenClaw](https://github.com/openclaw/openclaw).
It gives you a dashboard for managing agents and seeing useful info from your VPS, plus a Kanban app for coordinating work between agents and humans.

By default, the apps are meant to run alongside OpenClaw in **dev mode**. The idea is to give you a solid starting point you can install, run locally, and then adapt to your own setup and workflow.

<p align="center">
  <a href="./INSTALL.md">Install &amp; use</a> · <a href="./OPENCLAW_SETUP.md">Recommended setup</a> · <a href="./dashboard/README.md">Dashboard docs</a> · <a href="./kanban/README.md">Kanban docs</a> · <a href="./extension/README.md">Extension docs</a> · <a href="./LICENSE">License</a>
</p>

<table>
  <tr>
    <td align="center" width="33.33%">
      <img src="./assets/dashboard-agents.png" alt="SuperClaw dashboard agents view" width="100%"><br>
      <sub><strong>Dashboard · Agents</strong></sub>
    </td>
    <td align="center" width="33.33%">
      <img src="./assets/dashboard-ops.png" alt="SuperClaw dashboard ops view" width="100%"><br>
      <sub><strong>Dashboard · Ops</strong></sub>
    </td>
    <td align="center" width="33.33%">
      <img src="./assets/kanban.png" alt="SuperClaw kanban board" width="100%"><br>
      <sub><strong>Kanban</strong></sub>
    </td>
  </tr>
</table>

## Requirements

- **[Convex](https://www.convex.dev/)** — remote backend/database for Kanban tasks, boards, and workflow state
- **[Resend](https://resend.com/)** — for Kanban auth emails

### Optional

- **[Gemini API key](https://aistudio.google.com/)** — optional for dashboard avatar generation during the agent creation flow
- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** — recommended for exposing/managing apps cleanly

## Install and use

SuperClaw installs into your main OpenClaw workspace:

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

Before installing, check [`OPENCLAW_SETUP.md`](./OPENCLAW_SETUP.md) for the recommended base OpenClaw environment around the suite.

Then follow [`INSTALL.md`](./INSTALL.md), or point your OpenClaw agent at it and have it run the setup for you.

The default flow runs the apps in dev mode and treats this repo as a base you can adapt to your own needs after the initial install.
