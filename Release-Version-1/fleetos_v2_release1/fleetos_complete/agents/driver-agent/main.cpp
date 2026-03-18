// ╔══════════════════════════════════════════════════════════════════╗
// ║  Fleet OS — Driver Behaviour Agent  (AGT-006)                   ║
// ║  Calculates DSS (Driver Safety Score) 0-100                     ║
// ║  Publishes: driver.events, driver.scores                        ║
// ║  NEW: All events include resolved address (via Geocoder)        ║
// ╚══════════════════════════════════════════════════════════════════╝
#include <iostream>
#include <string>
#include <map>
#include <atomic>
#include <mutex>
#include <thread>
#include <csignal>
#include <chrono>
#include <cmath>
#include <nlohmann/json.hpp>
#include "Config.h"
#include "Logger.h"
#include "KafkaHelper.h"
#include "HttpServer.h"
#include "CBPCodec.h"
#include "Geocoder.h"

using json = nlohmann::json;
using namespace fleetos;

static std::atomic<bool> g_running{true};
void sig_handler(int) { g_running = false; }

struct DeviceState {
    double prev_speed = 0;
    double prev_lat   = 0;
    double prev_lon   = 0;
    long long prev_ts = 0;
    int daily_score   = 100;
    int event_count   = 0;
    long long drive_start = 0;
    long long idle_start  = 0;
    int speed_score     = 100;
    int braking_score   = 100;
    int cornering_score = 100;
    int fatigue_score   = 100;
    int idle_score      = 100;
};

static std::map<std::string, DeviceState> g_states;
static std::mutex g_mtx;
static std::atomic<long> g_events_total{0};

struct Thresholds {
    double harsh_brake_g  = -0.4;
    double harsh_accel_g  =  0.4;
    double harsh_corner_g =  0.5;
    double overspeed_kmh  =  80.0;
    int    idle_min       =  10;
    int    drive_hr_limit =  4;
} CFG_THR;

// ── Score an event + publish with address ──────────────────────────────────
void scoreEvent(const std::string& imei, const std::string& event_type,
                const std::string& severity, int impact,
                double lat, double lon, long long ts,
                double value, KafkaProducer& prod) {
    std::string address = geoShort(lat, lon);   // ← Geocoder

    {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto& st = g_states[imei];
        st.daily_score = std::max(0, st.daily_score + impact);
        st.event_count++;
    }
    g_events_total++;

    json ev;
    ev["imei"]     = imei;
    ev["event"]    = event_type;
    ev["severity"] = severity;
    ev["impact"]   = impact;
    ev["value"]    = value;
    ev["lat"]  = lat; ev["lon"] = lon; ev["ts"] = ts;
    ev["address"]  = address;           // ← Geocoder

    prod.send("driver.events", imei, ev.dump(), cbp::HIGH);

    json notif;
    notif["channel"]  = "FCM";
    notif["title"]    = event_type;
    notif["body"]     = imei + ": " + event_type + " @ " + address;
    notif["severity"] = severity;
    notif["address"]  = address;        // ← Geocoder
    prod.send("notification.requests", imei, notif.dump(), cbp::HIGH);

    LOG_WRN("[DSS] " + imei + " " + event_type +
            " (impact=" + std::to_string(impact) +
            ", score=" + std::to_string(g_states[imei].daily_score) +
            ") @ " + address);
}

