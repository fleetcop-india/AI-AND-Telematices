#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Fleet OS v2.0 — Start Script
#  Usage: bash start.sh
# ═══════════════════════════════════════════════════════
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$SCRIPT_DIR/web-panel/backend/server.js"
PORT=8080

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install with: sudo apt install nodejs"
  exit 1
fi

# Kill any existing instance on port 8080
EXISTING=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "  ↺ Stopping old server on :$PORT (PID $EXISTING)"
  kill $EXISTING 2>/dev/null
  sleep 1
fi

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Fleet OS v2.0  —  Starting...      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Start server
cd "$SCRIPT_DIR"
node "$SERVER" &
NODE_PID=$!

# Wait for server to be ready
echo "  ⏳ Waiting for server..."
for i in $(seq 1 20); do
  sleep 0.5
  if curl -s http://localhost:$PORT/api/health &>/dev/null; then
    break
  fi
done

# Check it started
if curl -s http://localhost:$PORT/api/health &>/dev/null; then
  echo ""
  echo "  ✅ Fleet OS is running!"
  echo ""
  echo "  ┌────────────────────────────────────────┐"
  echo "  │  🌐  http://localhost:$PORT              │"
  echo "  │  📧  admin@fleetcop.com                 │"
  echo "  │  🔑  Admin@123                          │"
  echo "  └────────────────────────────────────────┘"
  echo ""
  # Try to open browser
  if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:$PORT &>/dev/null &
  fi
  echo "  Press Ctrl+C to stop"
  wait $NODE_PID
else
  echo "  ❌ Server failed to start. Check logs above."
  exit 1
fi
