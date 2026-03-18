#pragma once
#include <string>
#include <map>
#include <functional>
#include <thread>
#include <atomic>
#include <sstream>
#include <cstring>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include "Logger.h"

namespace fleetos {

struct HttpRequest {
    std::string method, path, body;
    std::map<std::string, std::string> params;
};

struct HttpResponse {
    int status = 200;
    std::string body = "{}";
    std::string content_type = "application/json";
};

using HttpHandler = std::function<HttpResponse(const HttpRequest&)>;

class HttpServer {
public:
    HttpServer() : fd_(-1), running_(false) {}

    void on(const std::string& method, const std::string& path, HttpHandler h) {
        routes_[method + " " + path] = h;
    }
    void get(const std::string& path, HttpHandler h) { on("GET", path, h); }
    void post(const std::string& path, HttpHandler h) { on("POST", path, h); }

    bool listen(const std::string& host, int port) {
        fd_ = socket(AF_INET, SOCK_STREAM, 0);
        if (fd_ < 0) { LOG_ERR("socket() failed"); return false; }
        int opt = 1;
        setsockopt(fd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
        struct sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port);
        inet_pton(AF_INET, host.c_str(), &addr.sin_addr);
        if (bind(fd_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
            LOG_ERR("bind() failed on port " + std::to_string(port));
            close(fd_); return false;
        }
        ::listen(fd_, 32);
        running_ = true;
        thr_ = std::thread([this, port]() {
            LOG_INF("HTTP management server listening on :" + std::to_string(port));
            while (running_) {
                struct sockaddr_in ca{};
                socklen_t cl = sizeof(ca);
                struct timeval tv{1,0};
                fd_set fds; FD_ZERO(&fds); FD_SET(fd_, &fds);
                if (select(fd_+1, &fds, nullptr, nullptr, &tv) <= 0) continue;
                int cs = accept(fd_, (struct sockaddr*)&ca, &cl);
                if (cs < 0) continue;
                std::thread([this, cs]() { handleConn(cs); }).detach();
            }
        });
        return true;
    }

    void stop() {
        running_ = false;
        if (fd_ >= 0) { close(fd_); fd_ = -1; }
        if (thr_.joinable()) thr_.join();
    }

    ~HttpServer() { stop(); }

private:
    void handleConn(int cs) {
        char buf[8192]; int n = recv(cs, buf, sizeof(buf)-1, 0);
        if (n <= 0) { close(cs); return; }
        buf[n] = 0;
        HttpRequest req = parseRequest(buf);
        HttpResponse res = dispatch(req);
        sendResponse(cs, res);
        close(cs);
    }

    HttpRequest parseRequest(const char* raw) {
        HttpRequest req;
        std::istringstream ss(raw);
        std::string line;
        std::getline(ss, line);
        std::istringstream ls(line);
        ls >> req.method >> req.path;
        // Strip query string from path
        auto q = req.path.find('?');
        if (q != std::string::npos) req.path = req.path.substr(0, q);
        // Read until blank line, then body
        bool in_body = false; int clen = 0;
        while (std::getline(ss, line)) {
            if (line == "\r" || line.empty()) { in_body = true; continue; }
            if (!in_body) {
                auto col = line.find(':');
                if (col != std::string::npos) {
                    std::string k = line.substr(0, col);
                    std::string v = line.substr(col+2);
                    if (k == "Content-Length") clen = std::stoi(v);
                }
            }
        }
        if (clen > 0) {
            // Body is at end of raw buffer
            const char* body_start = strstr(raw, "\r\n\r\n");
            if (body_start) req.body = std::string(body_start+4, clen);
        }
        return req;
    }

    HttpResponse dispatch(const HttpRequest& req) {
        auto key = req.method + " " + req.path;
        auto it = routes_.find(key);
        if (it != routes_.end()) {
            try { return it->second(req); }
            catch (const std::exception& e) {
                return {500, "{\"error\":\"" + std::string(e.what()) + "\"}"};
            }
        }
        return {404, "{\"error\":\"not found\",\"path\":\"" + req.path + "\"}"};
    }

    void sendResponse(int cs, const HttpResponse& res) {
        std::ostringstream ss;
        ss << "HTTP/1.1 " << res.status << " OK\r\n"
           << "Content-Type: " << res.content_type << "\r\n"
           << "Access-Control-Allow-Origin: *\r\n"
           << "Content-Length: " << res.body.size() << "\r\n"
           << "Connection: close\r\n\r\n"
           << res.body;
        std::string resp = ss.str();
        send(cs, resp.c_str(), resp.size(), 0);
    }

    std::map<std::string, HttpHandler> routes_;
    int fd_;
    std::atomic<bool> running_;
    std::thread thr_;
};

} // namespace fleetos
