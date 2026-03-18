#!/usr/bin/env node
'use strict';
/**
 * Fleet OS — High-Scale Concurrent Simulator
 * 1000+ simultaneous TCP device connections
 * Usage: node sim1000.js
 * Commands: gen 1000 → start → panic/overspeed/geofence/cut/restore
 */
const net      = require('net');
const http     = require('http');
const fs       = require('fs');
const readline = require('readline');

const GPS_HOST  = process.env.GPS_HOST   || '127.0.0.1';
const GPS_PORT  = parseInt(process.env.GPS_PORT   || '6001');
const API_BASE  = process.env.API_BASE   || 'http://127.0.0.1:8080';
const BATCH     = parseInt(process.env.BATCH_SIZE || '50');
const INTERVAL  = parseInt(process.env.INTERVAL   || '5000');
const MAX_DEV   = parseInt(process.env.MAX_DEVICES || '1000');

const devices = new Map();
let totalSent = 0, totalFailed = 0, running = false;
let broadcastAlarm = null;

function makeDevice(imei, name, lat, lng, protocol) {
  return { imei, name, lat, lng, speed:0, heading:0, odometer:0,
    protocol:protocol||'JSON_SIM', engineOn:true, immobilised:false,
    csvTrack:[], csvIdx:-1, packetsSent:0 };
}

function moveDevice(d) {
  if (d.immobilised) { d.speed=0; return; }
  if (d.csvIdx >= 0 && d.csvTrack.length) {
    if (d.csvIdx >= d.csvTrack.length) d.csvIdx = 0;
    const pt = d.csvTrack[d.csvIdx++];
    Object.assign(d, { lat:pt.lat, lng:pt.lng, speed:pt.speed, heading:pt.heading });
    return;
  }
  const tgt = 30 + Math.random()*70;
  d.speed += (tgt-d.speed)*0.2 + (Math.random()-0.5)*10;
  d.speed = Math.max(0, Math.min(120, d.speed));
  d.heading = (d.heading + (Math.random()-0.5)*30 + 360) % 360;
  const step = (d.speed/3600)*(INTERVAL/1000)/111;
  d.lat += Math.cos(d.heading*Math.PI/180)*step;
  d.lng += Math.sin(d.heading*Math.PI/180)*step;
  d.odometer += (d.speed*INTERVAL/1000)/3600;
}

function buildPacket(d, alarm) {
  return JSON.stringify({
    imei:d.imei, protocol:'JSON_SIM',
    ts: new Date().toISOString(),
    lat:d.lat, lon:d.lng, speed:d.speed, heading:d.heading,
    odometer:d.odometer, satellites:8, voltage:12.4,
    ignition:d.engineOn, gps_fixed:true,
    alarm: alarm || (d.speed>100?'overspeed':false),
  }) + '\n';
}

function sendPacket(d, alarm) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    const t = setTimeout(()=>{ sock.destroy(); resolve(false); }, 1500);
    sock.connect(GPS_PORT, GPS_HOST, () => {
      sock.write(buildPacket(d, alarm), () => {
        clearTimeout(t); sock.destroy(); resolve(true);
      });
    });
    sock.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

async function tick() {
  if (!running) return;
  const all = [...devices.values()];
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i+BATCH);
    await Promise.all(batch.map(async d => {
      moveDevice(d);
      const ok = await sendPacket(d, broadcastAlarm);
      ok ? (d.packetsSent++, totalSent++) : totalFailed++;
    }));
  }
  broadcastAlarm = null;
  const on = [...devices.values()].filter(d=>d.engineOn).length;
  const im = [...devices.values()].filter(d=>d.immobilised).length;
  process.stdout.write(`\r  🚗 ${devices.size} | ✅ ${on} online | ✂️  ${im} cut | 📡 ${totalSent} pkts sent | ❌ ${totalFailed} fail`);
}

function apiGet(path) {
  return new Promise((res, rej) => {
    const u = new URL(API_BASE+path);
    const req = http.get({hostname:u.hostname,port:u.port||80,path:u.pathname+u.search,timeout:3000}, r => {
      let raw=''; r.on('data',d=>raw+=d);
      r.on('end',()=>{ try{res(JSON.parse(raw));}catch{res(null);} });
    });
    req.on('error', rej);
    req.on('timeout', ()=>{ req.destroy(); rej(new Error('timeout')); });
  });
}

async function pollCommands() {
  for (const [imei, d] of devices) {
    try {
      const cmds = await apiGet(`/api/device-commands/pending/${imei}`);
      if (!cmds || !cmds.length) continue;
      for (const c of cmds) {
        if (c.command==='engine_cut') {
          d.immobilised=true; d.engineOn=false; d.speed=0;
          console.log(`\n  ✂️  ENGINE CUT → ${imei}`);
        } else if (c.command==='engine_restore') {
          d.immobilised=false; d.engineOn=true;
          console.log(`\n  ✅  ENGINE RESTORED → ${imei}`);
        }
      }
    } catch {}
  }
}

