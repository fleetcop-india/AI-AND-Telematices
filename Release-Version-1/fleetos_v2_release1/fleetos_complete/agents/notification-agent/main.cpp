// ╔══════════════════════════════════════════════════════════════════╗
// ║  Fleet OS — Notification Agent  (AGT-008)                       ║
// ║  Consumes Kafka alarms → dispatches Firebase/SMS/Email/Webhook  ║
// ║  Port: FLEETOS_NOTIF_PORT (default 8083)                        ║
// ╚══════════════════════════════════════════════════════════════════╝
#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <map>
#include <csignal>
#include <chrono>

#include "Config.h"
#include "Logger.h"
#include "KafkaHelper.h"
#include "HttpServer.h"

#include <nlohmann/json.hpp>
using json = nlohmann::json;
using namespace fleetos;

static std::atomic<bool> g_running{true};
static std::atomic<long> g_sent{0};
static std::atomic<long> g_failed{0};

void sig_handler(int) { g_running = false; }

// ── Dispatch stub ────────────────────────────────────────────────────────
void dispatch(const std::string& channel, const json& alarm) {
    std::string imei = alarm.value("imei", "?");
    std::string type = alarm.value("type", "EVENT");
    LOG_INF("[NOTIF] " + channel + " -> " + type + " on " + imei);
    // TODO: real HTTP calls to Firebase FCM / Twilio / SendGrid / Telegram
    g_sent++;
}

// ── Kafka message handler ────────────────────────────────────────────────
void onMessage(const std::string& topic, const std::string& /*key*/,
               const std::string& value)
{
    try {
        json j = json::parse(value);
        dispatch("firebase", j);
    } catch (const std::exception& e) {
        LOG_WRN("[NOTIF] Parse error on topic " + topic + ": " + e.what());
        g_failed++;
    }
}

int main() {
    signal(SIGINT,  sig_handler);
    signal(SIGTERM, sig_handler);

    // Config is a singleton — access via Config::instance()
    Config& cfg = Config::instance();
    Logger::instance().setLevel(LogLevel::INFO);

    std::string brokers = cfg.get("FLEETOS_KAFKA_BROKERS", "127.0.0.1:9092");
    int         port    = std::stoi(cfg.get("FLEETOS_NOTIF_PORT", "8083"));

    LOG_INF("Fleet OS Notification Agent starting on :" + std::to_string(port));

    // ── Kafka consumer ───────────────────────────────────────────────
    KafkaConsumer cons;
    if (!cons.init(brokers, "notification-agent")) {
        LOG_ERR("Failed to initialise Kafka consumer");
        return 1;
    }
    cons.subscribe({"gps.alarms", "driver.events", "maintenance.events"});

    // ── HTTP management server ───────────────────────────────────────
    HttpServer http;

    http.get("/health", [&](const HttpRequest&) -> HttpResponse {
        json r;
        r["status"] = "ok";
        r["agent"]  = "notification-agent";
        r["sent"]   = (long)g_sent;
        r["failed"] = (long)g_failed;
        return {200, r.dump()};
    });

    http.get("/stats", [&](const HttpRequest&) -> HttpResponse {
        json r;
        r["sent"]   = (long)g_sent;
        r["failed"] = (long)g_failed;
        return {200, r.dump()};
    });

    if (!http.listen("0.0.0.0", port)) {
        LOG_ERR("HTTP server failed to bind on :" + std::to_string(port));
        return 1;
    }

    // ── Kafka poll loop (runs until g_running = false) ───────────────
    std::thread kafkaT([&]() {
        cons.poll(onMessage, g_running);
    });

    LOG_INF("Notification Agent ready.");
    while (g_running)
        std::this_thread::sleep_for(std::chrono::seconds(1));

    g_running = false;
    http.stop();
    kafkaT.join();
    LOG_INF("Notification Agent stopped.");
    return 0;
}
