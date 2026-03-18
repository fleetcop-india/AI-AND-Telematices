#!/usr/bin/env python3
"""
Fleet OS — DevOps Agent (AGT-012)
Manages build, compile, deploy, start/stop of all other agents.
Exposes REST API consumed by Qt Manager and Web Panel.

Run:   python3 devops_agent.py
Port:  8099
Deps:  None — stdlib only
"""
import http.server
import json
import subprocess
import threading
import time
import os
import sys
import signal
import socket
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

# ─── Config ──────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent.parent.parent  # fleetos/ root
CONFIG_DIR = BASE_DIR / "config"
SCRIPTS_DIR= BASE_DIR / "scripts"

PORT = int(os.environ.get("DEVOPS_PORT", 8099))

# Agent definitions — IP configurable
AGENTS = {
    "AGT-001": {
        "name": "GPS Server",
        "type": "cpp",
        "src":  "agents/gps-server",
        "bin":  "agents/gps-server/build/gps-server",
        "conf": "config/gps-server.conf",
        "ip":   os.environ.get("GPS_IP",   "127.0.0.1"),
        "port": int(os.environ.get("GPS_PORT_MGMT", 8080)),
        "icon": "📡",
    },
    "AGT-003": {
        "name": "Web Panel",
        "type": "node",
        "src":  "agents/web-panel",
        "bin":  "node agents/web-panel/src/server.js",
        "conf": "config/web-panel.env",
        "ip":   os.environ.get("WEB_IP",   "127.0.0.1"),
        "port": int(os.environ.get("WEB_PORT", 4001)),
        "icon": "🌐",
    },
    "AGT-012": {
        "name": "DevOps Agent",
        "type": "python",
        "src":  "agents/devops-agent",
        "bin":  __file__,
        "conf": "",
        "ip":   "127.0.0.1",
        "port": PORT,
        "icon": "🔩",
    },
}

# In-memory build logs
build_logs = {}
build_statuses = {}  # agent_id -> "idle" | "building" | "ok" | "failed"
processes = {}       # agent_id -> subprocess.Popen

# ─── Build log helper ─────────────────────────────────────────────────────────
def append_log(agent_id, line):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    entry = f"[{ts}] {line}"
    if agent_id not in build_logs:
        build_logs[agent_id] = []
    build_logs[agent_id].append(entry)
    if len(build_logs[agent_id]) > 500:
        build_logs[agent_id].pop(0)
    print(f"  [{agent_id}] {line}")

def build_cpp(agent_id, agent):
    """Build a C++ agent with cmake."""
    src = BASE_DIR / agent["src"]
    bld = src / "build"

    build_statuses[agent_id] = "building"
    append_log(agent_id, f"=== Building {agent['name']} ===")

    try:
        bld.mkdir(exist_ok=True)

        # cmake configure
        append_log(agent_id, "Running cmake configure...")
        r = subprocess.run(
            ["cmake", "..", "-DCMAKE_BUILD_TYPE=Debug"],
            cwd=bld, capture_output=True, text=True
        )
        for line in (r.stdout + r.stderr).splitlines():
            append_log(agent_id, line)
        if r.returncode != 0:
            raise RuntimeError("cmake configure failed")

        # cmake build
        append_log(agent_id, "Running cmake build...")
        r = subprocess.run(
            ["cmake", "--build", ".", "--parallel"],
            cwd=bld, capture_output=True, text=True
        )
        for line in (r.stdout + r.stderr).splitlines():
            append_log(agent_id, line)
        if r.returncode != 0:
            raise RuntimeError(f"cmake build failed\n{r.stderr}")

        build_statuses[agent_id] = "ok"
        append_log(agent_id, f"✓ Build SUCCESS: {agent['name']}")
    except Exception as e:
        build_statuses[agent_id] = "failed"
        append_log(agent_id, f"✗ Build FAILED: {e}")

def build_node(agent_id, agent):
    """Install npm dependencies."""
    src = BASE_DIR / agent["src"]
    build_statuses[agent_id] = "building"
    append_log(agent_id, f"=== npm install: {agent['name']} ===")
    try:
        r = subprocess.run(["npm", "install"], cwd=src, capture_output=True, text=True)
        for line in (r.stdout + r.stderr).splitlines():
            append_log(agent_id, line)
        if r.returncode != 0:
            raise RuntimeError("npm install failed")
        build_statuses[agent_id] = "ok"
        append_log(agent_id, f"✓ npm install SUCCESS")
    except Exception as e:
        build_statuses[agent_id] = "failed"
        append_log(agent_id, f"✗ npm install FAILED: {e}")

