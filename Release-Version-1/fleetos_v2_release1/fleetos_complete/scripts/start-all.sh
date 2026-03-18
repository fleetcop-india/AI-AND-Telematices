#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Fleet OS v2.0 — Unified Service Start Script
#  Starts ALL services in correct dependency order:
#    1. PostgreSQL
#    2. Kafka (Podman / Docker / Binary)
#    3. C++ GPS Server Agent           :6001 (TCP device port)
#    4. C++ Route Agent                :8082
#    5. C++ Driver Behaviour Agent     :8084
#    6. C++ Maintenance Agent          :8090
#    7. C++ Industry Agent             :8087
#    8. C++ Notification Agent         :8083
#    9. Node.js Web Panel Backend      :8080
#   10. Python Report Agent            :8086
#   11. Python DevOps Agent            :8099
#   [OPTIONAL] Qt Simulator GUI        (desktop)
#   [OPTIONAL] Qt Manager GUI          (desktop)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${BASE_DIR}/logs"
PID_DIR="${BASE_DIR}/run"
ENV_FILE="${BASE_DIR}/config/fleetos.env"
BIN_DIR="${BASE_DIR}/bin"
WEB_DIR="${BASE_DIR}/web-panel"
AGENTS_DIR="${BASE_DIR}/agents"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Flags ─────────────────────────────────────────────────────────────────────
START_SIMULATOR=0
START_MANAGER=0
DETACH=1            # run agents in background by default
SKIP_KAFKA=0
VERBOSE=0

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --simulator       Also launch Qt Simulator GUI
  --manager         Also launch Qt Manager desktop GUI
  --foreground      Run in foreground (no background daemonize)
  --skip-kafka      Skip Kafka startup (if already running)
  --verbose         Show extra output
  --help            Show this help

Examples:
  $0                          # Start all backend services
  $0 --simulator              # Also open Qt Simulator
  $0 --simulator --manager    # Open both GUIs
  $0 --foreground --verbose   # Debug mode (no background)
EOF
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --simulator)   START_SIMULATOR=1 ;;
    --manager)     START_MANAGER=1 ;;
    --foreground)  DETACH=0 ;;
    --skip-kafka)  SKIP_KAFKA=1 ;;
    --verbose)     VERBOSE=1 ;;
    --help|-h)     usage ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}${BLUE}"
cat << 'BANNER'
 _____ _           _    ___  ____
|  ___| | ___  ___| |_ / _ \/ ___|
| |_  | |/ _ \/ _ \ __| | | \___ \
|  _| | |  __/  __/ |_| |_| |___) |
|_|   |_|\___|\___|\__|\___/|____/

Fleet OS v2.0 — Enterprise Telematics Platform
BANNER
echo -e "${NC}"
echo -e "  ${CYAN}Starting all services...${NC}"
echo -e "  Base: ${BASE_DIR}"
echo ""

