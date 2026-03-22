#include "SimulatorWindow.h"
#include <QApplication>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGridLayout>
#include <QHeaderView>
#include <QMessageBox>
#include <QDateTime>
#include <QStatusBar>
#include <QFont>
#include <QtMath>
#include <QRandomGenerator>
#include <QTcpSocket>
#include <QJsonObject>
#include <QJsonDocument>
#include <QDir>
#include <QDirIterator>
#include <QInputDialog>
#include <QScrollBar>
#include <QComboBox>
#include <cmath>

// ─── CSS ──────────────────────────────────────────────────────────
static const char* CSS_MAIN = R"(
QMainWindow, QWidget#central { background:#F0F4F8; font-family:'Segoe UI','Ubuntu',sans-serif; font-size:13px; }
QGroupBox { background:#fff; border:1px solid #E2E8F0; border-radius:10px; margin-top:12px;
    padding:12px 10px 10px; font-weight:700; color:#0F172A; }
QGroupBox::title { subcontrol-origin:margin; left:10px; padding:2px 6px; background:#fff; border-radius:4px; }
QTableWidget { border:none; background:#fff; alternate-background-color:#F8FAFC;
    gridline-color:#F1F5F9; border-radius:8px; }
QTableWidget::item { padding:6px 10px; border:none; color:#0F172A; }
QTableWidget::item:selected { background:#EFF6FF; color:#1D4ED8; }
QHeaderView::section { background:#F8FAFC; border:none; border-bottom:1px solid #E2E8F0;
    padding:8px 10px; font-weight:700; color:#475569; font-size:11.5px; }
QPushButton { border-radius:7px; padding:6px 14px; font-weight:600; font-size:12.5px; border:none; }
QPushButton#btnStart { background:#10B981; color:#fff; }
QPushButton#btnStart:hover { background:#059669; }
QPushButton#btnStop  { background:#EF4444; color:#fff; }
QPushButton#btnStop:hover  { background:#DC2626; }
QPushButton#btnAdd   { background:#3B82F6; color:#fff; }
QPushButton#btnAdd:hover   { background:#2563EB; }
QPushButton          { background:#E2E8F0; color:#0F172A; }
QPushButton:hover    { background:#CBD5E1; }
QLineEdit, QSpinBox, QComboBox { background:#fff; border:1px solid #CBD5E1;
    border-radius:6px; padding:5px 9px; color:#0F172A; }
QLineEdit:focus, QSpinBox:focus, QComboBox:focus { border-color:#3B82F6; }
QTextEdit { background:#0F172A; color:#E2E8F0; border-radius:8px;
    font-family:'Consolas','Courier New',monospace; font-size:11.5px; border:none; padding:8px; }
QSlider::groove:horizontal { height:4px; background:#E2E8F0; border-radius:2px; }
QSlider::sub-page:horizontal { background:#2563EB; border-radius:2px; }
QSlider::handle:horizontal { width:14px; height:14px; background:#2563EB;
    border-radius:7px; margin:-5px 0; }
QTabWidget::pane { border:1px solid #E2E8F0; border-radius:8px; background:#fff; }
QTabBar::tab { background:#F1F5F9; border:1px solid #E2E8F0; padding:7px 16px;
    border-radius:6px 6px 0 0; font-weight:600; color:#475569; margin-right:2px; }
QTabBar::tab:selected { background:#fff; color:#1D4ED8; border-bottom-color:#fff; }
QProgressBar { border:1px solid #CBD5E1; border-radius:6px; background:#F1F5F9;
    text-align:center; font-weight:700; font-size:11px; }
QProgressBar::chunk { background:#10B981; border-radius:6px; }
QStatusBar { background:#1A2332; color:rgba(255,255,255,0.6); font-size:11.5px; padding:0 8px; }
)";

// ═══════════════════════════════════════════════════════════════
// CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════
SimulatorWindow::SimulatorWindow(QWidget* parent) : QMainWindow(parent) {
    setWindowTitle("Fleet OS — Telematics Simulator v2.0");
    setMinimumSize(1280, 800);
    setStyleSheet(CSS_MAIN);

    buildUI();
    buildTrayIcon();

    m_nam = new QNetworkAccessManager(this);
    m_nam->setProxy(QNetworkProxy(QNetworkProxy::NoProxy));

    // Engine command poll — every 5s (REQ-21)
    m_pollTimer = new QTimer(this);
    connect(m_pollTimer, &QTimer::timeout, this, &SimulatorWindow::pollEngineCommands);
    m_pollTimer->start(5000);

    // Stats refresh — every 1s
    m_statsTimer = new QTimer(this);
    connect(m_statsTimer, &QTimer::timeout, this, &SimulatorWindow::onStatsTimer);
    m_statsTimer->start(1000);

    // GT06N heartbeat — send 0x13 status packet every 30s per spec section 5.4
    m_gt06nHbTimer = new QTimer(this);
    connect(m_gt06nHbTimer, &QTimer::timeout, this, [this](){
        for (auto it = m_gt06nConns.begin(); it != m_gt06nConns.end(); ++it) {
            GT06NConn* c = it.value();
            if (!c->loggedIn || !c->socket ||
                c->socket->state() != QAbstractSocket::ConnectedState) continue;

            // Find the vehicle for this IMEI to encode real ignition/GPS state
            bool ignOn = true, gpsOk = true, imob = false;
            for (const auto& v : m_vehicles) {
                // connKey is "imei:proto" — extract IMEI part
                if (v.imei == it.key().section(':', 0, 0)) {
                    ignOn = v.engineOn;
                    gpsOk = v.gpsFixed;
                    imob  = v.immobilised;
                    break;
                }
            }
            QByteArray hb = buildGT06NHeartbeat(c->sn++, ignOn, gpsOk, imob);
            c->socket->write(hb);
            appendLog(QString("[%1] %2 💓 GT06N HB ign=%3 gps=%4 (%5B)")
                .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
                .arg(it.key().right(6))
                .arg(ignOn ? "ON" : "OFF")
                .arg(gpsOk ? "OK" : "—")
                .arg(hb.size()), "#334155");
        }
    });
    m_gt06nHbTimer->start(30000);

    updateTable();
    updateStats();

    statusBar()->showMessage("  ● Fleet OS Simulator ready  |  Main Tab: single device  |  Bulk Tab: 1000+ devices");

    appendLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "#334155");
    appendLog("  Fleet OS Telematics Simulator  v2.0", "#3B82F6");
    appendLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "#334155");
    appendLog("  MAIN TAB  — add devices one by one, CSV replay, fine control", "#94A3B8");
    appendLog("  BULK TAB  — generate/load 1000+ devices, concurrent send", "#94A3B8");
    appendLog("  ALARM TAB — broadcast panic/overspeed/geofence to all/selected", "#94A3B8");
    appendLog("  VIDEO TAB — configure future RTSP/WebRTC stream simulation", "#94A3B8");
    appendLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "#334155");

    QTimer::singleShot(800, this, [this]{ fetchDevicesFromAPI(); });
}

SimulatorWindow::~SimulatorWindow() {
    closeAllGT06N();
}

// ═══════════════════════════════════════════════════════════════
// BUILD UI — Tab layout
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::buildUI() {
    auto* central = new QWidget; central->setObjectName("central");
    setCentralWidget(central);
    auto* root = new QVBoxLayout(central);
    root->setContentsMargins(10,10,10,6); root->setSpacing(8);

    // ── Stat cards row ────────────────────────────────────────
    auto* statsRow = new QHBoxLayout; statsRow->setSpacing(8);
    auto mkStat = [&](const QString& lbl, QLabel** out, const QString& ico="") {
        auto* gb = new QGroupBox; gb->setMaximumHeight(80);
        auto* vl = new QVBoxLayout(gb); vl->setContentsMargins(10,4,10,6); vl->setSpacing(1);
        auto* t = new QLabel(ico+" "+lbl); t->setStyleSheet("font-size:10px;color:#64748B;font-weight:700;");
        auto* v = new QLabel("—"); v->setStyleSheet("font-size:20px;font-weight:800;color:#0F172A;");
        vl->addWidget(t); vl->addWidget(v); statsRow->addWidget(gb); *out=v;
    };
    mkStat("Online",  &m_lbOnline,  "🟢");
    mkStat("Packets", &m_lbPackets, "📡");
    mkStat("Total KM",&m_lbKm,      "📏");
    mkStat("Failed",  &m_lbFailed,  "❌");
    mkStat("Cut",     &m_lbImmob,   "✂️");
    mkStat("Interval",&m_lbFreq,    "⏱");
    root->addLayout(statsRow);

    // ── Connection bar ────────────────────────────────────────────────────
    // Single host:port for BOTH protocols.
    // Protocol selector: 0x22 (GPS-only, 28B) | 0x12 (GPS+LBS, 36B) | Both
    // "Both" sends 0x22 first then 0x12 on the same TCP connection each tick.
    auto* connOuter = new QVBoxLayout; connOuter->setSpacing(4);
    auto* connBar   = new QHBoxLayout; connBar->setSpacing(6);

    // Host
    m_hostEdit = new QLineEdit("www.fleetcop.com");
    m_hostEdit->setFixedWidth(160);
    m_hostEdit->setToolTip("GPS server hostname — same for both protocols");

    // Single port
    m_portSpin = new QSpinBox;
    m_portSpin->setRange(1, 65535);
    m_portSpin->setValue(6023);
    m_portSpin->setFixedWidth(72);
    m_portSpin->setToolTip("Port — same for both protocols");

    // Protocol selector  0x22 | 0x12 | Both
    m_protoCombo = new QComboBox;
    m_protoCombo->setFixedWidth(195);
    m_protoCombo->addItem("0x22  GPS-only  (28 bytes)",  QVariant(0x22));
    m_protoCombo->addItem("0x12  GPS + LBS (36 bytes)",  QVariant(0x12));
    m_protoCombo->addItem("Both  0x22 + 0x12  (dual)",   QVariant(0xFF));
    m_protoCombo->setToolTip( "0x22 — 28-byte GPS-only packet (no LBS cell data)"
        "0x12 — 36-byte GPS+LBS packet (includes MCC/MNC/LAC/CellID)"
        "Both — sends 0x22 then 0x12 on the same connection each tick");
    // Colour-code selection
    connect(m_protoCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, [this](int idx) {
        // Apply to all existing vehicles
        quint8 sel = quint8(m_protoCombo->itemData(idx).toInt());
        for (auto& v : m_vehicles) {
            v.gps_proto = sel;
            v.gps_port  = quint16(m_portSpin->value());
        }
        updateTable();
        const QString lbl = idx==0?"0x22 GPS-only":idx==1?"0x12 GPS+LBS":"Both 0x22+0x12";
        appendLog(QString("📡 Protocol → %1  port %2  (all vehicles)")
            .arg(lbl).arg(m_portSpin->value()), "#7C3AED");
    });
    // Keep port in sync with proto combo for vehicles
    connect(m_portSpin, QOverload<int>::of(&QSpinBox::valueChanged),
            this, [this](int port) {
        for (auto& v : m_vehicles) v.gps_port = quint16(port);
    });

    // Interval
    auto* lblInt    = new QLabel("Interval:");
    m_intervalSpin  = new QSpinBox;
    m_intervalSpin->setRange(1, 60); m_intervalSpin->setValue(5);
    m_intervalSpin->setSuffix(" s"); m_intervalSpin->setFixedWidth(70);

    // API
    auto* lblApi = new QLabel("API:");
    m_apiEdit    = new QLineEdit("http://127.0.0.1:8080");
    m_apiEdit->setFixedWidth(180);
    m_btnRefresh = new QPushButton("↺ Load Devices");
    m_btnRefresh->setStyleSheet(
        "background:#0EA5E9;color:#fff;border-radius:6px;padding:5px 10px;font-weight:600;");
    connect(m_btnRefresh, &QPushButton::clicked, this, [this]{ fetchDevicesFromAPI(); });

    // Start / Stop
    m_btnStart = new QPushButton("▶  Start All"); m_btnStart->setObjectName("btnStart");
    m_btnStop  = new QPushButton("⏹  Stop");      m_btnStop->setObjectName("btnStop");
    connect(m_btnStart, &QPushButton::clicked, this, &SimulatorWindow::onStartAll);
    connect(m_btnStop,  &QPushButton::clicked, this, &SimulatorWindow::onStopAll);

    // Protocol info label (updates when combo changes)
    auto* protoInfoLbl = new QLabel;
    protoInfoLbl->setStyleSheet("color:#64748B;font-size:10px;");
    auto updateProtoInfo = [protoInfoLbl, this]() {
        int idx = m_protoCombo ? m_protoCombo->currentIndex() : 0;
        if      (idx==0) protoInfoLbl->setText("28B · no LBS · degrees×1,800,000");
        else if (idx==1) protoInfoLbl->setText("36B · MCC/MNC/LAC/CellID · degrees×1,800,000");
        else             protoInfoLbl->setText("both packets sent each tick on same connection");
    };
    connect(m_protoCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, [updateProtoInfo](int){ updateProtoInfo(); });
    updateProtoInfo();

    // m_host12Edit / m_port12Spin kept as null (no longer separate)
    m_host12Edit = nullptr;
    m_port12Spin = nullptr;

    connBar->addWidget(new QLabel("Host:"));  connBar->addWidget(m_hostEdit);
    connBar->addWidget(new QLabel("Port:"));  connBar->addWidget(m_portSpin);
    connBar->addWidget(new QLabel("Proto:")); connBar->addWidget(m_protoCombo);
    connBar->addWidget(protoInfoLbl);
    connBar->addStretch();
    connBar->addWidget(m_btnStart);
    connBar->addWidget(m_btnStop);

    auto* apiBar = new QHBoxLayout; apiBar->setSpacing(6);
    apiBar->addWidget(lblInt); apiBar->addWidget(m_intervalSpin);
    apiBar->addWidget(lblApi); apiBar->addWidget(m_apiEdit);
    apiBar->addWidget(m_btnRefresh);
    apiBar->addStretch();

    connOuter->addLayout(connBar);
    connOuter->addLayout(apiBar);
    root->addLayout(connOuter);

    // ── Tabs ──────────────────────────────────────────────────
    m_tabs = new QTabWidget;
    buildMainTab();
    buildBulkTab();
    buildAlarmTab();
    buildVideoTab();
    root->addWidget(m_tabs, 1);

    setStatusBar(new QStatusBar);
}

// ═══════════════════════════════════════════════════════════════
// MAIN TAB — single device control + CSV replay
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::buildMainTab() {
    auto* w = new QWidget;
    auto* vl = new QVBoxLayout(w); vl->setContentsMargins(8,8,8,8); vl->setSpacing(6);

    // Toolbar
    auto* tbRow = new QHBoxLayout; tbRow->setSpacing(5);
    m_btnAdd    = new QPushButton("+ Add Device"); m_btnAdd->setObjectName("btnAdd");
    m_btnRemove = new QPushButton("− Remove");
    m_btnSelectAll = new QPushButton("☑ Select All");
    // "Send Selected Only" toggle — when ON, only highlighted rows send packets
    m_btnSendSelected = new QPushButton("📡 Send: All Devices");
    m_btnSendSelected->setCheckable(true);
    m_btnSendSelected->setChecked(false);
    m_btnSendSelected->setStyleSheet(
        "QPushButton{background:#0F172A;color:#94A3B8;border:1.5px solid #334155;"
        "border-radius:6px;padding:5px 11px;font-weight:700;font-size:12px;}"
        "QPushButton:checked{background:#1D4ED8;color:#fff;border-color:#2563EB;}"
        "QPushButton:hover{background:#1e293b;color:#e2e8f0;}");
    connect(m_btnSendSelected, &QPushButton::toggled, this, [this](bool on){
        m_btnSendSelected->setText(on ? "📡 Send: Selected Only" : "📡 Send: All Devices");
        appendLog(on ? "🎯 Mode: sending selected rows only"
                     : "📡 Mode: sending all devices", "#0EA5E9");
    });
    connect(m_btnAdd,       &QPushButton::clicked,this,&SimulatorWindow::onAddVehicle);
    connect(m_btnRemove,    &QPushButton::clicked,this,&SimulatorWindow::onRemoveVehicle);
    connect(m_btnSelectAll, &QPushButton::clicked,this,&SimulatorWindow::onSelectAll);
    m_protocolCombo = new QComboBox; m_protocolCombo->addItems({"GT06N","AIS140"});
    m_protocolCombo->setFixedWidth(110);
    tbRow->addWidget(m_btnAdd); tbRow->addWidget(m_btnRemove); tbRow->addWidget(m_btnSelectAll);
    tbRow->addWidget(m_btnSendSelected);
    tbRow->addWidget(new QLabel("Protocol:")); tbRow->addWidget(m_protocolCombo);
    tbRow->addStretch();

    // ── CSV Track Row ────────────────────────────────────────────────────
    // Row 1: Load + IMEI selection + status
    auto* csvRow = new QHBoxLayout; csvRow->setSpacing(5);
    m_btnLoadCSV = new QPushButton("📂 Load CSV Track");
    m_btnLoadCSV->setStyleSheet("background:#7C3AED;color:#fff;border-radius:6px;padding:5px 10px;font-weight:600;");
    m_csvImeiCombo = new QComboBox;
    m_csvImeiCombo->setFixedWidth(200); m_csvImeiCombo->setToolTip("Target IMEI for CSV track");
    auto* btnApply = new QPushButton("↗ Assign to Device");
    btnApply->setStyleSheet("background:#10B981;color:#fff;border-radius:6px;padding:5px 10px;font-weight:600;");
    m_csvStatusLabel = new QLabel("No CSV loaded");
    m_csvStatusLabel->setStyleSheet("color:#94A3B8;font-size:11px;");
    m_csvProgressLabel = new QLabel("");
    m_csvProgressLabel->setStyleSheet("color:#3B82F6;font-size:11px;font-weight:700;min-width:100px;");
    connect(m_btnLoadCSV, &QPushButton::clicked, this, &SimulatorWindow::onLoadCSV);
    connect(btnApply,     &QPushButton::clicked, this, &SimulatorWindow::onCsvAssignImei);
    csvRow->addWidget(m_btnLoadCSV);
    csvRow->addWidget(new QLabel("→ IMEI:"));
    csvRow->addWidget(m_csvImeiCombo);
    csvRow->addWidget(btnApply);
    csvRow->addWidget(m_csvStatusLabel);
    csvRow->addWidget(m_csvProgressLabel);
    csvRow->addStretch();

    // Row 2: Loop controls + interval
    auto* loopRow = new QHBoxLayout; loopRow->setSpacing(5);

    m_btnCsvLoop = new QPushButton("🔁 Loop: ON");
    m_btnCsvLoop->setCheckable(true);
    m_btnCsvLoop->setChecked(true);
    m_btnCsvLoop->setFixedWidth(110);
    m_btnCsvLoop->setStyleSheet(
        "QPushButton{background:#0F172A;color:#94A3B8;border:1.5px solid #334155;"
        "border-radius:6px;padding:4px 10px;font-weight:700;font-size:12px;}"
        "QPushButton:checked{background:#7C3AED;color:#fff;border-color:#6D28D9;}"
        "QPushButton:hover{background:#1e293b;color:#e2e8f0;}");
    connect(m_btnCsvLoop, &QPushButton::toggled, this, [this](bool on) {
        m_btnCsvLoop->setText(on ? "🔁 Loop: ON" : "🔁 Loop: OFF");
        // Apply loop flag to all vehicles with active CSV
        for (auto& v : m_vehicles)
            if (v.csvIdx >= 0) v.csvLoopOn = on;
        appendLog(on ? "🔁 CSV loop ENABLED — will repeat forever"
                     : "▶ CSV loop DISABLED — plays once then stops", "#7C3AED");
    });

    m_btnCsvStart = new QPushButton("▶ Start CSV");
    m_btnCsvStart->setStyleSheet(
        "background:#10B981;color:#fff;border-radius:6px;padding:4px 12px;font-weight:700;");
    connect(m_btnCsvStart, &QPushButton::clicked, this, [this]() {
        // Apply CSV to selected/all devices and start simulation
        if (m_csvTrack.isEmpty()) {
            appendLog("⚠️ Load a CSV file first", "#F59E0B"); return;
        }
        QString imei = m_csvImeiCombo ? m_csvImeiCombo->currentData().toString() : "";
        if (!imei.isEmpty()) {
            // Apply to specific IMEI
            for (auto& v : m_vehicles) {
                if (v.imei == imei) {
                    applyCsvToVehicle(v, m_csvTrack);
                    v.csvLoopOn = m_btnCsvLoop ? m_btnCsvLoop->isChecked() : true;
                    appendLog(QString("▶ CSV started → %1 [%2 pts, loop=%3]")
                        .arg(v.imei).arg(m_csvTrack.size())
                        .arg(v.csvLoopOn?"ON":"OFF"), "#10B981");
                    break;
                }
            }
        } else {
            // Apply to ALL vehicles
            for (auto& v : m_vehicles) {
                applyCsvToVehicle(v, m_csvTrack);
                v.csvLoopOn = m_btnCsvLoop ? m_btnCsvLoop->isChecked() : true;
            }
            appendLog(QString("▶ CSV started → all %1 devices [%2 pts, loop=%3]")
                .arg(m_vehicles.size()).arg(m_csvTrack.size())
                .arg((m_btnCsvLoop&&m_btnCsvLoop->isChecked())?"ON":"OFF"), "#10B981");
        }
        if (!m_running) onStartAll();
        updateTable();
    });

    m_btnCsvStop = new QPushButton("⏹ Stop CSV");
    m_btnCsvStop->setStyleSheet(
        "background:#EF4444;color:#fff;border-radius:6px;padding:4px 12px;font-weight:700;");
    connect(m_btnCsvStop, &QPushButton::clicked, this, [this]() {
        // Clear CSV from all vehicles
        for (auto& v : m_vehicles) {
            v.csvIdx   = -1;
            v.csvLoopOn = true;
            v.csvTrack.clear();
            v.speed    = 0;
            v.status   = "idle";
        }
        if (m_csvProgressLabel) m_csvProgressLabel->setText("");
        updateTable();
        appendLog("⏹ CSV stopped on all devices", "#EF4444");
    });

    auto* lblInterval = new QLabel("Interval:");
    m_csvIntervalSpin = new QSpinBox;
    m_csvIntervalSpin->setRange(1, 60);
    m_csvIntervalSpin->setValue(m_intervalSpin ? m_intervalSpin->value() : 5);
    m_csvIntervalSpin->setSuffix(" s/pt");
    m_csvIntervalSpin->setFixedWidth(80);
    m_csvIntervalSpin->setToolTip("How many seconds between each CSV point being sent");

    auto* lblLoopInfo = new QLabel("← One point sent per tick interval");
    lblLoopInfo->setStyleSheet("color:#64748B;font-size:11px;");

    loopRow->addWidget(m_btnCsvLoop);
    loopRow->addWidget(m_btnCsvStart);
    loopRow->addWidget(m_btnCsvStop);
    loopRow->addWidget(new QWidget); // spacer
    loopRow->addWidget(lblInterval);
    loopRow->addWidget(m_csvIntervalSpin);
    loopRow->addWidget(lblLoopInfo);
    loopRow->addStretch();

    vl->addLayout(tbRow);
    vl->addLayout(csvRow);
    vl->addLayout(loopRow);

    // ── Debug / Sample Location Buttons ─────────────────────────────────
    // Hard-coded world landmarks — click to instantly send a one-shot packet
    // to the server so you can verify lat/lon decoding in any region.
    auto* dbgBox = new QGroupBox("🌍 Debug Locations — one-click world landmarks");
    dbgBox->setStyleSheet(
        "QGroupBox{font-size:11px;font-weight:700;color:#64748B;"
        "border:1px solid #334155;border-radius:6px;margin-top:6px;padding:4px 6px;}"
        "QGroupBox::title{subcontrol-origin:margin;left:8px;}");
    auto* dbgRow = new QHBoxLayout(dbgBox);
    dbgRow->setSpacing(4); dbgRow->setContentsMargins(4,2,4,2);

    struct DebugLoc { const char* label; double lat; double lon; const char* color; };
    static const DebugLoc DEBUG_LOCS[] = {
        { "📍 Bengaluru",         13.17079,  77.56438,  "#7C3AED" },  // Karnataka, India
        { "🇦🇪 Dubai",           25.20484,  55.27078,  "#F59E0B" },  // Burj Khalifa
        { "🇬🇧 London",         51.50074,  -0.12462,  "#3B82F6" },  // Big Ben
        { "🇨🇦 Toronto",        43.65107, -79.34727,  "#10B981" },  // CN Tower area
        { "🇺🇸 New York",       40.71280, -74.00597,  "#EF4444" },  // Lower Manhattan
        { "🇸🇬 Singapore",       1.35209, 103.81984,  "#06B6D4" },  // CBD
        { "🇦🇺 Sydney",        -33.86785, 151.20732,  "#8B5CF6" },  // Opera House
    };

    for (const auto& loc : DEBUG_LOCS) {
        auto* btn = new QPushButton(QString::fromUtf8(loc.label));
        btn->setStyleSheet(QString(
            "QPushButton{background:%1;color:#fff;border-radius:5px;"
            "padding:3px 8px;font-size:11px;font-weight:700;}"
            "QPushButton:hover{opacity:0.85;}").arg(loc.color));
        double capLat = loc.lat, capLon = loc.lon;

        btn->setToolTip(QString("Send one location packet: lat=%1 lon=%2")
                        .arg(capLat, 0, 'f', 5).arg(capLon, 0, 'f', 5));

        connect(btn, &QPushButton::clicked, this, [this, capLat, capLon, loc]() {
            // Send a single location packet to ALL connected GT06N devices
            // with coordinates overridden to this debug point
            int sent = 0;
            for (const auto& v : m_vehicles) {
                // connKey = "imei:proto" — use per-vehicle protocol
                const QString ck = v.imei + ":" + QString::number(v.gps_proto, 16);
                GT06NConn* c = m_gt06nConns.value(ck, nullptr);
                if (!c || !c->socket ||
                    c->socket->state() != QAbstractSocket::ConnectedState ||
                    !c->loggedIn) continue;
                VehicleState dbgV = v;
                dbgV.lat = capLat;
                dbgV.lon = capLon;
                dbgV.speed = 0;
                dbgV.heading = 0;
                dbgV.satellites = 10;
                // Use the correct protocol for this connection
                QByteArray pkt = (c->proto == 0x22)
                    ? buildGT06NLocation22(dbgV, c->sn++)
                    : buildGT06NLocation(dbgV, "", c->sn++);
                c->socket->write(pkt);
                sent++;
            }
            const QString ts = QDateTime::currentDateTime().toString("hh:mm:ss");
            appendLog(QString("[%1] 🌍 Debug: lat=%2 lon=%3 → %4 device(s) — check server map")
                .arg(ts)
                .arg(capLat, 0, 'f', 5)
                .arg(capLon, 0, 'f', 5)
                .arg(sent), "#F59E0B");
            if (sent == 0)
                appendLog("⚠️ No connected devices — start simulation first", "#EF4444");
        });
        dbgRow->addWidget(btn);
    }
    dbgRow->addStretch();
    vl->addWidget(dbgBox);

    // Splitter: table + right panel
    auto* split = new QSplitter(Qt::Horizontal);

    // Vehicle table
    auto* tblGrp = new QGroupBox("Vehicles  [Double-click = toggle engine  |  Select rows + '📡 Send: Selected Only' = send subset]");
    auto* tblVl  = new QVBoxLayout(tblGrp);
    m_table = new QTableWidget(0,10);
    m_table->setHorizontalHeaderLabels({"✓","Name / IMEI","Protocol","Status","Speed","Lat","Lon","Odo","Hours","Pkts"});
    m_table->horizontalHeader()->setSectionResizeMode(1,QHeaderView::Stretch);
    m_table->horizontalHeader()->setSectionResizeMode(0,QHeaderView::Fixed);
    m_table->setColumnWidth(0,30);
    m_table->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_table->setSelectionMode(QAbstractItemView::ExtendedSelection);  // REQ-20
    m_table->setEditTriggers(QAbstractItemView::NoEditTriggers);
    m_table->setAlternatingRowColors(true);
    m_table->verticalHeader()->setVisible(false);
    connect(m_table,&QTableWidget::cellClicked,[this](int r,int){m_selectedRow=r;updateSelectedVehicle();});
    connect(m_table,&QTableWidget::cellDoubleClicked,[this](int r,int){
        if(r<(int)m_vehicles.size()){
            m_vehicles[r].engineOn=!m_vehicles[r].engineOn;
            appendLog(QString("[%1] Engine %2: %3")
                .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
                .arg(m_vehicles[r].engineOn?"ON":"OFF")
                .arg(m_vehicles[r].imei),
                m_vehicles[r].engineOn?"#10B981":"#EF4444");
            updateTable();
        }
    });
    connect(m_table,&QTableWidget::itemSelectionChanged,[this](){
        for(int i=0;i<(int)m_vehicles.size();i++)
            m_vehicles[i].selected=m_table->item(i,0)&&m_table->item(i,0)->isSelected();
    });
    tblVl->addWidget(m_table);
    split->addWidget(tblGrp);

    // Right control panel
    auto* rightW = new QWidget; rightW->setFixedWidth(270);
    auto* rightVl = new QVBoxLayout(rightW); rightVl->setContentsMargins(0,0,0,0); rightVl->setSpacing(8);

    auto* selGrp = new QGroupBox("Selected Vehicle");
    auto* selVl  = new QFormLayout(selGrp);
    m_selIMEI   = new QLabel("—"); m_selIMEI->setTextInteractionFlags(Qt::TextSelectableByMouse);
    m_selPos    = new QLabel("—");
    m_selSpeed  = new QLabel("—");
    m_selStatus = new QLabel("—");
    selVl->addRow("IMEI:",   m_selIMEI);
    selVl->addRow("Pos:",    m_selPos);
    selVl->addRow("Speed:",  m_selSpeed);
    selVl->addRow("Status:", m_selStatus);

    auto* spdGrp = new QGroupBox("Speed Override");
    auto* spdVl  = new QVBoxLayout(spdGrp);
    m_speedSlider = new QSlider(Qt::Horizontal);
    m_speedSlider->setRange(0,140); m_speedSlider->setValue(0);
    auto* spdLbl = new QLabel("0 km/h");
    connect(m_speedSlider,&QSlider::valueChanged,[spdLbl](int v){ spdLbl->setText(QString::number(v)+" km/h"); });
    connect(m_speedSlider,&QSlider::sliderReleased,this,[this](){ onSpeedChanged(m_speedSlider->value()); });
    spdVl->addWidget(m_speedSlider); spdVl->addWidget(spdLbl);

    auto* almGrp = new QGroupBox("Quick Alarms");
    auto* almVl  = new QVBoxLayout(almGrp);
    auto* btnPanic = new QPushButton("🚨 Send Panic");
    btnPanic->setStyleSheet("background:#EF4444;color:#fff;border-radius:6px;padding:6px;font-weight:700;");
    auto* btnOvs   = new QPushButton("⚡ Send Overspeed");
    btnOvs->setStyleSheet("background:#F59E0B;color:#fff;border-radius:6px;padding:6px;font-weight:700;");
    m_chkPanic     = new QCheckBox("Persist panic"); m_chkPanic->setStyleSheet("font-size:11px;");
    m_chkOverspeed = new QCheckBox("Persist overspeed"); m_chkOverspeed->setStyleSheet("font-size:11px;");
    connect(btnPanic,&QPushButton::clicked,this,&SimulatorWindow::onSendPanic);
    connect(btnOvs,  &QPushButton::clicked,this,&SimulatorWindow::onSendOverspeed);
    almVl->addWidget(btnPanic); almVl->addWidget(m_chkPanic);
    almVl->addWidget(btnOvs);   almVl->addWidget(m_chkOverspeed);

    rightVl->addWidget(selGrp);
    rightVl->addWidget(spdGrp);
    rightVl->addWidget(almGrp);
    rightVl->addStretch();
    split->addWidget(rightW);
    split->setSizes({900,270});
    vl->addWidget(split,2);

    // Log
    auto* logGrp = new QGroupBox("Live Packet Log");
    auto* logVl  = new QVBoxLayout(logGrp); logGrp->setMaximumHeight(170);
    m_log = new QTextEdit; m_log->setReadOnly(true);
    auto* btnClr = new QPushButton("Clear");
    connect(btnClr,&QPushButton::clicked,m_log,&QTextEdit::clear);
    auto* logCtrl = new QHBoxLayout; logCtrl->addStretch(); logCtrl->addWidget(btnClr);
    logVl->addWidget(m_log); logVl->addLayout(logCtrl);
    vl->addWidget(logGrp,0);

    m_tabs->addTab(w,"🚗  Main");
}

// ═══════════════════════════════════════════════════════════════
// BULK TAB — 1000+ concurrent devices
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::buildBulkTab() {
    auto* w  = new QWidget;
    auto* vl = new QVBoxLayout(w); vl->setContentsMargins(10,10,10,10); vl->setSpacing(8);

    // Info label
    auto* info = new QLabel(
        "📡  <b>Bulk Mode</b> — generate or load 1000+ devices, each with optional CSV track. "
        "Sends in concurrent batches so server handles all simultaneously.");
    info->setWordWrap(true);
    info->setStyleSheet("background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px;color:#1D4ED8;font-size:12px;");
    vl->addWidget(info);

    // Stat row
    auto* statRow = new QHBoxLayout; statRow->setSpacing(8);
    auto mkBStat = [&](const QString& lbl, QLabel** out){
        auto* gb = new QGroupBox; gb->setMaximumHeight(70);
        auto* bl = new QVBoxLayout(gb); bl->setContentsMargins(10,4,10,4); bl->setSpacing(1);
        auto* t = new QLabel(lbl); t->setStyleSheet("font-size:10px;color:#64748B;font-weight:700;");
        auto* v = new QLabel("0");  v->setStyleSheet("font-size:18px;font-weight:800;color:#0F172A;");
        bl->addWidget(t); bl->addWidget(v); statRow->addWidget(gb); *out=v;
    };
    mkBStat("Total Devices",&m_lbBulkTotal);
    mkBStat("Packets Sent",&m_lbBulkSent);
    QLabel* lbDummy1=nullptr,*lbDummy2=nullptr;
    mkBStat("Running",&lbDummy1); mkBStat("Failed",&lbDummy2);
    (void)lbDummy1;(void)lbDummy2;
    vl->addLayout(statRow);

    // Progress bar
    m_bulkProgress = new QProgressBar; m_bulkProgress->setRange(0,100); m_bulkProgress->setValue(0);
    m_bulkProgress->setFormat("Ready"); m_bulkProgress->setFixedHeight(22);
    vl->addWidget(m_bulkProgress);

    // Controls grid
    auto* grid = new QGridLayout; grid->setSpacing(8);

    // Row 0: Generate
    auto* lblGen = new QLabel("Generate random devices:");
    m_genCountSpin = new QSpinBox; m_genCountSpin->setRange(1,5000); m_genCountSpin->setValue(1000); m_genCountSpin->setSuffix(" devices");
    auto* btnGen = new QPushButton("🎲 Generate");
    btnGen->setStyleSheet("background:#8B5CF6;color:#fff;border-radius:6px;padding:6px 12px;font-weight:700;");
    connect(btnGen,&QPushButton::clicked,this,&SimulatorWindow::onGenerateDevices);
    grid->addWidget(lblGen,0,0); grid->addWidget(m_genCountSpin,0,1); grid->addWidget(btnGen,0,2);

    // Row 1: Load CSV
    auto* lblLoadCSV = new QLabel("Load devices from CSV:");
    auto* btnLoadDevCSV = new QPushButton("📂 Load devices.csv");
    btnLoadDevCSV->setStyleSheet("background:#0EA5E9;color:#fff;border-radius:6px;padding:6px 12px;font-weight:700;");
    connect(btnLoadDevCSV,&QPushButton::clicked,this,&SimulatorWindow::onLoadDevicesCSV);
    auto* lblCSVFmt = new QLabel("<small>Format: imei,name,lat,lng,protocol</small>");
    grid->addWidget(lblLoadCSV,1,0); grid->addWidget(btnLoadDevCSV,1,1); grid->addWidget(lblCSVFmt,1,2);

    // Row 2: Bulk assign CSV folder
    auto* lblBulkCSV = new QLabel("Bulk assign GPS tracks:");
    auto* btnBulkCSV = new QPushButton("📁 Assign CSV Folder");
    btnBulkCSV->setStyleSheet("background:#7C3AED;color:#fff;border-radius:6px;padding:6px 12px;font-weight:700;");
    connect(btnBulkCSV,&QPushButton::clicked,this,&SimulatorWindow::onBulkAssignCSV);
    auto* lblFolderFmt = new QLabel("<small>Folder of IMEI.csv files → each assigned to matching device</small>");
    grid->addWidget(lblBulkCSV,2,0); grid->addWidget(btnBulkCSV,2,1); grid->addWidget(lblFolderFmt,2,2);

    // Row 3: Batch size
    auto* lblBatch = new QLabel("Batch size (concurrent):");
    m_batchSizeSpin = new QSpinBox; m_batchSizeSpin->setRange(1,500); m_batchSizeSpin->setValue(50);
    m_batchSizeSpin->setSuffix(" per batch"); m_batchSizeSpin->setToolTip("TCP connections opened simultaneously per tick");
    auto* btnClear = new QPushButton("🗑 Clear All Devices");
    btnClear->setStyleSheet("background:#EF4444;color:#fff;border-radius:6px;padding:6px 12px;font-weight:700;");
    connect(btnClear,&QPushButton::clicked,this,&SimulatorWindow::onClearAllDevices);
    grid->addWidget(lblBatch,3,0); grid->addWidget(m_batchSizeSpin,3,1); grid->addWidget(btnClear,3,2);

    vl->addLayout(grid);

    // Bulk log
    auto* bulkLogGrp = new QGroupBox("Bulk Operation Log");
    auto* blVl = new QVBoxLayout(bulkLogGrp);
    m_bulkLog = new QTextEdit; m_bulkLog->setReadOnly(true);
    auto* btnBlClr = new QPushButton("Clear"); btnBlClr->setMaximumWidth(60);
    connect(btnBlClr,&QPushButton::clicked,m_bulkLog,&QTextEdit::clear);
    auto* blCtrl = new QHBoxLayout; blCtrl->addStretch(); blCtrl->addWidget(btnBlClr);
    blVl->addWidget(m_bulkLog); blVl->addLayout(blCtrl);
    vl->addWidget(bulkLogGrp,1);

    m_tabs->addTab(w,"📡  Bulk 1000+");
}

// ═══════════════════════════════════════════════════════════════
// ALARM TAB — broadcast to all / selected / filter
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::buildAlarmTab() {
    auto* w  = new QWidget;
    auto* vl = new QVBoxLayout(w); vl->setContentsMargins(14,14,14,14); vl->setSpacing(10);

    auto* info = new QLabel("🔔  Broadcast alarm events to <b>all</b> devices or a filtered subset simultaneously on next tick.");
    info->setWordWrap(true);
    info->setStyleSheet("background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:10px;color:#92400E;font-size:12px;");
    vl->addWidget(info);

    // Target selector
    auto* tgtRow = new QHBoxLayout;
    tgtRow->addWidget(new QLabel("Target:"));
    m_alarmTargetCombo = new QComboBox;
    m_alarmTargetCombo->addItems({"All Devices","Selected Rows (Main Tab)","IMEI Filter"});
    m_alarmImeiFilter = new QLineEdit; m_alarmImeiFilter->setPlaceholderText("IMEI prefix or comma-separated list...");
    m_alarmImeiFilter->setEnabled(false);
    connect(m_alarmTargetCombo,QOverload<int>::of(&QComboBox::currentIndexChanged),[this](int i){
        m_alarmImeiFilter->setEnabled(i==2);
    });
    tgtRow->addWidget(m_alarmTargetCombo); tgtRow->addWidget(m_alarmImeiFilter,1);
    vl->addLayout(tgtRow);

    // Alarm buttons
    auto mkAlm = [&](const QString& lbl, const QString& color, auto fn){
        auto* btn = new QPushButton(lbl);
        btn->setStyleSheet(QString("background:%1;color:#fff;border-radius:8px;padding:12px 20px;font-size:14px;font-weight:700;").arg(color));
        btn->setFixedHeight(48);
        connect(btn,&QPushButton::clicked,this,fn);
        return btn;
    };

    auto* grid = new QGridLayout; grid->setSpacing(10);
    grid->addWidget(mkAlm("🚨  Panic / SOS",         "#DC2626",&SimulatorWindow::onSendPanic),         0,0);
    grid->addWidget(mkAlm("⚡  Overspeed",            "#D97706",&SimulatorWindow::onSendOverspeed),      0,1);
    grid->addWidget(mkAlm("🔲  Geofence Entry",       "#7C3AED",&SimulatorWindow::onBroadcastGeofence), 1,0);
    grid->addWidget(mkAlm("📤  Custom Alarm →",       "#0EA5E9",&SimulatorWindow::onBroadcastCustomAlarm),1,1);
    vl->addLayout(grid);

    // Custom alarm
    auto* custRow = new QHBoxLayout;
    custRow->addWidget(new QLabel("Custom alarm type:"));
    m_customAlarmEdit = new QLineEdit("tow_away"); m_customAlarmEdit->setFixedWidth(180);
    auto* btnCust = new QPushButton("📣 Send Custom");
    btnCust->setStyleSheet("background:#6366F1;color:#fff;border-radius:6px;padding:6px 14px;font-weight:700;");
    connect(btnCust,&QPushButton::clicked,this,&SimulatorWindow::onBroadcastCustomAlarm);
    custRow->addWidget(m_customAlarmEdit); custRow->addWidget(btnCust); custRow->addStretch();
    vl->addLayout(custRow);

    // Engine cut section
    auto* cutGrp = new QGroupBox("Engine Cut / Restore  (REQ-21)");
    auto* cutVl  = new QVBoxLayout(cutGrp);
    auto* cutInfo = new QLabel("Engine cut commands are received from the web panel via polling.\n"
                               "Use the web panel → Live Map → vehicle popup → Cut Engine.");
    cutInfo->setStyleSheet("color:#64748B;font-size:11.5px;");
    cutInfo->setWordWrap(true);
    auto* cutRow = new QHBoxLayout;
    auto* cutImei = new QLineEdit; cutImei->setPlaceholderText("IMEI to cut/restore locally...");
    auto* btnCut = new QPushButton("✂️ Cut");
    btnCut->setStyleSheet("background:#EF4444;color:#fff;border-radius:6px;padding:5px 12px;font-weight:700;");
    auto* btnRestore = new QPushButton("✅ Restore");
    btnRestore->setStyleSheet("background:#10B981;color:#fff;border-radius:6px;padding:5px 12px;font-weight:700;");
    connect(btnCut,&QPushButton::clicked,[this,cutImei](){
        auto it=std::find_if(m_vehicles.begin(),m_vehicles.end(),[&](const VehicleState& v){return v.imei==cutImei->text();});
        if(it!=m_vehicles.end()){ it->immobilised=true; it->engineOn=false; it->speed=0;
            appendLog("✂️ Engine cut locally: "+cutImei->text(),"#EF4444"); updateTable(); }
    });
    connect(btnRestore,&QPushButton::clicked,[this,cutImei](){
        auto it=std::find_if(m_vehicles.begin(),m_vehicles.end(),[&](const VehicleState& v){return v.imei==cutImei->text();});
        if(it!=m_vehicles.end()){ it->immobilised=false; it->engineOn=true;
            appendLog("✅ Engine restored locally: "+cutImei->text(),"#10B981"); updateTable(); }
    });
    cutRow->addWidget(cutImei,1); cutRow->addWidget(btnCut); cutRow->addWidget(btnRestore);
    cutVl->addWidget(cutInfo); cutVl->addLayout(cutRow);
    vl->addWidget(cutGrp);

    vl->addStretch();
    m_tabs->addTab(w,"🔔  Alarms");
}

// ═══════════════════════════════════════════════════════════════
// VIDEO TAB — future RTSP/WebRTC simulation placeholder
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::buildVideoTab() {
    auto* w  = new QWidget;
    auto* vl = new QVBoxLayout(w); vl->setContentsMargins(14,14,14,14); vl->setSpacing(10);

    m_videoPlaceholder = new QLabel(
        "🎥  <b>Video Simulation — Coming Soon</b>\n\n"
        "This tab will simulate live RTSP / WebRTC video streams per device.\n\n"
        "Planned features:\n"
        "  • Assign an RTSP stream URL per device IMEI\n"
        "  • Relay or loop a test video file as a live stream\n"
        "  • Simulate dashcam + 4-channel DVR feeds\n"
        "  • Send stream metadata (FPS, resolution, bitrate) alongside GPS\n"
        "  • Test web panel video player integration\n\n"
        "Architecture:\n"
        "  • Qt Multimedia + GStreamer pipeline per device\n"
        "  • RTSP server embedded (Live555 or mediamtx)\n"
        "  • JSON packet extended with stream_url field"
    );
    m_videoPlaceholder->setWordWrap(true);
    m_videoPlaceholder->setAlignment(Qt::AlignTop|Qt::AlignLeft);
    m_videoPlaceholder->setStyleSheet(
        "background:#F8FAFC;border:2px dashed #CBD5E1;border-radius:12px;"
        "padding:24px;color:#475569;font-size:13px;line-height:1.6;");

    // Config area (disabled for now)
    auto* cfgGrp = new QGroupBox("Video Stream Config (disabled — future sprint)");
    cfgGrp->setEnabled(false);
    auto* cfgVl = new QFormLayout(cfgGrp);
    m_videoDeviceCombo = new QComboBox; m_videoDeviceCombo->setPlaceholderText("Select device IMEI...");
    m_videoUrlEdit = new QLineEdit; m_videoUrlEdit->setPlaceholderText("rtsp://192.168.1.100:8554/stream1");
    cfgVl->addRow("Device:", m_videoDeviceCombo);
    cfgVl->addRow("Stream URL:", m_videoUrlEdit);

    vl->addWidget(m_videoPlaceholder,1);
    vl->addWidget(cfgGrp);
    m_tabs->addTab(w,"🎥  Video");
}

void SimulatorWindow::buildTrayIcon() {
    m_tray = new QSystemTrayIcon(this);
    m_tray->setToolTip("Fleet OS Simulator");
    auto* menu = new QMenu;
    menu->addAction("Show",this,[this]{show();raise();activateWindow();});
    menu->addSeparator();
    menu->addAction("Quit",qApp,&QApplication::quit);
    m_tray->setContextMenu(menu);
    connect(m_tray,&QSystemTrayIcon::activated,this,&SimulatorWindow::onTrayActivated);
    m_tray->show();
}

// ═══════════════════════════════════════════════════════════════
// START / STOP
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::onStartAll() {
    if(m_running) return;
    m_running = true;
    if(!m_timer){ m_timer=new QTimer(this); connect(m_timer,&QTimer::timeout,this,&SimulatorWindow::onTick); }
    m_timer->start(m_intervalSpin->value()*1000);
    m_btnStart->setEnabled(false); m_btnStop->setEnabled(true);
    const int n=(int)m_vehicles.size();
    appendLog(QString("▶ Started: %1 devices → %2:%3").arg(n).arg(m_hostEdit->text()).arg(m_portSpin->value()),"#10B981");
    appendBulkLog(QString("▶ Simulation started: %1 devices").arg(n),"#10B981");
    statusBar()->showMessage(QString("  ● RUNNING | %1 devices → %2:%3").arg(n).arg(m_hostEdit->text()).arg(m_portSpin->value()));
}

void SimulatorWindow::onStopAll() {
    if(!m_running) return;
    m_running=false;
    if(m_timer){m_timer->stop();}
    closeAllGT06N();
    m_btnStart->setEnabled(true); m_btnStop->setEnabled(false);
    appendLog("⏹ Simulation stopped — all GT06N connections closed","#EF4444");
    statusBar()->showMessage("  ⏹ STOPPED");
}

// ═══════════════════════════════════════════════════════════════
// MAIN TICK — distributes load across devices
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::onTick() {
    if(!m_running||m_vehicles.empty()) return;

    const int  batchSize    = m_batchSizeSpin ? m_batchSizeSpin->value() : 50;
    const bool selectedOnly = m_btnSendSelected && m_btnSendSelected->isChecked();
    QString alarm = m_broadcastAlarm;
    m_broadcastAlarm.clear();

    for(int start=0;start<(int)m_vehicles.size();start+=batchSize) {
        int end = qMin(start+batchSize,(int)m_vehicles.size());
        for(int i=start;i<end;i++) {
            auto& v=m_vehicles[i];
            // If "Send Selected Only" is ON, skip unselected rows
            if(selectedOnly && !v.selected) continue;
            // Allow CSV replay regardless of engineOn (CSV controls ignition row-by-row)
            if(!v.engineOn && !v.immobilised && v.csvIdx<0) continue;
            moveVehicle(v);
            QString thisAlarm = alarm;
            if(v.panicActive)     thisAlarm="panic";
            if(v.overspeedActive) thisAlarm="overspeed";
            sendPacket(v, thisAlarm);
            v.packetsSent++;
            m_totalPackets++;
        }
        if(m_bulkProgress && m_vehicles.size()>50) {
            int pct = (start*100)/(int)m_vehicles.size();
            m_bulkProgress->setValue(pct);
            m_bulkProgress->setFormat(QString("%1 / %2 sent").arg(start).arg(m_vehicles.size()));
        }
    }
    if(m_bulkProgress && m_vehicles.size()>50) {
        m_bulkProgress->setValue(100);
        m_bulkProgress->setFormat(QString("Tick complete — %1 devices").arg(m_vehicles.size()));
    }

    if(m_selectedRow>=0) updateSelectedVehicle();
}

// ═══════════════════════════════════════════════════════════════
// MOVEMENT
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::moveVehicle(VehicleState& v) {
    if(v.immobilised){v.speed=0;v.engineOn=false;return;}

    // CSV replay mode
    if(v.csvIdx>=0 && !v.csvTrack.isEmpty()) {
        if(v.csvIdx>=v.csvTrack.size()){
            if(v.csvLoopOn) v.csvIdx=0;   // loop if toggle is ON
            else { v.csvIdx=-1; v.speed=0; v.status="idle"; return; }
        }
        const CsvPoint& pt=v.csvTrack[v.csvIdx];
        v.lat=pt.lat; v.lon=pt.lon; v.speed=pt.speed; v.heading=pt.heading;
        // Don't permanently set engineOn from CSV — would block next tick.
        // engineOn stays true during replay; ignition is encoded in HB packet.
        v.engineOn = true;   // keep vehicle alive for tick
        v.gpsFixed = (pt.lat != 0.0 || pt.lon != 0.0);
        if(!pt.alarm.isEmpty()) v.status="alarm";
        else v.status=v.speed>2?v.speed>85?"alarm":"online":"idle";
        v.odometer+=(v.speed*(m_intervalSpin->value()))/3600.0;
        v.engineHours+=(m_intervalSpin->value())/3600.0;
        m_totalKm+=(v.speed*(m_intervalSpin->value()))/3600.0;
        v.csvIdx++;
        return;
    }

    // Random walk
    double tgtSpd=30+QRandomGenerator::global()->generateDouble()*70;
    v.speed+=(tgtSpd-v.speed)*0.15+(QRandomGenerator::global()->generateDouble()-0.5)*8;
    v.speed=qMax(0.0,qMin(120.0,v.speed));
    double dlat=v.targetLat-v.lat, dlon=v.targetLon-v.lon;
    double dist=qSqrt(dlat*dlat+dlon*dlon);
    if(dist<0.003){
        v.targetLat=v.lat+(QRandomGenerator::global()->generateDouble()-0.5)*0.15;
        v.targetLon=v.lon+(QRandomGenerator::global()->generateDouble()-0.5)*0.15;
    }
    double step=(v.speed/3600.0)*(m_intervalSpin->value()/111000.0);
    v.lat+=(dlat/qMax(dist,0.0001))*step;
    v.lon+=(dlon/qMax(dist,0.0001))*step;
    v.heading=qAtan2(dlon,dlat)*180.0/M_PI;
    v.odometer+=(v.speed*m_intervalSpin->value())/3600.0;
    v.engineHours+=(m_intervalSpin->value())/3600.0;
    m_totalKm+=(v.speed*m_intervalSpin->value())/3600.0;
    v.status=v.speed>85?"alarm":v.speed>2?"online":"idle";
}

// ═══════════════════════════════════════════════════════════════
// PACKET SEND — routes by protocol
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::sendPacket(const VehicleState& v, const QString& alarm) {
    if (v.protocol == "GT06N") {
        sendGT06N(const_cast<VehicleState&>(v), alarm);
        return;
    }

    // AIS140 — text, one new TCP connection per packet
    if (v.protocol == "AIS140") {
        QString pkt = buildAIS140Packet(v);
        QTcpSocket sock;
        sock.connectToHost(m_hostEdit->text(), m_portSpin->value());
        if (sock.waitForConnected(300)) {
            sock.write(pkt.toUtf8());
            sock.waitForBytesWritten(300);
            sock.disconnectFromHost();
            if (m_vehicles.size() <= 20) {
                QString col = v.status=="alarm"?"#DC2626":v.status=="idle"?"#D97706":"#10B981";
                appendLog(QString("[%1] %2 AIS140 | %3km/h | %4,%5 | %6")
                    .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
                    .arg(v.imei)
                    .arg(v.speed,0,'f',0)
                    .arg(v.lat,0,'f',5).arg(v.lon,0,'f',5)
                    .arg(alarm.isEmpty() ? v.status : alarm.toUpper()), col);
            }
        } else {
            m_totalFailed++;
            if (m_vehicles.size() <= 20)
                appendLog(QString("[%1] %2 AIS140 ✗ CONN FAIL")
                    .arg(QDateTime::currentDateTime().toString("hh:mm:ss")).arg(v.imei), "#F97316");
        }
        return;
    }

    // Unknown protocol — default to GT06N binary
    sendGT06N(const_cast<VehicleState&>(v), alarm);
}

// ═══════════════════════════════════════════════════════════════
// GT06N — PERSISTENT TCP + BINARY PROTOCOL
// ═══════════════════════════════════════════════════════════════

// CRC-16/ITU (x.25) — same polynomial used by GT06 devices
// ═══════════════════════════════════════════════════════════════════════
// GT06 PROTOCOL IMPLEMENTATION — strictly per Concox GT06 spec v1.8
//
// Packet types implemented:
//   0x01  Login        (IMEI → server, expects ACK)
//   0x12  Location     (GPS+LBS combined, 36 bytes)
//   0x13  Heartbeat    (status info, 15 bytes)
//   0x15  String reply (terminal→server response to 0x80 command)
//
// CRC: CRC-ITU lookup-table algorithm per Appendix A of spec
// All lengths, offsets and bit fields verified against spec examples.
// ═══════════════════════════════════════════════════════════════════════

// ── CRC-ITU lookup table (Appendix A of spec) ────────────────────────
static const quint16 GT06_CRC_TABLE[256] = {
    0x0000,0x1189,0x2312,0x329B,0x4624,0x57AD,0x6536,0x74BF,
    0x8C48,0x9DC1,0xAF5A,0xBED3,0xCA6C,0xDBE5,0xE97E,0xF8F7,
    0x1081,0x0108,0x3393,0x221A,0x56A5,0x472C,0x75B7,0x643E,
    0x9CC9,0x8D40,0xBFDB,0xAE52,0xDAED,0xCB64,0xF9FF,0xE876,
    0x2102,0x308B,0x0210,0x1399,0x6726,0x76AF,0x4434,0x55BD,
    0xAD4A,0xBCC3,0x8E58,0x9FD1,0xEB6E,0xFAE7,0xC87C,0xD9F5,
    0x3183,0x200A,0x1291,0x0318,0x77A7,0x662E,0x54B5,0x453C,
    0xBDCB,0xAC42,0x9ED9,0x8F50,0xFBEF,0xEA66,0xD8FD,0xC974,
    0x4204,0x538D,0x6116,0x709F,0x0420,0x15A9,0x2732,0x36BB,
    0xCE4C,0xDFC5,0xED5E,0xFCD7,0x8868,0x99E1,0xAB7A,0xBAF3,
    0x5285,0x430C,0x7197,0x601E,0x14A1,0x0528,0x37B3,0x263A,
    0xDECD,0xCF44,0xFDDF,0xEC56,0x98E9,0x8960,0xBBFB,0xAA72,
    0x6306,0x728F,0x4014,0x519D,0x2522,0x34AB,0x0630,0x17B9,
    0xEF4E,0xFEC7,0xCC5C,0xDDD5,0xA96A,0xB8E3,0x8A78,0x9BF1,
    0x7387,0x620E,0x5095,0x411C,0x35A3,0x242A,0x16B1,0x0738,
    0xFFCF,0xEE46,0xDCDD,0xCD54,0xB9EB,0xA862,0x9AF9,0x8B70,
    0x8408,0x9581,0xA71A,0xB693,0xC22C,0xD3A5,0xE13E,0xF0B7,
    0x0840,0x19C9,0x2B52,0x3ADB,0x4E64,0x5FED,0x6D76,0x7CFF,
    0x9489,0x8500,0xB79B,0xA612,0xD2AD,0xC324,0xF1BF,0xE036,
    0x18C1,0x0948,0x3BD3,0x2A5A,0x5EE5,0x4F6C,0x7DF7,0x6C7E,
    0xA50A,0xB483,0x8618,0x9791,0xE32E,0xF2A7,0xC03C,0xD1B5,
    0x2942,0x38CB,0x0A50,0x1BD9,0x6F66,0x7EEF,0x4C74,0x5DFD,
    0xB58B,0xA402,0x9699,0x8710,0xF3AF,0xE226,0xD0BD,0xC134,
    0x39C3,0x284A,0x1AD1,0x0B58,0x7FE7,0x6E6E,0x5CF5,0x4D7C,
    0xC60C,0xD785,0xE51E,0xF497,0x8028,0x91A1,0xA33A,0xB2B3,
    0x4A44,0x5BCD,0x6956,0x78DF,0x0C60,0x1DE9,0x2F72,0x3EFB,
    0xD68D,0xC704,0xF59F,0xE416,0x90A9,0x8120,0xB3BB,0xA232,
    0x5AC5,0x4B4C,0x79D7,0x685E,0x1CE1,0x0D68,0x3FF3,0x2E7A,
    0xE70E,0xF687,0xC41C,0xD595,0xA12A,0xB0A3,0x8238,0x93B1,
    0x6B46,0x7ACF,0x4854,0x59DD,0x2D62,0x3CEB,0x0E70,0x1FF9,
    0xF78F,0xE606,0xD49D,0xC514,0xB1AB,0xA022,0x92B9,0x8330,
    0x7BC7,0x6A4E,0x58D5,0x495C,0x3DE3,0x2C6A,0x1EF1,0x0F78
};

// CRC over bytes [from,to) — wraps whole body array
static quint16 gt06Crc(const QByteArray& d, int from, int to) {
    quint16 fcs = 0xFFFF;
    for (int i = from; i < to; i++)
        fcs = (fcs >> 8) ^ GT06_CRC_TABLE[(fcs ^ (quint8)d[i]) & 0xFF];
    return (~fcs) & 0xFFFF;
}

static QByteArray gt06Wrap(const QByteArray& body) {
    // Prepend 0x78 0x78, append 0x0D 0x0A
    QByteArray pkt;
    pkt.reserve(body.size() + 4);
    pkt.append(char(0x78)); pkt.append(char(0x78));
    pkt.append(body);
    pkt.append(char(0x0D)); pkt.append(char(0x0A));
    return pkt;
}

// ── 0x01 LOGIN  (18 bytes total) ─────────────────────────────────────
// 78 78 | 0D | 01 | IMEI[8 BCD] | SN[2] | CRC[2] | 0D 0A
// Length = 0x0D = 13 (protocol + 8-byte IMEI + 2-byte SN + 2-byte CRC)
QByteArray SimulatorWindow::buildGT06NLogin(const VehicleState& v, quint16 sn) {
    // BCD-encode: prepend '0' to get 16 nibbles → 8 bytes
    QString s = QString("0") + v.imei.left(15).rightJustified(15, '0');
    QByteArray body;
    body.append(char(0x0D));        // length = 13
    body.append(char(0x01));        // protocol: login
    for (int i = 0; i < 8; i++) {
        int hi = s[i*2].digitValue(), lo = s[i*2+1].digitValue();
        body.append(char(((hi<0?0:hi) << 4) | (lo<0?0:lo)));
    }
    body.append(char((sn >> 8) & 0xFF));
    body.append(char( sn       & 0xFF));
    quint16 crc = gt06Crc(body, 0, body.size());
    body.append(char((crc >> 8) & 0xFF));
    body.append(char( crc       & 0xFF));
    return gt06Wrap(body);          // → 18 bytes total
}

// ── 0x12 LOCATION  (36 bytes total) ──────────────────────────────────
// Per spec section 5.2 — GPS + LBS combined packet:
//
//  Off  Sz  Field
//  0-1   2  Start bits (0x78 0x78)
//  2     1  Length = 0x1F = 31  (proto…serial+CRC)
//  3     1  Protocol = 0x12
//  4-9   6  Date/Time (YY MM DD HH mm SS, UTC)
//  10    1  Sat count (upper nibble=GPS info length=0xC, lower=sat count)
//  11-14 4  Latitude  (DDMM.MMMM × 30000, uint32 big-endian, absolute)
//  15-18 4  Longitude (DDMM.MMMM × 30000, uint32 big-endian, absolute)
//  19    1  Speed (km/h)
//  20-21 2  Course & Status (uint16 big-endian — see bit layout below)
//  22-23 2  MCC (Mobile Country Code, big-endian)
//  24    1  MNC (Mobile Network Code)
//  25-26 2  LAC (Location Area Code)
//  27-29 3  Cell ID
//  30-31 2  Serial Number
//  32-33 2  CRC-ITU (over bytes [2..31], i.e. Length through Serial)
//  34-35 2  Stop bits (0x0D 0x0A)
//
// Course/Status word bit layout (BYTE_1 = high byte, BYTE_2 = low byte):
//   Bit 13 (0x2000): 0 = real-time GPS,  1 = differential
//   Bit 12 (0x1000): 1 = GPS positioned (valid fix)
//   Bit 11 (0x0800): 0 = East,           1 = West
//   Bit 10 (0x0400): 1 = North,          0 = South
//   Bits 9-0 (0x03FF): heading 0-359°
//
// Verified against spec example 5.2.2:
//   0x154C → bit12=1(valid), bit11=0(East), bit10=1(North), course=332° ✓
QByteArray SimulatorWindow::buildGT06NLocation(const VehicleState& v, const QString& alarm, quint16 sn) {
    QDateTime now = QDateTime::currentDateTimeUtc();

    // ── Lat/Lon → degrees × 1800000  ────────────────────────────────────
    // CONFIRMED by screenshot analysis (2026-03-21):
    //   Simulator sent lat=13.17079 using DDMM×30000 → raw=39,307,422
    //   Server decoded: 39,307,422 / 1,800,000 = 21.837° (WRONG)
    //
    //   Using degrees×1800000 → raw=23,707,422
    //   Server decoded: 23,707,422 / 1,800,000 = 13.17079° (CORRECT ✓)
    //
    // fleetcop.com decode formula: raw / 1,800,000 = decimal_degrees
    // Therefore: raw = decimal_degrees × 1,800,000
    //
    // This also equals: total_minutes × 30,000
    //   (since degrees×1800000 = degrees×60×30000 = total_minutes×30000)
    auto toRaw1800k = [](double decDeg) -> quint32 {
        return quint32(qAbs(decDeg) * 1800000.0);
    };
    const quint32 latV = toRaw1800k(v.lat);
    const quint32 lonV = toRaw1800k(v.lon);

    // ── Course & Status word ──────────────────────────────────────────
    quint16 course = quint16(qAbs(v.heading)) & 0x03FF;  // bits 9-0 = heading
    course |= 0x1000;                      // bit 12 = GPS positioned (valid)
    // bit 13 stays 0  = real-time GPS (not differential)
    if (v.lon < 0.0)  course |= 0x0800;  // bit 11 = West  (0=East)
    if (v.lat >= 0.0) course |= 0x0400;  // bit 10 = North (0=South)

    QByteArray body;
    body.reserve(30);

    // 1. Protocol ID (Use 0x12 - much more stable for Traccar)
    body.append(char(0x12));

    // 2. Date and Time (6 bytes)
    body.append(char(now.date().year() % 100));
    body.append(char(now.date().month()));
    body.append(char(now.date().day()));
    body.append(char(now.time().hour()));
    body.append(char(now.time().minute()));
    body.append(char(now.time().second()));

    // 3. GPS Info (Combined byte: 0xC0 | Satellites)
    body.append(char(0xC0 | (quint8(v.satellites) & 0x0F)));

    // 4. Coordinates (Bengaluru - Aligned at index 8)
    body.append(char((latV >> 24) & 0xFF));
    body.append(char((latV >> 16) & 0xFF));
    body.append(char((latV >>  8) & 0xFF));
    body.append(char( latV        & 0xFF));
    body.append(char((lonV >> 24) & 0xFF));
    body.append(char((lonV >> 16) & 0xFF));
    body.append(char((lonV >>  8) & 0xFF));
    body.append(char( lonV        & 0xFF));

    // 5. Speed & Course/Status
    body.append(char(quint8(qMin(int(v.speed), 255))));
    body.append(char((course >> 8) & 0xFF));
    body.append(char( course       & 0xFF));

    // 6. LBS Block (8 bytes total - Matches Traccar 0x12 expectations)
    body.append(char(0x01)); body.append(char(0x94));     // MCC (404)
    body.append(char(0x2D));                              // MNC (45 - MUST BE 1 BYTE)
    body.append(char(0x69)); body.append(char(0x22));     // LAC
    body.append(char(0x00));                              // Cell ID High
    body.append(char(0xCF)); body.append(char(0xAA));     // Cell ID Low

    // 7. Serial Number
    body.append(char((sn >> 8) & 0xFF));
    body.append(char( sn       & 0xFF));

    // 1. Final Wrap
    QByteArray packet;
    packet.append(char(0x78)); packet.append(char(0x78)); // Start Bits
    packet.append(char(body.size() + 2));                 // Length Byte (0x1F)
    packet.append(body);                                  // Includes Serial Number

    // 2. Calculate CRC strictly from index 2 (Length byte) to index 28 (Serial Number)
    // Calculation length is: (Length Byte [1]) + (Protocol [1]) + (Time [6]) + (GPS/Sat [1]) +
    // (Lat [4]) + (Lon [4]) + (Speed [1]) + (Course [2]) + (LBS [8]) + (SN [2]) = 30 bytes total.
    const quint16 result = gt06Crc(packet, 2, packet.size() - 2);

    packet.append(char((result >> 8) & 0xFF));
    packet.append(char( result       & 0xFF));
    packet.append(char(0x0D)); packet.append(char(0x0A));
    appendLog(packet.toHex(), "#F97316");


    return  packet;    // → 36 bytes total
}

// ── 0x22 GPS-ONLY LOCATION PACKET (28 bytes total) ───────────────────────
// Used for port 6023 (fleetcop.com and similar servers).
// Same lat/lon/course encoding as 0x12 but WITHOUT LBS cell tower data.
//
// Packet layout:
//  [0-1]   78 78       start
//  [2]     0x17 (23)   length = proto(1)+dt(6)+sat(1)+lat(4)+lon(4)+spd(1)+crs(2)+SN(2)+CRC(2)
//  [3]     0x22        protocol
//  [4-9]   YY MM DD HH mm SS
//  [10]    0xC_        sat count
//  [11-14] lat (degrees × 1,800,000, big-endian)
//  [15-18] lon (degrees × 1,800,000, big-endian)
//  [19]    speed
//  [20-21] course+status word
//  [22-23] serial number
//  [24-25] CRC-ITU
//  [26-27] 0D 0A
QByteArray SimulatorWindow::buildGT06NLocation22(const VehicleState& v, quint16 sn) {
    QDateTime now = QDateTime::currentDateTimeUtc();

    // Lat/Lon: degrees × 1,800,000 (confirmed working on fleetcop.com)
    auto toRaw = [](double d) -> quint32 { return quint32(qAbs(d) * 1800000.0); };
    const quint32 latV = toRaw(v.lat);
    const quint32 lonV = toRaw(v.lon);

    // Course & Status word (same bit layout as 0x12)
    quint16 course = quint16(qAbs(v.heading)) & 0x03FF;
    course |= 0x1000;                      // bit12 = GPS positioned
    if (v.lon < 0.0)  course |= 0x0800;  // bit11 = West
    if (v.lat >= 0.0) course |= 0x0400;  // bit10 = North

    QByteArray body;
    body.reserve(24);   // 24 bytes: length byte through CRC

    body.append(char(0x17));                              // Length = 23
    body.append(char(0x22));                              // Protocol: GPS-only
    body.append(char(now.date().year() % 100));
    body.append(char(now.date().month()));
    body.append(char(now.date().day()));
    body.append(char(now.time().hour()));
    body.append(char(now.time().minute()));
    body.append(char(now.time().second()));
    body.append(char(0xC0 | qMin(v.satellites, 15)));    // sat byte
    body.append(char((latV >> 24) & 0xFF));
    body.append(char((latV >> 16) & 0xFF));
    body.append(char((latV >>  8) & 0xFF));
    body.append(char( latV        & 0xFF));
    body.append(char((lonV >> 24) & 0xFF));
    body.append(char((lonV >> 16) & 0xFF));
    body.append(char((lonV >>  8) & 0xFF));
    body.append(char( lonV        & 0xFF));
    body.append(char(quint8(qMin(int(v.speed), 255))));  // speed
    body.append(char((course >> 8) & 0xFF));
    body.append(char( course       & 0xFF));
    body.append(char((sn >> 8) & 0xFF));                  // serial number
    body.append(char( sn       & 0xFF));
    const quint16 crc = gt06Crc(body, 0, body.size());
    body.append(char((crc >> 8) & 0xFF));
    body.append(char( crc       & 0xFF));

    return gt06Wrap(body);    // → 28 bytes total
}

// ── 0x13 HEARTBEAT  (15 bytes total) ─────────────────────────────────
// Per spec section 5.4:
//
//  Off  Sz  Field
//  0-1   2  Start bits (0x78 0x78)
//  2     1  Length = 0x0A = 10  (proto…serial+CRC)
//  3     1  Protocol = 0x13
//  4     1  Terminal Information (bit layout below)
//  5     1  Voltage Level (0-6)
//  6     1  GSM Signal Strength (0-4)
//  7-8   2  Alarm/Language (0x00 0x02 = no alarm, English)
//  9-10  2  Serial Number
//  11-12 2  CRC-ITU (over bytes [2..10])
//  13-14 2  Stop bits (0x0D 0x0A)
//
// Terminal Information byte:
//   Bit 7: 0=oil connected,   1=oil cut (immobilised)
//   Bit 6: 1=GPS tracking ON, 0=off
//   Bit 5-3: 000=normal, 100=SOS, 011=LowBat, 010=PowerCut, 001=Shock
//   Bit 2: 1=charging
//   Bit 1: 1=ACC high (ignition ON)
//   Bit 0: 1=activated
QByteArray SimulatorWindow::buildGT06NHeartbeat(quint16 sn, bool ignitionOn, bool gpsFixed, bool immobilised) {
    quint8 termInfo = 0;
    if (immobilised)  termInfo |= (1 << 7);   // bit7: oil cut
    if (gpsFixed)     termInfo |= (1 << 6);   // bit6: GPS tracking ON
    // bits 5-3: 000 = normal (no alarm)
    if (ignitionOn)   termInfo |= (1 << 1);   // bit1: ACC high
    termInfo |= (1 << 0);                      // bit0: activated

    QByteArray body;
    body.append(char(0x0A));                   // Length = 10
    body.append(char(0x13));                   // Protocol: heartbeat/status
    body.append(char(termInfo));               // Terminal info
    body.append(char(0x04));                   // Voltage level: 4 = medium-high
    body.append(char(0x03));                   // GSM signal: 3 = good
    body.append(char(0x00)); body.append(char(0x02)); // Alarm=none, Language=English
    body.append(char((sn >> 8) & 0xFF));
    body.append(char( sn       & 0xFF));
    quint16 crc = gt06Crc(body, 0, body.size());
    body.append(char((crc >> 8) & 0xFF));
    body.append(char( crc       & 0xFF));
    return gt06Wrap(body);    // → 15 bytes total
}

// ── 0x15 STRING REPLY — terminal responds to 0x80 command ───────────
// Used to ACK engine cut (DYD) / restore (HFYD) commands from server
QByteArray SimulatorWindow::buildGT06NCommandReply(const QByteArray& serverFlagBit,
                                                    const QString& replyStr, quint16 sn) {
    QByteArray content = serverFlagBit;             // 4 bytes server flag (echo back)
    content.append(replyStr.toUtf8());              // ASCII reply
    content.append(char(0x00)); content.append(char(0x02)); // language = English

    QByteArray body;
    body.append(char(quint8(1 + content.size() + 2 + 2))); // length byte
    body.append(char(0x15));                                 // protocol: string reply
    body.append(char(quint8(content.size())));               // length of command content
    body.append(content);
    body.append(char((sn >> 8) & 0xFF));
    body.append(char( sn       & 0xFF));
    quint16 crc = gt06Crc(body, 0, body.size());
    body.append(char((crc >> 8) & 0xFF));
    body.append(char( crc       & 0xFF));
    return gt06Wrap(body);
}


// sendGT06N — manages a persistent socket per IMEI:
//   1st call: connect → send login → wait for ACK → send location
//   Subsequent calls: just send location on existing socket
void SimulatorWindow::sendGT06N(VehicleState& v, const QString& alarm) {
    const QString imei        = v.imei;
    const quint8  targetProto = v.gps_proto;  // 0x22 or 0x12 per vehicle
    const quint16 targetPort  = v.gps_port;   // 6023 or 6015 per vehicle
    const QString host = m_hostEdit->text();  // single host for all protocols
    // Connection key = "imei:proto" so same IMEI can be on both servers at once
    const QString connKey = imei + ":" + QString::number(targetProto, 16);

    // Get or create connection record
    GT06NConn* c = m_gt06nConns.value(connKey, nullptr);
    if (!c) {
        c = new GT06NConn;
        c->proto = targetProto;
        m_gt06nConns[connKey] = c;
    }

    // If already connected and logged in → send location immediately
    if (c->loggedIn && c->socket &&
        c->socket->state() == QAbstractSocket::ConnectedState) {
        // Choose packet: 0x22=GPS-only · 0x12=GPS+LBS · 0xFF=both on same socket
        if (c->proto == 0xFF) {
            c->socket->write(buildGT06NLocation22(v, c->sn++));
            c->socket->write(buildGT06NLocation(v, alarm, c->sn++));
        } else if (c->proto == 0x22) {
            c->socket->write(buildGT06NLocation22(v, c->sn++));
        } else {
            c->socket->write(buildGT06NLocation(v, alarm, c->sn++));
        }
        const QByteArray pkt; // placeholder for log size below
        m_totalPackets++;  // counted here for GT06N
        v.packetsSent++;
        if (m_vehicles.size() <= 20) {
            QString col = alarm.isEmpty()
                ? (v.status=="idle" ? "#D97706" : "#10B981")
                : "#DC2626";
            appendLog(QString("[%1] %2 📡 0x%3 lat=%4 lon=%5 spd=%6 %7 (%8B)")
                .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
                .arg(imei.right(6))
                .arg(c->proto==0xFF ? "22+12" : QString("%1").arg(c->proto,2,16,QChar('0')).toUpper())
                .arg(v.lat, 0,'f',5).arg(v.lon, 0,'f',5)
                .arg(v.speed, 0,'f',0)
                .arg(alarm.isEmpty() ? v.status : alarm.toUpper())
                .arg(c->proto==0xFF?"28+36B":"auto"), col);
        }
        return;
    }

    // Already trying to connect — skip this tick
    if (c->connecting) return;

    // Socket dead or not created — (re)connect
    if (c->socket) {
        c->socket->abort();
        c->socket->deleteLater();
        c->socket = nullptr;
        c->loggedIn   = false;
        c->connecting = false;
    }

    c->socket     = new QTcpSocket(this);
    c->loggedIn   = false;
    c->connecting = true;
    c->proto      = targetProto;  // store protocol for this connection
    c->rxBuf.clear();

    const QString protoLabel = (targetProto == 0x22) ? "0x22 GPS-only" : "0x12 GPS+LBS";
    appendLog(QString("[%1] %2 GT06N → connecting %3:%4 [%5]…")
        .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
        .arg(imei.right(6)).arg(host).arg(targetPort).arg(protoLabel), "#0EA5E9");

    // ── connected ─────────────────────────────────────────────
    connect(c->socket, &QTcpSocket::connected, this, [this, connKey]() {
        gt06nConnected(connKey);
    });

    // ── data from server (ACK packets) ────────────────────────
    connect(c->socket, &QTcpSocket::readyRead, this, [this, connKey]() {
        gt06nDataReady(connKey);
    });

    // ── disconnected ──────────────────────────────────────────
    connect(c->socket, &QTcpSocket::disconnected, this, [this, connKey]() {
        gt06nDisconnected(connKey);
    });

    // ── error ─────────────────────────────────────────────────
    connect(c->socket,
        QOverload<QAbstractSocket::SocketError>::of(&QTcpSocket::errorOccurred),
        this, [this, connKey](QAbstractSocket::SocketError err) {
            gt06nSocketError(connKey, err);
        });

    c->socket->connectToHost(host, targetPort);
}

// Called when TCP connection established → send LOGIN packet
void SimulatorWindow::gt06nConnected(const QString& connKey) {
    GT06NConn* c = m_gt06nConns.value(connKey, nullptr);
    if (!c || !c->socket) return;
    c->connecting = false;

    // Extract IMEI from connKey ("imei:proto")
    const QString imei = connKey.section(':', 0, 0);
    auto it = std::find_if(m_vehicles.begin(), m_vehicles.end(),
                           [&](const VehicleState& v){ return v.imei == imei; });
    if (it == m_vehicles.end()) return;

    QByteArray loginPkt = buildGT06NLogin(*it, c->sn++);
    c->socket->write(loginPkt);

    const QString protoTag = (c->proto==0x22) ? "0x22" : "0x12";
    appendLog(QString("[%1] %2 GT06N ✅ connected [%3] → login sent (%4B)")
        .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
        .arg(imei.right(6)).arg(protoTag).arg(loginPkt.size()), "#10B981");
}

// Called when server sends data — parse ACKs
void SimulatorWindow::gt06nDataReady(const QString& connKey) {
    GT06NConn* c = m_gt06nConns.value(connKey, nullptr);
    if (!c || !c->socket) return;
    c->rxBuf.append(c->socket->readAll());

    // Extract IMEI from connKey ("imei:proto")
    const QString imei = connKey.section(':', 0, 0);

    // Find and process complete packets (78 78 ...)
    while (c->rxBuf.size() >= 5) {
        // Sync to start bytes
        if ((quint8)c->rxBuf[0] != 0x78 || (quint8)c->rxBuf[1] != 0x78) {
            c->rxBuf.remove(0, 1);
            continue;
        }
        int len      = (quint8)c->rxBuf[2];          // length byte
        int totalPkt = 2 + 1 + len + 2;              // start(2) + len(1) + len + stop(2)
        if (c->rxBuf.size() < totalPkt) break;       // wait for more data

        quint8 proto = (quint8)c->rxBuf[3];
        QByteArray pkt = c->rxBuf.left(totalPkt);
        c->rxBuf.remove(0, totalPkt);

        const QString ts = QDateTime::currentDateTime().toString("hh:mm:ss");

        // ── Login ACK (0x01) — same for both protocols ────────────────
        if (proto == 0x01) {
            c->loggedIn = true;
            appendLog(QString("[%1] %2 GT06N ✅ LOGIN ACK [%3] → location stream active")
                .arg(ts).arg(imei.right(6))
                .arg(c->proto==0x22?"0x22 GPS-only":"0x12 GPS+LBS"), "#10B981");

        // ── Location ACK 0x22 (GPS-only) ─────────────────────────────
        } else if (proto == 0x22) {
            appendLog(QString("[%1] %2 📥 0x22 loc ACK")
                .arg(ts).arg(imei.right(6)), "#334155");

        // ── Location ACK 0x12 (GPS+LBS) ──────────────────────────────
        } else if (proto == 0x12) {
            appendLog(QString("[%1] %2 📥 0x12 loc ACK")
                .arg(ts).arg(imei.right(6)), "#334155");

        // ── Heartbeat ACK (0x13) ─────────────────────────────────────
        } else if (proto == 0x13) {
            appendLog(QString("[%1] %2 💓 HB ACK (0x13)")
                .arg(ts).arg(imei.right(6)), "#334155");

        // ── Engine cut/restore command (0x80) ────────────────────────
        } else if (proto == 0x80) {
            if (pkt.size() >= 10) {
                quint8  cmdLen  = (quint8)pkt[4];
                QByteArray flagBit = pkt.mid(5, 4);
                QString cmd;
                if (pkt.size() >= 5 + 4 + cmdLen)
                    cmd = QString::fromLatin1(pkt.mid(9, cmdLen - 4)).trimmed();
                appendLog(QString("[%1] %2 📟 CMD [%3]: %4")
                    .arg(ts).arg(imei.right(6))
                    .arg(c->proto==0x22?"0x22":"0x12").arg(cmd), "#F59E0B");

                QString replyStr;
                bool cutEngine = false, restoreEngine = false;
                if      (cmd.startsWith("DYD"))  { replyStr="DYD=Success!";  cutEngine=true;     }
                else if (cmd.startsWith("HFYD")) { replyStr="HFYD=Success!"; restoreEngine=true; }
                else                             { replyStr=cmd.split(',')[0]+"=OK"; }

                auto it = std::find_if(m_vehicles.begin(), m_vehicles.end(),
                            [&](const VehicleState& v){ return v.imei==imei; });
                if (it != m_vehicles.end()) {
                    if (cutEngine)     { it->immobilised=true;  it->engineOn=false; it->speed=0; }
                    if (restoreEngine) { it->immobilised=false; it->engineOn=true; }
                    updateTable();
                    appendLog(QString("[%1] %2 ✂️ Engine %3 via 0x80 command")
                        .arg(ts).arg(imei.right(6))
                        .arg(cutEngine?"CUT":"RESTORED"),
                        cutEngine?"#EF4444":"#10B981");
                }

                if (c->loggedIn && c->socket &&
                    c->socket->state() == QAbstractSocket::ConnectedState) {
                    quint16 cmdSN = 0;
                    int snPos = 2 + 1 + len - 4;
                    if (snPos + 1 < pkt.size())
                        cmdSN = ((quint8)pkt[snPos]<<8) | (quint8)pkt[snPos+1];
                    QByteArray reply = buildGT06NCommandReply(flagBit, replyStr, cmdSN);
                    c->socket->write(reply);
                    appendLog(QString("[%1] %2 📤 0x15 reply: %3")
                        .arg(ts).arg(imei.right(6)).arg(replyStr), "#10B981");
                }
            }
        }
    }
}




void SimulatorWindow::gt06nDisconnected(const QString& connKey) {
    const QString imei = connKey.section(':', 0, 0);
    GT06NConn* c = m_gt06nConns.value(connKey, nullptr);
    if (!c) return;
    c->loggedIn   = false;
    c->connecting = false;
    appendLog(QString("[%1] %2 GT06N 🔌 disconnected — will reconnect on next tick")
        .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
        .arg(imei.right(6)), "#F97316");
}

void SimulatorWindow::gt06nSocketError(const QString& connKey, QAbstractSocket::SocketError err) {
    const QString imei = connKey.section(':', 0, 0);
    GT06NConn* c = m_gt06nConns.value(connKey, nullptr);
    if (!c) return;
    QString msg = c->socket ? c->socket->errorString() : "unknown";
    c->loggedIn   = false;
    c->connecting = false;
    m_totalFailed++;
    if (m_vehicles.size() <= 20)
        appendLog(QString("[%1] %2 GT06N ❌ %3")
            .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
            .arg(imei.right(6)).arg(msg), "#EF4444");
    Q_UNUSED(err);
}

void SimulatorWindow::closeAllGT06N() {
    for (auto* c : m_gt06nConns) {
        if (c->socket) { c->socket->abort(); c->socket->deleteLater(); }
        delete c;
    }
    m_gt06nConns.clear();
}

QString SimulatorWindow::buildAIS140Packet(const VehicleState& v) {
    QDateTime dt=QDateTime::currentDateTimeUtc();
    return QString("$GPRMC,%1,A,%2,N,%3,E,%4,%5,%6,,,A*00\r\n")
        .arg(dt.toString("HHmmss.zzz"))
        .arg(qAbs(v.lat)*100,10,'f',2,QChar('0'))
        .arg(qAbs(v.lon)*100,11,'f',2,QChar('0'))
        .arg(v.speed/1.852,5,'f',1,QChar('0'))
        .arg(v.heading,5,'f',1,QChar('0'))
        .arg(dt.toString("ddMMyy"));
}

// ═══════════════════════════════════════════════════════════════
// TABLE + STATS UPDATE
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::updateTable() {
    m_table->setRowCount((int)m_vehicles.size());
    for(int i=0;i<(int)m_vehicles.size();i++) {
        const auto& v=m_vehicles[i];
        auto setItem=[&](int col,const QString& txt,const QString& fg="",bool bg=false){
            auto* item=new QTableWidgetItem(txt);
            if(!fg.isEmpty()) item->setForeground(QColor(fg));
            if(v.immobilised) item->setBackground(QColor(60,0,0));
            else if(bg&&v.selected) item->setBackground(QColor(239,246,255));
            m_table->setItem(i,col,item);
        };
        // Col 0: selection indicator
        auto* selItem=new QTableWidgetItem(v.selected?"☑":"☐");
        selItem->setTextAlignment(Qt::AlignCenter);
        if(v.immobilised) selItem->setBackground(QColor(60,0,0));
        m_table->setItem(i,0,selItem);

        QString nameImei=v.name+"\n"+v.imei;
        QString stCol=v.immobilised?"#EF4444":v.status=="alarm"?"#DC2626":v.status=="online"?"#10B981":"#D97706";
        // Show CSV progress in status column
        QString stTxt;
        if (v.immobilised) {
            stTxt = "✂️ CUT";
        } else if (v.csvIdx >= 0 && !v.csvTrack.isEmpty()) {
            int pct = v.csvTrack.size() > 0 ? (v.csvIdx * 100 / v.csvTrack.size()) : 0;
            stTxt = QString("📡 CSV %1/%2 (%3%)")
                    .arg(qMin(v.csvIdx, v.csvTrack.size()))
                    .arg(v.csvTrack.size()).arg(pct);
        } else if (v.engineOn) {
            stTxt = v.status == "alarm" ? "⚠ ALARM" : v.status.toUpper();
        } else {
            stTxt = "🔴 OFF";
        }
        setItem(1,nameImei);
        setItem(2,v.protocol);
        setItem(3,stTxt,stCol);
        setItem(4,QString::number(v.speed,'f',0)+" km/h",v.speed>85?"#DC2626":"#0F172A");
        setItem(5,QString::number(v.lat,'f',5));
        setItem(6,QString::number(v.lon,'f',5));
        setItem(7,QString("%1 km").arg((int)v.odometer));
        setItem(8,QString("%1 h").arg(v.engineHours,'0','f',1));
        setItem(9,QString::number(v.packetsSent));
        m_table->setRowHeight(i,36);
    }
}

void SimulatorWindow::onStatsTimer() {
    updateStats();

    // Update CSV progress label — show pts for selected/first device with active CSV
    if (!m_csvProgressLabel) return;
    const VehicleState* active = nullptr;
    // Prefer the selected row
    if (m_selectedRow >= 0 && m_selectedRow < (int)m_vehicles.size() &&
        m_vehicles[m_selectedRow].csvIdx >= 0)
        active = &m_vehicles[m_selectedRow];
    // Fall back to first vehicle with active CSV
    if (!active) {
        for (const auto& v : m_vehicles) {
            if (v.csvIdx >= 0) { active = &v; break; }
        }
    }
    if (active && !active->csvTrack.isEmpty()) {
        int idx   = active->csvIdx;
        int total = active->csvTrack.size();
        int pct   = total > 0 ? (idx * 100 / total) : 0;
        m_csvProgressLabel->setText(
            QString("▶ %1/%2 pts (%3%)")
            .arg(qMin(idx, total)).arg(total).arg(pct));
    } else {
        m_csvProgressLabel->setText("");
    }
}

void SimulatorWindow::updateStats() {
    int online=(int)std::count_if(m_vehicles.begin(),m_vehicles.end(),[](const VehicleState& v){
        return v.engineOn&&(v.status=="online"||v.status=="alarm");});
    int immob=(int)std::count_if(m_vehicles.begin(),m_vehicles.end(),[](const VehicleState& v){return v.immobilised;});
    if(m_lbOnline)  m_lbOnline->setText(QString("%1/%2").arg(online).arg(m_vehicles.size()));
    if(m_lbPackets) m_lbPackets->setText(QString::number(m_totalPackets));
    if(m_lbKm)      m_lbKm->setText(QString("%1 km").arg(m_totalKm,'0','f',1));
    if(m_lbFailed)  m_lbFailed->setText(QString::number(m_totalFailed));
    if(m_lbImmob)   m_lbImmob->setText(QString::number(immob));
    if(m_lbFreq)    m_lbFreq->setText(m_intervalSpin?m_intervalSpin->text():"—");
    if(m_lbBulkTotal) m_lbBulkTotal->setText(QString::number(m_vehicles.size()));
    if(m_lbBulkSent)  m_lbBulkSent->setText(QString::number(m_totalPackets));
}

void SimulatorWindow::updateSelectedVehicle() {
    if(m_selectedRow<0||m_selectedRow>=(int)m_vehicles.size()) return;
    const auto& v=m_vehicles[m_selectedRow];
    if(m_selIMEI)  m_selIMEI->setText(v.imei);
    if(m_selPos)   m_selPos->setText(QString("%1, %2").arg(v.lat,0,'f',5).arg(v.lon,0,'f',5));
    if(m_selSpeed) m_selSpeed->setText(QString("%1 km/h").arg(v.speed,0,'f',0));
    QString stc=v.immobilised?"color:#EF4444;font-weight:700":v.status=="alarm"?"color:#DC2626;font-weight:700":v.status=="online"?"color:#10B981;font-weight:700":"color:#D97706;font-weight:700";
    if(m_selStatus){m_selStatus->setStyleSheet(stc);m_selStatus->setText(v.immobilised?"IMMOBILISED":v.status.toUpper());}
    if(m_speedSlider) m_speedSlider->setValue((int)v.speed);
    if(m_protocolCombo) m_protocolCombo->setCurrentText(v.protocol);
}

// ═══════════════════════════════════════════════════════════════
// DEVICE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::onAddVehicle() { onAddLocalDevice(); }

void SimulatorWindow::onAddLocalDevice() {
    auto* dlg=new QDialog(this);
    dlg->setWindowTitle("Add Local Device");
    dlg->setMinimumWidth(400);
    dlg->setStyleSheet("QDialog{background:#1E293B;color:#F1F5F9;} QLabel{color:#94A3B8;font-size:12px;} "
                       "QLineEdit,QComboBox{background:#0F172A;color:#F1F5F9;border:1px solid #334155;border-radius:6px;padding:6px 10px;font-size:13px;} "
                       "QPushButton{padding:8px 16px;border-radius:6px;font-weight:600;}");
    auto* form=new QFormLayout(dlg); form->setSpacing(10); form->setContentsMargins(18,18,18,12);
    QString autoImei=QString("86%1").arg(QRandomGenerator::global()->bounded(100000000,999999999));
    auto* eImei=new QLineEdit(autoImei);
    auto* eName=new QLineEdit("CAR-"+autoImei.right(4));
    auto* eProt=new QComboBox; eProt->addItems({"GT06N","AIS140"});
    auto* eLat=new QLineEdit("12.9716"); auto* eLon=new QLineEdit("77.5946");
    form->addRow("IMEI:", eImei); form->addRow("Name:", eName); form->addRow("Protocol:", eProt);
    form->addRow("Latitude:", eLat); form->addRow("Longitude:", eLon);
    auto* btns=new QDialogButtonBox(QDialogButtonBox::Ok|QDialogButtonBox::Cancel);
    btns->button(QDialogButtonBox::Ok)->setStyleSheet("background:#10B981;color:#fff;border-radius:6px;");
    btns->button(QDialogButtonBox::Cancel)->setStyleSheet("background:#334155;color:#fff;border-radius:6px;");
    connect(btns,&QDialogButtonBox::accepted,dlg,&QDialog::accept);
    connect(btns,&QDialogButtonBox::rejected,dlg,&QDialog::reject);
    form->addRow(btns);
    if(dlg->exec()!=QDialog::Accepted){dlg->deleteLater();return;}
    VehicleState v;
    v.id=(int)m_vehicles.size()+1; v.imei=eImei->text().trimmed();
    v.name=eName->text().trimmed(); v.protocol=eProt->currentText();
    v.lat=eLat->text().toDouble(); v.lon=eLon->text().toDouble();
    v.targetLat=v.lat; v.targetLon=v.lon;
    m_vehicles.push_back(v);
    updateTable(); rebuildImeiCombo();
    appendLog(QString("➕ Added: %1 [%2] %3").arg(v.name).arg(v.imei).arg(v.protocol),"#3B82F6");
    dlg->deleteLater();
}

void SimulatorWindow::onRemoveVehicle() {
    if(m_selectedRow<0||m_selectedRow>=(int)m_vehicles.size()) return;
    appendLog("🗑 Removed: "+m_vehicles[m_selectedRow].imei,"#94A3B8");
    m_vehicles.erase(m_vehicles.begin()+m_selectedRow);
    m_selectedRow=-1; updateTable(); rebuildImeiCombo();
}

void SimulatorWindow::onClearAllDevices() {
    auto r=QMessageBox::question(this,"Clear All","Remove all "+QString::number(m_vehicles.size())+" devices?");
    if(r!=QMessageBox::Yes) return;
    closeAllGT06N();
    m_vehicles.clear(); m_totalPackets=0; m_totalFailed=0; m_totalKm=0;
    updateTable(); rebuildImeiCombo();
    appendBulkLog("🗑 All devices cleared","#EF4444");
}

// ── Generate N random devices ─────────────────────────────────
void SimulatorWindow::onGenerateDevices() {
    int n=m_genCountSpin?m_genCountSpin->value():100;
    static const QStringList types={"Car","Truck","Bus","Bike","Auto","MiniTruck","Van"};
    int startId=(int)m_vehicles.size()+1;
    for(int i=0;i<n;i++){
        VehicleState v;
        v.id=startId+i;
        v.imei=QString("86492006%1").arg(v.id,7,10,QChar('0'));
        v.name=types[i%types.size()]+QString("-%1").arg(i+1,4,10,QChar('0'));
        v.protocol="GT06N";
        v.lat=12.5+QRandomGenerator::global()->generateDouble()*2.5;
        v.lon=77.0+QRandomGenerator::global()->generateDouble()*2.0;
        v.targetLat=v.lat; v.targetLon=v.lon;
        v.heading=QRandomGenerator::global()->bounded(360);
        m_vehicles.push_back(v);
    }
    updateTable(); rebuildImeiCombo();
    appendBulkLog(QString("🎲 Generated %1 devices (total: %2)").arg(n).arg(m_vehicles.size()),"#8B5CF6");
    if(m_lbBulkTotal) m_lbBulkTotal->setText(QString::number(m_vehicles.size()));
}

// ── Load 1000+ devices from CSV ────────────────────────────────
// Format: imei,name,lat,lng,protocol
void SimulatorWindow::onLoadDevicesCSV() {
    QString path=QFileDialog::getOpenFileName(this,"Load Devices CSV","","CSV Files (*.csv)");
    if(path.isEmpty()) return;
    QFile f(path); if(!f.open(QIODevice::ReadOnly)){appendBulkLog("❌ Cannot open: "+path,"#EF4444");return;}
    QTextStream ts(&f);
    QString header=ts.readLine(); // skip header
    QStringList hdrs=header.split(',');
    int iImei=hdrs.indexOf("imei"),iName=hdrs.indexOf("name"),
        iLat=hdrs.indexOf("lat"),iLon=hdrs.indexOf("lng"),iProto=hdrs.indexOf("protocol");
    int count=0;
    while(!ts.atEnd()){
        QString line=ts.readLine().trimmed(); if(line.isEmpty()) continue;
        QStringList v=line.split(',');
        if(v.size()<2) continue;
        VehicleState vs;
        vs.id=(int)m_vehicles.size()+1;
        vs.imei  = iImei>=0&&iImei<v.size()   ? v[iImei].trimmed()  : v[0].trimmed();
        vs.name  = iName>=0&&iName<v.size()   ? v[iName].trimmed()  : vs.imei;
        vs.lat   = iLat>=0&&iLat<v.size()     ? v[iLat].toDouble()  : 12.9716;
        vs.lon   = iLon>=0&&iLon<v.size()     ? v[iLon].toDouble()  : 77.5946;
        vs.protocol = iProto>=0&&iProto<v.size()? v[iProto].trimmed(): "GT06N";
        vs.targetLat=vs.lat; vs.targetLon=vs.lon;
        // Check for existing CSV track
        if(m_csvLibrary.contains(vs.imei)) applyCsvToVehicle(vs, m_csvLibrary[vs.imei]);
        m_vehicles.push_back(vs);
        count++;
    }
    updateTable(); rebuildImeiCombo();
    appendBulkLog(QString("📂 Loaded %1 devices from %2 (total: %3)")
        .arg(count).arg(QFileInfo(path).fileName()).arg(m_vehicles.size()),"#10B981");
}

// ── Bulk assign CSV folder (IMEI.csv → per device) ─────────────
void SimulatorWindow::onBulkAssignCSV() {
    QString dir=QFileDialog::getExistingDirectory(this,"Select CSV Track Folder","",
        QFileDialog::ShowDirsOnly|QFileDialog::DontResolveSymlinks);
    if(dir.isEmpty()) return;
    int assigned=0;
    QDirIterator it(dir,{"*.csv"},QDir::Files);
    while(it.hasNext()){
        QString filePath=it.next();
        QString imei=QFileInfo(filePath).baseName();
        QVector<CsvPoint> track=parseCsvFile(filePath);
        if(track.isEmpty()) continue;
        m_csvLibrary[imei]=track;
        // Apply to matching vehicle
        for(auto& v:m_vehicles){
            if(v.imei==imei){ applyCsvToVehicle(v,track); assigned++; break; }
        }
    }
    appendBulkLog(QString("📁 Bulk assign: %1 tracks assigned from %2").arg(assigned).arg(dir),"#7C3AED");
}

// ═══════════════════════════════════════════════════════════════
// SINGLE CSV LOAD + ASSIGN
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::onLoadCSV() {
    QString path=QFileDialog::getOpenFileName(this,"Load CSV Track","","CSV Files (*.csv)");
    if(path.isEmpty()) return;
    m_csvTrack=parseCsvFile(path);
    if(m_csvTrack.isEmpty()){m_csvStatusLabel->setText("❌ No valid rows");return;}
    m_csvStatusLabel->setText(QString("✅ %1 pts: %2").arg(m_csvTrack.size()).arg(QFileInfo(path).fileName()));
    appendLog(QString("📂 CSV loaded: %1 pts from %2").arg(m_csvTrack.size()).arg(QFileInfo(path).fileName()),"#7C3AED");
}

void SimulatorWindow::onCsvAssignImei() {
    if (m_csvTrack.isEmpty()) { appendLog("⚠️ Load a CSV file first","#F59E0B"); return; }
    QString imei = m_csvImeiCombo ? m_csvImeiCombo->currentData().toString() : "";
    if (imei.isEmpty()) { appendLog("⚠️ Select a device first","#F59E0B"); return; }
    auto it = std::find_if(m_vehicles.begin(), m_vehicles.end(),
                           [&](const VehicleState& v){ return v.imei == imei; });
    if (it == m_vehicles.end()) { appendLog("⚠️ Device not found: "+imei,"#EF4444"); return; }
    applyCsvToVehicle(*it, m_csvTrack);
    it->csvLoopOn = m_btnCsvLoop ? m_btnCsvLoop->isChecked() : true;
    appendLog(QString("↗ CSV assigned to %1 [%2 pts, loop=%3]")
        .arg(imei).arg(m_csvTrack.size()).arg(it->csvLoopOn?"ON":"OFF"), "#10B981");
    if (!m_running) onStartAll();
}

QVector<CsvPoint> SimulatorWindow::parseCsvFile(const QString& path) {
    // Accepts any CSV with column headers (case-insensitive).
    // Required: lat/latitude, lon/lng/longitude
    // Optional: speed, heading/course, altitude, ignition/acc, dt/time/timestamp, alarm/event
    QFile f(path); QVector<CsvPoint> pts;
    if(!f.open(QIODevice::ReadOnly)) return pts;
    QTextStream ts(&f); ts.setEncoding(QStringConverter::Utf8);

    // ── Parse header ─────────────────────────────────────────────
    QString hdr = ts.readLine().trimmed().toLower();
    // Handle Excel BOM
    if(hdr.startsWith(QChar(0xFEFF))) hdr = hdr.mid(1);
    QStringList h = hdr.split(',');
    // Strip quotes
    for(auto& col : h)
          col = col.remove('"').remove("'").trimmed();

    auto col = [&](const QStringList& names) -> int {
        for(const QString& n : names) {
            int idx = h.indexOf(n);
            if(idx >= 0) return idx;
        }
        return -1;
    };

    int iLat = col({"lat","latitude"});
    int iLon = col({"lon","lng","longitude"});
    if(iLat<0||iLon<0) {
        appendLog("CSV: no lat/lon columns found in: "+hdr.left(80),"#EF4444");
        return pts;
    }
    int iSpd  = col({"speed","spd","kph","kmh","velocity"});
    int iHdg  = col({"heading","course","direction","hdg","bearing"});
    int iAlt  = col({"altitude","alt","elevation","elev"});
    int iIgn  = col({"ignition","ign","acc","engine","engineon","engine_on"});
    int iDt   = col({"dt","datetime","time","timestamp","ts","date_time"});
    int iAlrm = col({"alarm","alert","event","alarm1status"});

    int count = 0;
    while(!ts.atEnd()){
        QString line = ts.readLine().trimmed();
        if(line.isEmpty()) continue;
        // Handle quoted CSV fields
        QStringList v;
        if(line.contains('"')) {
            // Simple quoted-field parser
            bool inQ = false; QString cur;
            for(QChar c : line) {
                if(c=='"') { inQ=!inQ; }
                else if(c==',' && !inQ) { v.append(cur.trimmed()); cur.clear(); }
                else cur+=c;
            }
            v.append(cur.trimmed());
        } else {
            v = line.split(',');
        }
        if(v.size() <= qMax(iLat,iLon)) continue;

        CsvPoint pt;
        pt.lat = v[iLat].trimmed().toDouble();
        pt.lon = v[iLon].trimmed().toDouble();
        if(qAbs(pt.lat)<0.0001 && qAbs(pt.lon)<0.0001) continue;

        pt.speed    = (iSpd>=0 && iSpd<v.size())  ? v[iSpd].trimmed().toDouble() : 0.0;
        pt.heading  = (iHdg>=0 && iHdg<v.size())  ? v[iHdg].trimmed().toDouble() : 0.0;
        pt.altitude = (iAlt>=0 && iAlt<v.size())  ? v[iAlt].trimmed().toDouble() : 0.0;
        if(iIgn>=0 && iIgn<v.size()) {
            QString ig = v[iIgn].trimmed().toLower();
            pt.ignition = (ig!="0" && ig!="false" && ig!="off" && ig!="no");
        } else {
            pt.ignition = true;
        }
        if(iAlrm>=0 && iAlrm<v.size()) {
            QString al = v[iAlrm].trimmed().toLower();
            if(al!="0"&&al!="false"&&al!="none"&&!al.isEmpty()) pt.alarm = al;
        }
        // Epoch timestamp (optional — used for replay timing)
        if(iDt>=0 && iDt<v.size()) {
            QString dts = v[iDt].trimmed();
            QDateTime dt = QDateTime::fromString(dts, Qt::ISODate);
            if(!dt.isValid()) dt = QDateTime::fromString(dts, "yyyy-MM-dd HH:mm:ss");
            if(!dt.isValid()) dt = QDateTime::fromString(dts, "dd/MM/yyyy HH:mm:ss");
            if(dt.isValid()) pt.msEpoch = dt.toMSecsSinceEpoch();
        }
        pts.append(pt);
        count++;
    }
    appendLog(QString("CSV loaded: %1 points  [lat@%2, lon@%3, spd@%4, hdg@%5, ign@%6]")
        .arg(count).arg(iLat).arg(iLon).arg(iSpd).arg(iHdg).arg(iIgn), "#7C3AED");
    return pts;
}

void SimulatorWindow::applyCsvToVehicle(VehicleState& v, const QVector<CsvPoint>& track) {
    v.csvTrack = track;
    v.csvIdx   = 0;
    // csvLoopOn is set by the caller (loop button state)
    if (!track.isEmpty()) {
        v.lat     = track[0].lat;
        v.lon     = track[0].lon;
        v.speed   = track[0].speed;
        v.heading = track[0].heading;
    }
    v.engineOn = true;   // ensure vehicle is active
    v.status   = "online";
}

// ═══════════════════════════════════════════════════════════════
// ALARMS
// ═══════════════════════════════════════════════════════════════
// Helper: which vehicles to target
QVector<int> targetDevices(const std::vector<VehicleState>& vehicles, QComboBox* combo, QLineEdit* filter) {
    QVector<int> idxs;
    int mode = combo ? combo->currentIndex() : 0;
    for(int i=0;i<(int)vehicles.size();i++){
        const auto& v=vehicles[i];
        if(mode==0) { idxs.append(i); }                            // all
        else if(mode==1 && v.selected) { idxs.append(i); }         // selected
        else if(mode==2 && filter) {                                // IMEI filter
            QString f=filter->text().trimmed();
            QStringList parts=f.split(',');
            for(const auto& p:parts) if(v.imei.startsWith(p.trimmed())) { idxs.append(i); break; }
        }
    }
    return idxs;
}

void SimulatorWindow::onSendPanic() {
    auto idxs=targetDevices(m_vehicles,m_alarmTargetCombo,m_alarmImeiFilter);
    for(int i:idxs) m_vehicles[i].panicActive=true;
    m_broadcastAlarm="panic";
    appendLog(QString("🚨 PANIC → %1 devices").arg(idxs.size()),"#DC2626");
    appendBulkLog(QString("🚨 PANIC broadcast → %1 devices").arg(idxs.size()),"#DC2626");
}

void SimulatorWindow::onSendOverspeed() {
    auto idxs=targetDevices(m_vehicles,m_alarmTargetCombo,m_alarmImeiFilter);
    for(int i:idxs){m_vehicles[i].speed=95;m_vehicles[i].overspeedActive=true;}
    m_broadcastAlarm="overspeed";
    appendLog(QString("⚡ OVERSPEED → %1 devices").arg(idxs.size()),"#D97706");
}

void SimulatorWindow::onBroadcastGeofence() {
    m_broadcastAlarm="geofence_entry";
    appendLog("🔲 GEOFENCE ENTRY broadcast queued","#7C3AED");
}

void SimulatorWindow::onBroadcastCustomAlarm() {
    QString alarm=m_customAlarmEdit?m_customAlarmEdit->text().trimmed():"custom";
    if(alarm.isEmpty()) return;
    m_broadcastAlarm=alarm;
    appendLog("📣 Custom alarm queued: "+alarm,"#6366F1");
}

void SimulatorWindow::onSpeedChanged(int) {
    if(m_selectedRow<0||m_selectedRow>=(int)m_vehicles.size()) return;
    int spd=m_speedSlider?m_speedSlider->value():0;
    m_vehicles[m_selectedRow].speed=spd;
    appendLog(QString("⚡ Speed set: %1 → %2 km/h").arg(m_vehicles[m_selectedRow].imei).arg(spd),"#3B82F6");
}

// ═══════════════════════════════════════════════════════════════
// SELECTION (REQ-20)
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::onSelectAll() {
    static bool allSel=false; allSel=!allSel;
    for(int i=0;i<(int)m_vehicles.size();i++){
        m_vehicles[i].selected=allSel;
        if(allSel) m_table->selectRow(i);
    }
    if(!allSel) m_table->clearSelection();
    if(m_btnSelectAll) m_btnSelectAll->setText(allSel?"☐ Deselect All":"☑ Select All");
    updateTable();
    appendLog(QString("%1 %2 vehicles").arg(allSel?"☑ Selected":"☐ Deselected").arg(m_vehicles.size()),"#64748B");
}

void SimulatorWindow::onItemChanged(QTableWidgetItem*) {}
void SimulatorWindow::onRowSelected(int r){m_selectedRow=r;updateSelectedVehicle();}

// ═══════════════════════════════════════════════════════════════
// ENGINE COMMAND POLLING (REQ-21)
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::pollEngineCommands() {
    if(m_vehicles.empty()||m_jwt.isEmpty()) return;
    for(auto& v:m_vehicles) pollCommandsForImei(v.imei);
}

void SimulatorWindow::pollCommandsForImei(const QString& imei) {
    if(!m_nam||m_jwt.isEmpty()) return;
    QString base=m_apiEdit?m_apiEdit->text():"http://127.0.0.1:8080";
    QNetworkRequest req(QUrl(base+"/api/device-commands/pending/"+imei));
    req.setRawHeader("Authorization",("Bearer "+m_jwt).toUtf8());
    req.setHeader(QNetworkRequest::ContentTypeHeader,"application/json");
    auto* reply=m_nam->get(req);
    connect(reply,&QNetworkReply::finished,this,[this,reply,imei](){
        reply->deleteLater();
        if(reply->error()!=QNetworkReply::NoError) return;
        QByteArray data=reply->readAll();
        if(data.isEmpty()||data=="[]") return;
        QJsonDocument doc=QJsonDocument::fromJson(data);
        if(!doc.isArray()) return;
        for(const QJsonValue& val:doc.array()){
            QString cmd=val.toObject()["command"].toString();
            auto it=std::find_if(m_vehicles.begin(),m_vehicles.end(),[&](const VehicleState& v){return v.imei==imei;});
            if(it==m_vehicles.end()) continue;
            if(cmd=="engine_cut"){
                it->immobilised=true; it->engineOn=false; it->speed=0;
                m_immobilisedImeis.insert(imei);
                appendLog(QString("✂️  ENGINE CUT received: %1 [%2]").arg(it->name).arg(imei),"#EF4444");
            } else if(cmd=="engine_restore"){
                it->immobilised=false; it->engineOn=true;
                m_immobilisedImeis.remove(imei);
                appendLog(QString("✅  ENGINE RESTORED: %1 [%2]").arg(it->name).arg(imei),"#10B981");
            }
        }
        updateTable();
    });
}

// ═══════════════════════════════════════════════════════════════
// API: FETCH DEVICES FROM WEB PANEL
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::fetchDevicesFromAPI() {
    if(!m_apiEdit) return;
    QString base=m_apiEdit->text().trimmed();
    if(base.isEmpty()) return;
    doLoginThenFetch(base);
}

void SimulatorWindow::doLoginThenFetch(const QString& base) {
    if(!m_nam) return;
    QJsonObject body; body["email"]="admin@fleetcop.com"; body["password"]="Admin@123";
    QNetworkRequest req(QUrl(base+"/api/auth/login"));
    req.setHeader(QNetworkRequest::ContentTypeHeader,"application/json");
    auto* reply=m_nam->post(req,QJsonDocument(body).toJson());
    connect(reply,&QNetworkReply::finished,this,[this,reply,base](){
        reply->deleteLater();
        if(reply->error()!=QNetworkReply::NoError){ appendLog("⚠️ API login failed: "+reply->errorString(),"#F59E0B"); return; }
        QJsonDocument doc=QJsonDocument::fromJson(reply->readAll());
        QString jwt=doc.object()["token"].toString();
        if(jwt.isEmpty()){ appendLog("⚠️ No JWT in login response","#F59E0B"); return; }
        m_jwt=jwt;
        doFetchDevices(base,jwt);
    });
}

void SimulatorWindow::doFetchDevices(const QString& base, const QString& jwt) {
    m_jwt=jwt;
    QNetworkRequest req(QUrl(base+"/api/devices"));
    req.setRawHeader("Authorization",("Bearer "+jwt).toUtf8());
    auto* reply=m_nam->get(req);
    connect(reply,&QNetworkReply::finished,this,[this,reply](){
        reply->deleteLater();
        if(reply->error()!=QNetworkReply::NoError){ appendLog("⚠️ Device fetch failed","#F59E0B"); return; }
        QJsonDocument doc=QJsonDocument::fromJson(reply->readAll());
        QJsonArray arr=doc.array();
        for(const QJsonValue& val:arr){
            QJsonObject o=val.toObject();
            QString imei=o["imei"].toString();
            if(imei.isEmpty()) continue;
            bool exists=std::any_of(m_vehicles.begin(),m_vehicles.end(),[&](const VehicleState& v){return v.imei==imei;});
            if(exists) continue;
            VehicleState v;
            v.id=(int)m_vehicles.size()+1; v.imei=imei;
            v.name=o["name"].toString(imei); v.protocol="GT06N";
            v.gps_proto=0x22;
            v.gps_port=6023;
            v.lat=12.5+QRandomGenerator::global()->generateDouble()*2;
            v.lon=77.0+QRandomGenerator::global()->generateDouble()*2;
            v.targetLat=v.lat; v.targetLon=v.lon;
            if(m_csvLibrary.contains(imei)) applyCsvToVehicle(v,m_csvLibrary[imei]);
            m_vehicles.push_back(v);
        }
        updateTable(); rebuildImeiCombo();
        appendLog(QString("↺ Loaded %1 devices from web panel").arg(arr.size()),"#0EA5E9");
        appendBulkLog(QString("↺ Synced %1 devices from DB (total: %2)").arg(arr.size()).arg(m_vehicles.size()),"#0EA5E9");
    });
}

void SimulatorWindow::rebuildImeiCombo() {
    if(!m_csvImeiCombo) return;
    m_csvImeiCombo->clear();
    m_csvImeiCombo->addItem("-- select IMEI --","");
    for(const auto& v:m_vehicles) m_csvImeiCombo->addItem(v.name+" ("+v.imei+")",v.imei);
    if(m_videoDeviceCombo){
        m_videoDeviceCombo->clear();
        for(const auto& v:m_vehicles) m_videoDeviceCombo->addItem(v.name+" ("+v.imei+")",v.imei);
    }
}

// ═══════════════════════════════════════════════════════════════
// LOG + TRAY
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::appendLog(const QString& msg, const QString& color) {
    if(!m_log) return;
    m_log->append(QString("<span style='color:%1'>%2</span>").arg(color).arg(msg.toHtmlEscaped()));
    auto* sb=m_log->verticalScrollBar(); if(sb) sb->setValue(sb->maximum());
}

void SimulatorWindow::appendBulkLog(const QString& msg, const QString& color) {
    if(!m_bulkLog) return;
    m_bulkLog->append(QString("<span style='color:%1'>%2</span>").arg(color).arg(msg.toHtmlEscaped()));
    auto* sb=m_bulkLog->verticalScrollBar(); if(sb) sb->setValue(sb->maximum());
}

void SimulatorWindow::onTrayActivated(QSystemTrayIcon::ActivationReason r) {
    if(r==QSystemTrayIcon::DoubleClick){show();raise();activateWindow();}
}
