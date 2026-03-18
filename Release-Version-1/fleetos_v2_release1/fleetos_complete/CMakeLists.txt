cmake_minimum_required(VERSION 3.16)
project(FleetOS VERSION 2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type")
set(CMAKE_CXX_FLAGS_RELEASE "-O2")

# ── Shared include path ───────────────────────────────────────────────────────
set(SHARED_INC "${CMAKE_SOURCE_DIR}/shared/include")

# ── Find librdkafka ───────────────────────────────────────────────────────────
find_library(RDKAFKA_LIB  NAMES rdkafka  PATHS /usr/lib /usr/local/lib /usr/lib64 /usr/lib/aarch64-linux-gnu)
find_library(RDKAFKACPP_LIB NAMES rdkafka++ PATHS /usr/lib /usr/local/lib /usr/lib64 /usr/lib/aarch64-linux-gnu)
find_path(RDKAFKA_INC  NAMES librdkafka/rdkafka.h PATHS /usr/include /usr/local/include)

if(NOT RDKAFKA_LIB OR NOT RDKAFKACPP_LIB)
    message(WARNING "librdkafka not found via find_library — trying pkg-config")
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
        pkg_check_modules(RDKAFKA REQUIRED rdkafka++)
    else()
        message(FATAL_ERROR "librdkafka not found. Install: dnf install librdkafka-devel  OR  apt install librdkafka-dev")
    endif()
endif()

# ── Find nlohmann/json ────────────────────────────────────────────────────────
find_package(nlohmann_json QUIET)
if(NOT nlohmann_json_FOUND)
    # Try header-only fallback at shared/include/nlohmann/json.hpp
    find_path(NLOHMANN_INC NAMES nlohmann/json.hpp
        PATHS "${SHARED_INC}" /usr/include /usr/local/include)
    if(NOT NLOHMANN_INC)
        message(FATAL_ERROR
            "nlohmann/json not found.\n"
            "  Fedora:  sudo dnf install nlohmann-json-devel\n"
            "  Ubuntu:  sudo apt install nlohmann-json3-dev\n"
            "  Manual:  mkdir -p shared/include/nlohmann && "
            "curl -o shared/include/nlohmann/json.hpp "
            "https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp")
    endif()
endif()

# ── Helper: build one C++ agent ───────────────────────────────────────────────
function(add_agent TARGET SRC_DIR)
    file(GLOB SRCS "${SRC_DIR}/*.cpp")
    if(NOT SRCS)
        message(WARNING "No .cpp files in ${SRC_DIR} — skipping ${TARGET}")
        return()
    endif()
    add_executable(${TARGET} ${SRCS})
    target_include_directories(${TARGET} PRIVATE
        "${SHARED_INC}"
        "${RDKAFKA_INC}"
    )
    if(nlohmann_json_FOUND)
        target_link_libraries(${TARGET} PRIVATE nlohmann_json::nlohmann_json)
    endif()
    if(RDKAFKA_LIB AND RDKAFKACPP_LIB)
        target_link_libraries(${TARGET} PRIVATE "${RDKAFKACPP_LIB}" "${RDKAFKA_LIB}")
    else()
        target_link_libraries(${TARGET} PRIVATE ${RDKAFKA_LIBRARIES})
        target_include_directories(${TARGET} PRIVATE ${RDKAFKA_INCLUDE_DIRS})
        target_compile_options(${TARGET} PRIVATE ${RDKAFKA_CFLAGS_OTHER})
    endif()
    target_link_libraries(${TARGET} PRIVATE pthread)
    install(TARGETS ${TARGET} RUNTIME DESTINATION bin)
    message(STATUS "  → Agent: ${TARGET}")
endfunction()

# ── Add all agents ────────────────────────────────────────────────────────────
message(STATUS "Configuring Fleet OS agents:")
# gps-server: speaks PG wire protocol directly — no Kafka, no libpq, no OpenSSL
# Only needs pthread (already available everywhere)
add_executable(gps-server "${CMAKE_SOURCE_DIR}/agents/gps-server/main.cpp")
target_include_directories(gps-server PRIVATE "${SHARED_INC}")
target_link_libraries(gps-server PRIVATE pthread)
target_compile_options(gps-server PRIVATE -O2)
install(TARGETS gps-server RUNTIME DESTINATION bin)
message(STATUS "  → Agent: gps-server (standalone, no external deps)")
add_agent(route-agent        "${CMAKE_SOURCE_DIR}/agents/route-agent")
add_agent(driver-agent       "${CMAKE_SOURCE_DIR}/agents/driver-agent")
add_agent(maintenance-agent  "${CMAKE_SOURCE_DIR}/agents/maintenance-agent")
add_agent(industry-agent     "${CMAKE_SOURCE_DIR}/agents/industry-agent")
add_agent(notification-agent "${CMAKE_SOURCE_DIR}/agents/notification-agent")
