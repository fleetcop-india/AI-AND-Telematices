#!/usr/bin/env node
'use strict';
/**
 * Fleet OS GPS Server — psql-based, no external npm needed
 * TCP :6001  |  Mgmt HTTP :6002
 */
process.on('uncaughtException', e => console.error('[CRASH]', e.message));
process.on('unhandledRejection', e => console.error('[REJECT]', String(e)));

const net  = require('net');
const http = require('http');
const fs   = require('fs');
const { spawn, execSync } = require('child_process');

// ── Config ───────────────────────────────────────────────────────
const CFG = {
  dbHost : process.env.FLEETOS_DB_HOST || '127.0.0.1',
  dbPort : process.env.FLEETOS_DB_PORT || '5432',
  dbName : process.env.FLEETOS_DB_NAME || 'fleetos',
  dbUser : process.env.FLEETOS_DB_USER || 'fleetos',
  dbPass : process.env.FLEETOS_DB_PASS || 'fleetos123',
  tcpPort: parseInt(process.env.GPS_TCP_PORT  || '6001'),
  mgmPort: parseInt(process.env.GPS_MGMT_PORT || '6002'),
};

// ── Find psql binary ─────────────────────────────────────────────
function findPsql() {
  // Try PATH first
  try {
    const p = execSync('which psql', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  // Try common locations
  for (const p of [
    '/usr/bin/psql', '/usr/local/bin/psql',
    '/opt/homebrew/bin/psql', '/usr/lib/postgresql/14/bin/psql',
    '/usr/lib/postgresql/15/bin/psql', '/usr/lib/postgresql/16/bin/psql',
    '/usr/lib/postgresql/12/bin/psql', '/usr/lib/postgresql/13/bin/psql',
  ]) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return null;
}

const PSQL = findPsql();
if (!PSQL) {
  console.error('❌ psql not found. Install: sudo apt install postgresql-client');
  process.exit(1);
}
console.log('[GPS] psql =', PSQL);

// ── psql runner ──────────────────────────────────────────────────
function psqlRun(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(PSQL, [
      '-h', CFG.dbHost, '-p', CFG.dbPort,
      '-U', CFG.dbUser, '-d', CFG.dbName,
      '-t', '-A', '--no-psqlrc', '-c', sql
    ], {
      env: { ...process.env, PGPASSWORD: CFG.dbPass },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '', err = '', done = false;
    const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); fn(); };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish(() => reject(new Error('psql timeout — check DB auth and connectivity')));
    }, 6000);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('error', e => finish(() => reject(new Error('psql spawn: ' + e.message))));
    child.on('close', code => {
      finish(() => {
        if (code !== 0) {
          const msg = (err.trim().split('\n').find(l => /error/i.test(l)) || err.trim().split('\n')[0] || `exit ${code}`).trim();
          return reject(new Error(msg));
        }
        resolve(out.trim());
      });
    });
  });
}

