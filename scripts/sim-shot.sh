#!/usr/bin/env bash
# Headlessly run the official EvenHub simulator against the glasses build and
# capture the REAL 576x288 glasses framebuffer to a PNG. Prereqs: the simulator
# installed (npm i @evenrealities/evenhub-simulator) plus its system deps
# (libwebkit2gtk-4.1) and xvfb. Usage: scripts/sim-shot.sh [out.png] [action]
set -uo pipefail
OUT="${1:-glasses-shot.png}"; ACTION="${2:-}"; PORT=9898
npm run build:glasses >/dev/null 2>&1
npx vite preview --config vite.glasses.config.ts --port 5175 >/tmp/gp.log 2>&1 &
sleep 2
xvfb-run -a node node_modules/@evenrealities/evenhub-simulator/bin/index.js \
  --automation-port "$PORT" http://localhost:5175 >/tmp/sim.log 2>&1 &
sleep 11
[ -n "$ACTION" ] && curl -s -X POST -H 'content-type: application/json' \
  -d "{\"action\":\"$ACTION\"}" "http://127.0.0.1:$PORT/api/input" >/dev/null && sleep 1
curl -s "http://127.0.0.1:$PORT/api/screenshot/glasses" -o "$OUT"
echo "warnings:"; grep -iE "validation failed|not found|glyph" /tmp/sim.log | head || true
pkill -f evenhub-simulator 2>/dev/null; pkill -f "vite preview" 2>/dev/null; pkill Xvfb 2>/dev/null
echo "wrote $OUT"
