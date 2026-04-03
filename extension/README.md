# SuperClaw Extension

Extension for sending UI feedback into SuperClaw Kanban.

For suite-level setup, see:
- `../README.md`
- `../INSTALL.md`

## Basics

- path: `apps/superclaw/extension/`
- build output: `.output/chrome-mv3/`

## Commands

```bash
pnpm install
pnpm build
pnpm test
```

Optional:

```bash
pnpm zip
```

## Notes

- The extension talks to Kanban, not directly to OpenClaw.
- Default local Kanban URL is `http://127.0.0.1:4100`.
- Install it as an unpacked extension or from a built artifact.
