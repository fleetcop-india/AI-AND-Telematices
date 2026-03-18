-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Fleet OS v2 — Full Schema                                       ║
-- ║  Run: sudo -u postgres psql -d fleetos -f database/schema_v2.sql ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ── Users ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fname         VARCHAR(50) NOT NULL,
    lname         VARCHAR(50) NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    phone         VARCHAR(20),
    role          VARCHAR(20) NOT NULL DEFAULT 'user'
                  CHECK(role IN ('admin','manager','dealer','operator','user','demo')),
    password_hash VARCHAR(255) NOT NULL,
    manager_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    device_limit  INTEGER     DEFAULT 5,
    sub_limit     INTEGER     DEFAULT 0,
    expiry        DATE,
    last_login    TIMESTAMPTZ,
    status        VARCHAR(20) DEFAULT 'active'
                  CHECK(status IN ('active','inactive','suspended')),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Drivers (must be before devices for FK) ───────────────────────
DROP TABLE IF EXISTS drivers CASCADE;
CREATE TABLE drivers (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fname         VARCHAR(50) NOT NULL,
    lname         VARCHAR(50) NOT NULL,
    phone         VARCHAR(20),
    email         VARCHAR(100),
    lic_number    VARCHAR(50),
    lic_type      VARCHAR(20) DEFAULT 'LMV',
    lic_issue     DATE,
    lic_expiry    DATE,
    assigned_imei VARCHAR(20),
    dss_score     INTEGER     DEFAULT 100,
    notes         TEXT,
    is_active     BOOLEAN     DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Devices ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS devices CASCADE;
CREATE TABLE devices (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    imei               VARCHAR(20) UNIQUE NOT NULL,
    name               VARCHAR(100) NOT NULL,
    protocol           VARCHAR(20) DEFAULT 'GT06N',
    vehicle_type       VARCHAR(30) DEFAULT 'Car',
    sector             VARCHAR(20) DEFAULT 'GENERAL',
    assigned_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
    assigned_driver_id UUID        REFERENCES drivers(id) ON DELETE SET NULL,
    speed_limit        INTEGER     DEFAULT 80,
    fuel_type          VARCHAR(20) DEFAULT 'Diesel',
    odometer           DOUBLE PRECISION DEFAULT 0,
    notes              TEXT,
    is_active          BOOLEAN     DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Routes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(100) NOT NULL,
    waypoints      JSONB       DEFAULT '[]',
    distance_km    DOUBLE PRECISION DEFAULT 0,
    schedule       VARCHAR(100) DEFAULT 'Daily',
    compliance_pct INTEGER     DEFAULT 100,
    is_active      BOOLEAN     DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── GPS Positions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_positions (
    id            BIGSERIAL    PRIMARY KEY,
    imei          VARCHAR(20)  NOT NULL,
    latitude      DOUBLE PRECISION NOT NULL,
    longitude     DOUBLE PRECISION NOT NULL,
    speed         DOUBLE PRECISION DEFAULT 0,
    heading       INTEGER      DEFAULT 0,
    altitude      DOUBLE PRECISION DEFAULT 0,
    satellites    INTEGER      DEFAULT 0,
    address       TEXT,
    address_short TEXT,
    protocol      VARCHAR(20),
    ts            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    raw_data      JSONB
);
CREATE INDEX IF NOT EXISTS idx_pos_imei_ts   ON gps_positions(imei, ts DESC);

-- ── GPS Alarms ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_alarms (
    id         BIGSERIAL    PRIMARY KEY,
    imei       VARCHAR(20)  NOT NULL,
    alarm_type VARCHAR(50)  NOT NULL,
    severity   VARCHAR(10)  DEFAULT 'MEDIUM',
    latitude   DOUBLE PRECISION,
    longitude  DOUBLE PRECISION,
    address    TEXT,
    data       JSONB,
    ts         TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alarms_imei_ts ON gps_alarms(imei, ts DESC);

-- ── Geofences ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofences (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(100) NOT NULL,
    type           VARCHAR(30) DEFAULT 'GEN_ZONE',
    center_lat     DOUBLE PRECISION,
    center_lon     DOUBLE PRECISION,
    radius_m       DOUBLE PRECISION DEFAULT 500,
    max_speed_kmh  INTEGER     DEFAULT 0,
    alert_on_enter BOOLEAN     DEFAULT TRUE,
    alert_on_exit  BOOLEAN     DEFAULT TRUE,
    is_active      BOOLEAN     DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Geofence Events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofence_events (
    id            BIGSERIAL   PRIMARY KEY,
    imei          VARCHAR(20) NOT NULL,
    geofence_id   VARCHAR(50),
    geofence_name VARCHAR(100),
    event         VARCHAR(20),
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,
    address       TEXT,
    ts            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gfe_imei_ts ON geofence_events(imei, ts DESC);

-- ── Driver Events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_events (
    id           BIGSERIAL   PRIMARY KEY,
    imei         VARCHAR(20) NOT NULL,
    event_type   VARCHAR(50) NOT NULL,
    severity     VARCHAR(10) DEFAULT 'MEDIUM',
    score_impact INTEGER     DEFAULT 0,
    value        DOUBLE PRECISION,
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    address      TEXT,
    ts           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_de_imei_ts ON driver_events(imei, ts DESC);

-- ── Maintenance Alerts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_alerts (
    id          BIGSERIAL   PRIMARY KEY,
    imei        VARCHAR(20) NOT NULL,
    alert_type  VARCHAR(50),
    service     VARCHAR(100),
    odometer_km DOUBLE PRECISION,
    address     TEXT,
    ts          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Industry Alerts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS industry_alerts (
    id             BIGSERIAL   PRIMARY KEY,
    imei           VARCHAR(20) NOT NULL,
    sector         VARCHAR(20),
    alert_type     VARCHAR(50),
    equipment_type VARCHAR(30),
    idle_min       DOUBLE PRECISION,
    latitude       DOUBLE PRECISION,
    longitude      DOUBLE PRECISION,
    address        TEXT,
    ts             TIMESTAMPTZ DEFAULT NOW()
);

-- ── Geocoder Config ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geocoder_config (
    id         INTEGER     PRIMARY KEY DEFAULT 1,
    provider   VARCHAR(20) DEFAULT 'nominatim',
    api_key    TEXT        DEFAULT '',
    enabled    BOOLEAN     DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO geocoder_config(id,provider,enabled)
    VALUES(1,'nominatim',true) ON CONFLICT(id) DO NOTHING;

-- ── Audit Log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id         BIGSERIAL    PRIMARY KEY,
    user_email VARCHAR(100),
    action     VARCHAR(50)  NOT NULL,
    resource   VARCHAR(200),
    ip_addr    VARCHAR(50),
    status     VARCHAR(20)  DEFAULT 'success',
    detail     TEXT,
    ts         TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);

-- ══════════════════════════════════════════════════════════════════
-- SEED ADMIN USER
-- Password: Admin@123  (SHA-256)
-- ══════════════════════════════════════════════════════════════════
INSERT INTO users(fname,lname,email,phone,role,password_hash,device_limit,sub_limit,status)
VALUES(
    'Fleet','Admin',
    'admin@fleetcop.com',
    '+91 9876500000',
    'admin',
    'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
    999, 999, 'active'
) ON CONFLICT(email) DO UPDATE SET
    password_hash = 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
    role   = 'admin',
    status = 'active',
    device_limit = 999,
    sub_limit    = 999;


-- ══════════════════════════════════════════════════════════════════
-- GRANT full access to fleetos user on all tables
-- ══════════════════════════════════════════════════════════════════
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO fleetos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleetos;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO fleetos;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fleetos;

\echo 'Fleet OS schema v2 ready. Login: admin@fleetcop.com / Admin@123'
