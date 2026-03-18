#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Fleet OS v2.0 — build-all.sh
#  Installs build dependencies, compiles all C++ agents, installs binaries.
#  Supports: Fedora / Fedora Asahi Remix, Ubuntu / Debian, Rocky / AlmaLinux
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="${BASE_DIR}/build"
BIN_DIR="${BASE_DIR}/bin"
LOG_DIR="${BASE_DIR}/logs"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC}  $*"; }
fail() { echo -e "  ${RED}✗${NC}  $*"; exit 1; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }
info() { echo -e "  ${CYAN}→${NC}  $*"; }

JOBS="${BUILD_JOBS:-$(nproc)}"
INSTALL_DEPS=1
BUILD_QT=0
INSTALL_BINS=1

for arg in "$@"; do
  case "$arg" in
    --no-deps)    INSTALL_DEPS=0 ;;
    --qt)         BUILD_QT=1 ;;
    --no-install) INSTALL_BINS=0 ;;
    --help|-h)
      echo "Usage: $0 [--no-deps] [--qt] [--no-install]"
      echo "  --no-deps      Skip package installation (already installed)"
      echo "  --qt           Also build Qt Simulator GUI"
      echo "  --no-install   Don't copy binaries to bin/"
      exit 0 ;;
  esac
done

echo -e "${BOLD}${CYAN}"
echo "  ╔════════════════════════════════════╗"
echo "  ║  Fleet OS v2.0  ·  Build System    ║"
echo "  ╚════════════════════════════════════╝"
echo -e "${NC}"
echo "  Base:  ${BASE_DIR}"
echo "  Jobs:  ${JOBS} parallel"
echo ""

mkdir -p "$BUILD_DIR" "$BIN_DIR" "$LOG_DIR"

# ─────────────────────────────────────────────────────────────────────────────
# Distro detection
# ─────────────────────────────────────────────────────────────────────────────
step "Detecting operating system"

OS_ID=""
OS_ID_LIKE=""
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID:-}"
  OS_ID_LIKE="${ID_LIKE:-}"
fi

is_fedora() {
  echo "$OS_ID" | grep -qiE "^(fedora|fedora-asahi-remix)$" || \
    (echo "$OS_ID_LIKE" | grep -qi "fedora" && ! echo "$OS_ID_LIKE" | grep -qiE "rhel|centos")
}
is_rhel() {
  echo "$OS_ID" | grep -qiE "^(rhel|centos|rocky|alma)$" || \
    (echo "$OS_ID_LIKE" | grep -qiE "rhel|centos" && ! is_fedora)
}
is_debian() {
  echo "$OS_ID" | grep -qiE "^(debian|ubuntu|linuxmint|pop)$" || \
    echo "$OS_ID_LIKE" | grep -qi "debian"
}

if is_fedora; then   DISTRO="fedora";  ok "Fedora / Asahi Remix"
elif is_rhel; then   DISTRO="rhel";    ok "RHEL / Rocky / AlmaLinux"
elif is_debian; then DISTRO="debian";  ok "Ubuntu / Debian"
else                 DISTRO="unknown"; warn "Unknown distro — attempting generic build"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Install build dependencies
# ─────────────────────────────────────────────────────────────────────────────
if [ "$INSTALL_DEPS" -eq 1 ]; then
  step "Installing build dependencies"

  NEED_SUDO=""
  [ "$(id -u)" != "0" ] && NEED_SUDO="sudo"

  case "$DISTRO" in
    fedora)
      info "dnf install build tools..."
      $NEED_SUDO dnf install -y \
        gcc-c++ cmake make git curl \
        librdkafka-devel nlohmann-json-devel \
        openssl-devel 2>&1 | tail -5
      ok "Fedora dependencies installed"
      ;;
    rhel)
      info "dnf install build tools (RHEL/Rocky)..."
      $NEED_SUDO dnf install -y \
        gcc-c++ cmake make git curl \
        openssl-devel 2>&1 | tail -5
      # librdkafka from EPEL
      $NEED_SUDO dnf install -y epel-release 2>/dev/null || true
      $NEED_SUDO dnf install -y librdkafka-devel 2>/dev/null || \
        warn "librdkafka-devel not in EPEL — will build from source"
      ok "RHEL dependencies installed"
      ;;
    debian)
      info "apt install build tools..."
      $NEED_SUDO apt-get update -qq
      $NEED_SUDO apt-get install -y \
        g++ cmake make git curl \
        librdkafka-dev nlohmann-json3-dev \
        libssl-dev 2>&1 | tail -5
      ok "Debian/Ubuntu dependencies installed"
      ;;
  esac

  # ── nlohmann/json header fallback ─────────────────────────────────────────
  NLOHMANN_HDR="${BASE_DIR}/shared/include/nlohmann/json.hpp"
  if ! pkg-config --exists nlohmann_json 2>/dev/null && \
     ! [ -f /usr/include/nlohmann/json.hpp ] && \
     ! [ -f /usr/local/include/nlohmann/json.hpp ] && \
     ! [ -f "$NLOHMANN_HDR" ]; then
    info "Downloading nlohmann/json header..."
    mkdir -p "${BASE_DIR}/shared/include/nlohmann"
    curl -fsSL --retry 3 \
      "https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp" \
      -o "$NLOHMANN_HDR"
    ok "nlohmann/json downloaded → shared/include/nlohmann/json.hpp"
  else
    ok "nlohmann/json found"
  fi

  # ── librdkafka from source if not found ───────────────────────────────────
  if ! pkg-config --exists rdkafka++ 2>/dev/null && \
     ! [ -f /usr/lib/librdkafka.so ] && \
     ! [ -f /usr/lib64/librdkafka.so ] && \
     ! [ -f /usr/local/lib/librdkafka.so ] && \
     ! [ -f /usr/lib/aarch64-linux-gnu/librdkafka.so ]; then
    info "librdkafka not found — building from source v2.3.0..."
    RDKAFKA_SRC="/tmp/librdkafka-build"
    mkdir -p "$RDKAFKA_SRC"
    curl -fsSL --retry 3 \
      "https://github.com/confluentinc/librdkafka/archive/v2.3.0.tar.gz" \
      -o "/tmp/rdkafka.tar.gz"
    tar -xzf "/tmp/rdkafka.tar.gz" -C "$RDKAFKA_SRC" --strip-components=1
    pushd "$RDKAFKA_SRC" > /dev/null
    ./configure --prefix=/usr/local 2>&1 | tail -3
    make -j"$JOBS" 2>&1 | tail -5
    $NEED_SUDO make install 2>&1 | tail -3
    $NEED_SUDO ldconfig
    popd > /dev/null
    ok "librdkafka built and installed from source"
  else
    ok "librdkafka found"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Build C++ agents
