#!/usr/bin/env python3
"""
Fleet OS — Report Agent (AGT-009)
Consumes all Kafka topics, generates scheduled reports (PDF / CSV / JSON)
All reports include resolved addresses via Geocoder HTTP calls to web-panel
"""
import os, json, time, threading, csv, io, datetime
from flask import Flask, jsonify, request, Response
from kafka import KafkaConsumer

KAFKA      = os.environ.get("FLEETOS_KAFKA_BROKERS", "127.0.0.1:9092")
PORT       = int(os.environ.get("FLEETOS_REPORT_MGMT_PORT", 9086))
WEB_PANEL  = os.environ.get("FLEETOS_WEBPANEL_IP", "127.0.0.1")
WEB_PORT   = int(os.environ.get("FLEETOS_WEBPANEL_PORT", 4001))

app = Flask(__name__)

# ── Data buffers ──────────────────────────────────────────────────────────
buffers = {
    "gps_positions":  [],
    "gps_alarms":     [],
    "driver_events":  [],
    "geofence_events":[],
    "maintenance_alerts":[],
    "industry_alerts":[],
    "driver_scores":  [],
}
MAX_BUF = 1000

# ── Geocoder: call web panel to resolve address ───────────────────────────
import urllib.request, urllib.parse

def resolve_address(lat, lon):
    """Resolve lat/lon → address string via web panel's geocoder API."""
    try:
        url = f"http://{WEB_PANEL}:{WEB_PORT}/api/geocoder/resolve?lat={lat}&lon={lon}"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
            return data.get("full", f"{lat}, {lon}")
    except Exception:
        return f"{lat:.5f}, {lon:.5f}"

def enrich_with_address(record):
    """Add address field to a record if it has lat/lon."""
    lat = record.get("lat") or record.get("latitude")
    lon = record.get("lon") or record.get("longitude")
    if lat and lon and not record.get("address"):
        record["address"] = resolve_address(lat, lon)
    return record

# ── Kafka consumer ────────────────────────────────────────────────────────
def kafka_consume():
    while True:
        try:
            consumer = KafkaConsumer(
                "gps.positions", "gps.alarms", "driver.events",
                "geofence.events", "maintenance.alerts", "industry.alerts",
                "driver.scores",
                bootstrap_servers=[KAFKA],
                group_id="report-agent-group",
                auto_offset_reset="latest",
                value_deserializer=lambda m: json.loads(m.decode()),
                consumer_timeout_ms=2000,
            )
            print(f"[REPORT] Connected to Kafka {KAFKA}")
            for msg in consumer:
                key = msg.topic.replace(".", "_")
                if key in buffers:
                    rec = dict(msg.value)
                    buffers[key].append(rec)
                    if len(buffers[key]) > MAX_BUF:
                        buffers[key].pop(0)
        except Exception as e:
            print(f"[REPORT] Kafka error: {e}. Retrying in 10s.")
            time.sleep(10)

# ── Report generators ─────────────────────────────────────────────────────
def build_position_report(imei=None, limit=50, with_address=True):
    rows = buffers["gps_positions"]
    if imei:
        rows = [r for r in rows if r.get("imei") == imei]
    rows = rows[-limit:]
    if with_address:
        rows = [enrich_with_address(dict(r)) for r in rows]
    return rows

def build_alarm_report(imei=None, limit=50, with_address=True):
    rows = buffers["gps_alarms"]
    if imei:
        rows = [r for r in rows if r.get("imei") == imei]
    rows = rows[-limit:]
    if with_address:
        rows = [enrich_with_address(dict(r)) for r in rows]
    return rows

def build_driver_report(imei=None, limit=50, with_address=True):
    rows = buffers["driver_events"]
    if imei:
        rows = [r for r in rows if r.get("imei") == imei]
    rows = rows[-limit:]
    if with_address:
        rows = [enrich_with_address(dict(r)) for r in rows]
    return rows

def build_fleet_summary():
    all_imeis = set(r.get("imei","?") for r in buffers["gps_positions"])
    scores    = {}
    for s in buffers["driver_scores"]:
        scores[s.get("imei","?")] = s.get("overall_score", 100)
    return {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "total_vehicles": len(all_imeis),
        "total_positions": len(buffers["gps_positions"]),
        "total_alarms": len(buffers["gps_alarms"]),
        "total_driver_events": len(buffers["driver_events"]),
        "total_geofence_events": len(buffers["geofence_events"]),
        "total_maintenance_alerts": len(buffers["maintenance_alerts"]),
        "total_industry_alerts": len(buffers["industry_alerts"]),
        "driver_scores": scores,
        "geocoder_used": True,
    }

def rows_to_csv(rows, fields):
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, extrasaction='ignore')
    w.writeheader()
    w.writerows(rows)
    return out.getvalue()