// ── Escape helpers ───────────────────────────────────────────────
function esc(v) { return String(v == null ? '' : v).replace(/'/g, "''"); }
function sq(v)  { return v == null ? 'NULL' : `'${esc(v)}'`; }

// ── Stats ────────────────────────────────────────────────────────
const S = { pkts:0, ok:0, errs:0, skip:0, devices:new Set(), t0:Date.now(), lastErr:null };

// ── Write one position to DB ─────────────────────────────────────
async function writePos(raw) {
  // Extract + validate
  const imei = String(raw.imei || '').trim();
  const lat  = parseFloat(raw.lat  ?? raw.latitude);
  const lon  = parseFloat(raw.lon  ?? raw.longitude);
  const spd  = parseFloat(raw.speed)   || 0;
  const hdg  = Math.round(parseFloat(raw.heading || raw.course) || 0);
  const alt  = parseFloat(raw.altitude)|| 0;
  const sat  = parseInt(raw.satellites || raw.sat) || 0;
  const proto= esc(raw.protocol || 'JSON_SIM');

  if (!imei)           { S.skip++; console.warn('[SKIP] no imei'); return; }
  if (isNaN(lat))      { S.skip++; console.warn(`[SKIP] bad lat="${raw.lat??raw.latitude}" imei=${imei}`); return; }
  if (isNaN(lon))      { S.skip++; console.warn(`[SKIP] bad lon="${raw.lon??raw.longitude}" imei=${imei}`); return; }
  if (!lat && !lon)    { S.skip++; console.warn(`[SKIP] zero coords imei=${imei}`); return; }

  // Timestamp
  let tsVal = 'NOW()';
  if (raw.ts) { const d = new Date(raw.ts); if (!isNaN(d)) tsVal = sq(d.toISOString()); }

  // Build raw_data JSON safely
  const rawJson = esc(JSON.stringify(raw));

  // INSERT
  const sql =
    `INSERT INTO gps_positions` +
    `(imei,latitude,longitude,speed,heading,altitude,satellites,protocol,ts,raw_data)` +
    ` VALUES(${sq(imei)},${lat},${lon},${spd},${hdg},${alt},${sat},${sq(proto)},${tsVal},'${rawJson}'::jsonb)`;

  await psqlRun(sql);
  S.ok++;
  S.devices.add(imei);
  console.log(`[✓] ${imei} | lat=${lat.toFixed(5)} lon=${lon.toFixed(5)} spd=${spd.toFixed(0)} | total=${S.ok}`);

  // Odometer (non-critical)
  if (raw.odometer > 0)
    psqlRun(`UPDATE devices SET odometer=${parseFloat(raw.odometer)} WHERE imei=${sq(imei)}`).catch(()=>{});

  // ── Alarm ──────────────────────────────────────────────────
  const ar = raw.alarm;
  let alarmType = null;
  if (ar === true || ar === 'true' || ar === 1)             alarmType = spd > 80 ? 'OVERSPEED' : 'PANIC';
  else if (typeof ar === 'string' && ar.length > 1 && ar !== 'false') alarmType = ar.toUpperCase();
  if (spd > 100) alarmType = 'OVERSPEED';

  if (alarmType) {
    const sev = spd > 120 ? 'HIGH' : 'MEDIUM';
    await psqlRun(
      `INSERT INTO gps_alarms(imei,alarm_type,severity,latitude,longitude,ts)` +
      ` VALUES(${sq(imei)},${sq(alarmType)},${sq(sev)},${lat},${lon},${tsVal})`
    );
    console.log(`[🚨] ${imei} ALARM=${alarmType} spd=${spd.toFixed(0)}`);
  }
}

// ── GT06N binary ─────────────────────────────────────────────────
function decodeGT06N(buf, imei) {
  if (buf.length < 22) return null;
  let i = 0;
  while (i < buf.length - 1 && !(buf[i] === 0x78 && buf[i+1] === 0x78)) i++;
  if (i >= buf.length - 1 || (buf[i+3] !== 0x12 && buf[i+3] !== 0x22)) return null;
  try {
    const lat = buf.readUInt32BE(i+11) / 1800000;
    const lon = buf.readUInt32BE(i+15) / 1800000;
    const flg = buf.readUInt16BE(i+20);
    if (!(flg & 0x1000) || (!lat && !lon)) return null;
    const yr=2000+buf[i+4], mo=buf[i+5], dy=buf[i+6], hr=buf[i+7], mn=buf[i+8], sc=buf[i+9];
    return { imei, lat, lon, speed: buf[i+19], heading: flg & 0x03FF,
      satellites: buf[i+10] & 0x0F, protocol: 'GT06N',
      ts: `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}T` +
          `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}:${String(sc).padStart(2,'0')}Z` };
  } catch { return null; }
}

// ── AIS140 NMEA ──────────────────────────────────────────────────
function decodeNMEA(line, imei) {
  if (!line.startsWith('$GPRMC')) return null;
  const p = line.split(',');
  if (p.length < 9 || p[2] !== 'A') return null;
  try {
    const rl = parseFloat(p[3]), ll = parseFloat(p[5]);
    return { imei, protocol: 'AIS140', ts: new Date().toISOString(),
      lat: Math.floor(rl/100) + (rl%100)/60,
      lon: Math.floor(ll/100) + (ll%100)/60,
      speed: parseFloat(p[7]) * 1.852, heading: parseFloat(p[8]) || 0 };
  } catch { return null; }
}

// ── TCP handler ───────────────────────────────────────────────────
function handleClient(socket) {
  const addr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log('[+]', addr);
  let partial = '', binBuf = Buffer.alloc(0), imei = null;

  socket.on('data', async data => {
    S.pkts++;

    // GT06N binary
    if (data[0] === 0x78 && data[1] === 0x78) {
      binBuf = Buffer.concat([binBuf, data]);
      // Login packet
      if (data[3] === 0x01 && data.length >= 18) {
        let s = '';
        for (let k = 4; k < 12; k++) { const b = data[k]; s += (b >> 4).toString() + (b & 0xF).toString(); }
        imei = s.slice(0, 15);
        console.log('[GT06N] Login imei=' + imei);
        socket.write(Buffer.from([0x78,0x78,0x05,0x01,0x00,0x01,0x00,0xD9,0x0D,0x0A]));
      }
      if (imei) {
        const g = decodeGT06N(binBuf, imei);
        if (g) await writePos(g).catch(e => { S.errs++; S.lastErr = e.message; console.error('[ERR]', e.message); });
      }
      binBuf = Buffer.alloc(0);
      return;
    }

    // Text protocols
    partial += data.toString('utf8');
    const lines = partial.split('\n');
    partial = lines.pop(); // keep incomplete last line

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r/g, '').trim();
      if (!line) continue;

      // NMEA
      if (line.startsWith('$GPRMC')) {
        const g = decodeNMEA(line, imei);
        if (g) await writePos(g).catch(e => { S.errs++; S.lastErr = e.message; });
        continue;
      }

      // JSON
      if (line[0] === '{') {
        let j;
        try { j = JSON.parse(line); }
        catch (e) { console.warn('[JSON?]', line.slice(0, 80)); continue; }

        if (!j.imei) { console.warn('[NO IMEI]', line.slice(0, 80)); continue; }
        imei = j.imei;

        // Log exactly what we received
        console.log(`[PKT] imei=${j.imei} lat=${j.lat} lon=${j.lon} spd=${j.speed} alarm=${j.alarm} proto=${j.protocol}`);

        await writePos({
          imei:      j.imei,
          lat:       j.lat      ?? j.latitude  ?? null,
          lon:       j.lon      ?? j.longitude ?? null,
          speed:     j.speed    ?? 0,
          heading:   j.heading  ?? j.course ?? 0,
          altitude:  j.altitude ?? 0,
          satellites:j.satellites ?? j.sat ?? 0,
          protocol:  j.protocol ?? 'JSON_SIM',
          ts:        j.ts       ?? null,
          alarm:     j.alarm    ?? false,
          voltage:   j.voltage  ?? 0,
          odometer:  j.odometer ?? 0,
        }).then(() => {
          try { socket.write('{"ack":1}\n'); } catch {}
        }).catch(e => {
          S.errs++; S.lastErr = e.message;
          console.error('[DB ERR]', e.message);
        });
      }
    }
  });

  socket.on('error', e => console.warn('[SOCK]', addr, e.code || e.message));
  socket.on('close', () => console.log('[-]', addr, 'imei=' + (imei || 'none')));
}

