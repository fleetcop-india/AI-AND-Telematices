#pragma once
#include <QMainWindow>
#include <QTimer>
#include <QLabel>
#include <QPushButton>
#include <QSpinBox>
#include <QComboBox>
#include <QTableWidget>
#include <QTextEdit>
#include <QGroupBox>
#include <QSlider>
#include <QCheckBox>
#include <QSystemTrayIcon>
#include <QMenu>
#include <QLineEdit>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>
#include <QUrl>
#include <QFile>
#include <QTextStream>
#include <QFileDialog>
#include <QDialog>
#include <QFormLayout>
#include <QDialogButtonBox>
#include <QNetworkProxy>
#include <QSet>
#include <QMap>
#include <QTabWidget>
#include <QSplitter>
#include <QHeaderView>
#include <QProgressBar>
#include <QTcpSocket>
#include <vector>
#include <memory>

// ── GT06N per-device persistent connection state ─────────────────
struct GT06NConn {
    QTcpSocket* socket   = nullptr;
    quint16     sn       = 1;       // serial number counter
    bool        loggedIn = false;   // true after server ACK to login
    bool        connecting = false; // connect in progress
    QByteArray  rxBuf;              // incoming data buffer
};

struct CsvPoint {
    qint64  msEpoch = 0;
    double  lat = 0, lon = 0, speed = 0, heading = 0, altitude = 0;
    bool    ignition = true;
    QString alarm;
};

struct VehicleState {
    int     id = 0;
    QString imei, name;
    double  lat = 12.9716, lon = 77.5946;
    double  speed = 0, heading = 0, odometer = 0, engineHours = 0;
    QString protocol = "GT06N";
    QString status   = "idle";
    bool    engineOn    = true;
    bool    immobilised = false;   // REQ-21: engine cut via web panel
    bool    selected    = false;   // REQ-20: multi-device selection
    bool    gpsFixed    = true;
    bool    safePark    = false;
    int     satellites  = 8;
    double  voltage     = 12.4;
    double  fuel        = 100.0;
    int     packetsSent = 0;
    double  targetLat   = 12.9716, targetLon = 77.5946;
    // CSV replay
    QVector<CsvPoint> csvTrack;
    int     csvIdx  = -1;
    bool    csvLoop = true;
    // Alarms
    bool    panicActive     = false;
    bool    overspeedActive = false;
    // Video sim
    bool    videoSimEnabled = false;
    QString videoStreamUrl;
};

class SimulatorWindow : public QMainWindow {
    Q_OBJECT
public:
    explicit SimulatorWindow(QWidget* parent = nullptr);
    ~SimulatorWindow() override;

private slots:
    // Core
    void onTick();
    void onStartAll();
    void onStopAll();
    void onAddVehicle();
    void onRemoveVehicle();
    void onRowSelected(int row);
    void onSpeedChanged(int v);
    void onSelectAll();
    void onItemChanged(QTableWidgetItem*);

    // Alarms
    void onSendPanic();
    void onSendOverspeed();
    void onBroadcastGeofence();
    void onBroadcastCustomAlarm();

    // Engine cut / restore (REQ-21)
    void pollEngineCommands();
    void pollCommandsForImei(const QString& imei);

    // Bulk device management (1000+ devices)
    void onLoadDevicesCSV();
    void onGenerateDevices();
    void onClearAllDevices();

    // CSV track management (REQ-20)
    void onLoadCSV();
    void onCsvAssignImei();
    void onBulkAssignCSV();      // folder of IMEI.csv files

    // API
    void fetchDevicesFromAPI();
    void onAddLocalDevice();
    void doLoginThenFetch(const QString& base);
    void doFetchDevices(const QString& base, const QString& jwt);
    void rebuildImeiCombo();

    // Tray
    void onTrayActivated(QSystemTrayIcon::ActivationReason);
    void onStatsTimer();

private:
    void buildUI();
    void buildMainTab();
    void buildBulkTab();
    void buildAlarmTab();
    void buildVideoTab();
    void buildTrayIcon();
    void updateTable();
    void updateSelectedVehicle();
    void updateStats();
    void moveVehicle(VehicleState& v);

    // ── Packet sending ──────────────────────────────────────────
    void sendPacket(const VehicleState& v, const QString& alarm = QString());

    // AIS140 / NMEA (text)
    QString buildAIS140Packet(const VehicleState& v);

    // GT06N — REAL binary protocol, persistent TCP per device
    // Login packet:   78 78 | 11 | 01 | IMEI[8 BCD] | SN[2] | CRC[2] | 0D 0A
    // Location packet:78 78 | len | 12 | datetime[6] | sats | lat[4] | lon[4] | speed | course[2] | cell[7] | alarm | lang | SN[2] | CRC[2] | 0D 0A
    void        sendGT06N(VehicleState& v, const QString& alarm);
    QByteArray  buildGT06NLogin   (const VehicleState& v, quint16 sn);
    QByteArray  buildGT06NLocation(const VehicleState& v, const QString& alarm, quint16 sn);
    QByteArray  buildGT06NHeartbeat(quint16 sn, bool ignitionOn = true, bool gpsFixed = true, bool immobilised = false);

