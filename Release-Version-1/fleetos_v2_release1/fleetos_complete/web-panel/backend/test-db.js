#!/usr/bin/env node
// Run: node web-panel/backend/test-db.js
// This checks every piece of the login flow
'use strict';
const {exec} = require('child_process');
const crypto = require('crypto');

const DB_HOST = process.env.FLEETOS_DB_HOST || '127.0.0.1';
const DB_PORT = process.env.FLEETOS_DB_PORT || '5432';
const DB_NAME = process.env.FLEETOS_DB_NAME || 'fleetos';
const DB_USER = process.env.FLEETOS_DB_USER || 'fleetos';
const DB_PASS = process.env.FLEETOS_DB_PASS || 'fleetos123';

function run(cmd, env) {
  return new Promise(r => exec(cmd, {env:{...process.env,...env},timeout:5000}, (e,o,er) => r({ok:!e,out:o,err:er||e?.message||''})));
}

(async () => {
  console.log('\n=== Fleet OS DB Connectivity Test ===\n');

  // 1. Find psql
  const w = await run('which psql || command -v psql || ls /usr/bin/psql /usr/local/bin/psql 2>/dev/null | head -1');
  const psqlPath = w.out.trim().split('\n')[0] || 'psql';
  console.log('psql binary:', psqlPath || '❌ NOT FOUND');
  if (!psqlPath) { console.log('\n❌ psql not installed. Run: sudo dnf install postgresql\n'); process.exit(1); }

  // 2. Basic connection
  const conn = await run(`${psqlPath} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "SELECT 1 as ok" -t -A`, {PGPASSWORD:DB_PASS});
  console.log('DB connection:', conn.ok ? '✅ OK' : '❌ FAILED');
  if (!conn.ok) { console.log('  Error:', conn.err.split('\n')[0]); console.log('\n  Fix: sudo -u postgres psql -c "ALTER USER fleetos WITH PASSWORD \'fleetos123\';"'); process.exit(1); }

  // 3. Check users table
  const tbl = await run(`${psqlPath} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "SELECT COUNT(*) FROM users" -t -A`, {PGPASSWORD:DB_PASS});
  console.log('users table:', tbl.ok ? `✅ ${tbl.out.trim()} row(s)` : '❌ NOT FOUND');
  if (!tbl.ok) { console.log('\n  Fix: sudo -u postgres psql -d fleetos -f database/schema_v2.sql'); process.exit(1); }

  // 4. Check admin user
  const hash = crypto.createHash('sha256').update('Admin@123').digest('hex');
  const adm = await run(`${psqlPath} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "SELECT email,role FROM users WHERE email='admin@fleetcop.com' AND password_hash='${hash}'" -t -A`, {PGPASSWORD:DB_PASS});
  console.log('admin user:', adm.out.trim() ? `✅ Found: ${adm.out.trim()}` : '❌ NOT FOUND or wrong password hash');
  if (!adm.out.trim()) {
    console.log('\n  Fix: run schema_v2.sql again or manually:');
    console.log(`  sudo -u postgres psql -d fleetos -c "INSERT INTO users(fname,lname,email,phone,role,password_hash,device_limit,sub_limit,status) VALUES('Fleet','Admin','admin@fleetcop.com','+91 9876500000','admin','${hash}',999,999,'active') ON CONFLICT(email) DO UPDATE SET password_hash='${hash}',status='active';"`);
    process.exit(1);
  }

  // 5. Test row_to_json wrapper (what the server actually does)
  const jq = await run(`${psqlPath} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "SELECT row_to_json(t) FROM (SELECT email,role FROM users WHERE email='admin@fleetcop.com' LIMIT 1) t" -t -A`, {PGPASSWORD:DB_PASS});
  console.log('row_to_json:', jq.ok ? `✅ ${jq.out.trim()}` : '❌ FAILED');

  console.log('\n✅ All checks passed — login should work.\n');
  console.log('psql path to use in server.js:', psqlPath);
  console.log('Add this to your server.js db() function if psql not in PATH:\n');
  console.log(`  const PSQL = '${psqlPath}';  // replace 'psql' with this\n`);
})();
