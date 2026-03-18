#pragma once
#include <string>
#include <map>
#include <fstream>
#include <sstream>
#include <cstdlib>

namespace fleetos {

class Config {
public:
    static Config& instance() { static Config c; return c; }

    // Load from file (key=value format)
    void loadFile(const std::string& path) {
        std::ifstream f(path);
        std::string line;
        while (std::getline(f, line)) {
            if (line.empty() || line[0]=='#') continue;
            auto eq = line.find('=');
            if (eq == std::string::npos) continue;
            std::string k = trim(line.substr(0, eq));
            std::string v = trim(line.substr(eq+1));
            vals_[k] = v;
        }
    }

    // Get from env first, then file, then default
    std::string get(const std::string& key, const std::string& def = "") const {
        const char* e = std::getenv(key.c_str());
        if (e) return std::string(e);
        auto it = vals_.find(key);
        if (it != vals_.end()) return it->second;
        return def;
    }

    int getInt(const std::string& key, int def = 0) const {
        std::string v = get(key);
        if (v.empty()) return def;
        try { return std::stoi(v); } catch (...) { return def; }
    }

private:
    Config() {}
    std::map<std::string, std::string> vals_;
    static std::string trim(const std::string& s) {
        size_t a = s.find_first_not_of(" \t\r\n\"'");
        size_t b = s.find_last_not_of(" \t\r\n\"'");
        return (a==std::string::npos) ? "" : s.substr(a, b-a+1);
    }
};

inline std::string CFG(const std::string& k, const std::string& def="") {
    return Config::instance().get(k, def);
}
inline int CFGI(const std::string& k, int def=0) {
    return Config::instance().getInt(k, def);
}

} // namespace fleetos
