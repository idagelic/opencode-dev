#!/usr/bin/env bash
set -euo pipefail

PORT="${OPENCODE_PORT:-4096}"
HOST="${OPENCODE_HOST:-0.0.0.0}"

ARGS=(serve --port "$PORT" --hostname "$HOST")

if [ -n "${OPENCODE_CORS:-}" ]; then
  for origin in $OPENCODE_CORS; do
    ARGS+=(--cors "$origin")
  done
fi

if [ -n "${OPENCODE_MDNS:-}" ] && [ "$OPENCODE_MDNS" = "true" ]; then
  ARGS+=(--mdns)
fi

echo "Starting opencode server on ${HOST}:${PORT}"
exec opencode "${ARGS[@]}" "$@"
