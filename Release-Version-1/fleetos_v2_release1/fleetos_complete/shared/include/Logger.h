#pragma once
#include <iostream>
#include <string>
#include <ctime>
#include <mutex>
#include <sstream>

namespace fleetos {

enum class LogLevel { DEBUG=0, INFO=1, WARN=2, ERR=3 };

class Logger {
public:
    static Logger& instance() { static Logger l; return l; }

    void setLevel(LogLevel lvl) { level_ = lvl; }
    void setAgent(const std::string& name) { agent_ = name; }

    void log(LogLevel lvl, const std::string& msg) {
        if (lvl < level_) return;
        std::lock_guard<std::mutex> lk(mtx_);
        time_t t = time(nullptr);
        char ts[20];
        strftime(ts, sizeof(ts), "%H:%M:%S", localtime(&t));
        const char* lvls[] = {"DEBUG","INFO ","WARN ","ERROR"};
        const char* cols[] = {"\033[36m","\033[32m","\033[33m","\033[31m"};
        std::cout << cols[(int)lvl] << "[" << ts << "] "
                  << lvls[(int)lvl] << " [" << agent_ << "] "
                  << "\033[0m" << msg << "\n";
    }

private:
    Logger() : level_(LogLevel::DEBUG), agent_("agent") {}
    LogLevel level_;
    std::string agent_;
    std::mutex mtx_;
};

#define LOG_DBG(m) fleetos::Logger::instance().log(fleetos::LogLevel::DEBUG, m)
#define LOG_INF(m) fleetos::Logger::instance().log(fleetos::LogLevel::INFO,  m)
#define LOG_WRN(m) fleetos::Logger::instance().log(fleetos::LogLevel::WARN,  m)
#define LOG_ERR(m) fleetos::Logger::instance().log(fleetos::LogLevel::ERR,   m)

} // namespace fleetos
