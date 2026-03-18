// ================================================================
// Fleet OS v2.0 — app.js  (MVVM Architecture)
// Model    : API layer — all server communication
// ViewModel: Page modules — data binding & business logic
// View     : template() functions — pure HTML strings
// ================================================================

'use strict';

// ── Model: state ──────────────────────────────────────────────────
const M = {
  jwt: sessionStorage.getItem('fleetos_jwt') || null,
  role: 'admin',
  user: { fname:'Fleet', lname:'Admin', email:'admin@fleetcop.com' },
  devices: [], users: [], drivers: [], events: [], routes: [],
  maint: [], fences: [], notifs: [],
  dashTimer: null,
  liveMap: null, liveMarkers: {}, mapDevs: [],
  routeMap: null, routePoints: [],
  gfMap: null, gfLayer: null, gfFences: [], gfPendingCoords: null, gfPendingShape: 'polygon',
  uFilter:'all', uSearch:'', dFilter:'all', dSearch:'', drFilter:'all', drSearch:'', evFilter:'all',
};

// ── Model: API ────────────────────────────────────────────────────
const API = {
  _hdr() {
    return { 'Content-Type':'application/json',
             'Authorization': M.jwt ? `Bearer ${M.jwt}` : '' };
  },
  async _fetch(path, opts={}) {
    let res;
    try { res = await fetch('/api'+path, {...opts, headers:this._hdr()}); }
    catch { throw new Error('Server unreachable'); }
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.status === 401) { VM.logout(); return null; }
    if (!res.ok) throw new Error((data&&data.error)||`HTTP ${res.status}`);
    return data;
  },
  get:    (p)    => API._fetch(p),
  post:   (p,b)  => API._fetch(p, {method:'POST',   body:JSON.stringify(b)}),
  put:    (p,b)  => API._fetch(p, {method:'PUT',     body:JSON.stringify(b)}),
  delete: (p)    => API._fetch(p, {method:'DELETE'}),
};

// Legacy shims so old function references still work
const apiGet  = p    => API.get(p);
const apiPost = (p,b)=> API.post(p,b);
const apiPut  = (p,b)=> API.put(p,b);
const apiDel  = p    => API.delete(p);

// ── View: utilities ───────────────────────────────────────────────
const V = {
  $: id => document.getElementById(id),
  set: (id, html) => { const e=document.getElementById(id); if(e) e.innerHTML=html; },
  // colour helpers
  gc(s){ let h=0; for(const c of s) h=(h<<5)-h+c.charCodeAt(0);
    return ['#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#06B6D4','#14B8A6'][Math.abs(h)%8]; },
  ini: s => (s||'?').slice(0,2).toUpperCase(),
  dssColor: s => s>=80?'#059669':s>=60?'#D97706':'#DC2626',
  stColor: { moving:'#22c55e',idle:'#f59e0b',stopped:'#94a3b8',offline:'#ef4444',never_connected:'#cbd5e1' },
  fmtDate: d => d ? new Date(d).toLocaleDateString('en-IN') : '—',
  fmtTs:   d => d ? new Date(d).toLocaleString('en-IN')    : '—',
  badge(text, cls){ return `<span class="badge ${cls}">${text}</span>`; },
  roleBadge(r){
    const m={admin:'badge-red',manager:'badge-amber',dealer:'badge-orange',
             operator:'badge-violet',user:'badge-blue',demo:'badge-green'};
    const i={admin:'👑',manager:'📊',dealer:'🏪',operator:'🎛️',user:'👤',demo:'👁️'};
    return `<span class="badge ${m[r]||'badge-gray'}">${i[r]||''}${r}</span>`;
  },
  stBadge(s){
    const m={online:'badge-green',offline:'badge-gray',idle:'badge-amber',moving:'badge-green',
             stopped:'badge-gray',never_connected:'badge-gray',active:'badge-green',inactive:'badge-gray'};
    const dot = ['online','active','moving'].includes(s) ? '<span class="bdot"></span>' : '';
    return `<span class="badge ${m[s]||'badge-gray'}">${dot}${s||'—'}</span>`;
  },
  loadRow: n => `<tr><td colspan="${n}" style="text-align:center;padding:28px;color:var(--muted)">⏳ Loading…</td></tr>`,
  emptyRow: (n,msg='No data yet') => `<tr><td colspan="${n}" style="text-align:center;padding:28px;color:var(--muted)">${msg}</td></tr>`,
  svgEdit:  ()=>'<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  svgDel:   ()=>'<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  svgEye:   ()=>'<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  svgPlay:  ()=>'<svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
};

