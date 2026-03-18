#pragma once
#include <string>
#include <vector>
#include <functional>
#include <thread>
#include <atomic>
#include <chrono>
#include <sstream>
#include <librdkafka/rdkafka.h>
#include "Logger.h"
#include "CBPCodec.h"

namespace fleetos {

// ── Kafka Producer ────────────────────────────────────────────────────────
class KafkaProducer {
public:
    KafkaProducer() : rk_(nullptr) {}

    bool init(const std::string& brokers) {
        char errstr[512];
        rd_kafka_conf_t* conf = rd_kafka_conf_new();
        if (rd_kafka_conf_set(conf, "bootstrap.servers", brokers.c_str(),
                               errstr, sizeof(errstr)) != RD_KAFKA_CONF_OK) {
            LOG_ERR("Kafka producer config error: " + std::string(errstr));
            rd_kafka_conf_destroy(conf);
            return false;
        }
        rd_kafka_conf_set(conf, "queue.buffering.max.ms", "100", errstr, sizeof(errstr));
        rd_kafka_conf_set(conf, "socket.timeout.ms", "5000", errstr, sizeof(errstr));

        rk_ = rd_kafka_new(RD_KAFKA_PRODUCER, conf, errstr, sizeof(errstr));
        if (!rk_) {
            LOG_ERR("Failed to create Kafka producer: " + std::string(errstr));
            return false;
        }
        brokers_ = brokers;
        LOG_INF("Kafka producer ready → " + brokers);
        return true;
    }

    bool send(const std::string& topic, const std::string& key,
              const std::string& value, cbp::Band band = cbp::HIGH) {
        if (!rk_) return false;

        // Add CBP band byte as first byte in a custom header
        // For simplicity, we embed band in the message key prefix
        std::string tagged_key = std::string(1, (char)band) + key;

        int rc = rd_kafka_producev(rk_,
            RD_KAFKA_V_TOPIC(topic.c_str()),
            RD_KAFKA_V_KEY(const_cast<void*>(static_cast<const void*>(key.c_str())), key.size()),
            RD_KAFKA_V_VALUE(const_cast<void*>(static_cast<const void*>(value.c_str())), value.size()),
            RD_KAFKA_V_MSGFLAGS(RD_KAFKA_MSG_F_COPY),
            RD_KAFKA_V_END);

        if (rc != 0) {
            LOG_WRN("Kafka send failed for topic " + topic + ": " +
                     std::string(rd_kafka_err2str(rd_kafka_last_error())));
            return false;
        }
        rd_kafka_poll(rk_, 0);
        return true;
    }

    void flush(int timeout_ms = 3000) {
        if (rk_) rd_kafka_flush(rk_, timeout_ms);
    }

    ~KafkaProducer() {
        if (rk_) {
            rd_kafka_flush(rk_, 3000);
            rd_kafka_destroy(rk_);
        }
    }

private:
    rd_kafka_t* rk_;
    std::string brokers_;
};

// ── Kafka Consumer ────────────────────────────────────────────────────────
using KafkaMsgCallback = std::function<void(const std::string& topic,
                                              const std::string& key,
                                              const std::string& value)>;

class KafkaConsumer {
public:
    KafkaConsumer() : rk_(nullptr), running_(false) {}

    bool init(const std::string& brokers, const std::string& group_id) {
        char errstr[512];
        rd_kafka_conf_t* conf = rd_kafka_conf_new();
        rd_kafka_conf_set(conf, "bootstrap.servers", brokers.c_str(), errstr, sizeof(errstr));
        rd_kafka_conf_set(conf, "group.id",          group_id.c_str(), errstr, sizeof(errstr));
        rd_kafka_conf_set(conf, "auto.offset.reset", "latest", errstr, sizeof(errstr));
        rd_kafka_conf_set(conf, "enable.auto.commit","true",   errstr, sizeof(errstr));
        rd_kafka_conf_set(conf, "socket.timeout.ms", "5000",  errstr, sizeof(errstr));
        rd_kafka_conf_set(conf, "session.timeout.ms","10000", errstr, sizeof(errstr));

        rk_ = rd_kafka_new(RD_KAFKA_CONSUMER, conf, errstr, sizeof(errstr));
        if (!rk_) {
            LOG_ERR("Failed to create Kafka consumer: " + std::string(errstr));
            return false;
        }
        // rd_kafka_poll_set_consumer handled automatically for high-level consumer
        brokers_ = brokers;
        group_   = group_id;
        LOG_INF("Kafka consumer ready [" + group_id + "] → " + brokers);
        return true;
    }

