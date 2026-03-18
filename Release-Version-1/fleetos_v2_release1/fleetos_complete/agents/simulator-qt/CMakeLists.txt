cmake_minimum_required(VERSION 3.16)
project(FleetOSSimulator VERSION 2.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets Network)

add_executable(fleetos-simulator
    main.cpp
    SimulatorWindow.cpp
    SimulatorWindow.h
)

target_link_libraries(fleetos-simulator
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Network
)

install(TARGETS fleetos-simulator
    RUNTIME DESTINATION bin
)