// ── ViewModel: Toast ──────────────────────────────────────────────
function toast(msg, type='info', icon='') {
  const t = V.$('toastWrap');
  if (!t) return;
  const d = document.createElement('div');
  d.className = `toast ${type}`;
  d.innerHTML = `${icon?`<span>${icon}</span>`:''}${msg}`;
  t.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

// ── ViewModel: Modal ──────────────────────────────────────────────
function openModal(id)  { const e=V.$(id); if(e){e.style.display='flex'; e.classList.add('open');} }
function closeModal(id) { const e=V.$(id); if(e){e.style.display='none'; e.classList.remove('open');} }
function closeNotif()   { const p=V.$('notifPanel'); if(p) p.style.display='none'; }
function toggleNotif()  { const p=V.$('notifPanel'); if(p) p.style.display=p.style.display==='block'?'none':'block'; }
document.addEventListener('click', e=>{
  const p=V.$('notifPanel');
  if(p&&p.style.display==='block'&&!e.target.closest('.ico-btn')&&!e.target.closest('#notifPanel'))
    p.style.display='none';
});

// ── ViewModel: Confirm dialog ─────────────────────────────────────
let _confirmCb = null;
function confirmAction(title, msg, icon, cb) {
  const root = V.$('modal-root') || document.body;
  let ovl = V.$('confirmOvl');
  if (!ovl) {
    ovl = document.createElement('div');
    ovl.id = 'confirmOvl';
    ovl.className = 'confirm-overlay';
    ovl.innerHTML = `<div class="confirm-card">
      <div class="confirm-ico" id="conf-ico">🗑️</div>
      <div class="confirm-title" id="conf-title">Confirm</div>
      <div class="confirm-msg" id="conf-msg"></div>
      <div class="confirm-btns">
        <button class="btn btn-secondary" onclick="closeConfirm()">Cancel</button>
        <button class="btn btn-danger" onclick="execConfirm()">Confirm</button>
      </div></div>`;
    root.appendChild(ovl);
  }
  V.$('conf-title').textContent = title;
  V.$('conf-msg').textContent   = msg;
  if (icon) V.$('conf-ico').textContent = icon;
  _confirmCb = cb;
  ovl.style.display = 'flex';
  ovl.style.opacity = '1';
  ovl.style.pointerEvents = 'all';
}
function closeConfirm() {
  const o=V.$('confirmOvl'); if(o){o.style.display='none';} _confirmCb=null;
}
function execConfirm() { closeConfirm(); if(_confirmCb) _confirmCb(); }
async function confirmDel(type, id, name) {
  confirmAction('Delete '+type, `Delete "${name}"? This cannot be undone.`, '🗑️', async()=>{
    try {
      await apiDel('/'+type+'s/'+id);
      toast(`${name} deleted`, 'success', '🗑️');
      if(type==='user')   nav('users');
      if(type==='device') nav('devices');
      if(type==='driver') nav('drivers');
    } catch(e) { toast('Error: '+e.message, 'error'); }
  });
}

// ── ViewModel: Utilities ──────────────────────────────────────────
function refreshData() {
  const page = document.querySelector('.page-view.active')?.dataset?.page;
  if (page) nav(page);
}
function selAll(cb, tableId) {
  const t=V.$(tableId); if(!t) return;
  t.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=cb.checked);
}
function setTab(el) {
  el.closest('.tabs-row')?.querySelectorAll('.tab-item').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');
}
function buildPager(pid, iid, total, perPage) {
  const pager=V.$(pid), info=V.$(iid);
  if(!pager) return;
  const pages=Math.ceil(total/perPage)||1;
  if(info) info.textContent=`${Math.min(perPage,total)} of ${total}`;
  pager.innerHTML=Array.from({length:Math.min(pages,5)},(_,i)=>
    `<div class="pg-btn ${i===0?'on':''}">${i+1}</div>`).join('');
}
function exportCSV(tableId, filename) {
  const tbl=V.$(tableId); if(!tbl){toast('No data','warning');return;}
  const rows=[];
  tbl.closest('table').querySelectorAll('tr').forEach(tr=>{
    rows.push(Array.from(tr.querySelectorAll('th,td')).map(c=>'"'+c.innerText.replace(/"/g,'""')+'"').join(','));
  });
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(rows.join('\n'));
  a.download=(filename||'export')+'_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
}
function exportRptCSV(name) {
  const tbl=document.querySelector('#rpt-table')?.closest('table');
  if(!tbl){toast('Generate a report first','warning');return;}
  const rows=[];
  tbl.querySelectorAll('tr').forEach(tr=>{
    rows.push(Array.from(tr.querySelectorAll('th,td')).map(c=>'"'+c.innerText.replace(/"/g,'""')+'"').join(','));
  });
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(rows.join('\n'));
  a.download=(name||'report')+'_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
}
function exportReportPDF(){toast('Use browser Print → Save as PDF','info','🖨️');window.print();}
function ackAll(){
  confirmAction('Acknowledge All','Mark all alarms as acknowledged?','✓',()=>{
    toast('All alarms acknowledged','success','✅');
    setTimeout(()=>nav('events'),300);
  });
}
function downloadTemplate(entity){
  const t={devices:'imei,name,protocol,vehicle_type,speed_limit,fuel_type\n864920068034001,KA01AB1234,GT06N,Car,80,Diesel\n',
           drivers:'fname,lname,phone,email,lic_number,lic_type,lic_expiry\nRajesh,Kumar,+91 9876543210,rajesh@co.com,KA0320190123,LMV,2030-01-01\n',
           users:'fname,lname,email,phone,role,device_limit\nFleet,User,user@company.com,+91 9876543210,user,10\n'};
  const a=document.createElement('a');
  a.href='data:text/csv,'+encodeURIComponent(t[entity]||'');
  a.download=entity+'_template.csv'; a.click();
}
async function bulkImportEntity(entity, input){
  const file=input.files[0]; if(!file) return;
  const text=await file.text();
  const lines=text.split('\n').filter(l=>l.trim());
  if(lines.length<2){toast('Empty file','error');return;}
  const headers=lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
  const rows=lines.slice(1).map(line=>{
    const vals=line.split(',').map(v=>v.trim().replace(/"/g,''));
    const obj={};headers.forEach((h,i)=>{if(vals[i])obj[h]=vals[i];});return obj;
  }).filter(r=>Object.keys(r).length>0);
  try{
    const res=await apiPost('/bulk/'+entity,{rows});
    toast(`Imported ${res.inserted} ${entity}`,'success','📤');
    nav(entity);
  }catch(e){toast('Import error: '+e.message,'error');}
  input.value='';
}

// ── ViewModel: Auth / Role ────────────────────────────────────────
const NAV_ACCESS = {
  admin:   ['dashboard','map','playback','users','devices','drivers','routes','events','maintenance','geofence','reports','notifications','setup','logs','profile'],
  manager: ['dashboard','map','playback','users','devices','drivers','routes','events','maintenance','geofence','reports','notifications','profile'],
  dealer:  ['dashboard','map','playback','users','devices','drivers','events','reports','profile'],
  operator:['dashboard','map','playback','devices','events','reports','profile'],
  user:    ['dashboard','map','playback','devices','profile'],
  demo:    ['dashboard','map','profile'],
};
const PAGE_LABELS = {
  dashboard:'Dashboard',map:'Live Map',playback:'Playback',users:'Users',
  devices:'Devices',drivers:'Drivers',routes:'Routes',events:'Events & Alarms',
  maintenance:'Maintenance',geofence:'Geo-fences',reports:'Reports',
  notifications:'Notifications',setup:'Setup',logs:'Audit Log',profile:'Profile'
};

function VM_applyRole() {
  const allowed = NAV_ACCESS[M.role] || [];
  const sn=V.$('sb-uname'); if(sn) sn.textContent=`${M.user.fname} ${M.user.lname}`;
  const sr=V.$('sb-urole'); if(sr) sr.textContent=`${M.role} · ${M.user.email}`;
  const sa=V.$('sb-ava');   if(sa) sa.textContent=(M.user.fname[0]||'?').toUpperCase();
  ['dashboard','map','playback','users','devices','drivers','routes','events',
   'maintenance','geofence','reports','notifications','setup','logs','profile'].forEach(p=>{
    const el=V.$('nav-'+p); if(el) el.style.display=allowed.includes(p)?'':'none';
  });
  const sys=V.$('sys-sect');
  if(sys) sys.style.display=['admin','manager'].includes(M.role)?'':'none';
}

function VM_logout() {
  M.jwt=null; sessionStorage.removeItem('fleetos_jwt'); location.reload();
}
function doLogout() { VM_logout(); }
function applyRole() { VM_applyRole(); }

// ── ViewModel: Navigation (MVVM core) ────────────────────────────
const Pages = {}; // populated below by each Page module

function nav(page) {
  const allowed = NAV_ACCESS[M.role] || [];
  if (!allowed.includes(page)) { toast('Access denied','error','🚫'); return; }

  // Clear dashboard polling
  if (page !== 'dashboard' && M.dashTimer) { clearInterval(M.dashTimer); M.dashTimer=null; }

  // Update sidebar active state
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('active'));
  const nv=V.$('nav-'+page); if(nv) nv.classList.add('active');

  // Update breadcrumb
  const tb=V.$('tb-section'); if(tb) tb.textContent=PAGE_LABELS[page]||page;
  closeNotif();

  // Render the page
  const root = V.$('page-root');
  if (!root) return;

  // Remove active from previous
  document.querySelectorAll('.page-view').forEach(p=>p.classList.remove('active'));

  // Find or create page container
  let pageEl = V.$('page-'+page);
  if (!pageEl) {
    pageEl = document.createElement('div');
    pageEl.id = 'page-'+page;
    pageEl.className = 'page-view page';
    pageEl.dataset.page = page;
    root.appendChild(pageEl);
  }
  pageEl.classList.add('active');

  // Map/Playback get full height, no padding
  if (page==='map' || page==='playback') {
    pageEl.style.padding='0';
    pageEl.style.height='calc(100vh - 56px)';
    pageEl.style.overflow='hidden';
  } else {
    pageEl.style.padding='';
    pageEl.style.height='';
    pageEl.style.overflow='';
  }

  // Call the Page module render
  const mod = Pages[page];
  if (mod && mod.render) {
    mod.render(pageEl);
  } else {
    pageEl.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted)">Page "${page}" not implemented yet</div>`;
  }
}

// ── ViewModel: Sidebar search forward ────────────────────────────
function globalSearch(v) {
  const page=document.querySelector('.page-view.active')?.dataset?.page;
  const fns={users:'searchU',devices:'searchD',drivers:'searchDrv'};
  const fn=fns[page]; if(fn&&window[fn]) window[fn](v);
  const inp=document.querySelector('.page-view.active .search-field input');
  if(inp&&inp.value!==v) inp.value=v;
}
// ── filter helpers called from HTML strings ───────────────────────


// ================================================================
// PAGE MODULES — each has template() + render()
// ================================================================

// ── Dashboard ─────────────────────────────────────────────────────
Pages.dashboard = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Dashboard</div>
      <div class="page-sub" id="dash-sub">Fleet overview</div>
      <div class="stats-grid sg6" id="dash-stats">
        ${[...Array(6)].map(()=>`<div class="stat-card" style="min-height:100px;background:var(--bg)"></div>`).join('')}
      </div>
      <div class="stats-grid sg2">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">📡 Live Positions</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="nav('map')">View Map</button></div>
          </div>
          <div class="tbl-scroll"><table>
            <thead><tr><th>Device</th><th>Driver</th><th>Speed</th><th>Location</th><th>Status</th><th>Last Seen</th></tr></thead>
            <tbody id="dash-live"><tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">⏳ Loading…</td></tr></tbody>
          </table></div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">🔔 Recent Alerts</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="nav('events')">All Events</button></div>
          </div>
          <div class="timeline" id="dash-alerts"><div style="padding:20px;text-align:center;color:var(--muted)">⏳ Loading…</div></div>
        </div>
      </div>`;
    this._fetch();
    if (M.dashTimer) clearInterval(M.dashTimer);
    M.dashTimer = setInterval(()=>this._fetch(), 15000);
  },
  async _fetch() {
    try {
      const s = await apiGet('/dashboard'); if(!s) return;
      const total=+s.devices?.total||0, moving=+s.devices?.moving||0;
      const drvs=+s.drivers?.total||0, dss=+s.drivers?.avg_dss||0;
      const users=+s.users?.total||0, alarms=+s.alarms?.active||0;
      V.set('dash-sub','Fleet overview · '+new Date().toLocaleString('en-IN'));
      V.set('sb-d-ct', total);
      const stC={moving:'#22c55e',idle:'#f59e0b',stopped:'#64748b',offline:'#ef4444',never_connected:'#94a3b8'};
      V.set('dash-stats',[
        {ico:'🟢',val:moving,lbl:'Moving Now',col:'var(--green)',fn:"nav('map')"},
        {ico:'📡',val:total, lbl:'Total Devices',col:'var(--primary)',fn:"nav('devices')"},
        {ico:'🚗',val:drvs,  lbl:'Active Drivers',col:'var(--primary)',fn:"nav('drivers')"},
        {ico:'👤',val:users, lbl:'Active Users',col:'var(--amber)',fn:"nav('users')"},
        {ico:'🚨',val:alarms,lbl:'Active Alarms',col:'var(--red)',fn:"nav('events')"},
        {ico:'⭐',val:dss||'—',lbl:'Avg DSS Score',col:V.dssColor(dss),fn:"nav('drivers')"},
      ].map(({ico,val,lbl,col,fn})=>`
        <div class="stat-card" style="cursor:pointer" onclick="${fn}">
          <div class="stat-top"><div class="stat-ico">${ico}</div></div>
          <div class="stat-val" style="color:${col}">${val}</div>
          <div class="stat-lbl">${lbl}</div>
          <div class="stat-bar" style="background:${col}"></div>
        </div>`).join(''));
      const live = s.live||[];
      V.set('dash-live', live.length ? live.map(v=>`<tr onclick="nav('map')">
        <td><b>${v.name}</b><div style="font-size:10px;color:var(--muted)">${v.imei}</div></td>
        <td style="font-size:12px">${v.driver_name||'—'}</td>
        <td style="font-weight:700;color:${+v.speed>0?'#22c55e':'var(--muted)'}">${(+v.speed||0).toFixed(0)} km/h</td>
        <td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.address_short||'—'}</td>
        <td><span style="padding:2px 8px;border-radius:99px;background:${(stC[v.status]||'#94a3b8')+'22'};color:${stC[v.status]||'#94a3b8'};font-size:11px;font-weight:700">${(v.status||'offline').toUpperCase()}</span></td>
        <td style="font-size:11px;color:var(--muted)">${V.fmtTs(v.ts)}</td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">No GPS data yet</td></tr>');
      const evs = s.events||[];
      V.set('dash-alerts', evs.length ? evs.map(e=>`
        <div class="tl-item">
          <div class="tl-ico" style="background:var(--red-bg)">⚠️</div>
          <div class="tl-content"><div class="tl-title">${e.alarm_type||'ALARM'} — ${e.device_name||e.imei}</div>
          <div class="tl-sub">${e.address||'—'}</div></div>
          <span class="tl-time">${V.fmtTs(e.ts)}</span>
        </div>`).join('') : '<div style="padding:24px;text-align:center;color:var(--muted)">✅ No recent alerts</div>');
    } catch(e) { console.warn('[dash]',e.message); }
  }
};

// ── Users ─────────────────────────────────────────────────────────
Pages.users = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Users</div>
      <div class="page-sub">Fleet accounts, access levels and sub-account hierarchy</div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">All Users</span>
          <span class="card-sub" id="u-ct-lbl"></span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('users')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import
              <input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('users',this)"></label>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('uTable','users')">⬇ Export</button>
            <button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Add User</button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="fchip ${M.uFilter==='all'?'on':''}" onclick="filterU('all',this)">All</div>
          <div class="fchip ${M.uFilter==='admin'?'on':''}" onclick="filterU('admin',this)">👑 Admin</div>
          <div class="fchip ${M.uFilter==='manager'?'on':''}" onclick="filterU('manager',this)">📊 Manager</div>
          <div class="fchip ${M.uFilter==='dealer'?'on':''}" onclick="filterU('dealer',this)">🏪 Dealer</div>
          <div class="fchip ${M.uFilter==='operator'?'on':''}" onclick="filterU('operator',this)">🎛️ Operator</div>
          <div class="fchip ${M.uFilter==='user'?'on':''}" onclick="filterU('user',this)">👤 User</div>
          <div class="search-field"><svg width="13" height="13" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search name / email…" oninput="searchU(this.value)"></div>
        </div>
        <div class="tbl-scroll"><table>
          <thead><tr><th><input type="checkbox" onclick="selAll(this,'uTable')"></th>
            <th>User</th><th>Phone</th><th>Role</th><th>Manager</th><th>Devices</th><th>Expiry</th><th>Last Login</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody id="uTable">${V.loadRow(10)}</tbody>
        </table></div>
        <div class="pagination"><span id="u-pg-info"></span><div class="pg-btns" id="u-pager"></div></div>
      </div>`;
    this._fetch();
  },
  async _fetch() {
    try {
      M.users = await apiGet('/users') || [];
      V.set('sb-u-ct', M.users.length);
      this._populate();
    } catch(e) { V.set('uTable', V.emptyRow(10,'⚠️ '+e.message)); }
  },
  _populate() {
    let data = M.users.filter(u=>{
      if(M.uFilter!=='all' && u.role!==M.uFilter) return false;
      if(M.uSearch && !`${u.fname} ${u.lname} ${u.email}`.toLowerCase().includes(M.uSearch)) return false;
      return true;
    });
    V.set('u-ct-lbl', data.length+' users');
    if(!data.length){V.set('uTable',V.emptyRow(10,'No users found'));return;}
    V.set('uTable', data.map(u=>`<tr>
      <td><input type="checkbox"></td>
      <td><div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:50%;background:${V.gc(u.email)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">${V.ini(u.fname)}</div>
        <div><div style="font-weight:600">${u.fname} ${u.lname}</div><div style="font-size:11px;color:var(--muted)">${u.email}</div></div>
      </div></td>
      <td class="mono" style="font-size:12px">${u.phone||'—'}</td>
      <td>${V.roleBadge(u.role)}</td>
      <td style="font-size:12px">${u.manager_email||'—'}</td>
      <td>${u.device_count||0}/${u.device_limit||'∞'}</td>
      <td class="mono" style="font-size:11px">${V.fmtDate(u.expiry)||'Unlimited'}</td>
      <td class="mono" style="font-size:11px">${V.fmtTs(u.last_login)||'Never'}</td>
      <td>${V.stBadge(u.status)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn-icon" onclick="viewUser('${u.id}')" title="View">${V.svgEye()}</button>
        <button class="btn-icon edit" onclick="openUserModal('${u.id}')">${V.svgEdit()}</button>
        <button class="btn-icon del" onclick="confirmDel('user','${u.id}','${u.email}')">${V.svgDel()}</button>
      </div></td>
    </tr>`).join(''));
    buildPager('u-pager','u-pg-info',data.length,20);
  }
};

// ── Devices ───────────────────────────────────────────────────────
Pages.devices = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Devices / Objects</div>
      <div class="page-sub">GPS trackers, vehicles and IoT assets</div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">All Devices</span>
          <span class="card-sub" id="d-ct-lbl"></span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('devices')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import
              <input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('devices',this)"></label>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('dTable','devices')">⬇ Export</button>
            <button class="btn btn-primary btn-sm" onclick="openDevModal()">+ Add Device</button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="fchip ${M.dFilter==='all'?'on':''}" onclick="filterD('all',this)">All</div>
          <div class="fchip ${M.dFilter==='online'?'on':''}" onclick="filterD('online',this)">🟢 Online</div>
          <div class="fchip ${M.dFilter==='idle'?'on':''}" onclick="filterD('idle',this)">🟡 Idle</div>
          <div class="fchip ${M.dFilter==='offline'?'on':''}" onclick="filterD('offline',this)">⚫ Offline</div>
          <div class="search-field"><svg width="13" height="13" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search IMEI or name…" oninput="searchD(this.value)"></div>
        </div>
        <div class="tbl-scroll"><table>
          <thead><tr>
            <th style="width:28px"></th><th>Device / IMEI</th><th>Protocol</th><th>Type</th>
            <th>Status</th><th>User</th><th>Driver</th><th>Location</th><th>Speed</th><th>Last Seen</th><th>Actions</th>
          </tr></thead>
          <tbody id="dTable">${V.loadRow(11)}</tbody>
        </table></div>
        <div class="pagination"><span id="d-pg-info"></span><div class="pg-btns" id="d-pager"></div></div>
      </div>`;
    this._fetch();
  },
  async _fetch() {
    try {
      M.devices = await apiGet('/devices') || [];
      V.set('sb-d-ct', M.devices.length);
      this._populate();
    } catch(e) { V.set('dTable', V.emptyRow(11,'⚠️ '+e.message)); }
  },
  _populate() {
    const stC = V.stColor;
    let data = M.devices.filter(d=>{
      if(M.dFilter!=='all'){
        const st=d.status||'offline';
        if(M.dFilter==='online'&&!['moving','idle'].includes(st)) return false;
        if(M.dFilter==='offline'&&!['offline','never_connected'].includes(st)) return false;
        if(!['online','offline'].includes(M.dFilter)&&st!==M.dFilter) return false;
      }
      if(M.dSearch && !`${d.name} ${d.imei}`.toLowerCase().includes(M.dSearch)) return false;
      return true;
    });
    V.set('d-ct-lbl', data.length+' devices');
    if(!data.length){V.set('dTable',V.emptyRow(11,'No devices found'));return;}
    V.set('dTable', data.map(d=>{
      const st=d.status||'offline';
      const col=stC[st]||'#94a3b8';
      const dur=d.state_mins!=null?`${Math.floor(d.state_mins/60)}h ${d.state_mins%60}m`:'';
      return `<tr>
        <td><input type="checkbox"></td>
        <td><div style="font-weight:600">${d.name}</div>
            <div class="mono" style="font-size:10px;color:var(--muted)">${d.imei}</div>
            ${d.engine_cut?'<span style="font-size:10px;color:#dc2626;font-weight:700">✂️ CUT</span>':''}
            ${d.safe_parking?'<span style="font-size:10px;color:#7c3aed;font-weight:700">🔒</span>':''}</td>
        <td><span class="badge badge-gray">${d.protocol||'—'}</span></td>
        <td style="font-size:12px">${d.vehicle_type||'—'}</td>
        <td><span style="padding:2px 8px;border-radius:99px;background:${col}22;color:${col};font-size:11px;font-weight:700">${st.replace(/_/g,' ').toUpperCase()}</span>
            ${dur?`<div style="font-size:10px;color:${col}">${dur}</div>`:''}</td>
        <td style="font-size:12px">${d.user_email||'—'}</td>
        <td style="font-size:12px">${d.driver_name||'—'}</td>
        <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address_short||'No GPS'}</td>
        <td class="mono" style="color:${+d.speed>0?'#22c55e':'var(--muted)'}">${(+d.speed||0).toFixed(0)} km/h</td>
        <td style="font-size:11px;color:var(--muted)">${V.fmtTs(d.last_seen)||'Never'}</td>
        <td><div style="display:flex;gap:3px">
          <button class="btn-icon edit" onclick="openDevModal('${d.id}')">${V.svgEdit()}</button>
          <button class="btn-icon" onclick="openEngineCutModal('${d.imei}','${d.name.replace(/'/g,"\\'")}',${!!d.engine_cut})"
            style="color:${d.engine_cut?'#16a34a':'#dc2626'};font-size:13px">${d.engine_cut?'✅':'✂️'}</button>
          <button class="btn-icon del" onclick="confirmDel('device','${d.id}','${d.name.replace(/'/g,"\\'")}')">${V.svgDel()}</button>
          <button class="btn-icon" onclick="openPlaybackForImei('${d.imei}')" title="Playback">${V.svgPlay()}</button>
        </div></td>
      </tr>`;
    }).join(''));
    buildPager('d-pager','d-pg-info',data.length,20);
  }
};

// ── Drivers ───────────────────────────────────────────────────────
Pages.drivers = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Drivers</div>
      <div class="page-sub">Driver profiles, licenses, DSS scores and device assignments</div>
      <div class="stats-grid sg4" id="drv-stats"></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">All Drivers</span>
          <span class="card-sub" id="dr-ct-lbl"></span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('drivers')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import
              <input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('drivers',this)"></label>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('drTable','drivers')">⬇ Export</button>
            <button class="btn btn-primary btn-sm" onclick="openDrvModal()">+ Add Driver</button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="fchip ${M.drFilter==='all'?'on':''}" onclick="filterDrv('all',this)">All</div>
          <div class="fchip ${M.drFilter==='active'?'on':''}" onclick="filterDrv('active',this)">Active</div>
          <div class="fchip ${M.drFilter==='inactive'?'on':''}" onclick="filterDrv('inactive',this)">Inactive</div>
          <div class="fchip" onclick="filterDrv('risk',this)">⚠ High Risk DSS&lt;60</div>
          <div class="fchip" onclick="filterDrv('expire',this)">⏳ License Expiring</div>
          <div class="search-field"><svg width="13" height="13" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search name or license…" oninput="searchDrv(this.value)"></div>
        </div>
        <div class="tbl-scroll"><table>
          <thead><tr><th><input type="checkbox" onclick="selAll(this,'drTable')"></th>
            <th>Driver</th><th>License</th><th>Type</th><th>Expiry</th><th>Device</th><th>DSS Score</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody id="drTable">${V.loadRow(9)}</tbody>
        </table></div>
        <div class="pagination"><span id="dr-pg-info"></span><div class="pg-btns" id="dr-pager"></div></div>
      </div>`;
    this._fetch();
  },
  async _fetch() {
    try {
      M.drivers = await apiGet('/drivers') || [];
      V.set('sb-dr-ct', M.drivers.length);
      const today=new Date();
      const exp=M.drivers.filter(d=>{const e=new Date(d.lic_expiry);return(e-today)/86400000<90;}).length;
      V.set('drv-stats',`
        <div class="stat-card"><div class="stat-top"><div class="stat-ico">🚗</div></div><div class="stat-val">${M.drivers.length}</div><div class="stat-lbl">Total Drivers</div><div class="stat-bar" style="background:var(--primary)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">✅</div></div><div class="stat-val" style="color:var(--green)">${M.drivers.filter(d=>d.is_active).length}</div><div class="stat-lbl">Active</div><div class="stat-bar" style="background:var(--green)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--amber-bg)">⏳</div></div><div class="stat-val" style="color:var(--amber)">${exp}</div><div class="stat-lbl">License Expiring</div><div class="stat-bar" style="background:var(--amber)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">⚠️</div></div><div class="stat-val" style="color:var(--red)">${M.drivers.filter(d=>(d.dss_score||0)<60).length}</div><div class="stat-lbl">High Risk</div><div class="stat-bar" style="background:var(--red)"></div></div>`);
      this._populate();
    } catch(e) { V.set('drTable', V.emptyRow(9,'⚠️ '+e.message)); }
  },
  _populate() {
    let data = M.drivers.filter(d=>{
      if(M.drFilter==='active'   && !d.is_active) return false;
      if(M.drFilter==='inactive' && d.is_active)  return false;
      if(M.drFilter==='risk'     && (d.dss_score||0)>=60) return false;
      if(M.drFilter==='expire') {
        const e=new Date(d.lic_expiry), days=(e-new Date())/86400000;
        if(days>90 || isNaN(days)) return false;
      }
      if(M.drSearch && !`${d.fname} ${d.lname} ${d.phone||''}`.toLowerCase().includes(M.drSearch)) return false;
      return true;
    });
    V.set('dr-ct-lbl', data.length+' drivers');
    if(!data.length){V.set('drTable',V.emptyRow(9,'No drivers found'));return;}
    const today=new Date();
    V.set('drTable', data.map(d=>{
      const expiry=d.lic_expiry?new Date(d.lic_expiry):null;
      const exDays=expiry?Math.floor((expiry-today)/86400000):null;
      const exCol=exDays!=null?(exDays<0?'color:var(--red)':exDays<90?'color:var(--amber)':''):'';
      const dss=+d.dss_score||0;
      return `<tr>
        <td><input type="checkbox"></td>
        <td><div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:${V.gc(d.fname)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">${V.ini(d.fname)}</div>
          <div><div style="font-weight:600">${d.fname} ${d.lname}</div><div style="font-size:11px;color:var(--muted)">${d.phone||'—'}</div></div>
        </div></td>
        <td class="mono" style="font-size:12px">${d.lic_number||'—'}</td>
        <td><span class="badge badge-gray">${d.lic_type||'LMV'}</span></td>
        <td class="mono" style="font-size:12px;${exCol}">${V.fmtDate(d.lic_expiry)||'—'}${exDays!=null&&exDays<0?' ⚠️':''}</td>
        <td style="font-size:12px">${d.device_name||d.assigned_imei||'Unassigned'}</td>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:var(--border);border-radius:4px;height:6px;overflow:hidden">
            <div style="width:${dss}%;height:100%;background:${V.dssColor(dss)};border-radius:4px"></div>
          </div>
          <span style="font-weight:700;color:${V.dssColor(dss)};min-width:28px">${dss}</span>
        </div></td>
        <td>${V.stBadge(d.is_active?'active':'inactive')}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn-icon edit" onclick="openDrvModal('${d.id}')">${V.svgEdit()}</button>
          <button class="btn-icon del" onclick="confirmDel('driver','${d.id}','${d.fname} ${d.lname}')">${V.svgDel()}</button>
        </div></td>
      </tr>`;
    }).join(''));
    buildPager('dr-pager','dr-pg-info',data.length,20);
  }
};


// ── Events ────────────────────────────────────────────────────────
Pages.events = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Events &amp; Alarms</div>
      <div class="page-sub">Real-time and historical events from all devices</div>
      <div class="stats-grid sg4" id="ev-stats"></div>
      <div class="card">
        <div class="card-header"><span class="card-title">Event Log</span>
          <div class="card-actions">
            <button class="btn btn-amber btn-sm" onclick="ackAll()">✓ Ack All</button>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('evTable','events')">⬇ Export</button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="fchip on" onclick="filterEv('all',this)">All</div>
          <div class="fchip" onclick="filterEv('overspeed',this)">⚡ Overspeed</div>
          <div class="fchip" onclick="filterEv('geofence',this)">📍 Geofence</div>
          <div class="fchip" onclick="filterEv('panic',this)">🚨 Panic</div>
          <div class="fchip" onclick="filterEv('power',this)">🔌 Power</div>
          <div class="fchip" onclick="filterEv('idle',this)">🅿️ Idle</div>
        </div>
        <div class="tbl-scroll"><table>
          <thead><tr><th></th><th>Icon</th><th>Type</th><th>IMEI</th><th>Data</th><th>Location</th><th>Time</th><th>Status</th></tr></thead>
          <tbody id="evTable">${V.loadRow(8)}</tbody>
        </table></div>
      </div>`;
    this._fetch();
  },
  async _fetch() {
    try {
      M.events = await apiGet('/events') || [];
      const spd=M.events.filter(e=>e.type==='overspeed').length;
      const geo=M.events.filter(e=>e.type==='geofence').length;
      const pan=M.events.filter(e=>e.type==='panic').length;
      V.set('ev-stats',`
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">⚡</div></div><div class="stat-val" style="color:var(--red)">${spd}</div><div class="stat-lbl">Overspeed</div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">📍</div></div><div class="stat-val">${geo}</div><div class="stat-lbl">Geofence</div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">🚨</div></div><div class="stat-val" style="color:var(--red)">${pan}</div><div class="stat-lbl">Panic</div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">📊</div></div><div class="stat-val">${M.events.length}</div><div class="stat-lbl">Total</div></div>`);
      V.set('sb-ev-badge', M.events.length);
      this._populate();
    } catch(e) { V.set('evTable', V.emptyRow(8,'⚠️ '+e.message)); }
  },
  _populate() {
    const ico={overspeed:'⚡',geofence:'📍',panic:'🚨',power:'🔋',idle:'😴',maintenance:'🔧'};
    let data = M.evFilter==='all' ? M.events : M.events.filter(e=>e.type===M.evFilter);
    if(!data.length){V.set('evTable',V.emptyRow(8,'No events'));return;}
    V.set('evTable', data.map(e=>`<tr>
      <td><input type="checkbox"></td>
      <td style="font-size:16px">${ico[e.type]||'⚠️'}</td>
      <td><span class="badge badge-red">${(e.type||'ALARM').toUpperCase()}</span></td>
      <td class="mono" style="font-size:12px">${e.imei}</td>
      <td style="font-size:12px">${e.data?JSON.stringify(e.data).slice(0,50):'—'}</td>
      <td style="font-size:12px">${e.address||'—'}</td>
      <td class="mono" style="font-size:11px">${V.fmtTs(e.ts)}</td>
      <td><span class="badge badge-amber">Active</span></td>
    </tr>`).join(''));
  }
};

// ── Routes ────────────────────────────────────────────────────────
Pages.routes = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Routes</div>
      <div class="page-sub">Waypoint chains · Point owners · Timetables · Deviation tracking</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
        <button class="btn btn-primary btn-sm" onclick="openAddRouteModal()">+ New Route</button>
        <span style="margin-left:auto;font-size:12px;color:var(--muted)" id="routes-summary"></span>
      </div>
      <div style="display:flex;gap:14px;height:calc(100vh - 230px);min-height:500px">
        <div style="width:360px;flex-shrink:0;overflow-y:auto" id="routes-list-body">
          <div style="padding:20px;text-align:center;color:var(--muted)">⏳ Loading routes…</div>
        </div>
        <div style="flex:1;border-radius:var(--radius);overflow:hidden;position:relative;border:1px solid var(--border)">
          <div id="route-builder-map" style="width:100%;height:100%"></div>
        </div>
      </div>`;
    if (!M.routeMap) {
      setTimeout(()=>{
        const el2=V.$('route-builder-map'); if(!el2) return;
        M.routeMap=L.map('route-builder-map').setView([12.9716,77.5946],12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(M.routeMap);
      },100);
    } else {
      setTimeout(()=>M.routeMap?.invalidateSize(),200);
    }
    loadRoutesList();
  }
};

// ── Maintenance ───────────────────────────────────────────────────
Pages.maintenance = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Maintenance</div>
      <div class="page-sub">Service tasks — odometer, engine hours &amp; date triggers</div>
      <div class="stats-grid sg4" id="maint-stats"></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">🔧 Maintenance Tasks</span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadMaintTemplate()">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import
              <input type="file" accept=".csv" style="display:none" onchange="bulkImportMaint(this)"></label>
            <button class="btn btn-primary btn-sm" onclick="openAddMaintModal()">+ Add Task</button>
          </div>
        </div>
        <div class="tbl-scroll"><table>
          <thead><tr><th>Vehicle</th><th>Task</th><th>Type</th><th>Due Odo</th><th>Due Hours</th><th>Due Days</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="maintTable">${V.loadRow(8)}</tbody>
        </table></div>
      </div>`;
    this._fetch();
  },
  async _fetch() {
    try {
      M.maint = await apiGet('/maintenance') || [];
      const total=M.maint.length, overdue=M.maint.filter(m=>m.computed_status==='overdue').length;
      const soon=M.maint.filter(m=>m.computed_status==='due_soon').length, done=M.maint.filter(m=>m.status==='done').length;
      V.set('sb-maint-ct', overdue+soon);
      V.set('maint-stats',`
        <div class="stat-card"><div class="stat-top"><div class="stat-ico">📋</div></div><div class="stat-val">${total}</div><div class="stat-lbl">Total Tasks</div><div class="stat-bar" style="background:var(--primary)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">🚨</div></div><div class="stat-val" style="color:var(--red)">${overdue}</div><div class="stat-lbl">Overdue</div><div class="stat-bar" style="background:var(--red)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--amber-bg)">⚠️</div></div><div class="stat-val" style="color:var(--amber)">${soon}</div><div class="stat-lbl">Due Soon</div><div class="stat-bar" style="background:var(--amber)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">✅</div></div><div class="stat-val" style="color:var(--green)">${done}</div><div class="stat-lbl">Completed</div><div class="stat-bar" style="background:var(--green)"></div></div>`);
      const stMap={overdue:'badge-red',due_soon:'badge-amber',ok:'badge-green',done:'badge-blue',pending:'badge-gray'};
      V.set('maintTable', M.maint.length ? M.maint.map(m=>{
        const cs=m.status==='done'?'done':(m.computed_status||m.status||'ok');
        return `<tr>
          <td style="font-weight:600">${m.device_name||m.imei}</td>
          <td>${m.title}</td>
          <td><span class="badge badge-gray" style="text-transform:capitalize">${(m.task_type||'').replace('_',' ')}</span></td>
          <td class="mono" style="font-size:12px">${m.due_odometer?m.due_odometer.toLocaleString()+' km':'—'}</td>
          <td class="mono" style="font-size:12px">${m.due_engine_hours?m.due_engine_hours+' h':'—'}</td>
          <td class="mono" style="font-size:12px">${m.due_days?m.due_days+' days':'—'}</td>
          <td><span class="badge ${stMap[cs]||'badge-gray'}">${cs.replace('_',' ')}</span></td>
          <td><div style="display:flex;gap:4px">
            ${m.status!=='done'?`<button class="btn btn-icon" title="Done" onclick="markMaintDone('${m.id}')">✅</button>`:''}
            <button class="btn btn-icon del" onclick="deleteMaintTask('${m.id}')">${V.svgDel()}</button>
          </div></td>
        </tr>`;
      }).join('') : V.emptyRow(8,'No tasks yet — click + Add Task'));
    } catch(e) { V.set('maintTable', V.emptyRow(8,'⚠️ '+e.message)); }
  }
};