def start_agent(agent_id, agent):
    """Start an agent process."""
    if agent_id in processes and processes[agent_id].poll() is None:
        return {"ok": False, "msg": f"{agent['name']} already running"}

    if agent["type"] == "cpp":
        bin_path = BASE_DIR / agent["bin"]
        conf_path = BASE_DIR / agent["conf"]
        if not bin_path.exists():
            return {"ok": False, "msg": f"Binary not found: {bin_path}\nRun build first."}
        cmd = [str(bin_path), str(conf_path)]
    elif agent["type"] == "node":
        src = BASE_DIR / agent["src"]
        cmd = ["node", "src/server.js"]
        os.chdir(src)
    elif agent["type"] == "python":
        return {"ok": False, "msg": "DevOps agent starts itself"}
    else:
        return {"ok": False, "msg": f"Unknown type: {agent['type']}"}

    log_path = Path(f"/tmp/fleetos_{agent_id}.out")
    log_f = open(log_path, "a")
    try:
        p = subprocess.Popen(cmd, cwd=BASE_DIR,
                             stdout=log_f, stderr=log_f)
        processes[agent_id] = p
        append_log(agent_id, f"Started PID {p.pid}: {' '.join(cmd)}")
        return {"ok": True, "pid": p.pid, "msg": f"{agent['name']} started"}
    except Exception as e:
        return {"ok": False, "msg": str(e)}

def stop_agent(agent_id):
    p = processes.get(agent_id)
    if not p or p.poll() is not None:
        return {"ok": False, "msg": "Not running"}
    p.terminate()
    try: p.wait(timeout=5)
    except: p.kill()
    del processes[agent_id]
    return {"ok": True, "msg": "Stopped"}

def agent_status(agent_id, agent):
    p = processes.get(agent_id)
    running = p is not None and p.poll() is None

    # Try to reach management port
    reachable = False
    latency   = None
    try:
        t0 = time.time()
        urllib.request.urlopen(
            f"http://{agent['ip']}:{agent['port']}/health", timeout=1)
        reachable = True
        latency = int((time.time()-t0)*1000)
    except:
        pass

    return {
        "agent_id":   agent_id,
        "name":       agent["name"],
        "type":       agent["type"],
        "ip":         agent["ip"],
        "port":       agent["port"],
        "running":    running,
        "pid":        p.pid if running else None,
        "reachable":  reachable,
        "latency_ms": latency,
        "build":      build_statuses.get(agent_id, "idle"),
        "build_logs": build_logs.get(agent_id, [])[-5:],
    }

def check_deps():
    """Check system dependencies."""
    checks = []
    for tool, cmd in [
        ("cmake",  ["cmake", "--version"]),
        ("g++",    ["g++",   "--version"]),
        ("make",   ["make",  "--version"]),
        ("node",   ["node",  "--version"]),
        ("npm",    ["npm",   "--version"]),
        ("python3",["python3","--version"]),
    ]:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True)
            version = r.stdout.split('\n')[0].strip()
            checks.append({"tool": tool, "found": True, "version": version})
        except FileNotFoundError:
            checks.append({"tool": tool, "found": False,
                           "install": f"sudo apt install {tool}"})
    return checks