# ─────────────────────────────────────────────────────────────────────────────
step "Building C++ agents"

# GCC version check — warn about GCC 15 const_cast requirement (already fixed in KafkaHelper.h)
GCC_VER="$(gcc --version 2>/dev/null | head -1 | grep -oP '\d+\.\d+' | head -1)"
info "Compiler: $(gcc --version 2>/dev/null | head -1)"
if [ "${GCC_VER%%.*}" -ge 15 ] 2>/dev/null; then
  info "GCC 15+ detected — const_cast fixes already applied in KafkaHelper.h ✓"
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

info "Running CMake configure..."
cmake -S "$BASE_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$BASE_DIR" \
  2>&1 | tee "${LOG_DIR}/cmake-configure.log" | grep -E "^(--|\s+→|CMake Error|Error)" || true

info "Building with ${JOBS} parallel jobs..."
cmake --build "$BUILD_DIR" --parallel "$JOBS" \
  2>&1 | tee "${LOG_DIR}/cmake-build.log" | grep -E "(Building|Linking|Error|warning:.*error)" || true

if [ $? -ne 0 ]; then
  fail "Build failed. See ${LOG_DIR}/cmake-build.log for details."
fi

# ─────────────────────────────────────────────────────────────────────────────
# Install binaries to bin/
# ─────────────────────────────────────────────────────────────────────────────
if [ "$INSTALL_BINS" -eq 1 ]; then
  step "Installing binaries → bin/"
  mkdir -p "$BIN_DIR"
  for agent in gps-server route-agent driver-agent maintenance-agent industry-agent notification-agent; do
    BIN_PATH="${BUILD_DIR}/${agent}"
    if [ -f "$BIN_PATH" ]; then
      cp "$BIN_PATH" "${BIN_DIR}/${agent}"
      chmod +x "${BIN_DIR}/${agent}"
      ok "${agent}"
    else
      warn "${agent} binary not found after build"
    fi
  done
fi

# ─────────────────────────────────────────────────────────────────────────────
# Build Qt Simulator (optional)
# ─────────────────────────────────────────────────────────────────────────────
if [ "$BUILD_QT" -eq 1 ]; then
  step "Building Qt Simulator GUI"
  SIM_DIR="${BASE_DIR}/agents/simulator-qt"
  SIM_BUILD="${SIM_DIR}/build"

  if ! command -v cmake &>/dev/null; then
    warn "cmake not found — cannot build Qt simulator"
  elif ! pkg-config --exists Qt6Core 2>/dev/null && \
       ! command -v qmake6 &>/dev/null 2>&1 && \
       ! qmake --version 2>/dev/null | grep -q "Qt 6"; then
    warn "Qt6 not found. Install:"
    echo ""
    echo "    Fedora:  sudo dnf install qt6-qtbase-devel qt6-qtnetwork-devel"
    echo "    Ubuntu:  sudo apt install qt6-base-dev"
    echo ""
    warn "Then re-run: $0 --qt"
  else
    mkdir -p "$SIM_BUILD"
    cmake -S "$SIM_DIR" -B "$SIM_BUILD" -DCMAKE_BUILD_TYPE=Release \
      2>&1 | tail -5
    cmake --build "$SIM_BUILD" --parallel "$JOBS" \
      2>&1 | tee "${LOG_DIR}/qt-build.log" | grep -E "(Building|Linking|Error)" || true
    if [ -f "${SIM_BUILD}/fleetos-simulator" ]; then
      cp "${SIM_BUILD}/fleetos-simulator" "${BIN_DIR}/fleetos-simulator"
      chmod +x "${BIN_DIR}/fleetos-simulator"
      ok "Qt Simulator built → bin/fleetos-simulator"
    else
      warn "Qt Simulator build failed — see ${LOG_DIR}/qt-build.log"
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Build complete!${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo -e "  Binaries in: ${BOLD}${BIN_DIR}/${NC}"
ls -1 "${BIN_DIR}/" 2>/dev/null | while read f; do echo -e "    ${GREEN}•${NC} $f"; done
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "    ${CYAN}Start all services:${NC}  bash scripts/start-all.sh"
echo -e "    ${CYAN}With Qt Simulator:${NC}   bash scripts/start-all.sh --simulator"
echo -e "    ${CYAN}Check status:${NC}        bash scripts/status.sh"
echo ""
