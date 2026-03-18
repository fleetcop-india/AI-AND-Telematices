# Fleet OS v2.0 — Build & Run Guide

## Quick Start (3 steps)

```bash
# 1. Install dependencies (one-time)
sudo bash scripts/install.sh

# 2. Build all C++ agents (one-time)
bash scripts/build.sh

# 3. Start everything
bash scripts/start-all.sh
```

Open **http://localhost:4001** in your browser.

---

## What Each Step Does

### Step 1: `install.sh`
Installs system packages:
- `librdkafka-devel` (Kafka C++ client)
- `nlohmann-json` (JSON parsing)
- `libcurl-devel` (HTTP for Geocoder)
- `qt6-qtbase-devel` (Qt Simulator GUI)
- `postgresql` + `nodejs`
- Starts PostgreSQL, creates `fleetos` database
- Sets up Kafka (Podman container on Fedora, binary on Ubuntu)

### Step 2: `build.sh`
Compiles all 6 C++ agents using CMake:

| Binary | Port | Description |
|--------|------|-------------|
| `gps-server` | 8080 | Receives GPS packets (GT06N / AIS140 / JSON_SIM) |
| `route-agent` | 8082 | Geofence monitoring, route compliance |
| `driver-agent` | 8084 | DSS scoring, behaviour analysis |
| `notification-agent` | 8083 | Multi-channel alert dispatch |
| `maintenance-agent` | 8090 | Service schedule tracking |
| `industry-agent` | 8087 | Construction / Agriculture modules |
| `fleetos-simulator` | — | Qt6 GUI simulator (if Qt6 found) |

Build output → `bin/`
Build logs → `logs/build.log`

### Step 3: `start-all.sh`
Starts services in dependency order:
1. PostgreSQL (:5432)
2. Kafka (:9092) — auto-detects Podman/Docker/binary
3. C++ agents (auto-builds if `bin/` is empty)
4. Node.js web panel (:4001)
5. Python report agent (:8086)
6. Python devops agent (:8099)

---

## Useful Commands

```bash
# Status of all services
bash scripts/status.sh

# Stop everything
bash scripts/stop-all.sh

# Start with Qt Simulator GUI
bash scripts/start-all.sh --simulator

# Rebuild from scratch
bash scripts/build.sh --clean

# Watch logs
tail -f logs/gps-server.log
tail -f logs/web-panel.log

# Rebuild just one agent (after editing source)
cd build && make gps-server
```

---

## Fixing Common Errors

### Error: `librdkafka not found`
```bash
# Fedora / RHEL / Asahi
sudo dnf install librdkafka-devel

# Ubuntu / Debian
sudo apt install librdkafka-dev
```

### Error: `nlohmann/json not found`
```bash
# Fedora
sudo dnf install json-devel

# Ubuntu
sudo apt install nlohmann-json3-dev

# Manual (header-only)
mkdir -p shared/include/nlohmann
curl -sL https://github.com/nlohmann/json/releases/latest/download/json.hpp \
     -o shared/include/nlohmann/json.hpp
```

### Error: GCC 15 `invalid conversion const void*`
Already fixed in `shared/include/KafkaHelper.h` with `const_cast`.

### Error: Kafka `mode: binary` but binary not at `/opt/kafka`
Set `KAFKA_MODE=auto` in `config/fleetos.env` — it will use Podman or Docker automatically.

### Qt Simulator not built
```bash
# Fedora
sudo dnf install qt6-qtbase-devel qt6-qtbase qt6-qtnetwork

# Ubuntu
sudo apt install qt6-base-dev

# Then rebuild
bash scripts/build.sh
```

---

## Architecture

```
                     ┌─────────────────────────────┐
Devices (GPS)  ──▶  │  gps-server :8080            │
                     │  (GT06N / AIS140 / JSON_SIM) │
                     └──────────┬──────────────────┘
                                │  Kafka :9092
              ┌─────────────────┼──────────────────────┐
              ▼                 ▼                       ▼
    route-agent :8082   driver-agent :8084   maintenance :8090
    industry :8087      notification :8083   report :8086
              │                 │
              └────────┬────────┘
                       ▼
              web-panel :4001   ◀── Browser
              PostgreSQL :5432
```

---

## Qt Simulator

The Qt Simulator replaces the old Python terminal simulator.

```bash
# Build & launch
bash scripts/start-all.sh --simulator

# Or build manually
cd agents/simulator-qt
mkdir -p build && cd build
cmake .. && make -j$(nproc)
./fleetos-simulator
```

Features:
- Multi-vehicle simulation (configurable count)
- Protocol switching: GT06N / AIS140 / JSON_SIM per vehicle
- Live position movement with random routes
- Panic / Overspeed event injection buttons
- Per-vehicle speed slider
- Packet log with colour-coded events
- System tray icon (minimize to tray)
- Sends real TCP packets to `gps-server :8080`
