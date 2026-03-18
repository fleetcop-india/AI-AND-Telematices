#!/usr/bin/env bash
# Fleet OS v2.0 — Service status check
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
PID_DIR="${BASE_DIR}/run"
ENV_FILE="${BASE_DIR}/config/fleetos.env"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

[ -f "$ENV_FILE" ] && { set -a; source "$ENV_FILE"; set +a; }

echo -e "${BOLD}Fleet OS v2.0 — Service Status${NC}"
echo -e "$(date '+%Y-%m-%d %H:%M:%S')\n"

check() {
  local name="$1" port="$2"
  local pid_ok=0 port_ok=0
  local pidfile="${PID_DIR}/${name}.pid"
  [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null && pid_ok=1
  [ -n "$port" ] && nc -z 127.0.0.1 "$port" 2>/dev/null && port_ok=1
  if [ -n "$port" ]; then
    if [ "$port_ok" -eq 1 ]; then
      echo -e "  ${GREEN}●${NC}  ${BOLD}${name}${NC} — port :${port} ${GREEN}OPEN${NC}"
    else
      echo -e "  ${RED}●${NC}  ${BOLD}${name}${NC} — port :${port} ${RED}CLOSED${NC}"
    fi
  else
    if [ "$pid_ok" -eq 1 ]; then
      echo -e "  ${GREEN}●${NC}  ${BOLD}${name}${NC} — running (pid $(cat "$pidfile"))"
    else
      echo -e "  ${RED}●${NC}  ${BOLD}${name}${NC} — ${RED}not running${NC}"
    fi
  fi
}

echo -e "${CYAN}Infrastructure:${NC}"
check "postgresql"          "${DB_PORT:-5432}"
check "kafka"               "9092"

echo -e "\n${CYAN}C++ Agents:${NC}"
check "gps-server"          "6001"
check "route-agent"         "9082"
check "driver-agent"        "9084"
check "notification-agent"  "8083"
check "maintenance-agent"   "9090"
check "industry-agent"      "9087"

echo -e "\n${CYAN}Web & Python:${NC}"
check "web-panel"           "8080"
check "report-agent"        "8086"
check "devops-agent"        "8099"

echo -e "\n${CYAN}Desktop GUIs:${NC}"
check "qt-simulator"        ""
check "qt-manager"          ""

echo -e "\n  ${BOLD}Web Panel:${NC}  http://localhost:8080"
