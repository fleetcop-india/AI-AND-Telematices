#!/usr/bin/env bash
# Build Fleet OS Qt Simulator
set -e
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
echo "✅ Built: build/fleetos-simulator"
