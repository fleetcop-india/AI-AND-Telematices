// ╔══════════════════════════════════════════════════════════════════╗
// ║  Fleet OS — Route Agent  (AGT-004)                              ║
// ║  Consumes: gps.positions                                        ║
// ║  Publishes: route.violations, geofence.events                   ║
// ║  NEW: All events include resolved address (via Geocoder)        ║
// ╚══════════════════════════════════════════════════════════════════╝
#include <iostream>
#include <string>
#include <vector>
#include <cmath>
#include <atomic>
#include <mutex>
#include <set>
#include <map>
#include <thread>
#include <csignal>
#include <sstream>
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
static std::atomic<long> g_checks{0};
static std::atomic<long> g_violations{0};

void sig_handler(int) { g_running = false; }

// ── Haversine distance (metres) ────────────────────────────────────────────
double haversine(double lat1, double lon1, double lat2, double lon2) {
    const double R = 6371000.0;
    auto rad = [](double d){ return d * M_PI / 180.0; };
    double dlat = rad(lat2-lat1), dlon = rad(lon2-lon1);
    double a = sin(dlat/2)*sin(dlat/2) +
               cos(rad(lat1))*cos(rad(lat2))*sin(dlon/2)*sin(dlon/2);
    return R * 2 * atan2(sqrt(a), sqrt(1-a));
}

// ── Geofence ──────────────────────────────────────────────────────────────
struct Geofence {
    std::string id, name, type;
    double center_lat, center_lon, radius_m;
    int max_speed_kmh;
    bool alert_enter, alert_exit;
};

static std::vector<Geofence> g_fences = {
    {"gf-001","Mumbai Depot",      "GEN_HOME",     19.0760, 72.8777, 300, 0,  true, true},
    {"gf-002","Delhi Hub",         "GEN_HOME",     28.7041, 77.1025, 300, 0,  true, true},
    {"gf-003","Project Alpha",     "CON_SITE",     12.9716, 77.5946, 500, 0,  true, true},
    {"gf-004","Danger Zone A",     "CON_EXCLUSION",12.9750, 77.5980, 100, 0,  true, false},
    {"gf-005","North Farm Field",  "AGR_FIELD",    12.9800, 77.6050, 400, 0,  false,true},
    {"gf-006","Speed Zone-01",     "CON_HAZARD",   12.9720, 77.5960, 200, 15, true, true},
};
static std::mutex g_fences_mu;

// Track which devices are inside which geofences
static std::map<std::string, std::set<std::string>> g_inside;
static std::mutex g_inside_mu;

void checkGeofences(const json& pos, KafkaProducer& prod) {
    std::string imei = pos.value("imei","unknown");
    double lat  = pos.value("lat",  0.0);
    double lon  = pos.value("lon",  0.0);
    double spd  = pos.value("speed",0.0);
    long long ts = pos.value("ts",(long long)time(nullptr));

    // ── Resolve address (cached after first call for this location) ──
    std::string address = geoShort(lat, lon);

    std::lock_guard<std::mutex> lk(g_inside_mu);
    auto& inside = g_inside[imei];

    std::lock_guard<std::mutex> lk2(g_fences_mu);
    for (auto& f : g_fences) {
        double dist = haversine(lat, lon, f.center_lat, f.center_lon);
        bool now_inside  = (dist <= f.radius_m);
        bool was_inside  = (inside.count(f.id) > 0);

        std::string event_type;
        if (now_inside && !was_inside)  { event_type = "ENTER"; inside.insert(f.id); }
        if (!now_inside && was_inside)  { event_type = "EXIT";  inside.erase(f.id);  }

        // Speed violation inside geofence
        if (now_inside && f.max_speed_kmh > 0 && spd > f.max_speed_kmh) {
            json v;
            v["imei"]          = imei;
            v["geofence_id"]   = f.id;
            v["geofence_name"] = f.name;
            v["geofence_type"] = f.type;
            v["event"]         = "SPEED_VIOLATION";
            v["speed"]         = spd;
            v["limit"]         = f.max_speed_kmh;
            v["lat"] = lat; v["lon"] = lon; v["ts"] = ts;
            v["address"]       = address;    // ← Geocoder
            prod.send("geofence.events",  imei, v.dump(), cbp::MEDIUM);
            prod.send("route.violations", imei, v.dump(), cbp::MEDIUM);
            g_violations++;
            LOG_WRN("[SPEED] " + imei + " " + std::to_string((int)spd) +
                    "km/h in " + f.name + " @ " + address);
        }

        if (event_type.empty()) continue;

        bool critical = (f.type == "CON_EXCLUSION" || f.type == "GEN_RESTRICT");
        auto band = critical ? cbp::HIGH : cbp::MEDIUM;

        json ev;
        ev["imei"]          = imei;
        ev["geofence_id"]   = f.id;
        ev["geofence_name"] = f.name;
        ev["geofence_type"] = f.type;
        ev["event"]         = event_type;
        ev["dist_m"]        = (int)dist;
        ev["lat"] = lat; ev["lon"] = lon; ev["ts"] = ts;
        ev["address"]       = address;     // ← Geocoder

        prod.send("geofence.events", imei, ev.dump(), band);

        bool should_alert = (event_type=="ENTER" && f.alert_enter) ||
                            (event_type=="EXIT"  && f.alert_exit);
        if (should_alert) {
            json notif;
            notif["channel"]  = "FCM";
            notif["title"]    = f.name + " " + event_type;
            notif["body"]     = imei + " " + event_type + "ED " + f.name + " (" + address + ")";
            notif["imei"]     = imei;
            notif["severity"] = critical ? "HIGH" : "MEDIUM";
            notif["address"]  = address;   // ← Geocoder
            prod.send("notification.requests", imei, notif.dump(), band);
            g_violations++;
            LOG_INF("[GEOFENCE] " + imei + " " + event_type + " " + f.name +
                    " | " + address);
        }
    }
    g_checks++;
}