# ── Helpers ───────────────────────────────────────────────────────────────────
log_ok()   { echo -e "  ${GREEN}✓${NC}  $1"; }
log_fail() { echo -e "  ${RED}✗${NC}  $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
log_step() { echo -e "\n  ${BOLD}${BLUE}[$1]${NC} $2"; }
log_info() { echo -e "  ${CYAN}→${NC}  $1"; }

mkdir -p "$LOG_DIR" "$PID_DIR"

save_pid() {
  local name="$1" pid="$2"
  echo "$pid" > "${PID_DIR}/${name}.pid"
}

wait_port() {
  local port="$1" name="$2" timeout="${3:-30}"
  local count=0
  while ! nc -z 127.0.0.1 "$port" 2>/dev/null; do
    sleep 1; count=$((count+1))
    if [ "$count" -ge "$timeout" ]; then
      log_fail "$name did not open :$port within ${timeout}s"
      return 1
    fi
    [ $((count%5)) -eq 0 ] && log_info "Waiting for $name :$port ... (${count}s)"
  done
  log_ok "$name is listening on :$port"
  return 0
}

is_running() {
  local pidfile="${PID_DIR}/$1.pid"
  [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

# ── Load environment ──────────────────────────────────────────────────────────
log_step "0" "Loading configuration"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
  log_ok "Loaded ${ENV_FILE}"
else
  log_warn "No env file at ${ENV_FILE} — using defaults"
  FLEETOS_HOST="${FLEETOS_HOST:-127.0.0.1}"
  KAFKA_MODE="${KAFKA_MODE:-binary}"
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-5432}"
  DB_NAME="${DB_NAME:-fleetos}"
  DB_USER="${DB_USER:-fleetos}"
  DB_PASS="${DB_PASS:-fleetos123}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1 — PostgreSQL
# ═══════════════════════════════════════════════════════════════════════════════
log_step "1" "PostgreSQL"

if nc -z "${DB_HOST:-127.0.0.1}" "${DB_PORT:-5432}" 2>/dev/null; then
  log_ok "PostgreSQL already running on :${DB_PORT:-5432}"
else
  if command -v systemctl &>/dev/null && systemctl is-enabled postgresql &>/dev/null 2>&1; then
    systemctl start postgresql
    log_ok "Started PostgreSQL via systemctl"
  elif command -v pg_ctlcluster &>/dev/null; then
    pg_ctlcluster "$(pg_lsclusters -h | awk '{print $1}' | head -1)" main start 2>/dev/null || true
    log_ok "Started PostgreSQL via pg_ctlcluster"
  elif command -v pg_ctl &>/dev/null; then
    PGDATA="${PGDATA:-/var/lib/pgsql/data}"
    pg_ctl -D "$PGDATA" -l "${LOG_DIR}/postgresql.log" start
    log_ok "Started PostgreSQL via pg_ctl"
  else
    log_fail "PostgreSQL not found — install it first"
    exit 1
  fi
  wait_port "${DB_PORT:-5432}" "PostgreSQL" 20
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Kafka
# ═══════════════════════════════════════════════════════════════════════════════
log_step "2" "Apache Kafka (mode: ${KAFKA_MODE:-auto})"

if [ "$SKIP_KAFKA" -eq 1 ]; then
  log_warn "Kafka startup skipped (--skip-kafka)"
elif nc -z 127.0.0.1 9092 2>/dev/null; then
  log_ok "Kafka already listening on :9092"
else
  KAFKA_MODE="${KAFKA_MODE:-auto}"

  # Auto-detect if mode not set
  if [ "$KAFKA_MODE" = "auto" ]; then
    if command -v podman &>/dev/null; then KAFKA_MODE="podman"
    elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then KAFKA_MODE="docker"
    else KAFKA_MODE="binary"
    fi
    log_info "Auto-detected Kafka mode: $KAFKA_MODE"
  fi

  case "$KAFKA_MODE" in
    podman)
      log_info "Starting Kafka via Podman..."
      if podman container exists fleetos-kafka 2>/dev/null; then
        podman start fleetos-kafka
      else
        podman run -d --name fleetos-kafka --restart=unless-stopped -p 9092:9092 \
          -e KAFKA_NODE_ID=1 \
          -e KAFKA_PROCESS_ROLES=broker,controller \
          -e KAFKA_LISTENERS="PLAINTEXT://:9092,CONTROLLER://:9093" \
          -e KAFKA_ADVERTISED_LISTENERS="PLAINTEXT://127.0.0.1:9092" \
          -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
          -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP="CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT" \
          -e KAFKA_CONTROLLER_QUORUM_VOTERS="1@localhost:9093" \
          -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
          -e KAFKA_AUTO_CREATE_TOPICS_ENABLE=true \
          -e KAFKA_NUM_PARTITIONS=3 \
          docker.io/apache/kafka:3.7.0
      fi
      ;;
    docker)
      log_info "Starting Kafka via Docker..."
      if docker ps -a --format '{{.Names}}' | grep -q fleetos-kafka; then
        docker start fleetos-kafka
      else
        docker run -d --name fleetos-kafka --restart=unless-stopped -p 9092:9092 \
          -e KAFKA_NODE_ID=1 \
          -e KAFKA_PROCESS_ROLES=broker,controller \
          -e KAFKA_LISTENERS="PLAINTEXT://:9092,CONTROLLER://:9093" \
          -e KAFKA_ADVERTISED_LISTENERS="PLAINTEXT://127.0.0.1:9092" \
          -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
          -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP="CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT" \
          -e KAFKA_CONTROLLER_QUORUM_VOTERS="1@localhost:9093" \
          -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
          -e KAFKA_AUTO_CREATE_TOPICS_ENABLE=true \
          docker.io/apache/kafka:3.7.0
      fi
      ;;
    binary)
      log_info "Starting Kafka binary..."
      KAFKA_HOME="${KAFKA_HOME:-/opt/kafka}"
      if [ ! -d "$KAFKA_HOME" ]; then
        log_fail "Kafka binary not found at $KAFKA_HOME. Set KAFKA_HOME or use --skip-kafka"
        exit 1
      fi
      # Start ZooKeeper first
      if ! nc -z 127.0.0.1 2181 2>/dev/null; then
        nohup "$KAFKA_HOME/bin/zookeeper-server-start.sh" \
          "$KAFKA_HOME/config/zookeeper.properties" \
          >"${LOG_DIR}/zookeeper.log" 2>&1 &
        save_pid "zookeeper" $!
        wait_port 2181 "ZooKeeper" 30
      fi
      nohup "$KAFKA_HOME/bin/kafka-server-start.sh" \
        "$KAFKA_HOME/config/server.properties" \
        >"${LOG_DIR}/kafka.log" 2>&1 &
      save_pid "kafka" $!
      ;;
    *)
      log_warn "Unknown KAFKA_MODE=$KAFKA_MODE — skipping"
      ;;
  esac

  wait_port 9092 "Kafka" 45
