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

SimulatorWindow::~SimulatorWindow() {}

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

    // ── Connection bar ────────────────────────────────────────
    auto* connBar = new QHBoxLayout; connBar->setSpacing(6);
    auto* lblHost = new QLabel("GPS Server:");
    m_hostEdit = new QLineEdit("127.0.0.1"); m_hostEdit->setFixedWidth(120);
    m_portSpin = new QSpinBox; m_portSpin->setRange(1,65535); m_portSpin->setValue(6001); m_portSpin->setFixedWidth(75);
    auto* lblInt = new QLabel("Interval:");
    m_intervalSpin = new QSpinBox; m_intervalSpin->setRange(1,60); m_intervalSpin->setValue(5);
    m_intervalSpin->setSuffix(" s"); m_intervalSpin->setFixedWidth(70);
    auto* lblApi = new QLabel("API:");
    m_apiEdit = new QLineEdit("http://127.0.0.1:8080"); m_apiEdit->setFixedWidth(180);
    m_btnRefresh = new QPushButton("↺ Load Devices");
    m_btnRefresh->setStyleSheet("background:#0EA5E9;color:#fff;border-radius:6px;padding:5px 10px;font-weight:600;");
    connect(m_btnRefresh,&QPushButton::clicked,this,[this]{ fetchDevicesFromAPI(); });
    m_btnStart = new QPushButton("▶  Start All"); m_btnStart->setObjectName("btnStart");
    m_btnStop  = new QPushButton("⏹  Stop");      m_btnStop->setObjectName("btnStop");
    connect(m_btnStart,&QPushButton::clicked,this,&SimulatorWindow::onStartAll);
    connect(m_btnStop, &QPushButton::clicked,this,&SimulatorWindow::onStopAll);
    connBar->addWidget(lblHost); connBar->addWidget(m_hostEdit); connBar->addWidget(m_portSpin);
    connBar->addWidget(lblInt);  connBar->addWidget(m_intervalSpin);
    connBar->addWidget(lblApi);  connBar->addWidget(m_apiEdit); connBar->addWidget(m_btnRefresh);
    connBar->addStretch();
    connBar->addWidget(m_btnStart); connBar->addWidget(m_btnStop);
    root->addLayout(connBar);

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
    connect(m_btnAdd,       &QPushButton::clicked,this,&SimulatorWindow::onAddVehicle);
    connect(m_btnRemove,    &QPushButton::clicked,this,&SimulatorWindow::onRemoveVehicle);
    connect(m_btnSelectAll, &QPushButton::clicked,this,&SimulatorWindow::onSelectAll);
    m_protocolCombo = new QComboBox; m_protocolCombo->addItems({"JSON_SIM","GT06N","AIS140"});
    m_protocolCombo->setFixedWidth(110);
    tbRow->addWidget(m_btnAdd); tbRow->addWidget(m_btnRemove); tbRow->addWidget(m_btnSelectAll);
    tbRow->addWidget(new QLabel("Protocol:")); tbRow->addWidget(m_protocolCombo);
    tbRow->addStretch();

    // CSV row
    auto* csvRow = new QHBoxLayout; csvRow->setSpacing(5);
    m_btnLoadCSV = new QPushButton("📂 Load CSV Track");
    m_btnLoadCSV->setStyleSheet("background:#7C3AED;color:#fff;border-radius:6px;padding:5px 10px;font-weight:600;");
    m_csvImeiCombo = new QComboBox; m_csvImeiCombo->setFixedWidth(200); m_csvImeiCombo->setToolTip("Target IMEI for CSV track");
    auto* btnApply = new QPushButton("▶ Apply to IMEI");
    btnApply->setStyleSheet("background:#10B981;color:#fff;border-radius:6px;padding:5px 10px;font-weight:600;");
    m_csvStatusLabel = new QLabel("No CSV loaded"); m_csvStatusLabel->setStyleSheet("color:#94A3B8;font-size:11px;");
    connect(m_btnLoadCSV,&QPushButton::clicked,this,&SimulatorWindow::onLoadCSV);
    connect(btnApply,    &QPushButton::clicked,this,&SimulatorWindow::onCsvAssignImei);
    csvRow->addWidget(m_btnLoadCSV); csvRow->addWidget(new QLabel("→ IMEI:"));
    csvRow->addWidget(m_csvImeiCombo); csvRow->addWidget(btnApply);
    csvRow->addWidget(m_csvStatusLabel); csvRow->addStretch();

    vl->addLayout(tbRow);
    vl->addLayout(csvRow);

    // Splitter: table + right panel
    auto* split = new QSplitter(Qt::Horizontal);

    // Vehicle table
    auto* tblGrp = new QGroupBox("Vehicles  [Double-click row = toggle engine | Select rows = send selected only]");
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
    connect(m_speedSlider,&QSlider::sliderReleased,this,&SimulatorWindow::onSpeedChanged);
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
    connect(btnCut, &QPushButton::clicked, this,[this,cutImei](){
        auto it=std::find_if(m_vehicles.begin(),m_vehicles.end(),[&](const VehicleState& v){return v.imei==cutImei->text();});
        if(it!=m_vehicles.end()){ it->immobilised=true; it->engineOn=false; it->speed=0;
            appendLog("✂️ Engine cut locally: "+cutImei->text(),"#EF4444"); updateTable(); }
    });
    connect(m_speedSlider, &QSlider::sliderReleased, this, [this,cutImei](){
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
    m_btnStart->setEnabled(true); m_btnStop->setEnabled(false);
    appendLog("⏹ Simulation stopped","#EF4444");
    statusBar()->showMessage("  ⏹ STOPPED");
}

// ═══════════════════════════════════════════════════════════════
// MAIN TICK — distributes load across devices
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::onTick() {
    if(!m_running||m_vehicles.empty()) return;

    const int batchSize = m_batchSizeSpin ? m_batchSizeSpin->value() : 50;
    bool anySelected = std::any_of(m_vehicles.begin(),m_vehicles.end(),[](const VehicleState& v){return v.selected;});
    QString alarm = m_broadcastAlarm;
    m_broadcastAlarm.clear();

    // Send in batches of batchSize — open batchSize TCP sockets concurrently per iteration
    for(int start=0;start<(int)m_vehicles.size();start+=batchSize) {
        int end = qMin(start+batchSize,(int)m_vehicles.size());
        for(int i=start;i<end;i++) {
            auto& v=m_vehicles[i];
            bool shouldSend = !anySelected || v.selected;
            if(!shouldSend) continue;
            if(!v.engineOn && !v.immobilised) continue;
            moveVehicle(v);
            QString thisAlarm = alarm;
            if(v.panicActive)     thisAlarm="panic";
            if(v.overspeedActive) thisAlarm="overspeed";
            sendPacket(v, thisAlarm);
            v.packetsSent++;
            m_totalPackets++;
        }
        // Update progress bar during bulk
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
            if(v.csvLoop) v.csvIdx=0;
            else { v.csvIdx=-1; v.speed=0; v.status="idle"; return; }
        }
        const CsvPoint& pt=v.csvTrack[v.csvIdx];
        v.lat=pt.lat; v.lon=pt.lon; v.speed=pt.speed; v.heading=pt.heading;
        v.engineOn=pt.ignition;
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
// PACKET SEND — TCP with configurable protocol
// ═══════════════════════════════════════════════════════════════
void SimulatorWindow::sendPacket(const VehicleState& v, const QString& alarm) {
    QString pkt;
    if(v.protocol=="GT06N")       pkt=buildGT06NPacket(v);
    else if(v.protocol=="AIS140") pkt=buildAIS140Packet(v);
    else                          pkt=buildJSONPacket(v,alarm);

    QTcpSocket sock;
    sock.connectToHost(m_hostEdit->text(),m_portSpin->value());
    if(sock.waitForConnected(300)){
        sock.write(pkt.toUtf8());
        sock.waitForBytesWritten(300);
        sock.disconnectFromHost();
        if(m_vehicles.size()<=20){   // only log when small fleet (avoid spam)
            QString col=v.status=="alarm"?"#DC2626":v.status=="idle"?"#D97706":"#10B981";
            appendLog(QString("[%1] %2 → %3 | %4km/h | %5,%6 | %7")
                .arg(QDateTime::currentDateTime().toString("hh:mm:ss"))
                .arg(v.imei).arg(v.protocol)
                .arg(v.speed,0,'f',0)
                .arg(v.lat,0,'f',5).arg(v.lon,0,'f',5)
                .arg(alarm.isEmpty()?v.status:alarm.toUpper()),col);
        }
    } else {
        m_totalFailed++;
        if(m_vehicles.size()<=20)
            appendLog(QString("[%1] %2 ✗ CONN FAIL").arg(QDateTime::currentDateTime().toString("hh:mm:ss")).arg(v.imei),"#F97316");
    }
}

QString SimulatorWindow::buildJSONPacket(const VehicleState& v, const QString& alarm) {
    QJsonObject o;
    o["imei"]     = v.imei;
    o["protocol"] = "JSON_SIM";
    o["ts"]       = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    o["lat"]      = v.lat;   o["lon"]      = v.lon;
    o["speed"]    = v.speed; o["heading"]  = v.heading;
    o["odometer"] = v.odometer;
    o["engine_hours"] = v.engineHours;
    o["satellites"]   = v.satellites;
    o["voltage"]      = v.voltage;
    o["fuel"]         = v.fuel;
    o["ignition"]     = v.engineOn;
    o["gps_fixed"]    = v.gpsFixed;
    o["immobilised"]  = v.immobilised;
    if(!alarm.isEmpty()) o["alarm"] = alarm;
    else if(v.speed>100) o["alarm"] = "overspeed";
    else                 o["alarm"] = false;
    return QJsonDocument(o).toJson(QJsonDocument::Compact)+"\n";
}

QString SimulatorWindow::buildGT06NPacket(const VehicleState& v) {
    return buildJSONPacket(v,QString());  // GPS server accepts JSON_SIM for all
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
        QString stTxt=v.immobilised?"✂️ CUT":v.engineOn?(v.status=="alarm"?"⚠ ALARM":v.status.toUpper()):"🔴 OFF";
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
    auto* eProt=new QComboBox; eProt->addItems({"JSON_SIM","GT06N","AIS140"});
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
        v.protocol="JSON_SIM";
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
        vs.protocol = iProto>=0&&iProto<v.size()? v[iProto].trimmed(): "JSON_SIM";
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
    if(m_csvTrack.isEmpty()){appendLog("⚠️ Load a CSV file first","#F59E0B");return;}
    QString imei=m_csvImeiCombo->currentData().toString();
    if(imei.isEmpty()){appendLog("⚠️ No vehicle selected","#F59E0B");return;}
    auto it=std::find_if(m_vehicles.begin(),m_vehicles.end(),[&](const VehicleState& v){return v.imei==imei;});
    if(it==m_vehicles.end()){appendLog("⚠️ Vehicle not found: "+imei,"#EF4444");return;}
    applyCsvToVehicle(*it,m_csvTrack);
    appendLog(QString("▶ CSV assigned to %1 [%2] (%3 pts)").arg(it->name).arg(imei).arg(m_csvTrack.size()),"#10B981");
    if(!m_running) onStartAll();
}

QVector<CsvPoint> SimulatorWindow::parseCsvFile(const QString& path) {
    QFile f(path); QVector<CsvPoint> pts;
    if(!f.open(QIODevice::ReadOnly)) return pts;
    QTextStream ts(&f);
    QString hdr=ts.readLine().trimmed().toLower();
    QStringList h=hdr.split(',');
    int iLat=h.indexOf("lat"),iLon=h.indexOf("lon");
    if(iLon<0) iLon=h.indexOf("lng");
    int iSpd=h.indexOf("speed"),iHdg=h.indexOf("heading"),iHdg2=h.indexOf("course"),iIgn=h.indexOf("ignition");
    if(iLat<0||iLon<0) return pts;
    while(!ts.atEnd()){
        QString line=ts.readLine().trimmed(); if(line.isEmpty()) continue;
        QStringList v=line.split(',');
        if(v.size()<=qMax(iLat,iLon)) continue;
        CsvPoint pt;
        pt.lat=v[iLat].toDouble(); pt.lon=v[iLon].toDouble();
        if(pt.lat==0&&pt.lon==0) continue;
        pt.speed   = iSpd>=0&&iSpd<v.size()  ? v[iSpd].toDouble() : 0;
        pt.heading = iHdg>=0&&iHdg<v.size()  ? v[iHdg].toDouble() : (iHdg2>=0&&iHdg2<v.size()?v[iHdg2].toDouble():0);
        pt.ignition= iIgn>=0&&iIgn<v.size()  ? (v[iIgn]!="0"&&v[iIgn].toLower()!="false") : true;
        pts.append(pt);
    }
    return pts;
}

void SimulatorWindow::applyCsvToVehicle(VehicleState& v, const QVector<CsvPoint>& track) {
    v.csvTrack=track; v.csvIdx=0; v.csvLoop=true;
    if(!track.isEmpty()){v.lat=track[0].lat;v.lon=track[0].lon;v.speed=track[0].speed;v.heading=track[0].heading;}
    v.status="online";
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

void SimulatorWindow::onSpeedChanged() {
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
            v.name=o["name"].toString(imei); v.protocol="JSON_SIM";
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
