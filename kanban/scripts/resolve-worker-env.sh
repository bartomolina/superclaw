#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
MODE="${1:-plain}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

site_url="$(awk -F= '/^NEXT_PUBLIC_CONVEX_SITE_URL=/{sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE")"
site_url="${site_url%$'\r'}"
site_url="${site_url#\"}"
site_url="${site_url%\"}"
site_url="${site_url#\'}"
site_url="${site_url%\'}"

if [[ -z "$site_url" ]]; then
  echo "NEXT_PUBLIC_CONVEX_SITE_URL is missing in $ENV_FILE" >&2
  exit 1
fi

token="$(cd "$ROOT_DIR" && pnpm exec convex env get KANBAN_AGENT_SHARED_TOKEN | tr -d '\r' | tail -n 1)"
if [[ -z "$token" ]]; then
  echo "KANBAN_AGENT_SHARED_TOKEN is missing from the Convex deployment" >&2
  exit 1
fi

base_url="${site_url%/}/agent/kanban"

case "$MODE" in
  --exports)
    printf 'export KANBAN_BASE_URL=%q\n' "$base_url"
    printf 'export KANBAN_AGENT_TOKEN=%q\n' "$token"
    ;;
  plain|"")
    printf 'KANBAN_BASE_URL=%s\n' "$base_url"
    printf 'KANBAN_AGENT_TOKEN=%s\n' "$token"
    ;;
  *)
    echo "Unknown option: $MODE" >&2
    echo "Usage: $0 [--exports]" >&2
    exit 1
    ;;
esac