int main() {
    std::signal(SIGINT, sig_handler);
    std::signal(SIGTERM, sig_handler);

    Config::instance().loadFile("config/fleetos.env");
    Logger::instance().setAgent("route-agent");
    // Load geocoder config from env
    Geocoder::instance().loadFromEnv();

    std::string brokers   = CFG("FLEETOS_KAFKA_BROKERS","127.0.0.1:9092");
    int         mgmt_port = CFGI("FLEETOS_ROUTE_MGMT_PORT", 9082);

    LOG_INF("╔══════════════════════════════════════════╗");
    LOG_INF("║  Fleet OS — Route Agent  (AGT-004)       ║");
    LOG_INF("╚══════════════════════════════════════════╝");
    LOG_INF("Kafka: " + brokers + " | Mgmt: :" + std::to_string(mgmt_port));
    LOG_INF("Geocoder: provider=" + CFG("GEOCODER_PROVIDER","nominatim"));

    KafkaProducer prod;
    if (!prod.init(brokers)) { LOG_ERR("Kafka producer init failed"); return 1; }
    KafkaConsumer cons;
    if (!cons.init(brokers, "route-agent-group")) { LOG_ERR("Kafka consumer init failed"); return 1; }
    cons.subscribe({"gps.positions", "gps.alarms"});

    HealthPublisher health(prod, "AGT-004", "route-agent");
    health.setMetric("fences",     std::to_string(g_fences.size()));
    health.setMetric("geocoder",   CFG("GEOCODER_PROVIDER","nominatim"));
    health.start();

    HttpServer http;
    http.get("/health", [](const HttpRequest&) -> HttpResponse {
        json r; r["agent"]="route-agent"; r["status"]="RUNNING";
        r["checks"]=(long)g_checks; r["violations"]=(long)g_violations;
        r["fences"]=(int)g_fences.size();
        return {200, r.dump()};
    });
    http.get("/fences", [](const HttpRequest&) -> HttpResponse {
        json r = json::array();
        std::lock_guard<std::mutex> lk(g_fences_mu);
        for (auto& f : g_fences) {
            json j; j["id"]=f.id; j["name"]=f.name; j["type"]=f.type;
            j["center_lat"]=f.center_lat; j["center_lon"]=f.center_lon;
            j["radius_m"]=f.radius_m; j["max_speed_kmh"]=f.max_speed_kmh;
            r.push_back(j);
        }
        return {200, r.dump()};
    });
    // POST /fences — add geofence at runtime
    http.post("/fences", [](const HttpRequest& req) -> HttpResponse {
        try {
            auto j = json::parse(req.body);
            Geofence f;
            f.id          = j.value("id",   "gf-" + std::to_string(time(nullptr)));
            f.name        = j.value("name", "New Zone");
            f.type        = j.value("type", "GEN_ZONE");
            f.center_lat  = j.value("center_lat", 0.0);
            f.center_lon  = j.value("center_lon", 0.0);
            f.radius_m    = j.value("radius_m", 500.0);
            f.max_speed_kmh = j.value("max_speed_kmh", 0);
            f.alert_enter = j.value("alert_enter", true);
            f.alert_exit  = j.value("alert_exit",  true);
            std::lock_guard<std::mutex> lk(g_fences_mu);
            g_fences.push_back(f);
            LOG_INF("[FENCE] Added: " + f.name + " (" + f.type + ")");
            return {201, "{\"status\":\"created\",\"id\":\"" + f.id + "\"}"};
        } catch(const std::exception& e) {
            return {400, std::string("{\"error\":\"") + e.what() + "\"}"};
        }
    });
    // GET /geocoder/test?lat=12.97&lon=77.59
    http.get("/geocoder/test", [](const HttpRequest& req) -> HttpResponse {
        double lat = 12.9716, lon = 77.5946;
        if (req.params.count("lat")) lat = std::stod(req.params.at("lat"));
        if (req.params.count("lon")) lon = std::stod(req.params.at("lon"));
        auto addr = geoResolve(lat, lon);
        return {200, addr.toJson().dump()};
    });
    http.listen("0.0.0.0", mgmt_port);

    LOG_INF("Consuming gps.positions → checking " + std::to_string(g_fences.size()) + " geofences");

    cons.poll([&prod](const std::string& topic, const std::string&, const std::string& val){
        if (topic == "gps.positions") {
            try {
                auto pos = json::parse(val);
                checkGeofences(pos, prod);
            } catch(...) {}
        }
    }, g_running);

    health.stop(); prod.flush();
    LOG_INF("Route Agent stopped.");
    return 0;
}
