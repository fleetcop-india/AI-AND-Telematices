#include <QApplication>
#include <QIcon>
#include "SimulatorWindow.h"

int main(int argc, char* argv[]) {
    QApplication app(argc, argv);
    app.setApplicationName("Fleet OS Simulator");
    app.setApplicationVersion("2.0");
    app.setOrganizationName("FleetCop");
    app.setStyle("fusion");

    SimulatorWindow w;
    w.show();
    return app.exec();
}