void processPosition(const json& pos, KafkaProducer& prod) {
    std::string imei = pos.value("imei","unknown");
    double lat   = pos.value("lat",   0.0);
    double lon   = pos.value("lon",   0.0);
    double speed = pos.value("speed", 0.0);
    long long ts = pos.value("ts", (long long)time(nullptr));

    std::unique_lock<std::mutex> lk(g_mtx);
    auto& st = g_states[imei];
    double prev_speed = st.prev_speed;
    long long prev_ts = st.prev_ts;
    lk.unlock();

    double dt_s = (prev_ts > 0) ? (double)(ts - prev_ts) : 1.0;
    if (dt_s < 0.1) dt_s = 1.0;

    double delta_v_ms = (speed - prev_speed) * (1000.0/3600.0);
    double accel_g    = (delta_v_ms / dt_s) / 9.81;

    // Harsh braking
    if (accel_g < CFG_THR.harsh_brake_g && prev_speed > 20)
        scoreEvent(imei, "HARSH_BRAKING", "HIGH", -8, lat, lon, ts, accel_g, prod);

    // Harsh acceleration
    if (accel_g > CFG_THR.harsh_accel_g && prev_speed > 10)
        scoreEvent(imei, "HARSH_ACCELERATION", "MEDIUM", -5, lat, lon, ts, accel_g, prod);

    // Overspeed
    if (speed > CFG_THR.overspeed_kmh && prev_speed <= CFG_THR.overspeed_kmh)
        scoreEvent(imei, "OVERSPEED", "HIGH", -6, lat, lon, ts, speed, prod);

    // Fatigue
    {
        std::lock_guard<std::mutex> lk2(g_mtx);
        auto& st2 = g_states[imei];
        if (speed > 5) {
            if (st2.drive_start == 0) st2.drive_start = ts;
            double hrs = (ts - st2.drive_start) / 3600.0;
            if (hrs > CFG_THR.drive_hr_limit && (ts % 1800) < 5)
                scoreEvent(imei, "FATIGUE_RISK", "HIGH", -10, lat, lon, ts, hrs, prod);
        } else {
            st2.drive_start = 0;
        }

        // Idle
        if (speed < 1.0) {
            if (st2.idle_start == 0) st2.idle_start = ts;
            double idle_min = (ts - st2.idle_start) / 60.0;
            if (idle_min > CFG_THR.idle_min && (ts % 600) < 5)
                scoreEvent(imei, "EXCESSIVE_IDLE", "LOW", -2, lat, lon, ts, idle_min, prod);
        } else {
            st2.idle_start = 0;
        }

        st2.prev_speed = speed;
        st2.prev_lat   = lat;
        st2.prev_lon   = lon;
        st2.prev_ts    = ts;
    }

    // Publish daily score every 5 minutes per device
    if (ts % 300 < 3) {
        std::lock_guard<std::mutex> lk2(g_mtx);
        auto& st2 = g_states[imei];
        json sc;
        sc["imei"]         = imei;
        sc["overall_score"]= st2.daily_score;
        sc["event_count"]  = st2.event_count;
        sc["ts"]           = ts;
        prod.send("driver.scores", imei, sc.dump(), cbp::MEDIUM);
    }
}

int main() {
    std::signal(SIGINT, sig_handler);
    std::signal(SIGTERM, sig_handler);
    Config::instance().loadFile("config/fleetos.env");
    Logger::instance().setAgent("driver-agent");
    Geocoder::instance().loadFromEnv();

    std::string brokers   = CFG("FLEETOS_KAFKA_BROKERS","127.0.0.1:9092");
    int         mgmt_port = CFGI("FLEETOS_DRIVER_MGMT_PORT", 9084);

    LOG_INF("╔══════════════════════════════════════════╗");
    LOG_INF("║  Fleet OS — Driver Agent  (AGT-006)      ║");
    LOG_INF("╚══════════════════════════════════════════╝");
    LOG_INF("Geocoder: " + CFG("GEOCODER_PROVIDER","nominatim"));

    KafkaProducer prod;
    if (!prod.init(brokers)) { LOG_ERR("Kafka init failed"); return 1; }
    KafkaConsumer cons;
    if (!cons.init(brokers, "driver-agent-group")) { LOG_ERR("Kafka consumer init failed"); return 1; }
    cons.subscribe({"gps.positions"});

    HealthPublisher health(prod, "AGT-006", "driver-agent");
    health.setMetric("events", std::to_string((long)g_events_total));
    health.start();

    HttpServer http;
    http.get("/health", [](const HttpRequest&) -> HttpResponse {
        json r; r["agent"]="driver-agent"; r["status"]="RUNNING";
        r["events_total"]=(long)g_events_total;
        r["devices_tracked"]=(int)g_states.size();
        return {200, r.dump()};
    });
    http.get("/scores", [](const HttpRequest&) -> HttpResponse {
        json r = json::array();
        std::lock_guard<std::mutex> lk(g_mtx);
        for (auto& kv : g_states) {
            json d; d["imei"]=kv.first;
            d["score"]=kv.second.daily_score;
            d["events"]=kv.second.event_count;
            r.push_back(d);
        }
        return {200, r.dump()};
    });
    // PUT /thresholds — hot-configure DSS thresholds
    http.post("/thresholds", [](const HttpRequest& req) -> HttpResponse {
        try {
            auto j = json::parse(req.body);
            if (j.contains("harsh_brake_g"))  CFG_THR.harsh_brake_g  = j["harsh_brake_g"];
            if (j.contains("harsh_accel_g"))  CFG_THR.harsh_accel_g  = j["harsh_accel_g"];
            if (j.contains("overspeed_kmh"))  CFG_THR.overspeed_kmh  = j["overspeed_kmh"];
            if (j.contains("idle_min"))       CFG_THR.idle_min        = j["idle_min"];
            if (j.contains("drive_hr_limit")) CFG_THR.drive_hr_limit  = j["drive_hr_limit"];
            LOG_INF("[DSS] Thresholds updated");
            return {200, "{\"status\":\"applied\"}"};
        } catch(const std::exception& e) {
            return {400, std::string("{\"error\":\"") + e.what() + "\"}"};
        }
    });
    http.listen("0.0.0.0", mgmt_port);

    cons.poll([&prod](const std::string&, const std::string&, const std::string& val){
        try { processPosition(json::parse(val), prod); } catch(...) {}
    }, g_running);

    health.stop(); prod.flush();
    LOG_INF("Driver Agent stopped.");
    return 0;
}
