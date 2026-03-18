#!/usr/bin/env bash
# Fleet OS v2.0 — Stop all services
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
PID_DIR="${BASE_DIR}/run"
ENV_FILE="${BASE_DIR}/config/fleetos.env"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

[ -f "$ENV_FILE" ] && { set -a; source "$ENV_FILE"; set +a; }
KAFKA_MODE="${KAFKA_MODE:-auto}"

echo -e "${BOLD}Fleet OS v2.0 — Stopping all services${NC}\n"

stop_pid() {
  local name="$1"
  local pidfile="${PID_DIR}/${name}.pid"
  if [ -f "$pidfile" ]; then
    local pid; pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
      echo -e "  ${GREEN}✓${NC}  Stopped $name (pid $pid)"
    else
      echo -e "  ${YELLOW}–${NC}  $name not running (stale pid $pid)"
    fi
    rm -f "$pidfile"
  else
    echo -e "  ${YELLOW}–${NC}  $name: no PID file"
  fi
}

# Stop C++ agents and Python agents and web panel
for svc in gps-server route-agent driver-agent notification-agent \
            maintenance-agent industry-agent web-panel \
            report-agent devops-agent qt-simulator qt-manager \
            zookeeper kafka; do
  stop_pid "$svc"
done

# Stop Kafka container if container mode
case "$KAFKA_MODE" in
  podman)
    if command -v podman &>/dev/null && podman container exists fleetos-kafka 2>/dev/null; then
      podman stop fleetos-kafka 2>/dev/null && echo -e "  ${GREEN}✓${NC}  Kafka Podman container stopped"
    fi
    ;;
  docker)
    if command -v docker &>/dev/null && docker ps -q -f name=fleetos-kafka | grep -q .; then
      docker stop fleetos-kafka 2>/dev/null && echo -e "  ${GREEN}✓${NC}  Kafka Docker container stopped"
    fi
    ;;
esac

echo -e "\n  ${GREEN}All Fleet OS services stopped.${NC}"