// ── Geofences ─────────────────────────────────────────────────────
Pages.geofence = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Geo-fences</div>
      <div class="page-sub">Draw polygon &amp; circle zones — entry/exit alerts per vehicle</div>
      <div style="display:grid;grid-template-columns:340px 1fr;gap:14px;height:calc(100vh - 200px);min-height:500px">
        <div class="card" style="margin-bottom:0;display:flex;flex-direction:column;overflow:hidden">
          <div class="card-header">
            <span class="card-title">Fence List</span>
            <div class="card-actions">
              <button class="btn btn-secondary btn-sm" onclick="gfDrawMode('polygon')">✏️ Polygon</button>
              <button class="btn btn-secondary btn-sm" onclick="gfDrawMode('circle')">⭕ Circle</button>
            </div>
          </div>
          <div style="padding:8px 12px;border-bottom:1px solid var(--border)">
            <div id="gf-draw-hint" style="font-size:12px;color:var(--muted);padding:6px 10px;background:#f8fafc;border-radius:6px">
              Select ✏️ Polygon or ⭕ Circle above then draw on the map →
            </div>
          </div>
          <div style="flex:1;overflow-y:auto" id="gf-list"><div style="padding:20px;text-align:center;color:var(--muted)">⏳ Loading…</div></div>
        </div>
        <div class="card" style="margin-bottom:0;padding:0;overflow:hidden;position:relative">
          <div id="gf-map" style="width:100%;height:100%;min-height:400px"></div>
        </div>
      </div>`;
    setTimeout(()=>{ _initGfMap(); loadGeofences(); }, 100);
  }
};

// ── Notifications ─────────────────────────────────────────────────
Pages.notifications = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Notification Hub</div>
      <div class="page-sub">Per-user-level alert settings &amp; real-time history</div>
      <div class="stats-grid sg3">
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">📨</div></div><div class="stat-val" id="notif-stat-total">—</div><div class="stat-lbl">Total Notifications</div><div class="stat-bar" style="background:var(--primary)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--amber-bg)">🔔</div></div><div class="stat-val" id="notif-stat-unread" style="color:var(--amber)">—</div><div class="stat-lbl">Unread</div><div class="stat-bar" style="background:var(--amber)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">✅</div></div><div class="stat-val" style="color:var(--green)">7</div><div class="stat-lbl">Event Types</div><div class="stat-bar" style="background:var(--green)"></div></div>
      </div>
      <div class="stats-grid sg2">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">⚙️ Alert Matrix</span>
            <div class="card-actions"><button class="btn btn-primary btn-sm" onclick="saveNotifSettings()">💾 Save</button></div>
          </div>
          <div style="overflow-x:auto">
            <table style="min-width:420px"><thead><tr>
              <th style="text-align:left;padding:10px 14px">Event Type</th>
              <th style="text-align:center">Beginner</th><th style="text-align:center">Medium</th><th style="text-align:center">Pro</th>
            </tr></thead>
            <tbody id="notif-matrix-body"><tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">⏳ Loading…</td></tr></tbody>
            </table>
          </div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">📋 History</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="markNotifsRead()">✓ Mark All Read</button></div>
          </div>
          <div class="tbl-scroll" style="max-height:380px">
            <table><thead><tr><th>Time</th><th>Event</th><th>Device</th><th>Message</th></tr></thead>
            <tbody id="notif-history-body"><tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">⏳ Loading…</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>`;
    this._fetch();
  },
  async _fetch() {
    try {
      const data = await apiGet('/notifications'); if(!data) return;
      const {settings=[],history=[],unread=0}=data;
      V.set('notif-stat-total',history.length);
      V.set('notif-stat-unread',unread);
      const sbct=V.$('sb-notif-ct');if(sbct){sbct.textContent=unread;sbct.style.display=unread>0?'':'none';}
      const LABELS={ignition_on:'🔑 Ignition ON',ignition_off:'🔑 Ignition OFF',charging_off:'🔌 Charging Off',
        vehicle_added:'🚗 Vehicle Added',geofence_entry:'📍 Geofence Entry',geofence_exit:'↩ Geofence Exit',engine_cut:'✂️ Engine Cut'};
      const evTypes=[...new Set(settings.map(s=>s.event_type))];
      const smap={};settings.forEach(s=>{smap[`${s.event_type}_${s.user_level}`]=s.enabled;});
      V.set('notif-matrix-body', evTypes.length ? evTypes.map(ev=>`<tr>
        <td style="padding:8px 14px;font-size:13px">${LABELS[ev]||ev}</td>
        ${['beginner','medium','pro'].map(lvl=>`<td style="text-align:center;padding:8px">
          <input type="checkbox" data-ev="${ev}" data-lvl="${lvl}" ${smap[ev+'_'+lvl]?'checked':''}
            onchange="notifMatrixChange(this)" style="width:16px;height:16px;cursor:pointer">
        </td>`).join('')}
      </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">No settings configured</td></tr>');
      V.set('notif-history-body', history.length ? history.map(h=>`<tr>
        <td class="mono" style="font-size:11px">${V.fmtTs(h.ts)}</td>
        <td><span class="badge badge-blue" style="font-size:10px">${h.event_type||'—'}</span></td>
        <td style="font-size:12px">${h.imei||'—'}</td>
        <td style="font-size:12px">${h.title||h.body||'—'}</td>
      </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">No notifications yet</td></tr>');
    } catch(e) { console.warn('[notif]',e.message); }
  }
};

// ── Reports ───────────────────────────────────────────────────────
Pages.reports = {
  render(el) {
    const today=new Date().toISOString().slice(0,10);
    const week=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    el.innerHTML = `
      <div class="page-title">Reports</div>
      <div class="page-sub">Generate and export fleet analytics</div>
      <div class="card">
        <div class="card-header"><span class="card-title">Report Generator</span></div>
        <div class="mbody">
          <div class="frow">
            <div class="fg"><label class="flabel">Report Type</label>
              <select class="fselect" id="rpt-type">
                <option>Fleet Status</option><option>Position History</option>
                <option>Alarm Report</option><option>Driver Safety Score</option>
                <option>Mileage Report</option><option>Maintenance Log</option>
              </select>
            </div>
            <div class="fg"><label class="flabel">Device</label>
              <select class="fselect" id="rpt-dev"><option>All Devices</option></select>
            </div>
            <div class="fg"><label class="flabel">From Date</label>
              <input class="finput" type="date" id="rpt-from" value="${week}">
            </div>
            <div class="fg"><label class="flabel">To Date</label>
              <input class="finput" type="date" id="rpt-to" value="${today}">
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" onclick="genReport()">▶ Generate</button>
            <button class="btn btn-secondary" onclick="exportRptCSV('report')">⬇ CSV</button>
            <button class="btn btn-danger btn-sm" onclick="exportReportPDF()">⬇ PDF</button>
          </div>
        </div>
      </div>
      <div class="card" id="rpt-card" style="display:none">
        <div class="card-header"><span class="card-title" id="rpt-title">Report</span>
          <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="exportRptCSV('report')">⬇ Export</button></div>
        </div>
        <div class="tbl-scroll"><table>
          <thead><tr id="rpt-head"></tr></thead>
          <tbody id="rpt-table"></tbody>
        </table></div>
      </div>`;
    this._loadDevices();
  },
  async _loadDevices() {
    try {
      const devs=await apiGet('/devices')||[];
      const sel=V.$('rpt-dev'); if(!sel) return;
      sel.innerHTML='<option value="">All Devices</option>'+
        devs.map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');
    } catch{}
  }
};

// ── Audit Log ─────────────────────────────────────────────────────
Pages.logs = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Audit Log</div>
      <div class="page-sub">Login history, CRUD actions, API calls and alarms</div>
      <div class="card">
        <div class="card-header">
          <div class="tabs-row" style="margin-bottom:0">
            <div class="tab-item on" onclick="setTab(this)">All</div>
            <div class="tab-item" onclick="setTab(this)">Login</div>
            <div class="tab-item" onclick="setTab(this)">CRUD</div>
            <div class="tab-item" onclick="setTab(this)">Alarms</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('logTable','audit')">⬇ Export</button>
          </div>
        </div>
        <div class="tbl-scroll"><table>
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody id="logTable">${V.loadRow(7)}</tbody>
        </table></div>
        <div class="pagination"><span id="log-pg-info"></span><div class="pg-btns" id="log-pager"></div></div>
      </div>`;
    this._fetch();
  },
  async _fetch() {
    try {
      const data=await apiGet('/audit')||[];
      const am={LOGIN:'badge-green',LOGIN_FAILED:'badge-red',CREATE:'badge-blue',UPDATE:'badge-amber',DELETE:'badge-red',ENGINE_CUT:'badge-red',ENGINE_RESTORE:'badge-green'};
      V.set('logTable', data.length ? data.map(l=>`<tr>
        <td class="mono" style="font-size:11px">${V.fmtTs(l.ts)}</td>
        <td class="mono" style="font-size:11px">${l.user_email||'—'}</td>
        <td><span class="badge ${am[l.action]||'badge-gray'}">${l.action||'—'}</span></td>
        <td style="font-size:12px">${l.resource||'—'}</td>
        <td class="mono" style="font-size:11px">${l.ip_addr||'—'}</td>
        <td><span class="badge ${l.status==='OK'?'badge-green':'badge-red'}">${l.status||'—'}</span></td>
        <td style="font-size:11px;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.detail||'—'}</td>
      </tr>`).join('') : V.emptyRow(7,'No audit events yet'));
      buildPager('log-pager','log-pg-info',data.length,20);
    } catch(e) { V.set('logTable', V.emptyRow(7,'⚠️ '+e.message)); }
  }
};

// ── Setup ─────────────────────────────────────────────────────────
Pages.setup = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Setup &amp; Configuration</div>
      <div class="page-sub">System settings, access roles and integrations</div>
      <div class="stats-grid sg3">
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">⚙️ Server</span></div><div class="mbody">
          <div class="frow"><div class="fg"><label class="flabel">GPS Server Host</label><input class="finput" value="127.0.0.1"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">GPS Port</label><input class="finput" value="6001"></div><div class="fg"><label class="flabel">Web Port</label><input class="finput" value="8080"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">PostgreSQL DSN</label><input class="finput" value="postgresql://fleetos:fleetos123@127.0.0.1:5432/fleetos"></div></div>
          <button class="btn btn-primary btn-sm" onclick="toast('Config saved','success','⚙️')">Save Config</button>
        </div></div>
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">🔑 API Keys</span></div><div class="mbody">
          <div class="frow"><div class="fg"><label class="flabel">Geocoder</label><select class="fselect"><option>OpenStreetMap (free)</option><option>Google Maps</option><option>MapBox</option></select></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Geocoder API Key</label><input class="finput" type="password" placeholder="blank = OSM"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Firebase Project ID</label><input class="finput" placeholder="your-project-id"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">SMS API Key</label><input class="finput" type="password" placeholder="••••••••"></div></div>
          <button class="btn btn-primary btn-sm" onclick="toast('Keys saved','success','🔑')">Save Keys</button>
        </div></div>
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">🛡️ Access Roles</span></div>
          <div class="timeline">
            <div class="tl-item"><div class="tl-ico" style="background:var(--red-bg)">👑</div><div class="tl-content"><div class="tl-title">Admin</div><div class="tl-sub">Full access</div></div><span class="badge badge-red">Full</span></div>
            <div class="tl-item"><div class="tl-ico" style="background:var(--amber-bg)">📊</div><div class="tl-content"><div class="tl-title">Manager</div><div class="tl-sub">All ops + reports</div></div><span class="badge badge-amber">Ops</span></div>
            <div class="tl-item"><div class="tl-ico" style="background:var(--orange-bg)">🏪</div><div class="tl-content"><div class="tl-title">Dealer</div><div class="tl-sub">Sub-accounts + own devices</div></div><span class="badge badge-orange">Dealer</span></div>
            <div class="tl-item"><div class="tl-ico" style="background:var(--violet-bg)">🎛️</div><div class="tl-content"><div class="tl-title">Operator</div><div class="tl-sub">Assigned devices only</div></div><span class="badge badge-violet">Ops</span></div>
            <div class="tl-item"><div class="tl-ico" style="background:var(--primary-light)">👤</div><div class="tl-content"><div class="tl-title">User</div><div class="tl-sub">Own devices, read-only</div></div><span class="badge badge-blue">Read</span></div>
          </div>
        </div>
      </div>`;
  }
};

