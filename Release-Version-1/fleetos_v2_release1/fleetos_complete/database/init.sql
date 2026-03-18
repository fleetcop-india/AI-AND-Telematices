-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Fleet OS — PostgreSQL Schema                               ║
-- ║  Run: psql -U fleetos -d fleetos -f database/init.sql       ║
-- ╚══════════════════════════════════════════════════════════════╝



-- Devices
CREATE TABLE IF NOT EXISTS devices (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imei           VARCHAR(20) UNIQUE NOT NULL,
    name           VARCHAR(100),
    protocol       VARCHAR(20) DEFAULT 'JT808',
    equipment_type VARCHAR(30),
    sector         VARCHAR(20) DEFAULT 'GENERAL',
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Drivers
CREATE TABLE IF NOT EXISTS drivers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20),
    licence_number  VARCHAR(50),
    licence_expiry  DATE,
    overall_score   INTEGER DEFAULT 100,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- GPS Positions (with address)
CREATE TABLE IF NOT EXISTS gps_positions (
    id            BIGSERIAL PRIMARY KEY,
    imei          VARCHAR(20) NOT NULL,
    latitude      DOUBLE PRECISION NOT NULL,
    longitude     DOUBLE PRECISION NOT NULL,
    speed         DOUBLE PRECISION DEFAULT 0,
    heading       INTEGER DEFAULT 0,
    altitude      DOUBLE PRECISION DEFAULT 0,
    satellites    INTEGER DEFAULT 0,
    address       TEXT,              -- resolved via Geocoder
    address_short TEXT,              -- short form: "Road, City"
    protocol      VARCHAR(20),
    ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_data      JSONB
);
CREATE INDEX IF NOT EXISTS idx_pos_imei_ts ON gps_positions(imei, ts DESC);

-- GPS Alarms (with address)
CREATE TABLE IF NOT EXISTS gps_alarms (
    id         BIGSERIAL PRIMARY KEY,
    imei       VARCHAR(20) NOT NULL,
    alarm_type VARCHAR(50) NOT NULL,
    severity   VARCHAR(10) DEFAULT 'MEDIUM',
    latitude   DOUBLE PRECISION,
    longitude  DOUBLE PRECISION,
    address    TEXT,                 -- resolved via Geocoder
    data       JSONB,
    ts         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alarms_imei_ts ON gps_alarms(imei, ts DESC);

-- Geofences
CREATE TABLE IF NOT EXISTS geofences (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(100) NOT NULL,
    type           VARCHAR(30) DEFAULT 'GEN_ZONE',
    center_lat     DOUBLE PRECISION,
    center_lon     DOUBLE PRECISION,
    radius_m       DOUBLE PRECISION DEFAULT 500,
    max_speed_kmh  INTEGER DEFAULT 0,
    alert_on_enter BOOLEAN DEFAULT TRUE,
    alert_on_exit  BOOLEAN DEFAULT TRUE,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Geofence Events (with address)
CREATE TABLE IF NOT EXISTS geofence_events (
    id            BIGSERIAL PRIMARY KEY,
    imei          VARCHAR(20) NOT NULL,
    geofence_id   VARCHAR(50),
    geofence_name VARCHAR(100),
    geofence_type VARCHAR(30),
    event         VARCHAR(20),       -- ENTER, EXIT, SPEED_VIOLATION
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,
    address       TEXT,              -- resolved via Geocoder
    ts            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gfe_imei_ts ON geofence_events(imei, ts DESC);

-- Driver Events (with address)
CREATE TABLE IF NOT EXISTS driver_events (
    id           BIGSERIAL PRIMARY KEY,
    imei         VARCHAR(20) NOT NULL,
    event_type   VARCHAR(50) NOT NULL,
    severity     VARCHAR(10) DEFAULT 'MEDIUM',
    score_impact INTEGER DEFAULT 0,
    value        DOUBLE PRECISION,
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    address      TEXT,              -- resolved via Geocoder
    ts           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_de_imei_ts ON driver_events(imei, ts DESC);

-- Maintenance Alerts (with address)
CREATE TABLE IF NOT EXISTS maintenance_alerts (
    id          BIGSERIAL PRIMARY KEY,
    imei        VARCHAR(20) NOT NULL,
    alert_type  VARCHAR(50),
    service     VARCHAR(100),
    odometer_km DOUBLE PRECISION,
    address     TEXT,              -- resolved via Geocoder
    ts          TIMESTAMPTZ DEFAULT NOW()
);

-- Industry Alerts (with address)
CREATE TABLE IF NOT EXISTS industry_alerts (
    id             BIGSERIAL PRIMARY KEY,
    imei           VARCHAR(20) NOT NULL,
    sector         VARCHAR(20),
    alert_type     VARCHAR(50),
    equipment_type VARCHAR(30),
    idle_min       DOUBLE PRECISION,
    latitude       DOUBLE PRECISION,
    longitude      DOUBLE PRECISION,
    address        TEXT,             -- resolved via Geocoder
    ts             TIMESTAMPTZ DEFAULT NOW()
);

-- Geocoder Configuration
CREATE TABLE IF NOT EXISTS geocoder_config (
    id         INTEGER PRIMARY KEY DEFAULT 1,
    provider   VARCHAR(20) DEFAULT 'nominatim',
    api_key    TEXT DEFAULT '',
    enabled    BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO geocoder_config(id, provider, enabled)
    VALUES(1, 'nominatim', true)
    ON CONFLICT(id) DO NOTHING;

-- Seed devices
INSERT INTO devices(imei,name,protocol,sector,equipment_type) VALUES
    ('864920068034001','Truck-MH12EF9012','JSON_SIM','GENERAL','TRUCK'),
    ('864920068034002','Bus-DL3CAF7890','JSON_SIM','GENERAL','BUS'),
    ('864920068034003','Excavator-JCB-01','JSON_SIM','CONSTRUCTION','EXCAVATOR'),
    ('864920068034004','Tractor-MH-01','JSON_SIM','AGRICULTURE','TRACTOR'),
    ('864920068034005','Dumper-01','JSON_SIM','CONSTRUCTION','DUMPER')
ON CONFLICT(imei) DO NOTHING;

-- Seed geofences
INSERT INTO geofences(name,type,center_lat,center_lon,radius_m,alert_on_enter,alert_on_exit) VALUES
    ('Mumbai Depot','GEN_HOME',19.0760,72.8777,300,true,true),
    ('Delhi Hub','GEN_HOME',28.7041,77.1025,300,true,true),
    ('Project Alpha','CON_SITE',12.9716,77.5946,500,true,true),
    ('Danger Zone A','CON_EXCLUSION',12.9750,77.5980,100,true,false),
    ('North Farm Field','AGR_FIELD',12.9800,77.6050,400,false,true),
    ('Speed Zone-01','CON_HAZARD',12.9720,77.5960,200,true,true)
ON CONFLICT DO NOTHING;

\echo 'Fleet OS schema ready.'
