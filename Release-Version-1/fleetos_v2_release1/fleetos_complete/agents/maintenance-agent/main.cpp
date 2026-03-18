// Fleet OS — Maintenance Agent (AGT-005) — with Geocoder
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
struct DeviceOdo { double total_km=0,prev_lat=0,prev_lon=0,next_service_km=5000; bool alerted=false; };
static std::map<std::string,DeviceOdo> g_odo;
static std::mutex g_mtx;
double haversine(double lat1,double lon1,double lat2,double lon2){
    const double R=6371000; auto r=[](double d){return d*M_PI/180;};
    double a=sin(r(lat2-lat1)/2)*sin(r(lat2-lat1)/2)+cos(r(lat1))*cos(r(lat2))*sin(r(lon2-lon1)/2)*sin(r(lon2-lon1)/2);
    return R*2*atan2(sqrt(a),sqrt(1-a))/1000.0;
}
int main() {
    std::signal(SIGINT,sig_handler); std::signal(SIGTERM,sig_handler);
    Config::instance().loadFile("config/fleetos.env");
    Logger::instance().setAgent("maint-agent");
    Geocoder::instance().loadFromEnv();
    std::string brokers=CFG("FLEETOS_KAFKA_BROKERS","127.0.0.1:9092");
    int mgmt_port=CFGI("FLEETOS_MAINT_MGMT_PORT",9090);
    LOG_INF("║  Fleet OS — Maintenance Agent  (AGT-005) ║");
    KafkaProducer prod; if(!prod.init(brokers)){return 1;}
    KafkaConsumer cons; if(!cons.init(brokers,"maint-agent-group")){return 1;}
    cons.subscribe({"gps.positions"});
    HealthPublisher health(prod,"AGT-005","maintenance-agent"); health.start();
    HttpServer http;
    http.get("/health",[](const HttpRequest&)->HttpResponse{
        json r; r["agent"]="maintenance-agent"; r["status"]="RUNNING";
        r["devices_tracked"]=(int)g_odo.size(); return {200,r.dump()};
    });
    http.get("/odometers",[](const HttpRequest&)->HttpResponse{
        json r=json::array();
        std::lock_guard<std::mutex> lk(g_mtx);
        for(auto& kv:g_odo){
            json d; d["imei"]=kv.first;
            d["total_km"]=round(kv.second.total_km*100)/100;
            d["next_service_km"]=kv.second.next_service_km;
            d["remaining_km"]=round((kv.second.next_service_km-kv.second.total_km)*100)/100;
            r.push_back(d);
        }
        return {200,r.dump()};
    });
    http.listen("0.0.0.0",mgmt_port);
    cons.poll([&prod](const std::string&,const std::string&,const std::string& val){
        try {
            auto pos=json::parse(val);
            std::string imei=pos.value("imei","?");
            double lat=pos.value("lat",0.0), lon=pos.value("lon",0.0);
            std::lock_guard<std::mutex> lk(g_mtx);
            auto& od=g_odo[imei];
            if(od.prev_lat!=0||od.prev_lon!=0){
                double dist=haversine(od.prev_lat,od.prev_lon,lat,lon);
                od.total_km+=dist;
                if(!od.alerted && od.total_km>=od.next_service_km){
                    od.alerted=true;
                    std::string address=geoShort(lat,lon);  // ← Geocoder
                    json alert;
                    alert["imei"]=imei; alert["type"]="SERVICE_DUE";
                    alert["odometer_km"]=od.total_km; alert["service"]="Oil Change";
                    alert["address"]=address;             // ← Geocoder
                    alert["ts"]=(long long)time(nullptr);
                    prod.send("maintenance.alerts",imei,alert.dump(),cbp::LOW);
                    LOG_WRN("[MAINT] " + imei + " service due at " +
                            std::to_string((int)od.total_km) + " km @ " + address);
                }
            }
            od.prev_lat=lat; od.prev_lon=lon;
        } catch(...) {}
    }, g_running);
    health.stop(); prod.flush();
    return 0;
}
