#!/bin/bash
echo "  Stopping any existing Fleet OS processes..."
kill $(lsof -ti:8080) 2>/dev/null && sleep 1 || true
kill $(lsof -ti:6001) 2>/dev/null || true
kill $(lsof -ti:6002) 2>/dev/null || true

echo "  Starting Fleet OS Web Panel..."
cd "$(dirname "$0")"
node web-panel/backend/server.js
