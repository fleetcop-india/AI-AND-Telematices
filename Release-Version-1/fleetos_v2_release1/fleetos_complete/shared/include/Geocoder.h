#pragma once
// ╔══════════════════════════════════════════════════════════════════╗
// ║  Fleet OS — Geocoder Module                                     ║
// ║  Converts lat/lon → human-readable address                      ║
// ║                                                                 ║
// ║  Providers (configurable from Web Panel):                       ║
// ║    • nominatim — OpenStreetMap, FREE, no key (default)          ║
// ║    • google    — Google Maps API, needs GEOCODER_API_KEY        ║
// ║    • opencage  — OpenCage, needs GEOCODER_API_KEY               ║
// ║    • mapbox    — MapBox, needs GEOCODER_API_KEY                 ║
// ║    • arcgis    — ArcGIS World Geocoder, FREE, no key            ║
// ║                                                                 ║
// ║  Usage in any agent:                                            ║
// ║    #include "Geocoder.h"                                        ║
// ║    std::string addr = geoShort(lat, lon);                       ║
// ║    // → "MG Road, Bengaluru"                                    ║
// ║                                                                 ║
// ║  Web Panel configures via:                                      ║
// ║    PUT /api/geocoder/config  { provider, api_key }              ║
// ║    GET /api/geocoder/resolve?lat=12.97&lon=77.59                ║
// ╚══════════════════════════════════════════════════════════════════╝
#include <string>
#include <map>
#include <mutex>
#include <ctime>
#include <sstream>
#include <iomanip>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <stdexcept>
#include "Config.h"
#include "Logger.h"
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace fleetos {

// ── Resolved address ──────────────────────────────────────────────────────
struct Address {
    std::string full;          // "MG Road, Bengaluru, Karnataka 560001, India"
    std::string road;          // "MG Road"
    std::string locality;      // "Bengaluru"
    std::string state;         // "Karnataka"
    std::string postcode;      // "560001"
    std::string country;       // "India"
    std::string country_code;  // "in"
    double      lat{0.0};
    double      lon{0.0};
    std::string provider;
    bool        cached{false};
    bool        ok{false};
    std::string error;

    // Short form for alerts and notifications
    std::string short_addr() const {
        if (!road.empty() && !locality.empty())
            return road + ", " + locality;
        if (!locality.empty() && !state.empty())
            return locality + ", " + state;
        if (!full.empty())
            return full.substr(0, std::min(full.size(), (size_t)60));
        return "Unknown Location";
    }

    json toJson() const {
        return {
            {"full",         full},
            {"road",         road},
            {"locality",     locality},
            {"state",        state},
            {"postcode",     postcode},
            {"country",      country},
            {"country_code", country_code},
            {"lat",          lat},
            {"lon",          lon},
            {"provider",     provider},
            {"cached",       cached},
            {"ok",           ok},
            {"error",        error}
        };
    }
};

// ── Geocoder ──────────────────────────────────────────────────────────────
class Geocoder {
public:
    static Geocoder& instance() { static Geocoder g; return g; }

    // ── Primary API ───────────────────────────────────────────────────
    Address resolve(double lat, double lon) {
        if (!enabled_) {
            Address a; a.ok = true; a.provider = "disabled";
            a.full = coordStr(lat, lon);
            a.lat = lat; a.lon = lon;
            return a;
        }

        // Cache key rounded to ~1m precision
        std::string ck = cacheKey(lat, lon);
        {
            std::lock_guard<std::mutex> lk(cache_mu_);
            auto it = cache_.find(ck);
            if (it != cache_.end() && time(nullptr) - it->second.ts < 86400) {
                it->second.addr.cached = true;
                return it->second.addr;
            }
        }

        Address addr = fetch(lat, lon);
        addr.lat = lat; addr.lon = lon;

        if (addr.ok) {
            std::lock_guard<std::mutex> lk(cache_mu_);
            if (cache_.size() >= 10000) cache_.erase(cache_.begin());
            cache_[ck] = {addr, time(nullptr)};
        } else {
            // Fallback: return coordinate string so we always have something
            addr.full = coordStr(lat, lon);
            addr.ok   = true;
        }
        return addr;
    }

    std::string resolveShort(double lat, double lon) { return resolve(lat, lon).short_addr(); }
    std::string resolveFull (double lat, double lon) { return resolve(lat, lon).full; }

    // ── Config (called from web panel PUT /api/geocoder/config) ───────
    void applyConfig(const json& cfg) {
        std::lock_guard<std::mutex> lk(cfg_mu_);
        if (cfg.contains("provider")) provider_ = cfg["provider"].template get<std::string>();
        if (cfg.contains("api_key") && cfg["api_key"].template get<std::string>() != "***")
            api_key_ = cfg["api_key"].template get<std::string>();
        if (cfg.contains("enabled")) enabled_ = cfg["enabled"].template get<bool>();
        LOG_INF("[Geocoder] Config updated → provider=" + provider_ +
                " enabled=" + (enabled_ ? "yes" : "no"));
        // Clear cache so new provider is used
        std::lock_guard<std::mutex> lk2(cache_mu_);
        cache_.clear();
    }

    void loadFromEnv() {
        std::lock_guard<std::mutex> lk(cfg_mu_);
        provider_ = CFG("GEOCODER_PROVIDER", "nominatim");
        api_key_  = CFG("GEOCODER_API_KEY",  "");
        std::string en = CFG("GEOCODER_ENABLED", "true");
        enabled_  = (en != "false" && en != "0");
        LOG_INF("[Geocoder] Provider=" + provider_ + " enabled=" + (enabled_ ? "yes" : "no"));
    }

    json getConfig() const {
        std::lock_guard<std::mutex> lk(cfg_mu_);
        return {
            {"provider",     provider_},
            {"api_key",      api_key_.empty() ? "" : "***"},
            {"enabled",      enabled_},
            {"cache_size",   (int)cache_.size()},
            {"providers", json::array({
                {{"id","nominatim"},{"name","OpenStreetMap Nominatim"},{"key_required",false},{"free",true},{"notes","Default — no key, 1 req/sec rate limit"}},
                {{"id","arcgis"},  {"name","ArcGIS World Geocoder"},   {"key_required",false},{"free",true},{"notes","Free with Esri account, no key for basic use"}},
                {{"id","google"},  {"name","Google Maps Geocoding"},   {"key_required",true}, {"free",false},{"notes","Best accuracy, paid — set GEOCODER_API_KEY"}},
                {{"id","opencage"},{"name","OpenCage Geocoder"},       {"key_required",true}, {"free",true}, {"notes","2500/day free — set GEOCODER_API_KEY"}},
                {{"id","mapbox"},  {"name","MapBox Geocoding"},        {"key_required",true}, {"free",true}, {"notes","100k/month free — set GEOCODER_API_KEY"}},
            })}
        };
    }

    void clearCache() {
        std::lock_guard<std::mutex> lk(cache_mu_);
        cache_.clear();
        LOG_INF("[Geocoder] Cache cleared");
    }

private:
    Geocoder() { loadFromEnv(); }

    std::string provider_ = "nominatim";
    std::string api_key_;
    bool        enabled_  = true;
    mutable std::mutex cfg_mu_;

    struct CacheEntry { Address addr; time_t ts; };
    std::map<std::string, CacheEntry> cache_;
    mutable std::mutex cache_mu_;

    static std::string cacheKey(double lat, double lon) {
        std::ostringstream s;
        s << std::fixed << std::setprecision(5) << lat << "," << lon;
        return s.str();
    }

    static std::string coordStr(double lat, double lon) {
        std::ostringstream s;
        s << std::fixed << std::setprecision(6) << lat << ", " << lon;
        return s.str();
    }

    // ── HTTP GET using curl command (no libcurl dep needed) ───────────
    std::string httpGet(const std::string& url) {
        std::string cmd = "curl -s -m 5 -A 'FleetOS/1.0' '" + url + "' 2>/dev/null";
        FILE* pipe = popen(cmd.c_str(), "r");
        if (!pipe) return "";
        char buf[4096];
        std::string result;
        while (fgets(buf, sizeof(buf), pipe)) result += buf;
        pclose(pipe);
        return result;
    }

    // ── Provider dispatch ─────────────────────────────────────────────
    Address fetch(double lat, double lon) {
        std::string prov, key;
        {
            std::lock_guard<std::mutex> lk(cfg_mu_);
            prov = provider_; key = api_key_;
        }
        try {
            if      (prov == "google")   return fetchGoogle(lat, lon, key);
            else if (prov == "opencage") return fetchOpenCage(lat, lon, key);
            else if (prov == "mapbox")   return fetchMapBox(lat, lon, key);
            else if (prov == "arcgis")   return fetchArcGIS(lat, lon);
            else                         return fetchNominatim(lat, lon);
        } catch (const std::exception& e) {
            Address a; a.error = e.what(); return a;
        }
    }

    std::string latStr(double lat) { std::ostringstream s; s << std::fixed << std::setprecision(6) << lat; return s.str(); }
    std::string lonStr(double lon) { return latStr(lon); }

    // ── Nominatim (OpenStreetMap) — FREE ──────────────────────────────
    Address fetchNominatim(double lat, double lon) {
        Address a; a.provider = "nominatim";
        std::string url = "https://nominatim.openstreetmap.org/reverse?format=json&lat=" +
                          latStr(lat) + "&lon=" + lonStr(lon) + "&zoom=18&addressdetails=1";
        std::string resp = httpGet(url);
        if (resp.empty()) { a.error = "No response"; return a; }
        try {
            auto j = json::parse(resp);
            a.full = j.value("display_name", "");
            if (j.contains("address")) {
                auto& ad = j["address"];
                a.road     = ad.value("road", ad.value("pedestrian", ad.value("path", "")));
                a.locality = ad.value("city", ad.value("town", ad.value("village", ad.value("suburb", ""))));
                a.state    = ad.value("state", "");
                a.postcode = ad.value("postcode", "");
                a.country  = ad.value("country", "");
                a.country_code = ad.value("country_code", "");
            }
            a.ok = !a.full.empty();
        } catch (const std::exception& e) { a.error = e.what(); }
        return a;
    }

    // ── ArcGIS — FREE ─────────────────────────────────────────────────
    Address fetchArcGIS(double lat, double lon) {
        Address a; a.provider = "arcgis";
        std::string url = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&featureTypes=&location=" +
                          lonStr(lon) + "," + latStr(lat);
        std::string resp = httpGet(url);
        if (resp.empty()) { a.error = "No response"; return a; }
        try {
            auto j = json::parse(resp);
            if (j.contains("address")) {
                auto& ad = j["address"];
                a.road     = ad.value("Address", "");
                a.locality = ad.value("City", "");
                a.state    = ad.value("RegionAbbr", ad.value("Region", ""));
                a.postcode = ad.value("Postal", "");
                a.country  = ad.value("CountryCode", "");
                a.full     = ad.value("Match_addr", a.road + (a.road.empty() ? "" : ", ") + a.locality);
                a.ok       = !a.full.empty();
            }
        } catch (const std::exception& e) { a.error = e.what(); }
        return a;
    }

    // ── Google Maps ───────────────────────────────────────────────────
    Address fetchGoogle(double lat, double lon, const std::string& key) {
        Address a; a.provider = "google";
        if (key.empty()) { a.error = "API key not configured (set GEOCODER_API_KEY)"; return a; }
        std::string url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" +
                          latStr(lat) + "," + lonStr(lon) + "&key=" + key;
        std::string resp = httpGet(url);
        if (resp.empty()) { a.error = "No response"; return a; }
        try {
            auto j = json::parse(resp);
            if (j.value("status","") != "OK") { a.error = j.value("status","error"); return a; }
            auto& r = j["results"][0];
            a.full = r.value("formatted_address","");
            for (auto& c : r["address_components"]) {
                std::string ln = c.value("long_name","");
                auto& types = c["types"];
                if (std::find(types.begin(), types.end(), "route")            != types.end()) a.road     = ln;
                if (std::find(types.begin(), types.end(), "locality")         != types.end()) a.locality = ln;
                if (std::find(types.begin(), types.end(), "administrative_area_level_1") != types.end()) a.state = ln;
                if (std::find(types.begin(), types.end(), "postal_code")      != types.end()) a.postcode = ln;
                if (std::find(types.begin(), types.end(), "country")          != types.end()) a.country  = ln;
            }
            a.ok = !a.full.empty();
        } catch (const std::exception& e) { a.error = e.what(); }
        return a;
    }

    // ── OpenCage ──────────────────────────────────────────────────────
    Address fetchOpenCage(double lat, double lon, const std::string& key) {
        Address a; a.provider = "opencage";
        if (key.empty()) { a.error = "API key not configured (set GEOCODER_API_KEY)"; return a; }
        std::string url = "https://api.opencagedata.com/geocode/v1/json?q=" +
                          latStr(lat) + "+" + lonStr(lon) + "&key=" + key + "&limit=1&no_annotations=1";
        std::string resp = httpGet(url);
        if (resp.empty()) { a.error = "No response"; return a; }
        try {
            auto j = json::parse(resp);
            auto& res = j["results"][0];
            a.full = res.value("formatted","");
            auto& comp = res["components"];
            a.road     = comp.value("road","");
            a.locality = comp.value("city", comp.value("town", comp.value("village","")));
            a.state    = comp.value("state","");
            a.postcode = comp.value("postcode","");
            a.country  = comp.value("country","");
            a.country_code = comp.value("country_code","");
            a.ok = !a.full.empty();
        } catch (const std::exception& e) { a.error = e.what(); }
        return a;
    }

    // ── MapBox ────────────────────────────────────────────────────────
    Address fetchMapBox(double lat, double lon, const std::string& key) {
        Address a; a.provider = "mapbox";
        if (key.empty()) { a.error = "API key not configured (set GEOCODER_API_KEY)"; return a; }
        std::string url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
                          lonStr(lon) + "," + latStr(lat) + ".json?access_token=" + key +
                          "&types=address,place,region,postcode";
        std::string resp = httpGet(url);
        if (resp.empty()) { a.error = "No response"; return a; }
        try {
            auto j = json::parse(resp);
            if (!j["features"].empty()) {
                auto& feat = j["features"][0];
                a.full = feat.value("place_name","");
                for (auto& ctx : feat.value("context", json::array())) {
                    std::string id   = ctx.value("id","");
                    std::string text = ctx.value("text","");
                    if (id.find("place")    != std::string::npos) a.locality = text;
                    if (id.find("region")   != std::string::npos) a.state    = text;
                    if (id.find("postcode") != std::string::npos) a.postcode = text;
                    if (id.find("country")  != std::string::npos) a.country  = text;
                }
                a.ok = !a.full.empty();
            }
        } catch (const std::exception& e) { a.error = e.what(); }
        return a;
    }
};

// ── Convenience free functions ─────────────────────────────────────────────
inline std::string geoShort(double lat, double lon) {
    return Geocoder::instance().resolveShort(lat, lon);
}
inline std::string geoFull(double lat, double lon) {
    return Geocoder::instance().resolveFull(lat, lon);
}
inline Address geoResolve(double lat, double lon) {
    return Geocoder::instance().resolve(lat, lon);
}

} // namespace fleetos
