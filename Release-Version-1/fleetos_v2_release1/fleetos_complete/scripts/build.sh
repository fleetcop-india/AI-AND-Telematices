#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Fleet OS v2.0 — Build All C++ Agents
#  Run this once after install.sh to compile all agents into bin/
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="${BASE_DIR}/build"
BIN_DIR="${BASE_DIR}/bin"
LOG_DIR="${BASE_DIR}/logs"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

BUILD_TYPE="Release"
BUILD_JOBS="$(nproc 2>/dev/null || echo 4)"
CLEAN=0

for arg in "$@"; do
  case "$arg" in
    --debug)   BUILD_TYPE="Debug" ;;
    --clean)   CLEAN=1 ;;
    --jobs=*)  BUILD_JOBS="${arg#*=}" ;;
    --help)    echo "Usage: $0 [--debug] [--clean] [--jobs=N]"; exit 0 ;;
  esac
done

log_ok()   { echo -e "  ${GREEN}✓${NC}  $1"; }
log_fail() { echo -e "  ${RED}✗${NC}  $1"; }
log_step() { echo -e "\n${BOLD}${BLUE}[$1]${NC} $2"; }
log_info() { echo -e "  → $1"; }

echo -e "${BOLD}${BLUE}"
echo "  Fleet OS v2.0 — Build System"
echo "  Base: ${BASE_DIR}"
echo "  Type: ${BUILD_TYPE}  Jobs: ${BUILD_JOBS}"
echo -e "${NC}"

# ── Check prerequisites ────────────────────────────────────────────────────
log_step "1" "Checking prerequisites"

check_cmd() {
  if command -v "$1" &>/dev/null; then log_ok "$1 found: $(command -v "$1")"
  else log_fail "$1 not found"; echo "    Install: $2"; exit 1; fi
}

check_cmd cmake   "dnf install cmake  OR  apt install cmake"
check_cmd g++     "dnf install gcc-c++  OR  apt install g++"
check_cmd make    "dnf install make  OR  apt install make"

# Check librdkafka
if pkg-config --exists rdkafka++ 2>/dev/null; then
  log_ok "librdkafka found (pkg-config)"
elif ldconfig -p 2>/dev/null | grep -q librdkafka; then
  log_ok "librdkafka found (ldconfig)"
elif find /usr /usr/local -name "librdkafka*" 2>/dev/null | grep -q .; then
  log_ok "librdkafka found"
else
  log_fail "librdkafka not found"
  echo ""
  echo "  Install with:"
  echo "    Fedora/RHEL:  sudo dnf install librdkafka-devel"
  echo "    Ubuntu/Debian: sudo apt install librdkafka-dev"
  echo "    Or build from source: see scripts/install.sh"
  exit 1
fi

# Check nlohmann/json
if find /usr/include /usr/local/include "${BASE_DIR}/shared/include" \
   -name "json.hpp" -path "*/nlohmann/*" 2>/dev/null | grep -q .; then
  log_ok "nlohmann/json found"
elif pkg-config --exists nlohmann_json 2>/dev/null; then
  log_ok "nlohmann/json found (pkg-config)"
else
  log_fail "nlohmann/json not found"
  echo "  Install: dnf install json-devel  OR  apt install nlohmann-json3-dev"
  echo "  Or: mkdir -p ${BASE_DIR}/shared/include/nlohmann && curl -sL https://github.com/nlohmann/json/releases/latest/download/json.hpp -o ${BASE_DIR}/shared/include/nlohmann/json.hpp"
  exit 1
fi

# Check libcurl
if pkg-config --exists libcurl 2>/dev/null || ldconfig -p 2>/dev/null | grep -q libcurl; then
  log_ok "libcurl found"
else
  log_fail "libcurl not found"
  echo "  Install: dnf install libcurl-devel  OR  apt install libcurl4-openssl-dev"
  exit 1
fi

# ── CMake configure ────────────────────────────────────────────────────────
log_step "2" "CMake configure"

mkdir -p "$BUILD_DIR" "$BIN_DIR" "$LOG_DIR"

if [ "$CLEAN" -eq 1 ]; then
  log_info "Cleaning build directory..."
  rm -rf "${BUILD_DIR:?}/"*
fi

cmake -S "$BASE_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
  -DCMAKE_RUNTIME_OUTPUT_DIRECTORY="$BIN_DIR" \
  2>&1 | tee "${LOG_DIR}/cmake-configure.log" | grep -E "^(--|CMake|ERROR|FATAL|Found|Status)" | head -30

log_ok "CMake configuration complete"

# ── Build ──────────────────────────────────────────────────────────────────
log_step "3" "Compiling agents (jobs: ${BUILD_JOBS})"

AGENTS=(gps-server route-agent driver-agent notification-agent maintenance-agent industry-agent)

# Build all at once
if cmake --build "$BUILD_DIR" --config "$BUILD_TYPE" -j "$BUILD_JOBS" \
   2>&1 | tee "${LOG_DIR}/build.log" | grep -E "(Building|Linking|error:|warning:|FAILED|undefined)" | grep -v "^$"; then
  echo ""
  log_ok "Build succeeded"
else
  echo ""
  log_fail "Build failed — check ${LOG_DIR}/build.log for details"
  echo ""
  echo "  Common fixes:"
  echo "  • GCC 15 error 'invalid conversion const void*': already patched in KafkaHelper.h"
  echo "  • 'rdkafka not found': sudo dnf install librdkafka-devel"
  echo "  • 'json.hpp not found': sudo dnf install json-devel"
  exit 1
fi

# ── Verify binaries ────────────────────────────────────────────────────────
log_step "4" "Verifying binaries"

ALL_OK=1
for agent in "${AGENTS[@]}"; do
  bin="${BIN_DIR}/${agent}"
  if [ -f "$bin" ] && [ -x "$bin" ]; then
    size=$(du -h "$bin" | cut -f1)
    log_ok "${agent}  (${size})"
  else
    log_fail "${agent} — binary missing!"
    ALL_OK=0
  fi
done

# Qt Simulator (optional)
if [ -f "${BIN_DIR}/fleetos-simulator" ]; then
  size=$(du -h "${BIN_DIR}/fleetos-simulator" | cut -f1)
  log_ok "fleetos-simulator  (${size})  [Qt GUI]"
else
  echo -e "  ${YELLOW}–${NC}  fleetos-simulator not built (Qt6 not found — optional)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$ALL_OK" -eq 1 ]; then
  echo -e "${BOLD}${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${BOLD}${GREEN}  Build Complete — all agents ready         ${NC}"
  echo -e "${BOLD}${GREEN}═══════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Binaries → ${BIN_DIR}/"
  echo ""
  echo -e "  Next step:"
  echo -e "    ${YELLOW}bash scripts/start-all.sh${NC}              # Start everything"
  echo -e "    ${YELLOW}bash scripts/start-all.sh --simulator${NC}  # With Qt GUI"
else
  echo -e "${RED}Build had errors — some agents may not work${NC}"
  exit 1
fi