    void gt06nConnected (const QString& imei);
    void gt06nDataReady (const QString& imei);
    void gt06nDisconnected(const QString& imei);
    void gt06nSocketError(const QString& imei, QAbstractSocket::SocketError err);
    void closeAllGT06N();

    QVector<CsvPoint> parseCsvFile(const QString& path);
    void applyCsvToVehicle(VehicleState& v, const QVector<CsvPoint>& track);
    void appendLog(const QString& msg, const QString& color = "#64748B");
    void appendBulkLog(const QString& msg, const QString& color = "#64748B");

    // ── GT06N persistent connections (keyed by IMEI) ────────────
    QMap<QString, GT06NConn*> m_gt06nConns;
    QTimer*                   m_gt06nHbTimer = nullptr; // heartbeat every 30s

    // Timers
    QTimer* m_timer      = nullptr;
    QTimer* m_pollTimer  = nullptr;
    QTimer* m_statsTimer = nullptr;

    // State
    std::vector<VehicleState> m_vehicles;
    int    m_selectedRow  = -1;
    bool   m_running      = false;
    int    m_totalPackets = 0;
    int    m_totalFailed  = 0;
    double m_totalKm      = 0;
    QString m_broadcastAlarm;
    QString m_jwt;
    QSet<QString>              m_immobilisedImeis;
    QMap<QString, QVector<CsvPoint>> m_csvLibrary;
    QVector<CsvPoint>          m_csvTrack;

    // ── Main tab ─────────────────────────────────────────────────
    QTabWidget*   m_tabs        = nullptr;
    QTableWidget* m_table       = nullptr;
    QTextEdit*    m_log         = nullptr;
    QPushButton*  m_btnStart    = nullptr;
    QPushButton*  m_btnStop     = nullptr;
    QPushButton*  m_btnAdd      = nullptr;
    QPushButton*  m_btnRemove   = nullptr;
    QPushButton*  m_btnSelectAll= nullptr;
    QPushButton*  m_btnSendSelected = nullptr;  // toggle: send all vs send selected only
    QSpinBox*     m_intervalSpin= nullptr;
    QComboBox*    m_protocolCombo=nullptr;
    QLabel*       m_selIMEI     = nullptr;
    QLabel*       m_selPos      = nullptr;
    QLabel*       m_selSpeed    = nullptr;
    QLabel*       m_selStatus   = nullptr;
    QSlider*      m_speedSlider = nullptr;
    QCheckBox*    m_chkPanic    = nullptr;
    QCheckBox*    m_chkOverspeed= nullptr;
    QLineEdit*    m_hostEdit    = nullptr;
    QSpinBox*     m_portSpin    = nullptr;
    QSystemTrayIcon* m_tray     = nullptr;
    QNetworkAccessManager* m_nam= nullptr;
    QLineEdit*    m_apiEdit     = nullptr;
    QPushButton*  m_btnRefresh  = nullptr;
    QPushButton*  m_btnLoadCSV  = nullptr;
    QComboBox*    m_csvImeiCombo= nullptr;
    QLabel*       m_csvStatusLabel=nullptr;
    QLabel*       m_lbOnline    = nullptr;
    QLabel*       m_lbPackets   = nullptr;
    QLabel*       m_lbKm        = nullptr;
    QLabel*       m_lbFreq      = nullptr;
    QLabel*       m_lbFailed    = nullptr;
    QLabel*       m_lbImmob     = nullptr;

    // ── Bulk tab ─────────────────────────────────────────────────
    QTextEdit*    m_bulkLog     = nullptr;
    QLabel*       m_lbBulkTotal = nullptr;
    QLabel*       m_lbBulkSent  = nullptr;
    QSpinBox*     m_genCountSpin= nullptr;
    QSpinBox*     m_batchSizeSpin=nullptr;
    QProgressBar* m_bulkProgress= nullptr;

    // ── Alarm tab ────────────────────────────────────────────────
    QLineEdit*    m_customAlarmEdit   = nullptr;
    QComboBox*    m_alarmTargetCombo  = nullptr;
    QLineEdit*    m_alarmImeiFilter   = nullptr;

    // ── Video tab ────────────────────────────────────────────────
    QLabel*       m_videoPlaceholder  = nullptr;
    QLineEdit*    m_videoUrlEdit      = nullptr;
    QComboBox*    m_videoDeviceCombo  = nullptr;
};