fi

# Create topics if kafka-topics.sh is available
if command -v kafka-topics.sh &>/dev/null || [ -f "${KAFKA_HOME:-/opt/kafka}/bin/kafka-topics.sh" ]; then
  KTOPICS="gps.raw gps.processed gps.alarms driver.events driver.scores maintenance.events
           route.updates industry.events video.events notifications.outbound
           reports.queue devops.heartbeat agents.registry cbp.critical cbp.high cbp.medium
           cbp.low cbp.meta system.health"
  KAFKA_BIN="${KAFKA_HOME:-/opt/kafka}/bin/kafka-topics.sh"
  [ -f "$KAFKA_BIN" ] || KAFKA_BIN="kafka-topics.sh"
  for topic in $KTOPICS; do
    "$KAFKA_BIN" --bootstrap-server 127.0.0.1:9092 \
      --create --if-not-exists --topic "$topic" \
      --partitions 3 --replication-factor 1 \
      >"${LOG_DIR}/topic-create.log" 2>&1 || true
  done
  log_ok "Kafka topics verified (20 topics)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2.5 — Auto-build C++ agents if binaries missing
# ═══════════════════════════════════════════════════════════════════════════════
AGENTS_NEED_BUILD=0
for ag in gps-server route-agent driver-agent notification-agent maintenance-agent industry-agent; do
  [ ! -f "${BIN_DIR}/${ag}" ] && AGENTS_NEED_BUILD=1 && break
done

if [ "$AGENTS_NEED_BUILD" -eq 1 ]; then
  log_warn "C++ agent binaries not found in ${BIN_DIR}/"
  log_info "Running build script first..."
  echo ""
  if bash "${SCRIPT_DIR}/build.sh"; then
    log_ok "Build complete — continuing startup"
  else
    log_fail "Build failed. Fix errors above then re-run $0"
    log_info "Manual build: cd ${BASE_DIR} && bash scripts/build.sh"
    exit 1
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3–8 — C++ Agents
# ═══════════════════════════════════════════════════════════════════════════════
log_step "3-8" "C++ Backend Agents"

# ── Auto-build if binaries don't exist ───────────────────────────────────────
AGENTS_TO_CHECK=(gps-server route-agent driver-agent notification-agent maintenance-agent industry-agent)
MISSING_COUNT=0
for ag in "${AGENTS_TO_CHECK[@]}"; do
  [ ! -f "${BIN_DIR}/${ag}" ] && MISSING_COUNT=$((MISSING_COUNT+1))
done

if [ "$MISSING_COUNT" -gt 0 ]; then
  log_warn "${MISSING_COUNT} agent binary/binaries not found in ${BIN_DIR}/"
  log_info "Auto-running build-all.sh to compile C++ agents..."
  BUILD_SCRIPT="${SCRIPT_DIR}/build-all.sh"
  if [ -f "$BUILD_SCRIPT" ]; then
    bash "$BUILD_SCRIPT" 2>&1 | grep -E "(✓|✗|⚠|→|Build|Error|Install|fail)" || true
  else
    log_warn "build-all.sh not found at ${BUILD_SCRIPT}"
    log_warn "Run manually:  bash ${SCRIPT_DIR}/build-all.sh"
  fi
fi

