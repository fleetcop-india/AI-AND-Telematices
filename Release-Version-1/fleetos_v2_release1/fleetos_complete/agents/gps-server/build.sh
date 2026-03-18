#!/bin/bash
# Fleet OS GPS Server — build script
# Pure C++17, zero external dependencies (no OpenSSL, no libpq)
set -e
cd "$(dirname "$0")"
mkdir -p build
echo "Building GPS server..."
g++ -std=c++17 -O2 -pthread -o build/gps-server main.cpp
echo "✅ Build complete: build/gps-server"
echo "   Supports: trust / md5 / scram-sha-256 auth"