    bool subscribe(const std::vector<std::string>& topics) {
        if (!rk_) return false;
        rd_kafka_topic_partition_list_t* tpl =
            rd_kafka_topic_partition_list_new((int)topics.size());
        for (auto& t : topics)
            rd_kafka_topic_partition_list_add(tpl, t.c_str(), RD_KAFKA_PARTITION_UA);
        rd_kafka_resp_err_t err = rd_kafka_subscribe(rk_, tpl);
        rd_kafka_topic_partition_list_destroy(tpl);
        if (err != RD_KAFKA_RESP_ERR_NO_ERROR) {
            LOG_ERR("Subscribe failed: " + std::string(rd_kafka_err2str(err)));
            return false;
        }
        return true;
    }

    void poll(KafkaMsgCallback cb, std::atomic<bool>& running, int timeout_ms=500) {
        while (running.load()) {
            rd_kafka_message_t* msg = rd_kafka_consumer_poll(rk_, timeout_ms);
            if (!msg) continue;
            if (msg->err) {
                if (msg->err != RD_KAFKA_RESP_ERR__PARTITION_EOF)
                    LOG_WRN("Kafka poll error: " + std::string(rd_kafka_message_errstr(msg)));
                rd_kafka_message_destroy(msg);
                continue;
            }
            std::string topic = rd_kafka_topic_name(msg->rkt);
            std::string key   = msg->key ? std::string((char*)msg->key, msg->key_len) : "";
            std::string val   = msg->payload ? std::string((char*)msg->payload, msg->len) : "";
            rd_kafka_message_destroy(msg);
            try { cb(topic, key, val); } catch(const std::exception& e) {
                LOG_WRN("Message handler exception: " + std::string(e.what()));
            }
        }
    }

    ~KafkaConsumer() {
        if (rk_) {
            rd_kafka_consumer_close(rk_);
            rd_kafka_destroy(rk_);
        }
    }

private:
    rd_kafka_t*  rk_;
    std::string  brokers_, group_;
    std::atomic<bool> running_;
};

// ── Health Publisher (sends agent.health every 5s) ────────────────────────
class HealthPublisher {
public:
    HealthPublisher(KafkaProducer& prod, const std::string& agent_id,
                    const std::string& agent_name)
        : prod_(prod), id_(agent_id), name_(agent_name), running_(false) {}

    void setMetric(const std::string& k, const std::string& v) {
        std::lock_guard<std::mutex> lk(mtx_);
        metrics_[k] = v;
    }

    void start() {
        running_ = true;
        thr_ = std::thread([this]() {
            while (running_) {
                publish();
                for (int i = 0; i < 50 && running_; i++)
                    std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }
        });
    }

    void stop() {
        running_ = false;
        if (thr_.joinable()) thr_.join();
    }

private:
    void publish() {
        std::lock_guard<std::mutex> lk(mtx_);
        std::ostringstream ss;
        ss << "{";
        ss << "\"agent_id\":\"" << id_ << "\",";
        ss << "\"agent_name\":\"" << name_ << "\",";
        ss << "\"status\":\"RUNNING\",";
        ss << "\"ts\":" << time(nullptr) << ",";
        ss << "\"metrics\":{";
        bool first = true;
        for (auto& kv : metrics_) {
            if (!first) ss << ",";
            ss << "\"" << kv.first << "\":\"" << kv.second << "\"";
            first = false;
        }
        ss << "}}";
        prod_.send("agent.health", id_, ss.str(), cbp::META);
    }

    KafkaProducer& prod_;
    std::string id_, name_;
    std::map<std::string, std::string> metrics_;
    std::mutex mtx_;
    std::thread thr_;
    std::atomic<bool> running_;
};

} // namespace fleetos
