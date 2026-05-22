#!/usr/bin/env bash
# Local dev server. Service Workers require a real http origin (not file://).
PORT="${1:-8123}"
echo "autosplat-viewer → http://localhost:${PORT}/"
exec python3 -m http.server "$PORT"
