#pragma once
#include <cstdint>
#include <string>
#include <vector>
#include <cstring>

namespace fleetos { namespace cbp {

// ── CBP Band priorities (1-byte header) ──────────────────────────────────
enum Band : uint8_t {
    CRITICAL = 0x01,  // Video frames, panic alarms
    HIGH     = 0x02,  // GPS positions, driver events
    MEDIUM   = 0x03,  // Route violations, geofence events
    LOW      = 0x04,  // Notifications, reports
    META     = 0x00,  // Agent health, config, queries
};

// ── CBP Header (32 bytes fixed) ───────────────────────────────────────────
struct Header {
    uint8_t  band;           // 0x01..0x04 or 0x00
    uint8_t  magic[4];       // 0x464C4F53 "FLOS"
    uint8_t  version;        // 0x01
    uint16_t msg_type;       // Message type
    uint32_t src_agent;      // Source agent ID
    uint32_t dst_agent;      // Destination agent ID
    uint64_t msg_id;         // Unique message ID
    uint32_t payload_len;    // Payload length in bytes
    uint16_t compression;    // 0=none, 1=lz4, 2=zstd
    uint16_t encryption;     // 0=none, 1=aes256
    uint32_t crc32;          // Simple checksum
} __attribute__((packed));

// ── Message Types ─────────────────────────────────────────────────────────
enum MsgType : uint16_t {
    GPS_POSITION    = 0x0001,
    GPS_ALARM       = 0x0010,
    GPS_HEARTBEAT   = 0x0011,
    DRIVER_EVENT    = 0x0012,
    DRIVER_SCORE    = 0x0013,
    ROUTE_VIOLATION = 0x0020,
    GEOFENCE_EVENT  = 0x0021,
    INDUSTRY_EVENT  = 0x0022,
    NOTIFICATION    = 0x0030,
    AGENT_HEALTH    = 0x00F0,
    CONFIG_PUSH     = 0x00F1,
    OBJ_QUERY       = 0x00F2,
    OBJ_RESPONSE    = 0x00F3,
};

// ── Simple CRC32 ─────────────────────────────────────────────────────────
inline uint32_t crc32(const uint8_t* data, size_t len) {
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int j = 0; j < 8; j++)
            crc = (crc >> 1) ^ (0xEDB88320 * (crc & 1));
    }
    return crc ^ 0xFFFFFFFF;
}

// ── Encode a CBP packet ───────────────────────────────────────────────────
inline std::vector<uint8_t> encode(Band band, MsgType mtype,
                                    uint32_t src, uint32_t dst,
                                    const std::string& payload,
                                    uint64_t msg_id = 0) {
    static uint64_t counter = 0;
    Header h{};
    h.band = (uint8_t)band;
    h.magic[0]='F'; h.magic[1]='L'; h.magic[2]='O'; h.magic[3]='S';
    h.version = 0x01;
    h.msg_type = (uint16_t)mtype;
    h.src_agent = src;
    h.dst_agent = dst;
    h.msg_id = msg_id ? msg_id : ++counter;
    h.payload_len = (uint32_t)payload.size();
    h.compression = 0;
    h.encryption = 0;
    h.crc32 = crc32((const uint8_t*)payload.data(), payload.size());

    std::vector<uint8_t> pkt(sizeof(Header) + payload.size());
    std::memcpy(pkt.data(), &h, sizeof(Header));
    std::memcpy(pkt.data() + sizeof(Header), payload.data(), payload.size());
    return pkt;
}

// ── Get band name for logging ─────────────────────────────────────────────
inline const char* bandName(uint8_t b) {
    switch(b) {
        case CRITICAL: return "CRITICAL";
        case HIGH:     return "HIGH";
        case MEDIUM:   return "MEDIUM";
        case LOW:      return "LOW";
        default:       return "META";
    }
}

}} // namespace fleetos::cbp
