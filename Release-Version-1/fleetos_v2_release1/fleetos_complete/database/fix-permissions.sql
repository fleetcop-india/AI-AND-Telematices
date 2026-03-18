-- Run this if lists show empty after schema_v2.sql
-- sudo -u postgres psql -d fleetos -f database/fix-permissions.sql
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO fleetos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleetos;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO fleetos;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fleetos;
\echo 'Permissions fixed for fleetos user'
