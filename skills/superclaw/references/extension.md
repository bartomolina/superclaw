# SuperClaw Extension

## Purpose

The extension sends UI feedback into SuperClaw Kanban.

## Location

- App path: `apps/superclaw/extension/`
- Build output: `.output/chrome-mv3/`

## Runtime model

- built locally
- installed manually in the browser
- depends on the Kanban side remaining compatible with the extension's API expectations

## Working rules

1. Keep extension assumptions aligned with Kanban endpoints and auth expectations.
2. If local build/install steps change, update:
   - `README.md`
   - `AGENT_INSTALL.md`
   - `extension/README.md`
3. If the extension depends on new suite-level conventions, document them at the repo root rather than only inside the extension folder.
