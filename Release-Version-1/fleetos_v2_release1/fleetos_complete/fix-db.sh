#!/bin/bash
# Fleet OS — Database Setup (v6 — Sprint 1-4 schema)
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  Fleet OS — Database Setup v6            ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

HASH="e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7"

echo "  [1/3] Starting PostgreSQL..."
pg_isready -q 2>/dev/null && echo "  ✅ Already running" || {
    sudo systemctl start postgresql 2>/dev/null || sudo service postgresql start 2>/dev/null \
    || { echo "  ❌ Cannot start PostgreSQL"; exit 1; }; sleep 2; }
pg_isready -h 127.0.0.1 -q && echo "  ✅ Accepting connections" \
    || { echo "  ❌ PostgreSQL not accepting TCP"; exit 1; }

echo "  [2/3] Creating database and user..."
run_pg() {
    psql -h 127.0.0.1 -U postgres -q -c "$1" 2>/dev/null && return 0
    psql -U postgres -q -c "$1" 2>/dev/null && return 0
    sudo -u postgres psql -q -c "$1" 2>/dev/null && return 0
    return 1
}
run_pg "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='fleetos') THEN CREATE USER fleetos WITH PASSWORD 'fleetos123'; END IF; END \$\$;" \
    && echo "  ✅ User fleetos ready" || echo "  ⚠️  Could not create user"
run_pg "ALTER USER fleetos WITH PASSWORD 'fleetos123';" 2>/dev/null || true
run_pg "SELECT 'CREATE DATABASE fleetos OWNER fleetos' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='fleetos')\gexec" 2>/dev/null || true
run_pg "GRANT ALL PRIVILEGES ON DATABASE fleetos TO fleetos;" 2>/dev/null || true

echo "  [3/3] Applying schema..."
PGPASSWORD=fleetos123 psql -h 127.0.0.1 -U fleetos -d fleetos -q << SQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Core tables ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fname VARCHAR(50) NOT NULL DEFAULT 'User', lname VARCHAR(50) NOT NULL DEFAULT 'Name',
  email VARCHAR(100) UNIQUE NOT NULL, phone VARCHAR(20) DEFAULT '',
  role VARCHAR(20) NOT NULL DEFAULT 'user', password_hash VARCHAR(255) NOT NULL,
  manager_id UUID, device_limit INTEGER DEFAULT 5, sub_limit INTEGER DEFAULT 0,
  expiry DATE, last_login TIMESTAMPTZ, status VARCHAR(20) DEFAULT 'active',
  notification_level VARCHAR(10) DEFAULT 'medium',
  firebase_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imei VARCHAR(20) UNIQUE NOT NULL, name VARCHAR(100) NOT NULL DEFAULT 'Device',
  protocol VARCHAR(20) DEFAULT 'GT06N', vehicle_type VARCHAR(30) DEFAULT 'Car',
  sector VARCHAR(50) DEFAULT 'GENERAL', assigned_user_id UUID, assigned_driver_id UUID,
  speed_limit INTEGER DEFAULT 80, fuel_type VARCHAR(20) DEFAULT 'Diesel',
  odometer DOUBLE PRECISION DEFAULT 0, engine_hours DOUBLE PRECISION DEFAULT 0,
  engine_cut BOOLEAN DEFAULT FALSE, notes TEXT,
  is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fname VARCHAR(50) NOT NULL DEFAULT 'Driver', lname VARCHAR(50) NOT NULL DEFAULT 'Name',
  phone VARCHAR(20), email VARCHAR(100), lic_number VARCHAR(30),
  lic_type VARCHAR(20) DEFAULT 'LMV', lic_issue DATE, lic_expiry DATE,
  assigned_imei VARCHAR(20), dss_score INTEGER DEFAULT 75, notes TEXT,
  is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS gps_positions (
  id BIGSERIAL PRIMARY KEY, imei VARCHAR(20) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION DEFAULT 0, heading INTEGER DEFAULT 0,
  altitude DOUBLE PRECISION DEFAULT 0, satellites INTEGER DEFAULT 0,
  ignition BOOLEAN DEFAULT FALSE, charging BOOLEAN DEFAULT FALSE,
  address TEXT, address_short TEXT, protocol VARCHAR(20),
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(), raw_data JSONB);
CREATE INDEX IF NOT EXISTS idx_pos_imei_ts ON gps_positions(imei, ts DESC);

CREATE TABLE IF NOT EXISTS gps_alarms (
  id BIGSERIAL PRIMARY KEY, imei VARCHAR(20) NOT NULL,
  alarm_type VARCHAR(50) NOT NULL, severity VARCHAR(10) DEFAULT 'MEDIUM',
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  address TEXT, data JSONB, ts TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL DEFAULT 'Route',
  waypoints JSONB DEFAULT '[]', distance_km DOUBLE PRECISION DEFAULT 0,
  schedule VARCHAR(100) DEFAULT 'Daily', status VARCHAR(20) DEFAULT 'PLANNED',
  created_at TIMESTAMPTZ DEFAULT NOW());