// ── Mgmt HTTP ─────────────────────────────────────────────────────
const mgmt = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({
    status: 'RUNNING', psql: PSQL,
    tcp: CFG.tcpPort, mgmt: CFG.mgmPort,
    db: `${CFG.dbUser}@${CFG.dbHost}:${CFG.dbPort}/${CFG.dbName}`,
    packets: S.pkts, written: S.ok, errors: S.errs, skipped: S.skip,
    last_error: S.lastErr, devices: [...S.devices],
    uptime: Math.round((Date.now() - S.t0) / 1000) + 's'
  }, null, 2));
});

// ── Main ──────────────────────────────────────────────────────────
(async () => {
  console.log('\n  ┌─────────────────────────────────────────┐');
  console.log('  │  Fleet OS GPS Server                    │');
  console.log(`  │  TCP  → 0.0.0.0:${CFG.tcpPort}                    │`);
  console.log(`  │  Mgmt → http://localhost:${CFG.mgmPort}           │`);
  console.log(`  │  DB   → ${CFG.dbUser}@${CFG.dbHost}/${CFG.dbName}    │`);
  console.log('  └─────────────────────────────────────────┘\n');

  // DB connectivity test
  try {
    const n = await psqlRun('SELECT COUNT(*) FROM gps_positions');
    console.log(`  ✅ DB OK — gps_positions has ${n} rows`);
  } catch (e) {
    console.error('  ❌ DB SELECT failed:', e.message);
    console.error('  → Run: bash fix-db.sh');
    console.error('  → Or:  sudo -u postgres psql -d fleetos -f database/schema_v2.sql\n');
  }

  // Write test
  try {
    await psqlRun(`INSERT INTO gps_positions(imei,latitude,longitude,speed,protocol,ts) VALUES('_GPS_BOOT_',12.9716,77.5946,0,'BOOT',NOW())`);
    await psqlRun(`DELETE FROM gps_positions WHERE imei='_GPS_BOOT_'`);
    console.log('  ✅ DB write test PASSED\n');
  } catch (e) {
    console.error('  ❌ DB write test FAILED:', e.message);
    console.error('  → Run: sudo -u postgres psql -d fleetos -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO fleetos; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO fleetos;"\n');
  }

  // Start TCP
  const srv = net.createServer(handleClient);
  srv.listen(CFG.tcpPort, '0.0.0.0', () => {
    console.log(`  ✅ GPS server ready — simulator should connect to port ${CFG.tcpPort}\n`);
  });
  srv.on('error', e => {
    if (e.code === 'EADDRINUSE')
      console.error(`  ❌ Port ${CFG.tcpPort} busy — pkill -f gps-server.js`);
    else console.error('[TCP]', e.message);
  });

  // Start mgmt
  mgmt.listen(CFG.mgmPort, '0.0.0.0');
  mgmt.on('error', e => console.warn('[MGMT]', e.message));
})();

process.on('SIGINT',  () => { console.log('\nStopped.'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
