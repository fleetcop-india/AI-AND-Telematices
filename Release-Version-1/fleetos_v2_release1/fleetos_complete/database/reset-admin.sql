-- Run this to reset the admin password to Admin@123
-- sudo -u postgres psql -d fleetos -f database/reset-admin.sql

-- Make sure fleetos user has access
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO fleetos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleetos;

-- Reset or create admin user
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
    status = 'active';

-- Verify
SELECT email, role, status, LEFT(password_hash,16) AS hash_prefix FROM users WHERE email='admin@fleetcop.com';

\echo 'Done — login with: admin@fleetcop.com / Admin@123'