function loadDevicesCSV(file) {
  const lines = fs.readFileSync(file,'utf8').split('\n').filter(l=>l.trim());
  const hdrs  = lines[0].split(',').map(h=>h.trim().toLowerCase());
  let n=0;
  for (const line of lines.slice(1)) {
    if (n>=MAX_DEV) break;
    const vals=line.split(',').map(v=>v.trim().replace(/"/g,''));
    const obj={}; hdrs.forEach((h,i)=>{if(vals[i]) obj[h]=vals[i];});
    if (!obj.imei) continue;
    devices.set(obj.imei, makeDevice(obj.imei,obj.name||obj.imei,
      parseFloat(obj.lat||12.9716), parseFloat(obj.lng||77.5946), obj.protocol));
    n++;
  }
  console.log(`\n✅ Loaded ${n} devices from ${file}`);
}

function assignTrackCSV(imei, file) {
  const lines=fs.readFileSync(file,'utf8').split('\n').filter(l=>l.trim());
  const hdrs=lines[0].split(',').map(h=>h.trim().toLowerCase());
  const track=[];
  for (const line of lines.slice(1)) {
    const vals=line.split(',').map(v=>v.trim());
    const obj={}; hdrs.forEach((h,i)=>{if(vals[i]) obj[h]=vals[i];});
    if(obj.lat&&obj.lng) track.push({lat:+obj.lat,lng:+obj.lng,speed:+obj.speed||0,heading:+obj.heading||0});
  }
  const d=devices.get(imei);
  if(d){ d.csvTrack=track; d.csvIdx=0; }
  console.log(`\n✅ Track → ${imei}: ${track.length} pts`);
}

function generateDevices(n) {
  const types=['Car','Truck','Bus','Bike','Auto','MiniTruck'];
  let count=0;
  for(let i=1;i<=n&&count<MAX_DEV;i++,count++){
    const imei=`86492006${String(i).padStart(7,'0')}`;
    const lat=12.5+Math.random()*2.5, lng=77.0+Math.random()*2.0;
    devices.set(imei, makeDevice(imei,`${types[i%types.length]}-${String(i).padStart(4,'0')}`,lat,lng));
  }
  console.log(`\n✅ Generated ${count} devices`);
}

// ── CLI ─────────────────────────────────────────────────────────
console.log('\n  ╔══════════════════════════════════════════════╗');
console.log('  ║  Fleet OS — Concurrent Simulator v2.0       ║');
console.log(`  ║  GPS: ${GPS_HOST}:${GPS_PORT}  API: ${API_BASE.padEnd(22)} ║`);
console.log('  ║  Type "help" for commands                    ║');
console.log('  ╚══════════════════════════════════════════════╝\n');

const rl = readline.createInterface({input:process.stdin,output:process.stdout,prompt:'sim> '});
rl.prompt();

rl.on('line', async line => {
  const [cmd,...args] = line.trim().split(/\s+/);
  switch(cmd) {
    case 'gen':      generateDevices(parseInt(args[0])||100); break;
    case 'load':     if(args[0]) loadDevicesCSV(args[0]); else console.log('Usage: load <file.csv>'); break;
    case 'track':    if(args.length>=2) assignTrackCSV(args[0],args[1]); else console.log('Usage: track <imei> <track.csv>'); break;
    case 'start':
      if(!devices.size){console.log('No devices. Run: gen 100 or load <file>');break;}
      running=true;
      console.log(`\n▶ Running: ${devices.size} devices → ${GPS_HOST}:${GPS_PORT} every ${INTERVAL}ms\n`);
      setInterval(tick, INTERVAL);
      setInterval(pollCommands, 5000);
      break;
    case 'stop':     running=false; console.log('\n⏹ Stopped'); break;
    case 'panic':    broadcastAlarm='panic'; console.log('\n🚨 PANIC queued for next tick'); break;
    case 'overspeed':broadcastAlarm='overspeed'; console.log('\n⚡ OVERSPEED queued'); break;
    case 'geofence': broadcastAlarm='geofence_entry'; console.log('\n🔲 GEOFENCE ENTRY queued'); break;
    case 'cut':
      const dc=devices.get(args[0]);
      if(dc){dc.immobilised=true;dc.engineOn=false;console.log(`\n✂️  ${args[0]} cut`);}
      else console.log('IMEI not found'); break;
    case 'restore':
      const dr=devices.get(args[0]);
      if(dr){dr.immobilised=false;dr.engineOn=true;console.log(`\n✅  ${args[0]} restored`);}
      else console.log('IMEI not found'); break;
    case 'list':
      console.log(`\n  Devices (${devices.size} total):`);
      [...devices].slice(0,20).forEach(([imei,d])=>
        console.log(`  ${imei} | ${d.name.padEnd(16)} | ${d.engineOn?'ON ':'OFF'} | spd:${d.speed.toFixed(0).padStart(3)} | pkts:${d.packetsSent}`));
      if(devices.size>20) console.log(`  ... +${devices.size-20} more`);
      break;
    case 'stats':
      const on=[...devices.values()].filter(d=>d.engineOn).length;
      const im=[...devices.values()].filter(d=>d.immobilised).length;
      console.log(`\n  Total:${devices.size} Online:${on} Cut:${im} Sent:${totalSent} Failed:${totalFailed}`);
      break;
    case 'help':
      console.log(`
  gen <N>              Generate N random devices (Bangalore area)
  load <devices.csv>   Load from CSV: imei,name,lat,lng,protocol
  track <imei> <f.csv> Assign replay track to IMEI: lat,lng,speed,heading
  start                Begin simulation
  stop                 Pause simulation
  panic                Broadcast panic alarm (next tick)
  overspeed            Broadcast overspeed alarm
  geofence             Broadcast geofence entry alarm
  cut <imei>           Immobilise device
  restore <imei>       Restore engine
  list                 Show first 20 devices
  stats                Counters
  help                 This help

  Env vars: GPS_HOST GPS_PORT API_BASE BATCH_SIZE INTERVAL MAX_DEVICES
  Example:  GPS_HOST=192.168.1.10 node sim1000.js
      `);
      break;
    default: if(cmd) console.log(`Unknown: "${cmd}". Type help`);
  }
  rl.prompt();
});