-- ── Maintenance (real-time, replaces dummy maintenance_alerts) ────
CREATE TABLE IF NOT EXISTS maintenance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), imei VARCHAR(20) NOT NULL,
  alert_type VARCHAR(50), service VARCHAR(100), odometer_km DOUBLE PRECISION,
  address TEXT, ts TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imei VARCHAR(20) NOT NULL,
  task_type VARCHAR(50) NOT NULL DEFAULT 'service',
  title VARCHAR(100) NOT NULL,
  due_odometer DOUBLE PRECISION,
  due_engine_hours DOUBLE PRECISION,
  due_days INTEGER,
  start_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_maint_imei ON maintenance_tasks(imei);

-- ── Geofence ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  shape VARCHAR(10) NOT NULL DEFAULT 'polygon',
  coordinates JSONB NOT NULL DEFAULT '[]',
  assigned_imeis JSONB DEFAULT '[]',
  alert_entry BOOLEAN DEFAULT TRUE,
  alert_exit BOOLEAN DEFAULT TRUE,
  color VARCHAR(10) DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS geofence_events (
  id BIGSERIAL PRIMARY KEY,
  fence_id UUID REFERENCES geofences(id) ON DELETE CASCADE,
  fence_name VARCHAR(100),
  imei VARCHAR(20) NOT NULL,
  event_type VARCHAR(10) NOT NULL,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  ts TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_gfe_imei ON geofence_events(imei, ts DESC);

-- ── Notifications ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  user_level VARCHAR(10) NOT NULL DEFAULT 'beginner',
  enabled BOOLEAN DEFAULT TRUE,
  channel VARCHAR(20) DEFAULT 'in_app',
  UNIQUE(event_type, user_level));

CREATE TABLE IF NOT EXISTS notification_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  imei VARCHAR(20),
  event_type VARCHAR(50),
  title VARCHAR(200),
  body TEXT,
  read BOOLEAN DEFAULT FALSE,
  ts TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_notif_user ON notification_history(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_notif_read ON notification_history(read, ts DESC);

-- ── Device commands (engine cut/restore) ─────────────────────────
CREATE TABLE IF NOT EXISTS device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imei VARCHAR(20) NOT NULL,
  command VARCHAR(30) NOT NULL,
  issued_by VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  ts TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_dcmd_imei ON device_commands(imei, status);

-- ── Audit log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY, user_email VARCHAR(100),
  action VARCHAR(50), resource VARCHAR(50), ip_addr VARCHAR(45),
  status VARCHAR(20) DEFAULT 'OK', detail TEXT, ts TIMESTAMPTZ DEFAULT NOW());

-- ── Safe column additions (idempotent) ───────────────────────────
ALTER TABLE devices ADD COLUMN IF NOT EXISTS engine_hours DOUBLE PRECISION DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS engine_cut BOOLEAN DEFAULT FALSE;
ALTER TABLE gps_positions ADD COLUMN IF NOT EXISTS ignition BOOLEAN DEFAULT FALSE;
ALTER TABLE gps_positions ADD COLUMN IF NOT EXISTS charging BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_level VARCHAR(10) DEFAULT 'medium';
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_token TEXT;

-- ── Grants ───────────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO fleetos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleetos;
GRANT USAGE ON SCHEMA public TO fleetos;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO fleetos;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fleetos;

-- ── Default notification settings ────────────────────────────────
INSERT INTO notification_settings(event_type,user_level,enabled) VALUES
  ('ignition_on',   'beginner', true),('ignition_on',   'medium', true),('ignition_on',   'pro', true),
  ('ignition_off',  'beginner', true),('ignition_off',  'medium', true),('ignition_off',  'pro', true),
  ('charging_off',  'beginner', true),('charging_off',  'medium', true),('charging_off',  'pro', true),
  ('vehicle_added', 'beginner', false),('vehicle_added','medium', true),('vehicle_added', 'pro', true),
  ('vehicle_expired','beginner',false),('vehicle_expired','medium',true),('vehicle_expired','pro',true),
  ('profile_changed','beginner',false),('profile_changed','medium',false),('profile_changed','pro',true),
  ('driver_assigned','beginner',false),('driver_assigned','medium',true),('driver_assigned','pro',true),
  ('driver_changed','beginner',false),('driver_changed','medium',true),('driver_changed','pro',true),
  ('geofence_entry','beginner',false),('geofence_entry','medium',true),('geofence_entry','pro',true),
  ('geofence_exit', 'beginner',false),('geofence_exit', 'medium',true),('geofence_exit', 'pro',true)
ON CONFLICT(event_type,user_level) DO NOTHING;

-- ── Admin user ───────────────────────────────────────────────────
INSERT INTO users(id,fname,lname,email,phone,role,password_hash,device_limit,sub_limit,status)
VALUES('00000000-0000-0000-0000-000000000001','Fleet','Admin','admin@fleetcop.com',
  '+91 9876500000','admin','$HASH',999,999,'active')
ON CONFLICT(email) DO UPDATE SET password_hash='$HASH',role='admin',status='active';

SELECT 'schema_v6_complete' AS result;
SQL

echo ""
echo "  ════════════════════════════════════════════"
echo "  ✅ Fleet OS DB schema v6 applied!"
echo "     node web-panel/backend/server.js"
echo "  Admin: admin@fleetcop.com / Admin@123"
echo "  ════════════════════════════════════════════"
echo ""