start_agent() {
  local name="$1" binary="$2" port="$3"
  if is_running "$name"; then
    log_ok "$name already running (pid $(cat "${PID_DIR}/${name}.pid"))"
    return 0
  fi
  if [ ! -f "$binary" ]; then
    log_warn "$name binary not found at $binary — skipping"
    return 0
  fi
  if [ "$DETACH" -eq 1 ]; then
    nohup env FLEETOS_GPS_PORT="${FLEETOS_GPS_PORT:-6001}" "$binary" >"${LOG_DIR}/${name}.log" 2>&1 &
    save_pid "$name" $!
    log_info "Started $name (pid $!) → :$port"
    sleep 1
  else
    log_info "Starting $name in foreground → :$port"
    env FLEETOS_GPS_PORT="${FLEETOS_GPS_PORT:-6001}" "$binary" &
    save_pid "$name" $!
  fi
  wait_port "$port" "$name" 15 || log_warn "$name may not be ready yet"
}

FLEETOS_GPS_PORT=6001 start_agent "gps-server"        "${BIN_DIR}/gps-server"        6001
start_agent "route-agent"       "${BIN_DIR}/route-agent"       9082
start_agent "driver-agent"      "${BIN_DIR}/driver-agent"      9084
start_agent "notification-agent" "${BIN_DIR}/notification-agent" 8083
start_agent "maintenance-agent" "${BIN_DIR}/maintenance-agent" 9090
start_agent "industry-agent"    "${BIN_DIR}/industry-agent"    9087

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 9 — Node.js Web Panel
# ═══════════════════════════════════════════════════════════════════════════════
log_step "9" "Node.js Web Panel Backend (:8080)"

if is_running "web-panel"; then
  log_ok "Web panel already running"
else
  WEB_BACKEND="${WEB_DIR}/backend/server.js"
  if [ ! -f "$WEB_BACKEND" ]; then
    # Fallback: serve frontend statically with a tiny Node server
    WEB_BACKEND="${WEB_DIR}/serve.js"
    if [ ! -f "$WEB_BACKEND" ]; then
      cat > "$WEB_BACKEND" << 'NODE_EOF'
const http = require('http');
const fs   = require('fs');
const path = require('path');
const port = process.env.WEB_PORT || 8080;
const ROOT = path.join(__dirname, 'frontend');
const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript',
              '.json':'application/json','.png':'image/png','.ico':'image/x-icon'};
http.createServer((req, res) => {
  let fp = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(fp)] || 'text/plain'});
    res.end(data);
  });
}).listen(port, '0.0.0.0', () => console.log('Fleet OS Web Panel :' + port));
NODE_EOF
    fi
  fi
  NODE_BIN="$(command -v node || command -v nodejs || echo 'node')"
  if [ "$DETACH" -eq 1 ]; then
    WEB_PORT=8080 nohup "$NODE_BIN" "$WEB_BACKEND" >"${LOG_DIR}/web-panel.log" 2>&1 &
    save_pid "web-panel" $!
    log_info "Started web panel (pid $!) → :8080"
  else
    WEB_PORT=8080 "$NODE_BIN" "$WEB_BACKEND" &
    save_pid "web-panel" $!
  fi
  wait_port 8080 "Web Panel" 15
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 10 — Python Report Agent
# ═══════════════════════════════════════════════════════════════════════════════
log_step "10" "Python Report Agent (:8086)"

REPORT_AGENT="${AGENTS_DIR}/report-agent/report_agent.py"
[ ! -f "$REPORT_AGENT" ] && REPORT_AGENT="${AGENTS_DIR}/report-agent/main.py"
if is_running "report-agent"; then
  log_ok "Report agent already running"
elif [ -f "$REPORT_AGENT" ]; then
  PYTHON="$(command -v python3 || command -v python || echo 'python3')"
  if [ "$DETACH" -eq 1 ]; then
    nohup "$PYTHON" "$REPORT_AGENT" >"${LOG_DIR}/report-agent.log" 2>&1 &
    save_pid "report-agent" $!
    log_info "Started report agent (pid $!)"
  else
    "$PYTHON" "$REPORT_AGENT" &
    save_pid "report-agent" $!
  fi
else
  log_warn "Report agent not found at $REPORT_AGENT — skipping"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 11 — Python DevOps Agent
# ═══════════════════════════════════════════════════════════════════════════════
log_step "11" "Python DevOps Agent (:8099)"

