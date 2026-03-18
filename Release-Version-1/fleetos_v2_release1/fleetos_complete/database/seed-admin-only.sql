-- EMERGENCY FIX: Creates users table + admin account
-- Run: sudo -u postgres psql -d fleetos -f database/seed-admin-only.sql

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    fname         VARCHAR(50)  NOT NULL,
    lname         VARCHAR(50)  NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    phone         VARCHAR(20),
    role          VARCHAR(20)  NOT NULL DEFAULT 'user',
    password_hash VARCHAR(255) NOT NULL,
    manager_id    UUID,
    device_limit  INTEGER  DEFAULT 5,
    sub_limit     INTEGER  DEFAULT 0,
    expiry        DATE,
    last_login    TIMESTAMPTZ,
    status        VARCHAR(20)  DEFAULT 'active',
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Insert or fully reset admin user
INSERT INTO users(fname, lname, email, phone, role, password_hash, device_limit, sub_limit, status)
VALUES(
    'Fleet', 'Admin',
    'admin@fleetcop.com',
    '+91 9876500000',
    'admin',
    'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
    999, 999, 'active'
)
ON CONFLICT(email) DO UPDATE SET
    password_hash = 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
    role   = 'admin',
    status = 'active',
    device_limit = 999,
    sub_limit    = 999;

-- Grant access to fleetos user
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO fleetos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleetos;

-- Confirm
SELECT
    email,
    role,
    status,
    LEFT(password_hash, 16) AS hash_ok
FROM users
WHERE email = 'admin@fleetcop.com';

\echo ''
\echo '========================================='
\echo ' Login: admin@fleetcop.com / Admin@123  '
\echo '========================================='
