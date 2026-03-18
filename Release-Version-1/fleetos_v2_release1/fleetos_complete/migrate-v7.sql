-- Fleet OS v2.0 — Migration v7
-- Run: sudo -u postgres psql -d fleetos -f migrate-v7.sql

-- Safe parking on devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS safe_parking BOOLEAN DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS safe_parking_lat DOUBLE PRECISION;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS safe_parking_lng DOUBLE PRECISION;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS safe_parking_radius INTEGER DEFAULT 50;

-- Routes enhancements
ALTER TABLE routes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS speed_limit INTEGER DEFAULT 80;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_type VARCHAR(30) DEFAULT 'general';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION DEFAULT 0;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS schedule VARCHAR(100);

-- Route waypoints with owners
CREATE TABLE IF NOT EXISTS route_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL,
  seq_order INTEGER DEFAULT 0,
  name VARCHAR(100) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  owner_name VARCHAR(100),
  owner_phone VARCHAR(20),
  owner_type VARCHAR(30) DEFAULT 'general',
  planned_arrival VARCHAR(10),
  planned_departure VARCHAR(10),
  radius_m INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Route device assignments
CREATE TABLE IF NOT EXISTS route_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL,
  device_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(route_id, device_id)
);

-- Route compliance events + driver scoring
CREATE TABLE IF NOT EXISTS route_events (
  id BIGSERIAL PRIMARY KEY,
  route_id UUID,
  imei VARCHAR(20),
  event_type VARCHAR(30) NOT NULL,
  point_name VARCHAR(100),
  planned_time TIMESTAMPTZ,
  actual_time TIMESTAMPTZ,
  deviation_m DOUBLE PRECISION DEFAULT 0,
  delay_min DOUBLE PRECISION DEFAULT 0,
  notes TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_events_route ON route_events(route_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_route_points_route ON route_points(route_id, seq_order);

-- Grants
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fleetos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleetos;

SELECT 'migration_v7_complete' AS result;