// ── Profile ───────────────────────────────────────────────────────
Pages.profile = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">My Profile</div>
      <div class="page-sub">Account settings and security</div>
      <div class="stats-grid sg2">
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">👤 Account</span></div><div class="mbody">
          <div class="frow"><div class="fg"><label class="flabel">First Name</label><input class="finput" id="pf-fname" value="${M.user.fname}"></div><div class="fg"><label class="flabel">Last Name</label><input class="finput" id="pf-lname" value="${M.user.lname}"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Email</label><input class="finput" id="pf-email" type="email" value="${M.user.email}" readonly></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Role</label><input class="finput" value="${M.role}" readonly></div></div>
          <button class="btn btn-primary btn-sm" onclick="toast('Profile updated','success','✅')">Save</button>
        </div></div>
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">🔐 Security</span></div><div class="mbody">
          <div class="frow"><div class="fg"><label class="flabel">Current Password</label><input class="finput" type="password" placeholder="••••••••"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">New Password</label><input class="finput" type="password" placeholder="Min 8 chars"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Confirm</label><input class="finput" type="password" placeholder="Repeat new"></div></div>
          <button class="btn btn-primary btn-sm" onclick="toast('Password changed','success','🔐')">Change Password</button>
          <button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="doLogout()">Sign Out</button>
        </div></div>
      </div>`;
  }
};


// ── Live Map ──────────────────────────────────────────────────────
Pages.map = {
  render(el) {
    if (el.querySelector('#live-map')) {
      setTimeout(()=>M.liveMap?.invalidateSize(),200);
      renderMap(); return;
    }
    el.innerHTML = `
      <style>
        #map-shell{display:flex;height:100%}
        #map-sidebar{width:280px;flex-shrink:0;background:#fff;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;overflow:hidden}
        #map-sidebar-hdr{padding:10px 14px 8px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between}
        #map-sidebar-list{flex:1;overflow-y:auto;padding:4px 0}
        #map-main{flex:1;display:flex;flex-direction:column;min-width:0}
        #map-toolbar{padding:8px 12px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;align-items:center}
        #live-map{flex:1;min-height:0}
        .msv-row{display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;border-bottom:1px solid #f8fafc;transition:background .12s}
        .msv-row:hover{background:#f0f9ff}
        .msv-name{font-size:12.5px;font-weight:600;color:#0f172a}
        .msv-sub{font-size:11px;color:#94a3b8;display:flex;gap:6px;margin-top:2px;flex-wrap:wrap}
        .msv-pill{font-size:10px;padding:1px 6px;border-radius:99px;font-weight:600}
        .pill-moving{background:#dcfce7;color:#16a34a}
        .pill-idle{background:#fef9c3;color:#ca8a04}
        .pill-stopped{background:#f1f5f9;color:#64748b}
        .pill-offline{background:#fee2e2;color:#dc2626}
      </style>
      <div id="map-shell">
        <div id="map-sidebar">
          <div id="map-sidebar-hdr">
            <div style="font-size:13px;font-weight:700">🗺 Live Fleet</div>
            <div id="map-live-count" style="font-size:11px;color:#64748b"></div>
          </div>
          <div style="padding:6px 10px;border-bottom:1px solid #f1f5f9">
            <select class="fselect" id="map-filter-sel" style="width:100%;padding:5px 8px;font-size:11.5px" onchange="applyMapFilter()">
              <option value="all">All Vehicles</option>
              <option value="moving">🟢 Moving</option>
              <option value="idle">🟡 Idle</option>
              <option value="stopped">⚫ Stopped</option>
              <option value="offline">🔴 Offline</option>
            </select>
          </div>
          <div id="map-sidebar-list"></div>
        </div>
        <div id="map-main">
          <div id="map-toolbar">
            <button class="btn btn-secondary btn-sm" onclick="renderMap()">🔄 Refresh</button>
            <button class="btn btn-secondary btn-sm" onclick="fitMapBounds()">⊙ Fit All</button>
            <div style="margin-left:auto;font-size:12px;color:var(--muted)" id="map-last-refresh"></div>
          </div>
          <div id="live-map"></div>
        </div>
      </div>`;
    setTimeout(()=>{ _initLiveMap(()=>renderMap()); }, 150);
  }
};

function _initLiveMap(cb) {
  if (M.liveMap) { if(cb) cb(); return; }
  const el=V.$('live-map'); if(!el) return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if (M.liveMap) { if(cb) cb(); return; }
    M.liveMap = L.map('live-map',{zoomControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {attribution:'© OpenStreetMap',maxZoom:19}).addTo(M.liveMap);
    M.liveMap.setView([20.5937,78.9629],5);
    if(cb) cb();
  }));
}

async function renderMap() {
  try {
    if (!M.liveMap) { _initLiveMap(()=>renderMap()); return; }
    const devs = await apiGet('/live'); if(!devs||!Array.isArray(devs)) return;
    M.mapDevs = devs;
    const withGPS = devs.filter(d=>d.latitude&&d.longitude);
    const current = new Set(devs.map(d=>d.imei));
    Object.keys(M.liveMarkers).forEach(imei=>{
      if(!current.has(imei)){ M.liveMap.removeLayer(M.liveMarkers[imei]); delete M.liveMarkers[imei]; }
    });
    withGPS.forEach(d=>{
      const lat=+d.latitude, lng=+d.longitude;
      const icon = _liveMarkerIcon(d);
      const popup = _buildPopup(d);
      if (M.liveMarkers[d.imei]) {
        M.liveMarkers[d.imei].setLatLng([lat,lng]).setIcon(icon).getPopup().setContent(popup);
      } else {
        M.liveMarkers[d.imei] = L.marker([lat,lng],{icon}).bindPopup(popup).addTo(M.liveMap);
      }
    });
    if(withGPS.length===1) M.liveMap.setView([+withGPS[0].latitude,+withGPS[0].longitude],14);
    else if(!withGPS.length) M.liveMap.setView([20.5937,78.9629],5);
    // Sidebar list
    const listEl=V.$('map-sidebar-list');
    if(listEl) {
      const filter=V.$('map-filter-sel')?.value||'all';
      const filtered=filter==='all'?devs:devs.filter(d=>d.status===filter);
      listEl.innerHTML=filtered.map(d=>{
        const st=d.status||'offline';
        const col={moving:'#22c55e',idle:'#f59e0b',stopped:'#94a3b8',offline:'#ef4444'}[st]||'#94a3b8';
        return `<div class="msv-row" onclick="if(M.liveMap&&${!!d.latitude}){M.liveMap.setView([${d.latitude||20},${d.longitude||78}],15);M.liveMarkers['${d.imei}']?.openPopup();}">
          <div style="width:10px;height:10px;border-radius:50%;background:${col};flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div class="msv-name">${d.name}</div>
            <div class="msv-sub">
              <span class="msv-pill pill-${st}">${st.toUpperCase()}</span>
              <span>${(+d.speed||0).toFixed(0)} km/h</span>
              ${d.driver_name?`<span>👤${d.driver_name.split(' ')[0]}</span>`:''}
            </div>
          </div>
          <button onclick="event.stopPropagation();openPlaybackForImei('${d.imei}')"
            style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--primary)">▶</button>
        </div>`;
      }).join('');
    }
    const ct=V.$('map-live-count'); if(ct) ct.textContent=`${withGPS.length}/${devs.length} GPS`;
    const lr=V.$('map-last-refresh'); if(lr) lr.textContent='Updated '+new Date().toLocaleTimeString('en-IN');
  } catch(e) { console.warn('[map]',e.message); }
}

function _liveMarkerIcon(d) {
  const col={moving:'#22c55e',idle:'#f59e0b',stopped:'#94a3b8',offline:'#ef4444'}[d.status||'offline']||'#94a3b8';
  return L.divIcon({className:'',iconSize:[14,14],iconAnchor:[7,7],popupAnchor:[0,-10],
    html:`<div style="width:14px;height:14px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 0 6px ${col}88"></div>`});
}
function _buildPopup(d) {
  const spd=(+d.speed||0).toFixed(0);
  return `<div style="min-width:190px;font-family:sans-serif">
    <div style="font-weight:800;font-size:13px;margin-bottom:3px">${d.name}</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">${d.imei}</div>
    <div style="font-size:12px"><b>${spd} km/h</b> · ${d.ignition?'🔑 ON':'🔑 OFF'} · 🛰${d.satellites||0}</div>
    ${d.address_short?`<div style="font-size:11px;color:#64748b;margin-top:4px">${d.address_short}</div>`:''}
    ${d.driver_name?`<div style="font-size:11px;margin-top:3px">👤 ${d.driver_name}</div>`:''}
    <div style="display:flex;gap:4px;margin-top:8px">
      <button onclick="openPlaybackForImei('${d.imei}')" style="flex:1;padding:4px;background:#2563eb;color:#fff;border:none;border-radius:5px;font-size:11px;cursor:pointer">▶ Replay</button>
      <button onclick="openEngineCutModal('${d.imei}','${d.name.replace(/'/g,"\\'")}',${!!d.engine_cut})" style="flex:1;padding:4px;background:${d.engine_cut?'#16a34a':'#dc2626'};color:#fff;border:none;border-radius:5px;font-size:11px;cursor:pointer">${d.engine_cut?'✅ Restore':'✂️ Cut'}</button>
    </div>
  </div>`;
}
function applyMapFilter() { renderMap(); }
function fitMapBounds() {
  if(!M.liveMap) return;
  const pts=Object.values(M.liveMarkers).map(m=>m.getLatLng());
  if(pts.length) M.liveMap.fitBounds(L.latLngBounds(pts),{padding:[30,30]});
}

// ── Playback page ─────────────────────────────────────────────────
Pages.playback = {
  render(el) {
    if (el.querySelector('#pb-device')) { this._loadDevices(); return; }
    el.innerHTML = `
      <style>
        #pb-shell{display:flex;height:100%;background:#0f172a}
        #pb-left{width:280px;flex-shrink:0;background:#1e293b;overflow-y:auto;border-right:1px solid rgba(255,255,255,.07)}
        #pb-right{flex:1;display:flex;flex-direction:column;min-width:0}
        #pb-map-wrap{flex:1;position:relative;min-height:0}
        #pb-map{width:100%;height:100%}
        .pb-section{padding:12px 14px 4px;font-size:10px;font-weight:700;letter-spacing:1.2px;color:#475569;text-transform:uppercase}
        .pb-field{padding:0 14px 10px}
        .pb-label{font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:4px}
        .pb-sel,.pb-input{width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#e2e8f0;border-radius:8px;padding:8px 10px;font-size:12.5px;outline:none;box-sizing:border-box}
        .pb-sel:focus,.pb-input:focus{border-color:#3b82f6}
        .pb-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px 10px}
        .pb-load-btn{margin:4px 14px 14px;width:calc(100% - 28px);background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;transition:all .18s}
        .pb-load-btn:hover{opacity:.9;transform:translateY(-1px)}
        .pb-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,.06)}
        .pb-stat-item{background:#1e293b;padding:10px 14px}
        .pb-stat-lbl{font-size:9.5px;font-weight:700;letter-spacing:.8px;color:#475569;text-transform:uppercase}
        .pb-stat-val{font-size:16px;font-weight:800;color:#f1f5f9;margin-top:2px;font-family:monospace}
        #pb-ctrl-bar{background:#1e293b;border-top:1px solid rgba(255,255,255,.07);padding:10px 16px;flex-shrink:0}
        .pb-ctrl-row{display:flex;align-items:center;gap:8px}
        .pb-cbtn{width:36px;height:36px;border-radius:9px;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .15s;flex-shrink:0}
        .pb-cbtn:hover{border-color:#3b82f6;color:#3b82f6}
        .pb-cbtn.active{background:#2563eb;border-color:#2563eb;color:#fff}
        .pb-spd-row{display:flex;gap:3px}
        .pb-spdbtn{padding:5px 9px;border-radius:6px;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#64748b;font-size:11px;font-weight:700;cursor:pointer;font-family:monospace;transition:all .15s}
        .pb-spdbtn.on{background:#2563eb;border-color:#2563eb;color:#fff}
        .pb-tl-wrap{flex:1;position:relative;cursor:pointer;margin:0 8px}
        .pb-tl-bg{height:6px;background:rgba(255,255,255,.08);border-radius:3px;position:relative;overflow:hidden}
        .pb-tl-fill{height:100%;background:linear-gradient(90deg,#2563eb,#7c3aed);border-radius:3px;width:0%}
        .pb-tl-thumb{position:absolute;top:50%;width:14px;height:14px;background:#fff;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 0 3px #2563eb;left:0%}
        .pb-ts-badge{background:#0f172a;border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:5px 10px;font-size:12px;font-weight:700;color:#e2e8f0;font-family:monospace;white-space:nowrap;flex-shrink:0}
        #pb-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#334155;pointer-events:none}
      </style>
      <div id="pb-shell">
        <div id="pb-left">
          <div class="pb-section">Device</div>
          <div class="pb-field">
            <div class="pb-label">Select Device</div>
            <select class="pb-sel" id="pb-device" onchange="loadPBDates(this.value)">
              <option value="">— Select device —</option>
            </select>
          </div>
          <div class="pb-section">Date &amp; Time</div>
          <div class="pb-field">
            <div class="pb-label">Date</div>
            <input class="pb-input" type="date" id="pb-date" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="pb-row2">
            <div><div class="pb-label">From</div><input class="pb-input" type="time" id="pb-from" value="00:00"></div>
            <div><div class="pb-label">To</div><input class="pb-input" type="time" id="pb-to" value="23:59"></div>
          </div>
          <button class="pb-load-btn" onclick="loadPB()">⬇ Load Track</button>
          <div class="pb-section">Statistics</div>
          <div class="pb-stats-grid">
            <div class="pb-stat-item"><div class="pb-stat-lbl">Distance</div><div class="pb-stat-val" id="pb-dist">—</div></div>
            <div class="pb-stat-item"><div class="pb-stat-lbl">Duration</div><div class="pb-stat-val" id="pb-dur">—</div></div>
            <div class="pb-stat-item"><div class="pb-stat-lbl">Max Speed</div><div class="pb-stat-val" id="pb-max">—</div></div>
            <div class="pb-stat-item"><div class="pb-stat-lbl">Avg Speed</div><div class="pb-stat-val" id="pb-avg">—</div></div>
            <div class="pb-stat-item"><div class="pb-stat-lbl">Stops</div><div class="pb-stat-val" id="pb-stops">—</div></div>
            <div class="pb-stat-item"><div class="pb-stat-lbl">Points</div><div class="pb-stat-val" id="pb-pts">—</div></div>
          </div>
        </div>
        <div id="pb-right">
          <div id="pb-map-wrap">
            <div id="pb-map"></div>
            <div id="pb-empty"><div style="font-size:40px;margin-bottom:12px;opacity:.3">🗺</div><p style="font-size:14px;font-weight:600">Select device and load a track</p></div>
          </div>
          <div id="pb-ctrl-bar">
            <div class="pb-ctrl-row">
              <button class="pb-cbtn" onclick="pbRestart()">⏮</button>
              <button class="pb-cbtn" onclick="pbStep(-10)">⏪</button>
              <button class="pb-cbtn" id="pb-playbtn" onclick="pbToggle()" style="width:42px;height:42px;font-size:18px">▶</button>
              <button class="pb-cbtn" onclick="pbStep(10)">⏩</button>
              <button class="pb-cbtn" onclick="pbGoEnd()">⏭</button>
              <div class="pb-spd-row">
                <div class="pb-spdbtn on" onclick="pbSpd(1,this)">1×</div>
                <div class="pb-spdbtn" onclick="pbSpd(2,this)">2×</div>
                <div class="pb-spdbtn" onclick="pbSpd(5,this)">5×</div>
                <div class="pb-spdbtn" onclick="pbSpd(10,this)">10×</div>
                <div class="pb-spdbtn" onclick="pbSpd(30,this)">30×</div>
              </div>
              <div class="pb-tl-wrap">
                <div class="pb-tl-bg"><div class="pb-tl-fill" id="pb-prog"></div></div>
                <div class="pb-tl-thumb" id="pb-thumb"></div>
              </div>
              <div class="pb-ts-badge" id="pb-ts">--:--:--</div>
            </div>
          </div>
        </div>
      </div>`;
    this._loadDevices();
    this._initMap();
  },
  async _loadDevices() {
    try {
      const devs=await apiGet('/devices')||[];
      const sel=V.$('pb-device'); if(!sel) return;
      sel.innerHTML='<option value="">— Select device —</option>'+
        devs.map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');
    } catch(e){console.warn('[pb]',e.message);}
  },
  _pbMap: null, _track: [], _pos: 0, _playing: false, _timer: null, _speed: 1,
  _initMap() {
    setTimeout(()=>{
      const el=V.$('pb-map'); if(!el||this._pbMap) return;
      this._pbMap=L.map('pb-map').setView([20.5937,78.9629],5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(this._pbMap);
      Pages.playback._pbMap=this._pbMap;
    },200);
  }
};

async function loadPBDates(imei) {
  if(!imei) return;
  const dateInput=V.$('pb-date'); if(!dateInput) return;
  try {
    const dates=await apiGet('/playback-dates/'+imei);
    if(Array.isArray(dates)&&dates.length) dateInput.value=dates[0];
  } catch{}
}

async function loadPB() {
  const imei=V.$('pb-device')?.value;
  if(!imei){toast('Select a device first','warning','⚠️');return;}
  const date=V.$('pb-date')?.value||new Date().toISOString().slice(0,10);
  const from=V.$('pb-from')?.value||'00:00';
  const to=V.$('pb-to')?.value||'23:59';
  toast('Loading track…','info','⏳');
  try {
    const pts=await apiGet(`/playback/${imei}?date=${date}&from=${from}&to=${to}`);
    if(!pts||!pts.length){toast('No GPS data for selected time range','warning','⚠️');return;}
    const pb=Pages.playback;
    pb._track=pts; pb._pos=0; pb._playing=false;
    if(pb._timer){clearInterval(pb._timer);pb._timer=null;}
    // Show on map
    const pm=pb._pbMap;
    if(!pm){toast('Map not ready','warning');return;}
    pm.eachLayer(l=>{if(l instanceof L.Polyline||l instanceof L.Marker)pm.removeLayer(l);});
    const lls=pts.map(p=>[+p.latitude,+p.longitude]);
    L.polyline(lls,{color:'#3b82f6',weight:4,opacity:.8}).addTo(pm);
    if(lls.length>0){
      L.marker(lls[0],{icon:L.divIcon({className:'',iconSize:[12,12],iconAnchor:[6,6],html:'<div style="width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff"></div>'})}).addTo(pm);
      L.marker(lls[lls.length-1],{icon:L.divIcon({className:'',iconSize:[12,12],iconAnchor:[6,6],html:'<div style="width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid #fff"></div>'})}).addTo(pm);
      pm.fitBounds(L.polyline(lls).getBounds(),{padding:[30,30]});
    }
    // Stats
    V.set('pb-pts',pts.length);
    const maxSpd=Math.max(...pts.map(p=>+p.speed||0));
    const avgSpd=pts.reduce((a,p)=>a+(+p.speed||0),0)/pts.length;
    V.set('pb-max',maxSpd.toFixed(0)+' km/h');
    V.set('pb-avg',avgSpd.toFixed(0)+' km/h');
    const dur=Math.round((new Date(pts[pts.length-1].ts)-new Date(pts[0].ts))/60000);
    V.set('pb-dur',`${Math.floor(dur/60)}h ${dur%60}m`);
    V.set('pb-empty','');
    V.set('pb-ts',new Date(pts[0].ts).toLocaleTimeString('en-IN'));
    toast(`Track loaded: ${pts.length} points`,'success','✅');
  } catch(e){toast('Error: '+e.message,'error');}
}

// Playback controls
let _pbMarker=null;
function pbToggle(){
  const pb=Pages.playback; if(!pb._track.length) return;
  pb._playing=!pb._playing;
  const btn=V.$('pb-playbtn'); if(btn) btn.textContent=pb._playing?'⏸':'▶';
  if(btn) btn.classList.toggle('active',pb._playing);
  if(pb._playing){
    pb._timer=setInterval(()=>{
      if(pb._pos>=pb._track.length-1){pbRestart();return;}
      pb._pos++;
      _pbUpdateMarker();
    },200/pb._speed);
  } else { clearInterval(pb._timer); }
}
function pbRestart(){ const pb=Pages.playback; pb._pos=0; _pbUpdateMarker(); }
function pbGoEnd(){ const pb=Pages.playback; pb._pos=pb._track.length-1; _pbUpdateMarker(); }
function pbStep(n){ const pb=Pages.playback; pb._pos=Math.max(0,Math.min(pb._track.length-1,pb._pos+n)); _pbUpdateMarker(); }
function pbSpd(x,el){ const pb=Pages.playback; pb._speed=x; document.querySelectorAll('.pb-spdbtn').forEach(b=>b.classList.remove('on')); if(el) el.classList.add('on'); if(pb._playing){clearInterval(pb._timer);pbToggle();pbToggle();} }
function _pbUpdateMarker(){
  const pb=Pages.playback; const pts=pb._track; if(!pts.length) return;
  const p=pts[pb._pos]; const pm=pb._pbMap; if(!pm) return;
  if(!_pbMarker){
    _pbMarker=L.marker([+p.latitude,+p.longitude],{icon:L.divIcon({className:'',iconSize:[16,16],iconAnchor:[8,8],html:'<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 8px #3b82f688"></div>'})}).addTo(pm);
  } else { _pbMarker.setLatLng([+p.latitude,+p.longitude]); }
  V.set('pb-ts',new Date(p.ts).toLocaleTimeString('en-IN'));
  const pct=(pb._pos/(pts.length-1)*100).toFixed(1);
  const prog=V.$('pb-prog'); if(prog) prog.style.width=pct+'%';
  const thumb=V.$('pb-thumb'); if(thumb) thumb.style.left=pct+'%';
}
function openPlaybackForImei(imei){
  nav('playback');
  setTimeout(async()=>{
    const sel=V.$('pb-device'); if(sel){ sel.value=imei; await loadPBDates(imei); }
  },500);
}
function pbSetVType(){}
function pbExport(){
  const pb=Pages.playback;
  if(!pb._track.length){toast('No track loaded','warning');return;}
  const rows=[['timestamp','latitude','longitude','speed','heading'].join(','),...pb._track.map(p=>[p.ts,p.latitude,p.longitude,p.speed,p.heading].join(','))];
  const a=document.createElement('a');
  a.href='data:text/csv,'+encodeURIComponent(rows.join('\n'));
  a.download='track_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
}


// ================================================================
// CRUD MODALS — injected into DOM when needed
// ================================================================
function _ensureModal(id, html) {
  if (!V.$(id)) {
    const d=document.createElement('div');
    d.innerHTML=html.trim();
    document.body.appendChild(d.firstElementChild);
  }
}

// ── User Modal ────────────────────────────────────────────────────
async function openUserModal(id) {
  _ensureModal('userModal',`
    <div class="overlay" id="userModal" onclick="if(event.target===this)closeModal('userModal')">
      <div class="modal"><div class="mhdr"><div><div class="mtitle" id="um-title">User</div><div class="msub">Fleet account</div></div>
        <div class="mclose" onclick="closeModal('userModal')">✕</div></div>
        <div class="mbody">
          <input type="hidden" id="um-id">
          <div class="frow"><div class="fg"><label class="flabel">First Name</label><input class="finput" id="um-fname" placeholder="John"></div><div class="fg"><label class="flabel">Last Name</label><input class="finput" id="um-lname" placeholder="Doe"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Email</label><input class="finput" type="email" id="um-email" placeholder="john@company.com"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Phone</label><input class="finput" id="um-phone" placeholder="+91 9876543210"></div>
            <div class="fg"><label class="flabel">Role</label><select class="fselect" id="um-role">
              <option value="admin">👑 Admin</option><option value="manager">📊 Manager</option>
              <option value="dealer">🏪 Dealer</option><option value="operator">🎛️ Operator</option>
              <option value="user" selected>👤 User</option><option value="demo">👁️ Demo</option>
            </select></div>
          </div>
          <div class="frow"><div class="fg"><label class="flabel">Status</label><select class="fselect" id="um-status"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            <div class="fg"><label class="flabel">Password</label><input class="finput" type="password" id="um-pass" placeholder="Leave blank to keep"></div></div>
        </div>
        <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('userModal')">Cancel</button><button class="btn btn-primary" onclick="saveUser()">Save User</button></div>
      </div>
    </div>`);
  V.$('um-id').value=id||'';
  V.$('um-title').textContent=id?'Edit User':'Add User';
  ['um-fname','um-lname','um-email','um-phone','um-pass'].forEach(f=>{const e=V.$(f);if(e)e.value='';});
  if(id){
    try{const u=await apiGet('/users/'+id);
      V.$('um-fname').value=u.fname||''; V.$('um-lname').value=u.lname||'';
      V.$('um-email').value=u.email||''; V.$('um-phone').value=u.phone||'';
      V.$('um-role').value=u.role||'user'; V.$('um-status').value=u.status||'active';
    }catch(e){toast('Error: '+e.message,'error');}
  }
  openModal('userModal');
}
async function saveUser() {
  const id=V.$('um-id').value;
  const b={fname:V.$('um-fname').value.trim(),lname:V.$('um-lname').value.trim(),
    email:V.$('um-email').value.trim(),phone:V.$('um-phone')?.value||'',
    role:V.$('um-role').value,status:V.$('um-status').value};
  const pass=V.$('um-pass')?.value; if(pass)b.password=pass;
  if(!id&&!pass){toast('Password required','error');return;}
  if(!b.fname||!b.email){toast('Name and email required','error');return;}
  try{if(id)await apiPut('/users/'+id,b);else await apiPost('/users',{...b,password:pass});
    toast(id?'User updated':'User created','success','👤');closeModal('userModal');nav('users');}
  catch(e){toast('Error: '+e.message,'error');}
}

// ── Device Modal ──────────────────────────────────────────────────
async function openDevModal(id) {
  _ensureModal('devModal',`
    <div class="overlay" id="devModal" onclick="if(event.target===this)closeModal('devModal')">
      <div class="modal"><div class="mhdr"><div><div class="mtitle" id="dm-title">Device</div></div>
        <div class="mclose" onclick="closeModal('devModal')">✕</div></div>
        <div class="mbody">
          <input type="hidden" id="dm-id">
          <div class="frow"><div class="fg"><label class="flabel">Name / Plate</label><input class="finput" id="dm-name" placeholder="KA01AB1234"></div>
            <div class="fg"><label class="flabel">IMEI</label><input class="finput" id="dm-imei" placeholder="864920068034001" maxlength="15"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Protocol</label><select class="fselect" id="dm-proto"><option>GT06N</option><option>Concox</option><option>Teltonika</option><option>Meitrack</option><option>Queclink</option><option>AIS140</option></select></div>
            <div class="fg"><label class="flabel">Type</label><select class="fselect" id="dm-type"><option>Car</option><option>Truck</option><option>Bus</option><option>Van</option><option>Bike</option><option>Tractor</option></select></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Speed Limit (km/h)</label><input class="finput" type="number" id="dm-speed" value="80"></div>
            <div class="fg"><label class="flabel">Fuel Type</label><select class="fselect" id="dm-fuel"><option>Diesel</option><option>Petrol</option><option>CNG</option><option>Electric</option></select></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Odometer (km)</label><input class="finput" type="number" id="dm-odo" value="0"></div>
            <div class="fg"><label class="flabel">Notes</label><input class="finput" id="dm-notes"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Assign User</label><select class="fselect" id="dm-user"><option value="">— Unassigned —</option></select></div>
            <div class="fg"><label class="flabel">Assign Driver</label><select class="fselect" id="dm-driver"><option value="">— No Driver —</option></select></div></div>
          <div class="frow">
            <div class="fg" style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:8px;border-radius:8px">
              <label class="flabel" style="margin:0;flex:1">🔒 Safe Parking</label>
              <input type="checkbox" id="dm-safe-park" style="width:18px;height:18px;cursor:pointer">
            </div>
            <div class="fg" style="display:flex;align-items:center;gap:8px;background:#fff5f5;padding:8px;border-radius:8px">
              <label class="flabel" style="margin:0;flex:1;color:var(--red)">✂️ Engine Cut</label>
              <input type="checkbox" id="dm-engine-cut" style="width:18px;height:18px;cursor:pointer">
            </div>
          </div>
        </div>
        <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('devModal')">Cancel</button><button class="btn btn-primary" onclick="saveDev()">Save Device</button></div>
      </div>
    </div>`);
  V.$('dm-id').value=id||'';
  V.$('dm-title').textContent=id?'Edit Device':'Add Device';
  ['dm-name','dm-imei','dm-notes'].forEach(f=>{const e=V.$(f);if(e)e.value='';});
  V.$('dm-speed').value='80'; V.$('dm-odo').value='0';
  try{
    const [users,drivers]=await Promise.all([apiGet('/users'),apiGet('/drivers')]);
    V.$('dm-user').innerHTML='<option value="">— Unassigned —</option>'+(users||[]).map(u=>`<option value="${u.id}">${u.fname} ${u.lname}</option>`).join('');
    V.$('dm-driver').innerHTML='<option value="">— No Driver —</option>'+(drivers||[]).map(d=>`<option value="${d.id}">${d.fname} ${d.lname}</option>`).join('');
  }catch{}
  if(id){
    try{const d=await apiGet('/devices/'+id);
      V.$('dm-name').value=d.name||''; V.$('dm-imei').value=d.imei||'';
      V.$('dm-proto').value=d.protocol||'GT06N'; V.$('dm-type').value=d.vehicle_type||'Car';
      V.$('dm-speed').value=d.speed_limit||80; V.$('dm-fuel').value=d.fuel_type||'Diesel';
      V.$('dm-odo').value=d.odometer||0; V.$('dm-notes').value=d.notes||'';
      V.$('dm-safe-park').checked=!!d.safe_parking; V.$('dm-engine-cut').checked=!!d.engine_cut;
      if(d.assigned_user_id)V.$('dm-user').value=d.assigned_user_id;
      if(d.assigned_driver_id)V.$('dm-driver').value=d.assigned_driver_id;
    }catch(e){toast('Error: '+e.message,'error');}
  }
  openModal('devModal');
}
async function saveDev() {
  const id=V.$('dm-id').value;
  const b={name:V.$('dm-name').value.trim(),imei:V.$('dm-imei').value.trim(),
    protocol:V.$('dm-proto').value,vehicle_type:V.$('dm-type').value,
    speed_limit:+V.$('dm-speed').value||80,fuel_type:V.$('dm-fuel').value,
    odometer:+V.$('dm-odo').value||0,notes:V.$('dm-notes').value,
    assigned_user_id:V.$('dm-user').value||null,
    assigned_driver_id:V.$('dm-driver').value||null,
    safe_parking:V.$('dm-safe-park').checked,engine_cut:V.$('dm-engine-cut').checked};
  if(!b.name||!b.imei){toast('Name and IMEI required','error');return;}
  try{if(id)await apiPut('/devices/'+id,b);else await apiPost('/devices',b);
    toast(id?'Device updated':'Device added','success','📡');closeModal('devModal');nav('devices');}
  catch(e){toast('Error: '+e.message,'error');}
}

// ── Engine Cut Modal ──────────────────────────────────────────────
function openEngineCutModal(imei,name,isCut) {
  _ensureModal('engineCutModal',`
    <div class="overlay" id="engineCutModal" onclick="if(event.target===this)closeModal('engineCutModal')">
      <div class="modal" style="max-width:400px">
        <div class="mhdr"><div><div class="mtitle" id="ecm-title">Engine Cut</div></div>
          <div class="mclose" onclick="closeModal('engineCutModal')">✕</div></div>
        <div class="mbody">
          <input type="hidden" id="ecm-imei"><input type="hidden" id="ecm-cmd">
          <div id="ecm-body" style="font-size:14px;color:var(--muted);padding:8px 0"></div>
        </div>
        <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('engineCutModal')">Cancel</button>
          <button class="btn btn-danger" id="ecm-confirm-btn" onclick="execEngineCut()">Confirm</button></div>
      </div>
    </div>`);
  V.$('ecm-imei').value=imei; V.$('ecm-cmd').value=isCut?'engine_restore':'engine_cut';
  V.$('ecm-title').textContent=isCut?'Restore Engine':'Engine Cut';
  V.$('ecm-body').innerHTML=isCut?`<p>Restore engine on <b>${name}</b>?</p>`:`<p>Cut engine on <b>${name}</b>?<br><span style="color:#dc2626;font-weight:700">⚠️ Vehicle will be immobilised.</span></p>`;
  const btn=V.$('ecm-confirm-btn');
  if(btn){btn.textContent=isCut?'✅ Restore':'✂️ Cut Engine';btn.style.background=isCut?'#16a34a':'#dc2626';}
  openModal('engineCutModal');
}
async function execEngineCut() {
  const imei=V.$('ecm-imei').value, cmd=V.$('ecm-cmd').value;
  try{await apiPost('/device-commands',{imei,command:cmd});
    toast(cmd==='engine_cut'?'Engine cut sent':'Engine restored','success',cmd==='engine_cut'?'✂️':'✅');
    closeModal('engineCutModal');nav('devices');}
  catch(e){toast('Error: '+e.message,'error');}
}

// ── Driver Modal ──────────────────────────────────────────────────
async function openDrvModal(id) {
  _ensureModal('drvModal',`
    <div class="overlay" id="drvModal" onclick="if(event.target===this)closeModal('drvModal')">
      <div class="modal"><div class="mhdr"><div><div class="mtitle" id="drvm-title">Driver</div></div>
        <div class="mclose" onclick="closeModal('drvModal')">✕</div></div>
        <div class="mbody">
          <input type="hidden" id="drvm-id">
          <div class="frow"><div class="fg"><label class="flabel">First Name</label><input class="finput" id="drvm-fname" placeholder="Rajesh"></div>
            <div class="fg"><label class="flabel">Last Name</label><input class="finput" id="drvm-lname" placeholder="Kumar"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Phone</label><input class="finput" id="drvm-phone" placeholder="+91 9876543210"></div>
            <div class="fg"><label class="flabel">Email</label><input class="finput" id="drvm-email" type="email"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">License No.</label><input class="finput" id="drvm-lic"></div>
            <div class="fg"><label class="flabel">Type</label><select class="fselect" id="drvm-lictype"><option>LMV</option><option>HMV</option><option>HGMV</option><option>MCWG</option></select></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Issue Date</label><input class="finput" type="date" id="drvm-issue"></div>
            <div class="fg"><label class="flabel">Expiry Date</label><input class="finput" type="date" id="drvm-expiry"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Assigned Device</label><select class="fselect" id="drvm-dev"><option value="">— No device —</option></select></div>
            <div class="fg"><label class="flabel">Status</label><select class="fselect" id="drvm-status"><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Notes</label><input class="finput" id="drvm-notes" placeholder="Optional"></div></div>
        </div>
        <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('drvModal')">Cancel</button><button class="btn btn-primary" onclick="saveDrv()">Save Driver</button></div>
      </div>
    </div>`);
  V.$('drvm-id').value=id||'';
  V.$('drvm-title').textContent=id?'Edit Driver':'Add Driver';
  ['drvm-fname','drvm-lname','drvm-phone','drvm-email','drvm-lic','drvm-notes'].forEach(f=>{const e=V.$(f);if(e)e.value='';});
  try{const devs=await apiGet('/devices')||[];
    V.$('drvm-dev').innerHTML='<option value="">— No device —</option>'+devs.map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');
  }catch{}
  if(id){
    try{const d=await apiGet('/drivers/'+id);
      V.$('drvm-fname').value=d.fname||''; V.$('drvm-lname').value=d.lname||'';
      V.$('drvm-phone').value=d.phone||''; V.$('drvm-email').value=d.email||'';
      V.$('drvm-lic').value=d.lic_number||'';
      if(d.lic_expiry) V.$('drvm-expiry').value=d.lic_expiry.slice(0,10)||'';
      if(d.assigned_imei) V.$('drvm-dev').value=d.assigned_imei;
      V.$('drvm-status').value=d.is_active?'active':'inactive';
    }catch(e){toast('Error: '+e.message,'error');}
  }
  openModal('drvModal');
}
async function saveDrv() {
  const id=V.$('drvm-id').value;
  const b={fname:V.$('drvm-fname').value.trim(),lname:V.$('drvm-lname').value.trim(),
    phone:V.$('drvm-phone')?.value||'',email:V.$('drvm-email')?.value||'',
    lic_number:V.$('drvm-lic')?.value||'',lic_expiry:V.$('drvm-expiry')?.value||null,
    assigned_imei:V.$('drvm-dev')?.value||null,
    is_active:V.$('drvm-status')?.value==='active'};
  if(!b.fname||!b.lname){toast('First and last name required','error');return;}
  try{if(id)await apiPut('/drivers/'+id,b);else await apiPost('/drivers',b);
    toast(id?'Driver updated':'Driver added','success','🚗');closeModal('drvModal');nav('drivers');}
  catch(e){toast('Error: '+e.message,'error');}
}

// ── Maintenance CRUD ──────────────────────────────────────────────
async function openAddMaintModal() {
  _ensureModal('addMaintModal',`
    <div class="overlay" id="addMaintModal" onclick="if(event.target===this)closeModal('addMaintModal')">
      <div class="modal"><div class="mhdr"><div><div class="mtitle">Add Maintenance Task</div><div class="msub">Set triggers by odometer, engine hours or days</div></div>
        <div class="mclose" onclick="closeModal('addMaintModal')">✕</div></div>
        <div class="mbody">
          <input type="hidden" id="maint-edit-id">
          <div class="frow"><div class="fg"><label class="flabel">Vehicle / IMEI</label><select class="fselect" id="maint-dev-sel"><option value="">Loading…</option></select></div>
            <div class="fg"><label class="flabel">Task Type</label><select class="fselect" id="maint-task-type"><option value="oil_change">Oil Change</option><option value="tyre">Tyre Rotation</option><option value="brakes">Brake Inspection</option><option value="service">Full Service</option><option value="battery">Battery Check</option><option value="custom">Custom</option></select></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Task Title</label><input class="finput" id="maint-title" placeholder="50,000 km Oil Change"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Due Odometer (km)</label><input class="finput" type="number" id="maint-odo" placeholder="50000"></div>
            <div class="fg"><label class="flabel">Due Engine Hours</label><input class="finput" type="number" id="maint-hrs" placeholder="500"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Due in Days</label><input class="finput" type="number" id="maint-days" placeholder="90"></div>
            <div class="fg"><label class="flabel">Start Date</label><input class="finput" type="date" id="maint-start" value="${new Date().toISOString().slice(0,10)}"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Notes</label><input class="finput" id="maint-notes" placeholder="Optional"></div></div>
        </div>
        <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('addMaintModal')">Cancel</button><button class="btn btn-primary" onclick="saveMaintTask()">Save Task</button></div>
      </div>
    </div>`);
  ['maint-title','maint-odo','maint-hrs','maint-days','maint-notes'].forEach(f=>{const e=V.$(f);if(e)e.value='';});
  try{const devs=await apiGet('/devices')||[];
    V.$('maint-dev-sel').innerHTML=devs.map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');
  }catch{}
  openModal('addMaintModal');
}
async function saveMaintTask() {
  const b={imei:V.$('maint-dev-sel').value,task_type:V.$('maint-task-type').value,
    title:V.$('maint-title').value.trim(),due_odometer:+V.$('maint-odo').value||null,
    due_engine_hours:+V.$('maint-hrs').value||null,due_days:+V.$('maint-days').value||null,
    start_date:V.$('maint-start').value||null,notes:V.$('maint-notes').value||null};
  if(!b.imei||!b.title){toast('IMEI and title required','error');return;}
  try{await apiPost('/maintenance',b);toast('Task saved','success','🔧');closeModal('addMaintModal');nav('maintenance');}
  catch(e){toast('Error: '+e.message,'error');}
}
async function markMaintDone(id){try{await apiPut('/maintenance/'+id,{status:'done'});toast('Marked done','success','✅');nav('maintenance');}catch(e){toast('Error: '+e.message,'error');}}
async function deleteMaintTask(id){confirmAction('Delete Task','Remove this task permanently?','🗑️',async()=>{try{await apiDel('/maintenance/'+id);toast('Deleted','success');nav('maintenance');}catch(e){toast('Error: '+e.message,'error');}});}
function downloadMaintTemplate(){const csv='imei,task_type,title,due_odometer,due_engine_hours,due_days\n352312097033263,oil_change,50k Oil Change,50000,,\n';const a=document.createElement('a');a.href='data:text/csv,'+encodeURIComponent(csv);a.download='maintenance_template.csv';a.click();}
async function bulkImportMaint(input){const file=input.files[0];if(!file)return;const text=await file.text();const lines=text.split('\n').filter(l=>l.trim());const headers=lines[0].split(',').map(h=>h.trim());const rows=lines.slice(1).map(line=>{const vals=line.split(',').map(v=>v.trim());const obj={};headers.forEach((h,i)=>{if(vals[i])obj[h]=vals[i];});return obj;}).filter(r=>r.imei&&r.title);try{const res=await apiPost('/bulk/maintenance',{rows});toast(`Imported ${res.inserted||0} tasks`,'success','📤');nav('maintenance');}catch(e){toast('Error: '+e.message,'error');}input.value='';}

// ── Geofence CRUD ─────────────────────────────────────────────────
let _gfMap=null,_gfLayer=null,_gfFences=[],_gfPendingCoords=null,_gfPendingShape='polygon';
function _initGfMap(){
  if(_gfMap) return;
  const el=V.$('gf-map'); if(!el) return;
  _gfMap=L.map('gf-map').setView([12.9716,77.5946],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(_gfMap);
  _gfLayer=L.featureGroup().addTo(_gfMap);
}
async function loadGeofences(){
  try{_gfFences=await apiGet('/geofences')||[];
    if(_gfLayer)_gfLayer.clearLayers();
    _gfFences.forEach(f=>{try{const c=typeof f.coordinates==='string'?JSON.parse(f.coordinates):f.coordinates;const s={color:f.color||'#3b82f6',fillOpacity:.15,weight:2};if(f.shape==='circle'&&c.lat)L.circle([c.lat,c.lng],{radius:c.radius_m||500,...s}).bindTooltip(f.name).addTo(_gfLayer);else if(Array.isArray(c)&&c.length)L.polygon(c,s).bindTooltip(f.name).addTo(_gfLayer);}catch{}});
    const listEl=V.$('gf-list'); if(!listEl) return;
    if(!_gfFences.length){listEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">No fences yet. Draw one on the map →</div>';return;}
    listEl.innerHTML=_gfFences.map(f=>{const imeis=JSON.parse(typeof f.assigned_imeis==='string'?f.assigned_imeis:'[]');
      return `<div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer" onclick="focusFence('${f.id}')">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="width:10px;height:10px;border-radius:50%;background:${f.color||'#3b82f6'};display:inline-block"></span>
          <span style="font-weight:600;font-size:13px">${f.name}</span>
          <span class="badge badge-blue" style="font-size:10px;margin-left:auto">${f.shape}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);display:flex;gap:8px">
          <span>🚗${imeis.length}</span>${f.alert_entry?'<span>📥 Entry</span>':''}${f.alert_exit?'<span>📤 Exit</span>':''}
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 8px" onclick="event.stopPropagation();editGf('${f.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 8px" onclick="event.stopPropagation();deleteGf('${f.id}')">Delete</button>
        </div>
      </div>`;}).join('');
  }catch(e){console.warn('[gf]',e.message);}
}
function gfDrawMode(shape){
  if(!_gfMap){_initGfMap();setTimeout(()=>gfDrawMode(shape),300);return;}
  _gfPendingShape=shape;_gfPendingCoords=null;
  const hint=V.$('gf-draw-hint');
  if(shape==='polygon'){
    if(hint)hint.textContent='Click map to add polygon points. Double-click to finish.';
    const pts=[];let poly=null;
    _gfMap.off('click');_gfMap.off('dblclick');
    _gfMap.on('click',e=>{pts.push([e.latlng.lat,e.latlng.lng]);if(poly)_gfMap.removeLayer(poly);if(pts.length>1)poly=L.polygon(pts,{color:'#3b82f6',fillOpacity:.15}).addTo(_gfMap);});
    _gfMap.on('dblclick',()=>{_gfMap.off('click');_gfMap.off('dblclick');if(pts.length<3){toast('Need ≥3 points','error');return;}_gfPendingCoords=pts;if(poly)_gfLayer.addLayer(poly);openGfModal();});
  }else{
    if(hint)hint.textContent='Click map center for circle zone.';
    _gfMap.off('click');_gfMap.off('dblclick');
    _gfMap.once('click',e=>{_gfPendingCoords={lat:e.latlng.lat,lng:e.latlng.lng,radius_m:500};L.circle([e.latlng.lat,e.latlng.lng],{radius:500,color:'#3b82f6',fillOpacity:.15}).addTo(_gfLayer);openGfModal();});
  }
}
async function openGfModal(fence){
  _ensureModal('gfModal',`
    <div class="overlay" id="gfModal" onclick="if(event.target===this)closeModal('gfModal')">
      <div class="modal"><div class="mhdr"><div><div class="mtitle" id="gfm-title">New Geo-fence</div></div>
        <div class="mclose" onclick="closeModal('gfModal')">✕</div></div>
        <div class="mbody">
          <input type="hidden" id="gfm-id">
          <div class="frow"><div class="fg"><label class="flabel">Fence Name</label><input class="finput" id="gfm-name" placeholder="Bangalore Depot"></div>
            <div class="fg"><label class="flabel">Colour</label><input class="finput" type="color" id="gfm-color" value="#3B82F6" style="padding:4px;height:38px"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Alert on Entry</label><select class="fselect" id="gfm-entry"><option value="true">Yes</option><option value="false">No</option></select></div>
            <div class="fg"><label class="flabel">Alert on Exit</label><select class="fselect" id="gfm-exit"><option value="true">Yes</option><option value="false">No</option></select></div></div>
          <div class="fg" style="margin-bottom:10px"><label class="flabel">Assign Vehicles</label>
            <div id="gfm-vehicle-checks" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--border);border-radius:8px;max-height:120px;overflow-y:auto"></div></div>
          <div style="padding:10px;background:#f8fafc;border-radius:8px;font-size:12px;color:var(--muted)" id="gfm-coords-info">Coordinates taken from map drawing.</div>
        </div>
        <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('gfModal')">Cancel</button><button class="btn btn-primary" onclick="saveGeofence()">Save Fence</button></div>
      </div>
    </div>`);
  V.$('gfm-id').value=fence?fence.id:'';
  V.$('gfm-title').textContent=fence?'Edit Fence':'New Geo-fence';
  V.$('gfm-name').value=fence?fence.name:'';
  V.$('gfm-color').value=fence?fence.color:'#3B82F6';
  const assigned=fence?JSON.parse(typeof fence.assigned_imeis==='string'?fence.assigned_imeis:'[]'):[];
  const vc=V.$('gfm-vehicle-checks'); vc.innerHTML='';
  try{const devs=await apiGet('/live')||[];
    devs.forEach(d=>{const lbl=document.createElement('label');
      lbl.style.cssText='display:flex;align-items:center;gap:4px;font-size:12px;padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer';
      lbl.innerHTML=`<input type="checkbox" value="${d.imei}" ${assigned.includes(d.imei)?'checked':''}> ${d.name}`;
      vc.appendChild(lbl);});
  }catch{}
  openModal('gfModal');
}
async function saveGeofence(){
  const id=V.$('gfm-id').value,name=V.$('gfm-name').value.trim();
  if(!name){toast('Name required','error');return;}
  const imeis=[...document.querySelectorAll('#gfm-vehicle-checks input:checked')].map(c=>c.value);
  const b={name,color:V.$('gfm-color').value,shape:_gfPendingShape,coordinates:_gfPendingCoords||[],
    assigned_imeis:imeis,alert_entry:V.$('gfm-entry').value==='true',alert_exit:V.$('gfm-exit').value==='true'};
  try{if(id)await apiPut('/geofences/'+id,b);else await apiPost('/geofences',b);
    toast('Fence saved','success','🔲');closeModal('gfModal');_gfPendingCoords=null;nav('geofence');}
  catch(e){toast('Error: '+e.message,'error');}
}
async function deleteGf(id){confirmAction('Delete Fence','Remove this fence?','🗑️',async()=>{try{await apiDel('/geofences/'+id);toast('Deleted','success');nav('geofence');}catch(e){toast(e.message,'error');}});}
function editGf(id){const f=_gfFences.find(x=>x.id===id);if(!f)return;_gfPendingShape=f.shape;_gfPendingCoords=typeof f.coordinates==='string'?JSON.parse(f.coordinates):f.coordinates;openGfModal(f);}
function focusFence(id){const f=_gfFences.find(x=>x.id===id);if(!f||!_gfMap)return;try{const c=typeof f.coordinates==='string'?JSON.parse(f.coordinates):f.coordinates;if(f.shape==='circle'&&c.lat)_gfMap.setView([c.lat,c.lng],14);else if(Array.isArray(c)&&c.length>0)_gfMap.fitBounds(L.polygon(c).getBounds());}catch{}}

// ── Routes CRUD ───────────────────────────────────────────────────
let _routeMap=null,_routePoints=[],_routeMarkers=[],_routePolyline=null;
async function loadRoutesList(){
  const body=V.$('routes-list-body'); if(!body) return;
  try{const routes=await apiGet('/routes-v2')||[];
    V.set('routes-summary',routes.length+' routes');
    if(!routes.length){body.innerHTML='<div style="padding:24px;text-align:center;color:var(--muted)">No routes yet — click + New Route</div>';return;}
    body.innerHTML=routes.map(r=>`<div style="background:#fff;border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer" onclick="selectRoute('${r.id}')">
      <div style="font-weight:700;font-size:14px;margin-bottom:3px">${r.name}</div>
      <div style="font-size:11px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap">
        <span>📍 ${r.point_count||0} stops</span><span>📏 ${r.distance_km||0} km</span><span>🗓 ${r.schedule||'—'}</span>
      </div>
      <div style="display:flex;gap:5px;margin-top:8px">
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openEditRoute('${r.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteRoute('${r.id}','${r.name.replace(/'/g,"\\'")}')">🗑</button>
      </div>
    </div>`).join('');
  }catch(e){if(body)body.innerHTML='<div style="padding:20px;color:var(--red)">Error: '+e.message+'</div>';}
}
function selectRoute(id){apiGet('/routes-v2/'+id).then(r=>{if(!r?.points?.length)return;if(!_routeMap)return;_routeMarkers.forEach(m=>_routeMap.removeLayer(m));_routeMarkers=[];if(_routePolyline){_routeMap.removeLayer(_routePolyline);_routePolyline=null;}const lls=r.points.map(p=>[+p.lat,+p.lng]);_routePolyline=L.polyline(lls,{color:'#3b82f6',weight:4,opacity:.8}).addTo(_routeMap);r.points.forEach((p,i)=>{const c=i===0?'#16a34a':i===r.points.length-1?'#dc2626':'#3b82f6';const ic=L.divIcon({className:'',iconSize:[24,24],iconAnchor:[12,12],html:`<div style="width:24px;height:24px;border-radius:50%;background:${c};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff">${i+1}</div>`});_routeMarkers.push(L.marker([p.lat,p.lng],{icon:ic}).bindPopup(`<b>#${i+1} ${p.name}</b>`).addTo(_routeMap));});if(lls.length>1)_routeMap.fitBounds(L.polyline(lls).getBounds(),{padding:[30,30]});}).catch(()=>{});}
async function openAddRouteModal(){
  _routePoints=[];
  _ensureModal('addRouteModal',`<div class="overlay" id="addRouteModal" onclick="if(event.target===this)closeModal('addRouteModal')">
    <div class="modal" style="max-width:640px;width:95vw"><div class="mhdr"><div><div class="mtitle" id="arm-title">New Route</div></div>
      <div class="mclose" onclick="closeModal('addRouteModal')">✕</div></div>
      <div class="mbody" style="max-height:70vh;overflow-y:auto">
        <input type="hidden" id="arm-id">
        <div class="frow"><div class="fg"><label class="flabel">Route Name</label><input class="finput" id="arm-name" placeholder="School Bus Route A"></div>
          <div class="fg"><label class="flabel">Schedule</label><input class="finput" id="arm-schedule" placeholder="Mon–Fri 08:00–20:00"></div></div>
        <div class="frow"><div class="fg"><label class="flabel">Speed Limit</label><input class="finput" type="number" id="arm-speed" value="60"></div>
          <div class="fg"><label class="flabel">Distance (km)</label><input class="finput" type="number" id="arm-dist" placeholder="0"></div></div>
        <div class="fsection">📍 Waypoints</div>
        <div id="arm-points-list" style="margin-bottom:8px"></div>
        <button class="btn btn-secondary btn-sm" style="width:100%" onclick="armAddPoint()">+ Add Point</button>
      </div>
      <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('addRouteModal')">Cancel</button><button class="btn btn-primary" onclick="saveRouteV2()">💾 Save</button></div>
    </div></div>`);
  armRenderPoints(); openModal('addRouteModal');
}
function openEditRoute(id){}
async function deleteRoute(id,name){confirmAction('Delete Route',`Remove "${name}"?`,'🗑️',async()=>{try{await apiDel('/routes-v2/'+id);toast('Route deleted','success');loadRoutesList();}catch(e){toast(e.message,'error');}});}
function armAddPoint(lat,lng){_routePoints.push({name:'Stop '+(_routePoints.length+1),lat:lat||12.9716,lng:lng||77.5946,planned_arrival:'',planned_departure:''});armRenderPoints();}
function armRenderPoints(){const el=V.$('arm-points-list');if(!el)return;if(!_routePoints.length){el.innerHTML='<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">No waypoints yet</div>';return;}el.innerHTML=_routePoints.map((p,i)=>`<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:6px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center">${i+1}</div><input class="finput" value="${p.name}" style="flex:1;padding:4px 8px;font-size:12px" onchange="_routePoints[${i}].name=this.value"><button onclick="_routePoints.splice(${i},1);armRenderPoints()" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:16px">✕</button></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px"><div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">LAT</div><input class="finput" type="number" step="0.00001" value="${p.lat}" style="padding:4px 8px;font-size:12px" onchange="_routePoints[${i}].lat=+this.value"></div><div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">LNG</div><input class="finput" type="number" step="0.00001" value="${p.lng}" style="padding:4px 8px;font-size:12px" onchange="_routePoints[${i}].lng=+this.value"></div><div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">ARRIVAL</div><input class="finput" type="time" value="${p.planned_arrival}" style="padding:4px 8px;font-size:12px" onchange="_routePoints[${i}].planned_arrival=this.value"></div><div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">DEPARTURE</div><input class="finput" type="time" value="${p.planned_departure}" style="padding:4px 8px;font-size:12px" onchange="_routePoints[${i}].planned_departure=this.value"></div></div></div>`).join('');}
async function saveRouteV2(){const name=V.$('arm-name')?.value.trim();if(!name){toast('Route name required','error');return;}try{await apiPost('/routes-v2',{name,schedule:V.$('arm-schedule')?.value,speed_limit:+V.$('arm-speed')?.value||60,distance_km:+V.$('arm-dist')?.value||0,points:_routePoints});toast('Route saved','success','🛣');closeModal('addRouteModal');loadRoutesList();}catch(e){toast('Error: '+e.message,'error');}}

// ── Notifications helpers ─────────────────────────────────────────
let _notifChanges={};
function notifMatrixChange(cb){_notifChanges[`${cb.dataset.ev}_${cb.dataset.lvl}`]={event_type:cb.dataset.ev,user_level:cb.dataset.lvl,enabled:cb.checked};}
async function saveNotifSettings(){if(!Object.keys(_notifChanges).length){toast('No changes','info');return;}try{await apiPut('/notifications',{settings:Object.values(_notifChanges)});_notifChanges={};toast('Settings saved','success','🔔');}catch(e){toast('Error: '+e.message,'error');}}
async function markNotifsRead(){try{await apiPut('/notifications',{mark_read:true});toast('All marked read','success','✅');const sbct=V.$('sb-notif-ct');if(sbct)sbct.style.display='none';Pages.notifications?.render(V.$('page-notifications'));}catch(e){toast('Error: '+e.message,'error');}}

// ── Bell notifications ────────────────────────────────────────────
async function loadBellNotifs(){
  try{const data=await apiGet('/notifications');const{history=[],unread=0}=data||{};
    const bell=V.$('notif-bell-list');
    if(bell)bell.innerHTML=history.slice(0,5).map(h=>`<div class="np-item"><div class="np-ico" style="background:var(--primary-light)">🔔</div><div><div class="np-text">${h.title||h.event_type||'Alert'}</div><div class="np-sub">${V.fmtTs(h.ts)}</div></div></div>`).join('')||'<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">No notifications</div>';
    const sbct=V.$('sb-notif-ct');if(sbct){sbct.textContent=unread;sbct.style.display=unread>0?'':'none';}
  }catch{}
}

// ── Boot — Auto-login ─────────────────────────────────────────────

// ── Login page stubs (hidden in dev mode) ────────────────────────
function doLogin(){}
function sendOtp(){}
function switchLoginTab(t){}
function switchOtpStep(s){}
function verifyOtp(){}
function downloadMaintTemplate(){
  const csv='imei,task_type,title,due_odometer,due_engine_hours,due_days\n';
  const a=document.createElement('a');
  a.href='data:text/csv,'+encodeURIComponent(csv);
  a.download='maintenance_template.csv';
  a.click();
}
function saveFirebaseConfig(){
  toast('Firebase config saved','success','🔥');
  const el=document.getElementById('notif-firebase-status');
  if(el) el.textContent='Configured ✅';
  closeModal('firebaseModal');
}
function updateChanFields(){}