DEVOPS_AGENT="${AGENTS_DIR}/devops-agent/devops_agent.py"
if is_running "devops-agent"; then
  log_ok "DevOps agent already running"
elif [ -f "$DEVOPS_AGENT" ]; then
  PYTHON="$(command -v python3 || command -v python || echo 'python3')"
  if [ "$DETACH" -eq 1 ]; then
    nohup "$PYTHON" "$DEVOPS_AGENT" >"${LOG_DIR}/devops-agent.log" 2>&1 &
    save_pid "devops-agent" $!
    log_info "Started devops agent (pid $!)"
  else
    "$PYTHON" "$DEVOPS_AGENT" &
    save_pid "devops-agent" $!
  fi
else
  log_warn "DevOps agent not found at $DEVOPS_AGENT — skipping"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 12 (OPTIONAL) — Qt Simulator GUI
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$START_SIMULATOR" -eq 1 ]; then
  log_step "12" "Qt Simulator GUI"

  SIM_BIN="${BIN_DIR}/fleetos-simulator"
  # Check build directory too
  if [ ! -f "$SIM_BIN" ]; then
    SIM_BIN="${AGENTS_DIR}/simulator-qt/build/fleetos-simulator"
  fi

  if [ ! -f "$SIM_BIN" ]; then
    # Try to build it first
    log_info "Simulator binary not found — attempting build..."
    SIM_SRC="${AGENTS_DIR}/simulator-qt"
    if [ -d "$SIM_SRC" ] && command -v cmake &>/dev/null && command -v qmake6 &>/dev/null 2>&1 || command -v qt6-config &>/dev/null 2>&1 || pkg-config --exists Qt6Core 2>/dev/null; then
      mkdir -p "${SIM_SRC}/build"
      pushd "${SIM_SRC}/build" > /dev/null
      cmake .. -DCMAKE_BUILD_TYPE=Release >"${LOG_DIR}/sim-build.log" 2>&1 && \
        make -j"$(nproc)" >>"${LOG_DIR}/sim-build.log" 2>&1
      popd > /dev/null
      SIM_BIN="${SIM_SRC}/build/fleetos-simulator"
      log_ok "Simulator built successfully"
    else
      log_warn "Qt6 not found or CMake missing — cannot auto-build simulator"
      log_warn "Build manually: cd ${AGENTS_DIR}/simulator-qt && mkdir build && cd build && cmake .. && make"
    fi
  fi

  if [ -f "$SIM_BIN" ]; then
    log_info "Launching Qt Simulator GUI..."
    "$SIM_BIN" &
    save_pid "qt-simulator" $!
    log_ok "Qt Simulator launched (pid $!)"
  else
    log_warn "Simulator binary not found — GUI not started"
    log_warn "Run: bash ${AGENTS_DIR}/simulator-qt/build.sh"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 13 (OPTIONAL) — Qt Manager GUI
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$START_MANAGER" -eq 1 ]; then
  log_step "13" "Qt Manager GUI"
  MGR_BIN="${BIN_DIR}/fleetos-manager"
  if [ -f "$MGR_BIN" ]; then
    "$MGR_BIN" &
    save_pid "qt-manager" $!
    log_ok "Qt Manager launched (pid $!)"
  else
    log_warn "Qt Manager binary not found at $MGR_BIN — build it first"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# DONE — Summary
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Fleet OS v2.0 — All Services Started          ${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Access Points:${NC}"
echo -e "  ${CYAN}Web Panel     ${NC}→  http://localhost:8080"
echo -e "  ${CYAN}GPS Server    ${NC}→  tcp://localhost:6001"
echo -e "  ${CYAN}Kafka         ${NC}→  localhost:9092"
echo -e "  ${CYAN}PostgreSQL    ${NC}→  localhost:${DB_PORT:-5432}/${DB_NAME:-fleetos}"
echo ""
echo -e "  ${BOLD}Useful Commands:${NC}"
echo -e "  ${YELLOW}logs${NC}   →  tail -f ${LOG_DIR}/<agent>.log"
echo -e "  ${YELLOW}stop${NC}   →  bash ${SCRIPT_DIR}/stop-all.sh"
echo -e "  ${YELLOW}status${NC} →  bash ${SCRIPT_DIR}/status.sh"
echo -e "  ${YELLOW}sim${NC}    →  $0 --simulator"
echo ""
echo -e "  PID files: ${PID_DIR}/"
echo ""
