#!/bin/bash
# Kills any existing web-panel process and starts fresh on port 8080
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND="$ROOT/web-panel/backend/server.js"

# Find node
NODE=$(which node 2>/dev/null || which nodejs 2>/dev/null)
if [ -z "$NODE" ]; then echo "❌ node not found"; exit 1; fi

# Kill any process holding port 8080
echo "→ Freeing port 8080..."
fuser -k 8080/tcp 2>/dev/null || true
# Also kill any node server.js processes
pkill -f "node.*server\.js" 2>/dev/null || true
sleep 1

echo "→ Fixing DB permissions..."
sudo -u postgres psql -d fleetos -c "
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO fleetos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleetos;
" 2>/dev/null || echo "  (skipped — may need sudo)"

echo "→ Starting web panel on :8080..."
cd "$ROOT"
WEB_PORT=8080 "$NODE" "$BACKEND" &
echo "  PID $!"
sleep 2

# Quick health check
if curl -sf http://localhost:8080/api/health > /dev/null 2>&1; then
  echo "✅ Web panel running at http://localhost:8080"
  echo "🔍 Check data: http://localhost:8080/api/counts"
else
  echo "❌ Web panel failed to start — check logs above"
fi
