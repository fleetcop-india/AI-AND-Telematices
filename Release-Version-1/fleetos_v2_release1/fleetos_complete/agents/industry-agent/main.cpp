// Fleet OS — Industry Agent (AGT-007) — Construction + Agriculture — with Geocoder
#include <iostream>
#include <string>
#include <map>
#include <atomic>
#include <mutex>
#include <csignal>
#include <cmath>
#include <nlohmann/json.hpp>
#include "Config.h"
#include "Logger.h"
#include "KafkaHelper.h"
#include "HttpServer.h"
#include "Geocoder.h"
using json = nlohmann::json;
using namespace fleetos;
static std::atomic<bool> g_running{true};
void sig_handler(int) { g_running = false; }
struct EquipState {
    std::string sector, equipment_type;
    double idle_since=0, coverage_km2=0;
    long long idle_alert_at=0;
    double last_lat=0, last_lon=0;
    std::string last_address;
};
static std::map<std::string,EquipState> g_equip;
static std::mutex g_mtx;
// Device → {sector, equipment_type}
static std::map<std::string,std::pair<std::string,std::string>> g_device_meta = {
    {"864920068034003",{"CONSTRUCTION","EXCAVATOR"}},
    {"864920068034004",{"AGRICULTURE", "TRACTOR"}},
    {"864920068034005",{"CONSTRUCTION","DUMPER"}},
};
int main() {
    std::signal(SIGINT,sig_handler); std::signal(SIGTERM,sig_handler);
    Config::instance().loadFile("config/fleetos.env");
    Logger::instance().setAgent("industry-agent");
    Geocoder::instance().loadFromEnv();
    std::string brokers=CFG("FLEETOS_KAFKA_BROKERS","127.0.0.1:9092");
    int mgmt_port=CFGI("FLEETOS_INDUSTRY_MGMT_PORT",9087);
    LOG_INF("║  Fleet OS — Industry Agent  (AGT-007)    ║");
    KafkaProducer prod; if(!prod.init(brokers)){return 1;}
    KafkaConsumer cons; if(!cons.init(brokers,"industry-agent-group")){return 1;}
    cons.subscribe({"gps.positions"});
    HealthPublisher health(prod,"AGT-007","industry-agent"); health.start();
    HttpServer http;
    http.get("/health",[](const HttpRequest&)->HttpResponse{
        json r; r["agent"]="industry-agent"; r["status"]="RUNNING";
        r["tracked"]=(int)g_equip.size(); return {200,r.dump()};
    });
    http.get("/equipment",[](const HttpRequest&)->HttpResponse{
        json r=json::array();
        std::lock_guard<std::mutex> lk(g_mtx);
        for(auto& kv:g_equip){
            json d; d["imei"]=kv.first;
            d["sector"]=kv.second.sector; d["type"]=kv.second.equipment_type;
            d["idle_since"]=kv.second.idle_since;
            d["coverage_km2"]=round(kv.second.coverage_km2*10000)/10000;
            d["address"]=kv.second.last_address;  // ← Geocoder
            r.push_back(d);
        }
        return {200,r.dump()};
    });
    http.listen("0.0.0.0",mgmt_port);
    cons.poll([&prod](const std::string&,const std::string&,const std::string& val){
        try {
            auto pos=json::parse(val);
            std::string imei=pos.value("imei","?");
            double speed=pos.value("speed",0.0);
            double lat=pos.value("lat",0.0), lon=pos.value("lon",0.0);
            long long ts=pos.value("ts",(long long)time(nullptr));
            auto it=g_device_meta.find(imei);
            if(it==g_device_meta.end()) return;
            std::lock_guard<std::mutex> lk(g_mtx);
            auto& eq=g_equip[imei];
            eq.sector=it->second.first; eq.equipment_type=it->second.second;
            // Update address when position changes significantly
            if(abs(lat-eq.last_lat)>0.001 || abs(lon-eq.last_lon)>0.001) {
                eq.last_address=geoShort(lat,lon);  // ← Geocoder
                eq.last_lat=lat; eq.last_lon=lon;
            }
            if(speed<1.0){
                if(eq.idle_since==0) eq.idle_since=ts;
                double idle_min=(ts-eq.idle_since)/60.0;
                if(idle_min>=10 && eq.idle_alert_at!=ts/300){
                    eq.idle_alert_at=ts/300;
                    json alert;
                    alert["imei"]=imei; alert["sector"]=eq.sector;
                    alert["type"]="IDLE"; alert["equipment"]=eq.equipment_type;
                    alert["idle_min"]=idle_min; alert["ts"]=ts;
                    alert["lat"]=lat; alert["lon"]=lon;
                    alert["address"]=eq.last_address;  // ← Geocoder
                    prod.send("industry.alerts",imei,alert.dump(),cbp::MEDIUM);
                    LOG_WRN("[INDUSTRY] "+eq.sector+" "+eq.equipment_type+" "+imei+
                            " idle "+std::to_string((int)idle_min)+"min @ "+eq.last_address);
                }
            } else { eq.idle_since=0; }
            if(eq.sector=="AGRICULTURE"&&speed>2.0){
                double row_width_m=2.5,dt_h=1.0/3600.0;
                eq.coverage_km2+=speed*row_width_m*dt_h/1000000.0;
            }
        } catch(...) {}
    }, g_running);
    health.stop(); prod.flush();
    return 0;
}