# ── REST API ──────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return jsonify({ "agent":"report-agent","status":"RUNNING","port":PORT,
                     "buffers":{ k:len(v) for k,v in buffers.items() } })

@app.get("/report/summary")
def summary():
    return jsonify(build_fleet_summary())

@app.get("/report/positions")
def positions():
    imei  = request.args.get("imei")
    limit = int(request.args.get("limit", 50))
    fmt   = request.args.get("format","json")
    rows  = build_position_report(imei, limit, with_address=True)
    if fmt == "csv":
        csv_data = rows_to_csv(rows, ["ts","imei","lat","lon","speed","heading","altitude","address","protocol"])
        return Response(csv_data, mimetype="text/csv",
                        headers={"Content-Disposition":"attachment;filename=positions.csv"})
    return jsonify(rows)

@app.get("/report/alarms")
def alarms():
    imei  = request.args.get("imei")
    limit = int(request.args.get("limit", 50))
    fmt   = request.args.get("format","json")
    rows  = build_alarm_report(imei, limit, with_address=True)
    if fmt == "csv":
        csv_data = rows_to_csv(rows, ["ts","imei","alarm_type","severity","lat","lon","address"])
        return Response(csv_data, mimetype="text/csv",
                        headers={"Content-Disposition":"attachment;filename=alarms.csv"})
    return jsonify(rows)

@app.get("/report/driver-events")
def driver_events():
    imei  = request.args.get("imei")
    limit = int(request.args.get("limit", 50))
    fmt   = request.args.get("format","json")
    rows  = build_driver_report(imei, limit, with_address=True)
    if fmt == "csv":
        csv_data = rows_to_csv(rows, ["ts","imei","event","severity","impact","value","lat","lon","address"])
        return Response(csv_data, mimetype="text/csv",
                        headers={"Content-Disposition":"attachment;filename=driver_events.csv"})
    return jsonify(rows)

@app.get("/report/geofence-events")
def geofence_events():
    rows = list(buffers["geofence_events"])[-50:]
    rows = [enrich_with_address(dict(r)) for r in rows]
    fmt  = request.args.get("format","json")
    if fmt == "csv":
        csv_data = rows_to_csv(rows, ["ts","imei","geofence_name","geofence_type","event","lat","lon","address"])
        return Response(csv_data, mimetype="text/csv",
                        headers={"Content-Disposition":"attachment;filename=geofence_events.csv"})
    return jsonify(rows)

@app.get("/report/maintenance")
def maintenance():
    rows = list(buffers["maintenance_alerts"])[-50:]
    rows = [enrich_with_address(dict(r)) for r in rows]
    return jsonify(rows)

@app.get("/report/industry")
def industry():
    rows = list(buffers["industry_alerts"])[-50:]
    rows = [enrich_with_address(dict(r)) for r in rows]
    return jsonify(rows)

@app.get("/report/fleet-csv")
def fleet_csv():
    """Complete fleet CSV: latest position + score for each IMEI with address."""
    latest = {}
    for r in buffers["gps_positions"]:
        latest[r.get("imei","?")] = r
    scores = { s.get("imei","?"): s.get("overall_score",100) for s in buffers["driver_scores"] }

    rows = []
    for imei, pos in latest.items():
        addr = resolve_address(pos.get("lat",0), pos.get("lon",0))
        rows.append({
            "imei":     imei,
            "lat":      pos.get("lat"),
            "lon":      pos.get("lon"),
            "speed":    pos.get("speed"),
            "address":  addr,
            "dss_score":scores.get(imei, "N/A"),
            "ts":       pos.get("ts"),
        })

    csv_data = rows_to_csv(rows, ["imei","ts","lat","lon","speed","address","dss_score"])
    return Response(csv_data, mimetype="text/csv",
                    headers={"Content-Disposition":"attachment;filename=fleet_report.csv"})

if __name__ == "__main__":
    print("╔══════════════════════════════════════════╗")
    print("║  Fleet OS — Report Agent  (AGT-009)      ║")
    print(f"║  Port: {PORT:<34}║")
    print(f"║  Kafka: {KAFKA:<33}║")
    print("╚══════════════════════════════════════════╝")
    print("Reports available:")
    print(f"  GET http://127.0.0.1:{PORT}/report/summary")
    print(f"  GET http://127.0.0.1:{PORT}/report/positions?format=csv")
    print(f"  GET http://127.0.0.1:{PORT}/report/alarms?format=csv")
    print(f"  GET http://127.0.0.1:{PORT}/report/driver-events?format=csv")
    print(f"  GET http://127.0.0.1:{PORT}/report/fleet-csv")
    print()
    threading.Thread(target=kafka_consume, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, debug=False)