# ─── HTTP Request Handler ─────────────────────────────────────────────────────
class DevOpsHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        data = self._route_get(path)
        self._respond(data)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode() if length else ''
        try: body_json = json.loads(body) if body else {}
        except: body_json = {}
        path = self.path.split('?')[0]
        data = self._route_post(path, body_json)
        self._respond(data)

    def _route_get(self, path):
        # Health
        if path == '/health' or path == '/':
            return {"agent_id":"AGT-012","name":"DevOps Agent",
                    "status":"running","port":PORT}

        # List all agents
        if path == '/api/agents':
            return {
                a: agent_status(a, AGENTS[a]) for a in AGENTS
            }

        # Single agent status
        if path.startswith('/api/agents/') and path.endswith('/status'):
            aid = path.split('/')[3]
            a = AGENTS.get(aid)
            return agent_status(aid, a) if a else {"error":"not found"}

        # Build logs
        if path.startswith('/api/agents/') and path.endswith('/logs'):
            aid = path.split('/')[3]
            return {"logs": build_logs.get(aid, [])}

        # System deps check
        if path == '/api/deps/check':
            return {"deps": check_deps()}

        # Install instructions
        if path == '/api/deps/install-cmd':
            return {"command":
                "sudo apt update && sudo apt install -y "
                "cmake g++ make libpthread-stubs0-dev "
                "nodejs npm python3 python3-pip git curl"
            }

        # Overall system status
        if path == '/api/system':
            all_status = {a: agent_status(a, AGENTS[a]) for a in AGENTS}
            online = sum(1 for s in all_status.values() if s["reachable"])
            return {
                "total_agents": len(AGENTS),
                "online": online,
                "offline": len(AGENTS) - online,
                "agents": all_status
            }

        # Connectivity test
        if path == '/api/test/connectivity':
            results = []
            for aid, a in AGENTS.items():
                results.append(agent_status(aid, a))
            return results

        return {"error": "not found", "path": path}

    def _route_post(self, path, body):
        # Build single agent
        if path.startswith('/api/build/'):
            aid = path.split('/')[-1]
            a = AGENTS.get(aid)
            if not a: return {"error":"agent not found"}
            def run(): 
                if a["type"] == "cpp": build_cpp(aid, a)
                elif a["type"] == "node": build_node(aid, a)
            threading.Thread(target=run, daemon=True).start()
            return {"ok":True,"msg":f"Building {a['name']}...","agent":aid}

        # Build all
        if path == '/api/build/all':
            def run_all():
                for aid, a in AGENTS.items():
                    if a["type"] == "cpp":   build_cpp(aid, a)
                    elif a["type"] == "node": build_node(aid, a)
            threading.Thread(target=run_all, daemon=True).start()
            return {"ok":True,"msg":"Building all agents..."}

        # Start agent
        if path.startswith('/api/start/'):
            aid = path.split('/')[-1]
            a = AGENTS.get(aid)
            if not a: return {"error":"agent not found"}
            return start_agent(aid, a)

        # Stop agent
        if path.startswith('/api/stop/'):
            aid = path.split('/')[-1]
            return stop_agent(aid)

        # Restart agent
        if path.startswith('/api/restart/'):
            aid = path.split('/')[-1]
            stop_agent(aid)
            time.sleep(1)
            a = AGENTS.get(aid)
            return start_agent(aid, a) if a else {"error":"not found"}

        # Start all
        if path == '/api/start/all':
            results = {}
            for aid, a in AGENTS.items():
                if aid != "AGT-012":  # don't restart self
                    results[aid] = start_agent(aid, a)
            return {"ok":True,"results":results}

        # Update IP config
        if path == '/api/config/ips':
            for aid, cfg in body.items():
                if aid in AGENTS:
                    if "ip"   in cfg: AGENTS[aid]["ip"]   = cfg["ip"]
                    if "port" in cfg: AGENTS[aid]["port"] = int(cfg["port"])
            return {"ok":True,"agents":AGENTS}

        # Run arbitrary command (for advanced use)
        if path == '/api/exec':
            cmd = body.get("cmd","")
            if not cmd: return {"error":"no cmd"}
            # Security: only allow cmake/make/npm/node commands
            safe = ["cmake","make","npm","node","python3","git","ls","pwd"]
            if not any(cmd.startswith(s) for s in safe):
                return {"error":"command not allowed for security"}
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                               cwd=BASE_DIR)
            return {"stdout":r.stdout,"stderr":r.stderr,"code":r.returncode}

        return {"error":"not found","path":path}

    def _respond(self, data, code=200):
        body = json.dumps(data, indent=2).encode()
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')

# ─── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\n╔══════════════════════════════════════════╗")
    print(f"║  Fleet OS — DevOps Agent (AGT-012)       ║")
    print(f"║  Port: {PORT:<34}  ║")
    print(f"║  Base: {str(BASE_DIR):<34}  ║")
    print(f"╚══════════════════════════════════════════╝\n")
    print(f"  API:    http://127.0.0.1:{PORT}/api/system")
    print(f"  Build:  POST http://127.0.0.1:{PORT}/api/build/AGT-001")
    print(f"  Start:  POST http://127.0.0.1:{PORT}/api/start/AGT-001")
    print(f"  Deps:   GET  http://127.0.0.1:{PORT}/api/deps/check")
    print("")

    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), DevOpsHandler)

    def shutdown(sig, frame):
        print("\nDevOps Agent shutting down...")
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"DevOps Agent listening on :{PORT}  (Ctrl+C to stop)\n")
    server.serve_forever()
