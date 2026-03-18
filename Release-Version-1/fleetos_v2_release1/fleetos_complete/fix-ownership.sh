#!/bin/bash
# Fleet OS — Fix column ownership errors
# Run ONCE as superuser to add new columns to tables owned by postgres
# Usage: sudo -u postgres psql -d fleetos -f fix-ownership.sh
#   OR:  bash fix-ownership.sh  (if postgres allows peer auth)

PGUSER=${PGUSER:-postgres}
PGDB=${PGDB:-fleetos}

echo "  Adding columns to tables owned by postgres..."

sudo -u postgres psql -d $PGDB << 'SQL'
ALTER TABLE devices        ADD COLUMN IF NOT EXISTS engine_hours        DOUBLE PRECISION DEFAULT 0;
ALTER TABLE devices        ADD COLUMN IF NOT EXISTS engine_cut          BOOLEAN DEFAULT FALSE;
ALTER TABLE devices        ADD COLUMN IF NOT EXISTS safe_parking        BOOLEAN DEFAULT FALSE;
ALTER TABLE devices        ADD COLUMN IF NOT EXISTS safe_parking_lat    DOUBLE PRECISION;
ALTER TABLE devices        ADD COLUMN IF NOT EXISTS safe_parking_lng    DOUBLE PRECISION;
ALTER TABLE devices        ADD COLUMN IF NOT EXISTS safe_parking_radius INTEGER DEFAULT 50;

ALTER TABLE gps_positions  ADD COLUMN IF NOT EXISTS ignition   BOOLEAN DEFAULT FALSE;
ALTER TABLE gps_positions  ADD COLUMN IF NOT EXISTS charging   BOOLEAN DEFAULT FALSE;

ALTER TABLE users          ADD COLUMN IF NOT EXISTS notification_level  VARCHAR(10) DEFAULT 'medium';
ALTER TABLE users          ADD COLUMN IF NOT EXISTS firebase_token      TEXT;

ALTER TABLE routes         ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE routes         ADD COLUMN IF NOT EXISTS speed_limit  INTEGER DEFAULT 80;
ALTER TABLE routes         ADD COLUMN IF NOT EXISTS route_type   VARCHAR(30) DEFAULT 'general';
ALTER TABLE routes         ADD COLUMN IF NOT EXISTS distance_km  DOUBLE PRECISION DEFAULT 0;

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO fleetos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleetos;
GRANT USAGE ON SCHEMA public TO fleetos;

SELECT 'fix-ownership complete' AS result;
SQL

echo "  ✅ Done"
