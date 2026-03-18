// ================================================================
// Fleet OS v2.0 — pages.js
// MVVM Page ViewModels — each registers into Pages{}
// Every page: Pages['name'] = { render(el), destroy() }
// ================================================================

// ── Helpers shared across pages ──────────────────────────────────
const T = {
  row:  (cols) => `<tr><td colspan="${cols}" style="text-align:center;padding:28px;color:var(--muted)">⏳ Loading…</td></tr>`,
  empty:(cols,msg='No data') => `<tr><td colspan="${cols}" style="text-align:center;padding:28px;color:var(--muted)">${msg}</td></tr>`,
  date: d => d ? new Date(d).toLocaleDateString('en-IN') : '—',
  ts:   d => d ? new Date(d).toLocaleString('en-IN')     : '—',
  badge:(cls,txt) => `<span class="badge badge-${cls}">${txt}</span>`,
  roleBadge(r){
    const m={admin:'red',manager:'amber',dealer:'orange',operator:'violet',user:'blue',demo:'green'};
    const i={admin:'👑',manager:'📊',dealer:'🏪',operator:'🎛️',user:'👤',demo:'👁️'};
    return `<span class="badge badge-${m[r]||'gray'}">${i[r]||''}${r||'—'}</span>`;
  },
  statusBadge(s){
    const m={active:'green',online:'green',moving:'green',idle:'amber',stopped:'gray',offline:'gray',never_connected:'gray',inactive:'gray',suspended:'red'};
    const dot = ['active','online','moving'].includes(s) ? '<span class="bdot"></span>' : '';
    return `<span class="badge badge-${m[s]||'gray'}">${dot}${s||'—'}</span>`;
  },
  pager(pid,iid,total,per){
    const p=document.getElementById(pid), i=document.getElementById(iid);
    if(!p) return;
    const pages=Math.ceil(total/per);
    if(i) i.textContent=`${Math.min(per,total)} of ${total}`;
    p.innerHTML=Array.from({length:Math.min(pages,7)},(_,j)=>`<div class="pg-btn${j===0?' on':''}">${j+1}</div>`).join('');
  },
  dssBar(score){
    const c = score>=80?'#059669':score>=60?'#D97706':'#DC2626';
    return `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;background:var(--border);border-radius:4px;height:6px"><div style="width:${score}%;height:100%;background:${c};border-radius:4px"></div></div><span style="font-weight:700;color:${c};min-width:26px">${score}</span></div>`;
  },
  svgEdit:  () => `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>`,
  svgDel:   () => `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`,
  svgEye:   () => `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  svgPlay:  () => `<svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  actions:(...btns) => `<div style="display:flex;gap:3px">${btns.join('')}</div>`,
  btn:(cls,icon,onclick,title='') => `<button class="btn-icon ${cls}" onclick="${onclick}" title="${title}">${icon}</button>`,
};

// ================================================================
// PAGE: DASHBOARD
// ================================================================
Pages['dashboard'] = {
  _timer: null,
  render(el) {
    el.innerHTML = `
      <div class="page-title">Dashboard</div>
      <div class="page-sub" id="dash-sub">Live fleet overview</div>
      <div class="stats-grid sg6" id="dash-stats">
        ${Array(6).fill('<div class="stat-card"><div style="height:60px;background:var(--bg);border-radius:8px;animation:pulse 1.5s infinite"></div></div>').join('')}
      </div>
      <div class="stats-grid sg2">
        <div class="card">
          <div class="card-header"><span class="card-title">📡 Live Positions</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="nav('map')">Open Map</button></div>
          </div>
          <div class="tbl-scroll"><table><thead><tr><th>Vehicle</th><th>Driver</th><th>Speed</th><th>Location</th><th>Status</th><th>Last Seen</th></tr></thead>
          <tbody id="dash-live">${T.row(6)}</tbody></table></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">🔔 Recent Alarms</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="nav('events')">All Events</button></div>
          </div>
          <div class="timeline" id="dash-alerts"><div style="padding:24px;text-align:center;color:var(--muted)">⏳</div></div>
        </div>
      </div>`;
    this._load();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._load(), 15000);
  },
  destroy() { if (this._timer) clearInterval(this._timer); this._timer = null; },
  async _load() {
    try {
      const s = await apiGet('/dashboard'); if (!s) return;
      const total=+s.devices?.total||0, moving=+s.devices?.moving||0;
      const drvs=+s.drivers?.total||0, dss=+s.drivers?.avg_dss||0;
      const users=+s.users?.total||0, alarms=+s.alarms?.active||0;
      V.set('dash-stats', [
        {ico:'🟢',val:moving,  lbl:'Moving Now',   col:'var(--green)',  bg:'var(--green-bg)',  page:'map'},
        {ico:'📡',val:total,   lbl:'Total Devices', col:'var(--primary)',bg:'var(--primary-light)',page:'devices'},
        {ico:'🚗',val:drvs,    lbl:'Drivers',       col:'var(--primary)',bg:'var(--primary-light)',page:'drivers'},
        {ico:'👤',val:users,   lbl:'Active Users',  col:'var(--amber)',  bg:'var(--amber-bg)',  page:'users'},
        {ico:'🚨',val:alarms,  lbl:'Active Alarms', col:'var(--red)',    bg:'var(--red-bg)',    page:'events'},
        {ico:'⭐',val:dss||'—',lbl:'Avg DSS Score', col:V.dssColor?.(dss)||'var(--green)', bg:'var(--green-bg)', page:'drivers'},
      ].map(c=>`<div class="stat-card" style="cursor:pointer" onclick="nav('${c.page}')">
        <div class="stat-top"><div class="stat-ico" style="background:${c.bg}">${c.ico}</div></div>
        <div class="stat-val" style="color:${c.col}">${c.val}</div>
        <div class="stat-lbl">${c.lbl}</div>
        <div class="stat-bar" style="background:${c.col}"></div>
      </div>`).join(''));
      const stC={moving:'#22c55e',idle:'#f59e0b',stopped:'#94a3b8',offline:'#ef4444',never_connected:'#cbd5e1'};
      const live=s.live||[];
      V.set('dash-live', live.length ? live.map(v=>`<tr style="cursor:pointer" onclick="nav('map')">
        <td><b>${v.name}</b><div style="font-size:10px;color:var(--muted)">${v.imei}</div></td>
        <td>${v.driver_name||'—'}</td>
        <td style="font-weight:700;color:${(+v.speed||0)>0?'#22c55e':'var(--muted)'}">${(+v.speed||0).toFixed(0)} km/h</td>
        <td style="font-size:11px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.address_short||'—'}</td>
        <td><span style="padding:2px 8px;border-radius:99px;background:${(stC[v.status]||'#94a3b8')+'22'};color:${stC[v.status]||'#94a3b8'};font-size:11px;font-weight:700">${(v.status||'offline').toUpperCase()}</span></td>
        <td style="font-size:11px;color:var(--muted)">${T.ts(v.ts)}</td>
      </tr>`).join('') : T.empty(6,'No GPS data yet'));
      const evts=s.events||[];
      V.set('dash-alerts', evts.length ? evts.map(e=>`<div class="tl-item">
        <div class="tl-ico" style="background:var(--red-bg)">⚠️</div>
        <div class="tl-content"><div class="tl-title">${e.alarm_type||'ALARM'} — ${e.device_name||e.imei}</div>
        <div class="tl-sub">${e.address||'—'}</div></div>
        <span class="tl-time">${T.ts(e.ts)}</span>
      </div>`).join('') : '<div style="padding:24px;text-align:center;color:var(--muted)">✅ No recent alerts</div>');
      const sub=V.$('dash-sub'); if(sub) sub.textContent='Updated '+new Date().toLocaleString('en-IN');
    } catch(e) { console.warn('[dash]',e.message); }
  }
};

// ================================================================
// PAGE: USERS
// ================================================================
Pages['users'] = {
  _filter:'all', _search:'',
  render(el) {
    el.innerHTML = `
      <div class="page-title">Users</div>
      <div class="page-sub">Fleet accounts, access levels and sub-account hierarchy</div>
      <div class="card">
        <div class="card-header"><span class="card-title">All Users</span><span class="card-sub" id="u-ct-lbl"></span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('users')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer">📤 Import<input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('users',this)"></label>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('uTable','users')">⬇ Export</button>
            <button class="btn btn-primary btn-sm" onclick="openUserModal()">+ Add User</button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="fchip on" onclick="filterU('all',this)">All</div>
          <div class="fchip" onclick="filterU('admin',this)">👑 Admin</div>
          <div class="fchip" onclick="filterU('manager',this)">📊 Manager</div>
          <div class="fchip" onclick="filterU('dealer',this)">🏪 Dealer</div>
          <div class="fchip" onclick="filterU('operator',this)">🎛️ Operator</div>
          <div class="fchip" onclick="filterU('user',this)">👤 User</div>
          <div class="search-field" style="margin-left:auto"><svg width="13" height="13" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search name / email…" oninput="searchU(this.value)"></div>
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th><input type="checkbox" onclick="selAll(this,'uTable')"></th>
          <th>User</th><th>Phone</th><th>Role</th><th>Manager</th><th>Devices</th><th>Last Login</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody id="uTable">${T.row(9)}</tbody></table></div>
        <div class="pagination"><span id="u-pg-info"></span><div class="pg-btns" id="u-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load() {
    const tb = V.$('uTable'); if (!tb) return;
    try {
      M.users = await apiGet('/users') || [];
      const f = this._filter, s = this._search;
      const data = M.users.filter(u => {
        if (f !== 'all' && u.role !== f) return false;
        if (s && !`${u.fname} ${u.lname} ${u.email}`.toLowerCase().includes(s)) return false;
        return true;
      });
      const lbl = V.$('u-ct-lbl'); if (lbl) lbl.textContent = `${M.users.length} total`;
      const sbct = V.$('sb-u-ct'); if (sbct) sbct.textContent = M.users.length;
      if (!data.length) { tb.innerHTML = T.empty(9,'No users found'); return; }
      tb.innerHTML = data.map(u => `<tr>
        <td><input type="checkbox"></td>
        <td><div style="display:flex;align-items:center;gap:9px">
          <div style="width:32px;height:32px;border-radius:50%;background:${V.gc(u.email)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">${V.ini(u.fname)}</div>
          <div><div style="font-weight:600">${u.fname} ${u.lname}</div><div style="font-size:11px;color:var(--muted)">${u.email}</div></div>
        </div></td>
        <td style="font-size:12px">${u.phone||'—'}</td>
        <td>${T.roleBadge(u.role)}</td>
        <td style="font-size:12px">${u.manager_email||'—'}</td>
        <td>${u.device_count||0} / ${u.device_limit||'∞'}</td>
        <td style="font-size:11px;color:var(--muted)">${T.ts(u.last_login)||'Never'}</td>
        <td>${T.statusBadge(u.status)}</td>
        <td>${T.actions(
          T.btn('','👁',`viewUser('${u.id}')`,  'View'),
          T.btn('edit',T.svgEdit(),`openUserModal('${u.id}')`, 'Edit'),
          T.btn('del', T.svgDel(), `confirmDel('user','${u.id}','${u.email}')`, 'Delete')
        )}</td>
      </tr>`).join('');
      T.pager('u-pager','u-pg-info', data.length, 25);
    } catch(e) { tb.innerHTML = T.empty(9,'⚠️ '+e.message); }
  }
};

// ================================================================
// PAGE: DEVICES
// ================================================================
Pages['devices'] = {
  _filter:'all', _search:'',
  render(el) {
    el.innerHTML = `
      <div class="page-title">Devices / Objects</div>
      <div class="page-sub">GPS trackers, vehicles and IoT assets</div>
      <div class="card">
        <div class="card-header"><span class="card-title">All Devices</span><span class="card-sub" id="d-ct-lbl"></span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('devices')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer">📤 Import<input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('devices',this)"></label>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('dTable','devices')">⬇ Export</button>
            <button class="btn btn-primary btn-sm" onclick="openDevModal()">+ Add Device</button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="fchip on" onclick="filterD('all',this)">All</div>
          <div class="fchip" onclick="filterD('online',this)">🟢 Online</div>
          <div class="fchip" onclick="filterD('idle',this)">🟡 Idle</div>
          <div class="fchip" onclick="filterD('offline',this)">⚫ Offline</div>
          <div class="fchip" onclick="filterD('alarm',this)">🔴 Alarm</div>
          <div class="search-field" style="margin-left:auto"><svg width="13" height="13" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search IMEI or name…" oninput="searchD(this.value)"></div>
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th></th><th>Device / IMEI</th><th>Protocol</th><th>Type</th><th>Status</th><th>User</th><th>Driver</th><th>Location</th><th>Speed</th><th>Last Seen</th><th>Actions</th>
        </tr></thead><tbody id="dTable">${T.row(11)}</tbody></table></div>
        <div class="pagination"><span id="d-pg-info"></span><div class="pg-btns" id="d-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load() {
    const tb = V.$('dTable'); if (!tb) return;
    try {
      M.devices = await apiGet('/devices') || [];
      const f = this._filter, s = this._search;
      const stC = {moving:'#22c55e',idle:'#f59e0b',stopped:'#94a3b8',offline:'#ef4444',never_connected:'#cbd5e1'};
      const data = M.devices.filter(d => {
        if (f !== 'all') {
          const st = d.status||'offline';
          if (f==='online'  && !['moving','idle'].includes(st)) return false;
          if (f==='offline' && !['offline','never_connected'].includes(st)) return false;
          if (f==='idle'    && st!=='idle') return false;
          if (f==='alarm'   && st!=='alarm') return false;
        }
        if (s && !`${d.name} ${d.imei}`.toLowerCase().includes(s)) return false;
        return true;
      });
      const lbl=V.$('d-ct-lbl'); if(lbl) lbl.textContent=`${M.devices.length} registered`;
      const sbct=V.$('sb-d-ct'); if(sbct) sbct.textContent=M.devices.length;
      if (!data.length) { tb.innerHTML = T.empty(11,'No devices found'); return; }
      tb.innerHTML = data.map(d => {
        const st=d.status||'offline', col=stC[st]||'#94a3b8';
        const dur=d.state_mins!=null?`${Math.floor(d.state_mins/60)}h ${d.state_mins%60}m`:'';
        return `<tr>
          <td><input type="checkbox"></td>
          <td><div style="font-weight:600">${d.name}${d.engine_cut?'<span style="color:#dc2626;font-size:10px;font-weight:700;margin-left:4px">✂️CUT</span>':''}</div>
              <div class="mono" style="font-size:10px;color:var(--muted)">${d.imei}</div></td>
          <td><span class="badge badge-gray">${d.protocol||'—'}</span></td>
          <td style="font-size:12px">${d.vehicle_type||'—'}</td>
          <td><span style="padding:2px 8px;border-radius:99px;background:${col}22;color:${col};font-size:11px;font-weight:700">${st.replace(/_/g,' ').toUpperCase()}</span>
              ${dur?`<div style="font-size:10px;color:${col}">${dur}</div>`:''}</td>
          <td style="font-size:12px">${d.user_email||'—'}</td>
          <td style="font-size:12px">${d.driver_name||'—'}</td>
          <td style="font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address_short||'No GPS'}</td>
          <td class="mono" style="color:${(+d.speed||0)>0?'#22c55e':'var(--muted)'}">${(+d.speed||0).toFixed(0)} km/h</td>
          <td style="font-size:11px;color:var(--muted)">${T.ts(d.last_seen)||'Never'}</td>
          <td>${T.actions(
            T.btn('edit',T.svgEdit(),`openDevModal('${d.id}')`, 'Edit'),
            T.btn('',d.engine_cut?'✅':'✂️',`openEngineCutModal('${d.imei}','${d.name}',${!!d.engine_cut})`, d.engine_cut?'Restore':'Cut Engine'),
            T.btn('',T.svgPlay(),`openPlaybackForImei('${d.imei}')`, 'Playback'),
            T.btn('del',T.svgDel(),`confirmDel('device','${d.id}','${d.name}')`, 'Delete')
          )}</td>
        </tr>`;
      }).join('');
      T.pager('d-pager','d-pg-info', data.length, 25);
    } catch(e) { tb.innerHTML = T.empty(11,'⚠️ '+e.message); }
  }
};

// ================================================================
// PAGE: DRIVERS
// ================================================================
Pages['drivers'] = {
  _filter:'all', _search:'',
  render(el) {
    el.innerHTML = `
      <div class="page-title">Drivers</div>
      <div class="page-sub">Driver profiles, licenses, DSS scores and assignments</div>
      <div class="card">
        <div class="card-header"><span class="card-title">All Drivers</span><span class="card-sub" id="dr-ct-lbl"></span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('drivers')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer">📤 Import<input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('drivers',this)"></label>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('drTable','drivers')">⬇ Export</button>
            <button class="btn btn-primary btn-sm" onclick="openDrvModal()">+ Add Driver</button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="fchip on" onclick="filterDrv('all',this)">All</div>
          <div class="fchip" onclick="filterDrv('active',this)">Active</div>
          <div class="fchip" onclick="filterDrv('inactive',this)">Inactive</div>
          <div class="fchip" onclick="filterDrv('risk',this)">⚠ High Risk DSS&lt;60</div>
          <div class="fchip" onclick="filterDrv('expire',this)">⏳ License Expiring</div>
          <div class="search-field" style="margin-left:auto"><svg width="13" height="13" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search name or license…" oninput="searchDrv(this.value)"></div>
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th><input type="checkbox" onclick="selAll(this,'drTable')"></th>
          <th>Driver</th><th>License</th><th>Type</th><th>Expiry</th><th>Assigned Vehicle</th><th>DSS Score</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody id="drTable">${T.row(9)}</tbody></table></div>
        <div class="pagination"><span id="dr-pg-info"></span><div class="pg-btns" id="dr-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load() {
    const tb = V.$('drTable'); if (!tb) return;
    try {
      M.drivers = await apiGet('/drivers') || [];
      const f = this._filter, s = this._search, today=new Date();
      const data = M.drivers.filter(d => {
        if (f==='active' && !d.is_active) return false;
        if (f==='inactive' && d.is_active) return false;
        if (f==='risk' && (+d.dss_score||75)>=60) return false;
        if (f==='expire') {
          const exp=d.lic_expiry?new Date(d.lic_expiry):null;
          if (!exp || Math.floor((exp-today)/86400000)>90) return false;
        }
        if (s && !`${d.fname} ${d.lname} ${d.phone||''}`.toLowerCase().includes(s)) return false;
        return true;
      });
      const lbl=V.$('dr-ct-lbl'); if(lbl) lbl.textContent=`${M.drivers.length} registered`;
      const sbct=V.$('sb-dr-ct'); if(sbct) sbct.textContent=M.drivers.length;
      if (!data.length) { tb.innerHTML = T.empty(9,'No drivers found'); return; }
      tb.innerHTML = data.map(d => {
        const exp=d.lic_expiry?new Date(d.lic_expiry):null;
        const exDays=exp?Math.floor((exp-today)/86400000):null;
        const exStyle=exDays!=null?(exDays<0?'color:var(--red)':exDays<90?'color:var(--amber)':''):'';
        return `<tr>
          <td><input type="checkbox"></td>
          <td><div style="display:flex;align-items:center;gap:9px">
            <div style="width:32px;height:32px;border-radius:50%;background:${V.gc(d.fname)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">${V.ini(d.fname)}</div>
            <div><div style="font-weight:600">${d.fname} ${d.lname}</div><div style="font-size:11px;color:var(--muted)">${d.phone||'—'}</div></div>
          </div></td>
          <td class="mono" style="font-size:12px">${d.lic_number||'—'}</td>
          <td><span class="badge badge-gray">${d.lic_type||'LMV'}</span></td>
          <td class="mono" style="font-size:12px;${exStyle}">${T.date(d.lic_expiry)}${exDays!=null&&exDays<0?' ⚠':''}</td>
          <td style="font-size:12px">${d.device_name||'Unassigned'}</td>
          <td style="min-width:120px">${T.dssBar(+d.dss_score||75)}</td>
          <td>${T.statusBadge(d.is_active?'active':'inactive')}</td>
          <td>${T.actions(
            T.btn('edit',T.svgEdit(),`openDrvModal('${d.id}')`, 'Edit'),
            T.btn('del',T.svgDel(),`confirmDel('driver','${d.id}','${d.fname} ${d.lname}')`, 'Delete')
          )}</td>
        </tr>`;
      }).join('');
      T.pager('dr-pager','dr-pg-info', data.length, 25);
    } catch(e) { tb.innerHTML = T.empty(9,'⚠️ '+e.message); }
  }
};

// ================================================================
// PAGE: EVENTS
// ================================================================
Pages['events'] = {
  _filter:'all',
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
          <div class="fchip" onclick="filterEv('idle',this)">😴 Idle</div>
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th><input type="checkbox"></th><th>Icon</th><th>Type</th><th>IMEI</th><th>Data</th><th>Location</th><th>Time</th><th>Status</th>
        </tr></thead><tbody id="evTable">${T.row(8)}</tbody></table></div>
        <div class="pagination"><span></span><div class="pg-btns" id="ev-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load() {
    const tb = V.$('evTable'); if (!tb) return;
    try {
      M.events = await apiGet('/events') || [];
      const icoMap={overspeed:'⚡',geofence:'📍',panic:'🚨',power:'🔋',idle:'😴',maintenance:'🔧'};
      const spd=M.events.filter(e=>e.type==='overspeed').length;
      const geo=M.events.filter(e=>e.type==='geofence').length;
      const pan=M.events.filter(e=>e.type==='panic').length;
      V.set('ev-stats',`
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">⚡</div></div><div class="stat-val" style="color:var(--red)">${spd}</div><div class="stat-lbl">Overspeed</div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">📍</div></div><div class="stat-val">${geo}</div><div class="stat-lbl">Geofence</div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">🚨</div></div><div class="stat-val" style="color:var(--red)">${pan}</div><div class="stat-lbl">Panic</div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">📊</div></div><div class="stat-val">${M.events.length}</div><div class="stat-lbl">Total (24h)</div></div>`);
      const sbct=V.$('sb-ev-badge'); if(sbct) sbct.textContent=M.events.length;
      const f = this._filter;
      const data = f==='all' ? M.events : M.events.filter(e=>e.type===f);
      if (!data.length) { tb.innerHTML = T.empty(8,'No events'); return; }
      tb.innerHTML = data.map(e=>`<tr>
        <td><input type="checkbox"></td>
        <td style="font-size:18px">${icoMap[e.type]||'⚠️'}</td>
        <td><span class="badge badge-red">${(e.type||'ALARM').toUpperCase()}</span></td>
        <td class="mono" style="font-size:12px">${e.imei}</td>
        <td style="font-size:12px">${e.data?JSON.stringify(e.data).slice(0,60):'—'}</td>
        <td style="font-size:12px">${e.address||'—'}</td>
        <td class="mono" style="font-size:11px">${T.ts(e.ts)}</td>
        <td><span class="badge badge-amber">Active</span></td>
      </tr>`).join('');
    } catch(e) { tb.innerHTML = T.empty(8,'⚠️ '+e.message); }
  }
};

// ================================================================
// PAGE: ROUTES
// ================================================================
Pages['routes'] = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Routes</div>
      <div class="page-sub">Waypoint chains · Point owners · Timetables · Deviation tracking</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
        <button class="btn btn-primary btn-sm" onclick="openAddRouteModal()">+ New Route</button>
        <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('routes')">⬇ Template</button>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">📤 Import CSV<input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('routes',this)"></label>
        <span id="routes-summary" style="margin-left:auto;font-size:12px;color:var(--muted)"></span>
      </div>
      <div id="route-shell" style="display:flex;gap:14px;height:calc(100vh - 240px);min-height:500px">
        <div id="route-list-panel" style="width:360px;flex-shrink:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
          <div id="routes-list-body"><div style="padding:20px;text-align:center;color:var(--muted)">⏳ Loading routes…</div></div>
        </div>
        <div style="flex:1;background:var(--white);border-radius:var(--radius);border:1px solid var(--border);overflow:hidden;position:relative">
          <div id="route-builder-map" style="width:100%;height:100%"></div>
        </div>
      </div>`;
    // Init map then load list
    if (!window._routeMap) {
      const el2 = V.$('route-builder-map');
      if (el2 && typeof L !== 'undefined') {
        window._routeMap = L.map('route-builder-map').setView([12.9716,77.5946],12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(window._routeMap);
        window._routeMarkers=[]; window._routePolyline=null;
      }
    } else {
      setTimeout(()=>{ if(window._routeMap) window._routeMap.invalidateSize(); },200);
    }
    loadRoutesList();
  }
};

// ================================================================
// PAGE: MAINTENANCE
// ================================================================
Pages['maintenance'] = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Maintenance</div>
      <div class="page-sub">Service tasks — odometer, engine hours &amp; date triggers</div>
      <div class="stats-grid sg4" id="maint-stats"></div>
      <div class="card">
        <div class="card-header"><span class="card-title">🔧 Maintenance Tasks</span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadMaintTemplate()">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer">📤 Import<input type="file" accept=".csv" style="display:none" onchange="bulkImportMaint(this)"></label>
            <button class="btn btn-primary btn-sm" onclick="openAddMaintModal()">+ Add Task</button>
          </div>
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th>Vehicle</th><th>Task</th><th>Type</th><th>Due Odometer</th><th>Due Hours</th><th>Due Days</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody id="maintTable">${T.row(8)}</tbody></table></div>
      </div>`;
    this._load();
  },
  async _load() {
    const tb = V.$('maintTable'); if (!tb) return;
    try {
      M.maint = await apiGet('/maintenance') || [];
      const total=M.maint.length, overdue=M.maint.filter(m=>m.computed_status==='overdue').length;
      const dueSoon=M.maint.filter(m=>m.computed_status==='due_soon').length, done=M.maint.filter(m=>m.status==='done').length;
      V.set('maint-stats',`
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">📋</div></div><div class="stat-val">${total}</div><div class="stat-lbl">Total Tasks</div><div class="stat-bar" style="background:var(--primary)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">🚨</div></div><div class="stat-val" style="color:var(--red)">${overdue}</div><div class="stat-lbl">Overdue</div><div class="stat-bar" style="background:var(--red)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--amber-bg)">⚠️</div></div><div class="stat-val" style="color:var(--amber)">${dueSoon}</div><div class="stat-lbl">Due Soon</div><div class="stat-bar" style="background:var(--amber)"></div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">✅</div></div><div class="stat-val" style="color:var(--green)">${done}</div><div class="stat-lbl">Completed</div><div class="stat-bar" style="background:var(--green)"></div></div>`);
      const sbct=V.$('sb-maint-ct'); if(sbct){sbct.textContent=overdue+dueSoon;sbct.style.display=(overdue+dueSoon)>0?'':'none';}
      if (!M.maint.length) { tb.innerHTML = T.empty(8,'No tasks yet — click + Add Task'); return; }
      const stMap={overdue:'red',due_soon:'amber',ok:'green',done:'blue',pending:'gray'};
      tb.innerHTML = M.maint.map(m=>{
        const cs=m.status==='done'?'done':(m.computed_status||m.status||'ok');
        return `<tr>
          <td style="font-weight:600">${m.device_name||m.imei}</td>
          <td>${m.title}</td>
          <td><span class="badge badge-gray">${(m.task_type||'').replace('_',' ')}</span></td>
          <td class="mono">${m.due_odometer?m.due_odometer.toLocaleString()+' km':'—'}</td>
          <td class="mono">${m.due_engine_hours?m.due_engine_hours+' h':'—'}</td>
          <td class="mono">${m.due_days?m.due_days+' d':'—'}</td>
          <td>${T.badge(stMap[cs]||'gray',cs.replace('_',' '))}</td>
          <td>${T.actions(
            m.status!=='done'?T.btn('','✅',`markMaintDone('${m.id}')`, 'Done'):'',
            T.btn('del',T.svgDel(),`deleteMaintTask('${m.id}')`, 'Delete')
          )}</td>
        </tr>`;
      }).join('');
    } catch(e) { tb.innerHTML = T.empty(8,'⚠️ '+e.message); }
  }
};

// ================================================================
// PAGE: GEOFENCES
// ================================================================
Pages['geofence'] = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Geo-fences</div>
      <div class="page-sub">Draw polygon &amp; circle zones — entry/exit alerts per vehicle</div>
      <div class="stats-grid sg2" style="height:calc(100vh - 190px);min-height:500px">
        <div class="card" style="margin-bottom:0;display:flex;flex-direction:column;overflow:hidden">
          <div class="card-header"><span class="card-title">Fence List</span>
            <div class="card-actions">
              <button class="btn btn-secondary btn-sm" onclick="gfDrawMode('polygon')">✏️ Polygon</button>
              <button class="btn btn-secondary btn-sm" onclick="gfDrawMode('circle')">⭕ Circle</button>
            </div>
          </div>
          <div style="padding:10px;border-bottom:1px solid var(--border)">
            <div id="gf-draw-hint" style="font-size:12px;color:var(--muted);padding:6px 10px;background:#f8fafc;border-radius:6px">
              Click ✏️ Polygon or ⭕ Circle then draw on the map →</div>
          </div>
          <div style="flex:1;overflow-y:auto" id="gf-list"><div style="padding:20px;text-align:center;color:var(--muted)">⏳ Loading…</div></div>
        </div>
        <div class="card" style="margin-bottom:0;padding:0;overflow:hidden;position:relative">
          <div id="gf-map" style="width:100%;height:100%;min-height:400px"></div>
        </div>
      </div>`;
    if (!window._gfMap) {
      const mapEl = V.$('gf-map');
      if (mapEl && typeof L !== 'undefined') {
        window._gfMap = L.map('gf-map').setView([12.9716,77.5946],12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(window._gfMap);
        window._gfLayer = L.featureGroup().addTo(window._gfMap);
        window._gfFences = []; window._gfPendingCoords = null; window._gfPendingShape = 'polygon';
      }
    } else {
      setTimeout(()=>{ if(window._gfMap) window._gfMap.invalidateSize(); },200);
    }
    loadGeofences();
  }
};

// ================================================================
// PAGE: NOTIFICATIONS
// ================================================================
Pages['notifications'] = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Notification Hub</div>
      <div class="page-sub">Per-user-level alert settings &amp; history</div>
      <div class="stats-grid sg3" id="notif-stats-row">
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">📨</div></div><div class="stat-val" id="notif-stat-total">—</div><div class="stat-lbl">Total Notifications</div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--amber-bg)">🔔</div></div><div class="stat-val" id="notif-stat-unread" style="color:var(--amber)">—</div><div class="stat-lbl">Unread</div></div>
        <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">✅</div></div><div class="stat-val" style="color:var(--green)">10</div><div class="stat-lbl">Event Types Configured</div></div>
      </div>
      <div class="stats-grid sg2">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">⚙️ Alert Matrix</span>
            <div class="card-actions"><button class="btn btn-primary btn-sm" onclick="saveNotifSettings()">💾 Save</button></div>
          </div>
          <div style="overflow-x:auto"><table style="min-width:480px">
            <thead><tr><th style="text-align:left;padding:10px 14px">Event Type</th><th style="text-align:center;padding:10px">Beginner</th><th style="text-align:center;padding:10px">Medium</th><th style="text-align:center;padding:10px">Pro</th></tr></thead>
            <tbody id="notif-matrix-body"><tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted)">⏳</td></tr></tbody>
          </table></div>
          <div style="padding:12px 14px;border-top:1px solid var(--border);font-size:11.5px;color:var(--muted)">
            🔥 Firebase: <span id="notif-firebase-status">Not configured</span>
            &nbsp;·&nbsp;<button class="btn btn-secondary btn-sm" onclick="openModal('firebaseModal')">Configure Firebase</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">📋 History</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="markNotifsRead()">✓ Mark All Read</button></div>
          </div>
          <div class="tbl-scroll" style="max-height:420px"><table>
            <thead><tr><th>Time</th><th>Event</th><th>Device</th><th>Message</th></tr></thead>
            <tbody id="notif-history-body"><tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted)">⏳</td></tr></tbody>
          </table></div>
        </div>
      </div>`;
    this._load();
  },
  async _load() {
    try {
      const data = await apiGet('/notifications'); if (!data) return;
      const {settings=[],history=[],unread=0} = data;
      const e=(id,v)=>{const el=V.$(id);if(el)el.textContent=v;};
      e('notif-stat-total',history.length); e('notif-stat-unread',unread);
      const sbct=V.$('sb-notif-ct'); if(sbct){sbct.textContent=unread;sbct.style.display=unread>0?'':'none';}
      const EL={ignition_on:'🔑 Ignition ON',ignition_off:'🔑 Ignition OFF',charging_off:'🔌 Charging Off',vehicle_added:'🚗 Vehicle Added',geofence_entry:'📍 Geofence Entry',geofence_exit:'↩ Geofence Exit',engine_cut:'✂️ Engine Cut'};
      const evts=[...new Set(settings.map(s=>s.event_type))];
      const lvls=['beginner','medium','pro'];
      const smap={}; settings.forEach(s=>smap[s.event_type+'_'+s.user_level]=s.enabled);
      V.set('notif-matrix-body', evts.map(ev=>`<tr><td style="padding:8px 14px;font-size:13px">${EL[ev]||ev}</td>${lvls.map(lvl=>`<td style="text-align:center;padding:8px"><input type="checkbox" data-ev="${ev}" data-lvl="${lvl}" ${smap[ev+'_'+lvl]?'checked':''} onchange="notifMatrixChange(this)" style="width:16px;height:16px"></td>`).join('')}</tr>`).join(''));
      V.set('notif-history-body', history.length ? history.map(h=>`<tr>
        <td class="mono" style="font-size:11px">${T.ts(h.ts)}</td>
        <td><span class="badge badge-blue" style="font-size:10px">${h.event_type||'—'}</span></td>
        <td style="font-size:12px">${h.imei||'—'}</td>
        <td style="font-size:12px">${h.title||h.body||'—'}</td>
      </tr>`).join('') : '<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted)">No notifications yet</td></tr>');
    } catch(e) { console.warn('[notif]',e.message); }
  }
};

// ================================================================
// PAGE: REPORTS
// ================================================================
Pages['reports'] = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Reports</div>
      <div class="page-sub">Generate and export fleet analytics</div>
      <div class="card">
        <div class="card-header"><span class="card-title">Report Generator</span></div>
        <div class="mbody">
          <div class="frow">
            <div class="fg"><label class="flabel">Report Type</label>
              <select class="fselect" id="rpt-type">
                <option>Fleet Status</option><option>Driver Safety Score</option>
                <option>Alarm Report</option><option>Mileage Report</option>
              </select></div>
            <div class="fg"><label class="flabel">Device</label><select class="fselect" id="rpt-dev"><option>All Devices</option></select></div>
            <div class="fg"><label class="flabel">From Date</label><input class="finput" type="date" id="rpt-from"></div>
            <div class="fg"><label class="flabel">To Date</label><input class="finput" type="date" id="rpt-to"></div>
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
        <div class="tbl-scroll"><table><thead><tr id="rpt-head"></tr></thead><tbody id="rpt-table"></tbody></table></div>
      </div>`;
    this._init();
  },
  async _init() {
    try {
      const devs = await apiGet('/devices') || [];
      const sel = V.$('rpt-dev'); if (!sel) return;
      sel.innerHTML = '<option value="">All Devices</option>'+devs.map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');
      const to=new Date(), from=new Date(to-7*86400000);
      const fmt=d=>d.toISOString().slice(0,10);
      const fd=V.$('rpt-from'), td=V.$('rpt-to');
      if(fd&&!fd.value) fd.value=fmt(from);
      if(td&&!td.value) td.value=fmt(to);
    } catch {}
  }
};

// ================================================================
// PAGE: AUDIT LOG
// ================================================================
Pages['logs'] = {
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
          <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="exportCSV('logTable','logs')">⬇ Export</button></div>
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th><th>Status</th><th>Detail</th>
        </tr></thead><tbody id="logTable">${T.row(7)}</tbody></table></div>
        <div class="pagination"><span id="log-pg-info"></span><div class="pg-btns" id="log-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load() {
    const tb = V.$('logTable'); if (!tb) return;
    try {
      const data = await apiGet('/audit') || [];
      if (!data.length) { tb.innerHTML = T.empty(7,'No audit events yet'); return; }
      const am={LOGIN:'green',LOGIN_FAILED:'red',CREATE:'blue',UPDATE:'amber',DELETE:'red',ALARM:'red',ENGINE_CUT:'red',ENGINE_RESTORE:'green'};
      tb.innerHTML = data.map(l=>`<tr>
        <td class="mono" style="font-size:11px">${T.ts(l.ts)}</td>
        <td class="mono" style="font-size:11px">${l.user_email||'—'}</td>
        <td>${T.badge(am[l.action]||'gray',l.action||'—')}</td>
        <td style="font-size:12px">${l.resource||'—'}</td>
        <td class="mono" style="font-size:11px">${l.ip_addr||'—'}</td>
        <td>${T.badge(l.status==='OK'?'green':'red',l.status||'—')}</td>
        <td style="font-size:11px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.detail||'—'}</td>
      </tr>`).join('');
      T.pager('log-pager','log-pg-info', data.length, 25);
    } catch(e) { tb.innerHTML = T.empty(7,'⚠️ '+e.message); }
  }
};

// ================================================================
// PAGE: SETUP
// ================================================================
Pages['setup'] = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">Setup &amp; Configuration</div>
      <div class="page-sub">System settings, roles and integrations</div>
      <div class="stats-grid sg3">
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">⚙️ Server Config</span></div><div class="mbody">
          <div class="frow"><div class="fg"><label class="flabel">GPS Server Host</label><input class="finput" value="127.0.0.1" id="cfg-host"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">GPS Port</label><input class="finput" value="6001" id="cfg-port"></div><div class="fg"><label class="flabel">Mgmt Port</label><input class="finput" value="6002" id="cfg-mgmt"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">PostgreSQL DSN</label><input class="finput" value="postgresql://fleetos:fleetos123@127.0.0.1:5432/fleetos" id="cfg-pg"></div></div>
          <button class="btn btn-primary btn-sm" onclick="toast('Config saved','success','⚙️')">Save Config</button>
        </div></div>
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">🔑 API Keys</span></div><div class="mbody">
          <div class="frow"><div class="fg"><label class="flabel">Geocoder</label><select class="fselect"><option>OpenStreetMap (free)</option><option>Google Maps</option><option>MapBox</option></select></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Geocoder API Key</label><input class="finput" type="password" placeholder="blank = OSM free"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Firebase Project ID</label><input class="finput" placeholder="your-project-id"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">SMS API Key</label><input class="finput" type="password" placeholder="MSG91 / Twilio"></div></div>
          <button class="btn btn-primary btn-sm" onclick="toast('Keys saved','success','🔑')">Save Keys</button>
        </div></div>
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">🛡️ Role Matrix</span></div>
          <div class="timeline">
            <div class="tl-item"><div class="tl-ico" style="background:var(--red-bg)">👑</div><div class="tl-content"><div class="tl-title">Admin</div><div class="tl-sub">Full access — all panels, users, system config, logs</div></div><span class="badge badge-red">Full</span></div>
            <div class="tl-item"><div class="tl-ico" style="background:var(--amber-bg)">📊</div><div class="tl-content"><div class="tl-title">Manager</div><div class="tl-sub">All devices, ack alarms, reports, notifications</div></div><span class="badge badge-amber">Ops</span></div>
            <div class="tl-item"><div class="tl-ico" style="background:var(--orange-bg)">🏪</div><div class="tl-content"><div class="tl-title">Dealer</div><div class="tl-sub">Sub-accounts and own client devices</div></div><span class="badge badge-orange">Dealer</span></div>
            <div class="tl-item"><div class="tl-ico" style="background:var(--violet-bg)">🎛️</div><div class="tl-content"><div class="tl-title">Operator</div><div class="tl-sub">Assigned devices only, can send commands</div></div><span class="badge badge-violet">Ops</span></div>
            <div class="tl-item"><div class="tl-ico" style="background:var(--primary-light)">👤</div><div class="tl-content"><div class="tl-title">User</div><div class="tl-sub">Own devices only, read access</div></div><span class="badge badge-blue">Read</span></div>
          </div>
        </div>
      </div>`;
  }
};

// ================================================================
// PAGE: PROFILE
// ================================================================
Pages['profile'] = {
  render(el) {
    el.innerHTML = `
      <div class="page-title">My Profile</div>
      <div class="page-sub">Account settings and security</div>
      <div class="stats-grid sg2">
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">👤 Account</span></div><div class="mbody">
          <div class="frow"><div class="fg"><label class="flabel">First Name</label><input class="finput" id="pf-fname" value="${M.user?.fname||''}"></div><div class="fg"><label class="flabel">Last Name</label><input class="finput" id="pf-lname" value="${M.user?.lname||''}"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Email</label><input class="finput" id="pf-email" type="email" value="${M.user?.email||''}"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Role</label><input class="finput" value="${M.role||'admin'}" readonly></div><div class="fg"><label class="flabel">Timezone</label><select class="fselect"><option>Asia/Kolkata (IST +5:30)</option><option>UTC</option></select></div></div>
          <button class="btn btn-primary btn-sm" onclick="toast('Profile updated','success','✅')">Save Profile</button>
        </div></div>
        <div class="card" style="margin-bottom:0"><div class="card-header"><span class="card-title">🔐 Security</span></div><div class="mbody">
          <div class="frow"><div class="fg"><label class="flabel">Current Password</label><input class="finput" type="password" placeholder="••••••••"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">New Password</label><input class="finput" type="password" placeholder="Min 8 chars"></div></div>
          <div class="frow"><div class="fg"><label class="flabel">Confirm Password</label><input class="finput" type="password" placeholder="Repeat new"></div></div>
          <hr class="fdivider">
          <button class="btn btn-primary btn-sm" onclick="toast('Password changed','success','🔐')">Change Password</button>
          <button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="doLogout()">Sign Out</button>
        </div></div>
      </div>`;
  }
};

// ================================================================
// PLAYBACK PAGE — handled by renderPlayback in app.js
// ================================================================
Pages['playback'] = {
  render(el) {
    el.style.cssText='padding:0;height:calc(100vh - 56px);overflow:hidden';
    if (typeof renderPlayback === 'function') renderPlayback(el);
  }
};

// ================================================================
// filterU / filterD / filterDrv / filterEv — update VM state
// ================================================================
function filterU(f,el){
  if(Pages['users']) Pages['users']._filter=f;
  document.querySelectorAll('#page-users .fchip').forEach(c=>c.classList.remove('on'));
  if(el) el.classList.add('on');
  if(Pages['users']&&Pages['users']._load) Pages['users']._load();
}
function filterD(f,el){
  if(Pages['devices']) Pages['devices']._filter=f;
  document.querySelectorAll('#page-devices .fchip').forEach(c=>c.classList.remove('on'));
  if(el) el.classList.add('on');
  if(Pages['devices']&&Pages['devices']._load) Pages['devices']._load();
}
function filterDrv(f,el){
  if(Pages['drivers']) Pages['drivers']._filter=f;
  document.querySelectorAll('#page-drivers .fchip').forEach(c=>c.classList.remove('on'));
  if(el) el.classList.add('on');
  if(Pages['drivers']&&Pages['drivers']._load) Pages['drivers']._load();
}
function filterEv(f,el){
  if(Pages['events']) Pages['events']._filter=f;
  document.querySelectorAll('#page-events .fchip').forEach(c=>c.classList.remove('on'));
  if(el) el.classList.add('on');
  if(Pages['events']&&Pages['events']._load) Pages['events']._load();
}
function searchU(v){if(Pages['users']){Pages['users']._search=v.toLowerCase();Pages['users']._load();}}
function searchD(v){if(Pages['devices']){Pages['devices']._search=v.toLowerCase();Pages['devices']._load();}}
function searchDrv(v){if(Pages['drivers']){Pages['drivers']._search=v.toLowerCase();Pages['drivers']._load();}}

// ================================================================
// genReport — reports page action
// ================================================================
async function genReport(){
  const rptCard=V.$('rpt-card'),rptTitle=V.$('rpt-title');
  const rptHead=V.$('rpt-head'),rptTable=V.$('rpt-table');
  if(!rptTable) return;
  if(rptCard) rptCard.style.display='';
  rptTable.innerHTML=T.row(8);
  try{
    const from=V.$('rpt-from')?.value;
    const dev=V.$('rpt-dev')?.value;
    const p=new URLSearchParams({type:'fleet',date:from||new Date().toISOString().slice(0,10)});
    if(dev) p.set('imei',dev);
    const data=await apiGet('/report?'+p.toString());
    if(!Array.isArray(data)||!data.length){rptTable.innerHTML=T.empty(8,'No data');return;}
    const cols=Object.keys(data[0]);
    if(rptHead) rptHead.innerHTML=cols.map(c=>`<th>${c.replace(/_/g,' ').toUpperCase()}</th>`).join('');
    rptTable.innerHTML=data.map(row=>`<tr>${cols.map(c=>`<td style="font-size:12px">${row[c]??'—'}</td>`).join('')}</tr>`).join('');
    if(rptTitle) rptTitle.textContent=(V.$('rpt-type')?.value||'Fleet')+' Report';
  }catch(e){rptTable.innerHTML=`<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--red)">Error: ${e.message}</td></tr>`;}
}

// ================================================================
// viewUser — user detail modal
// ================================================================
async function viewUser(id){
  try{
    const u=await apiGet('/users/'+id);
    _ensureModal('userDetailModal',`
      <div class="mhdr"><div><div class="mtitle" id="udm-title">User Detail</div><div class="msub" id="udm-sub"></div></div><div class="mclose" onclick="closeModal('userDetailModal')">✕</div></div>
      <div class="mbody" id="udm-body"></div>
      <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('userDetailModal')">Close</button></div>`);
    const title=document.getElementById('udm-title'),sub=document.getElementById('udm-sub'),body=document.getElementById('udm-body');
    if(title) title.textContent=u.fname+' '+u.lname;
    if(sub) sub.textContent=u.email;
    if(body) body.innerHTML=`<table style="width:100%;font-size:13px;border-collapse:collapse">${Object.entries(u).filter(([k])=>!k.includes('hash')).map(([k,v])=>`<tr style="border-bottom:1px solid var(--border)"><td style="padding:7px 10px;color:var(--muted);font-weight:600;width:140px">${k}</td><td style="padding:7px 10px">${v??'—'}</td></tr>`).join('')}</table>`;
    openModal('userDetailModal');
  }catch(e){toast('Error: '+e.message,'error');}
}

// openPlayback — called from sidebar + map markers
function openPlayback(imei) {
  if (imei) localStorage.setItem('pb_preload_imei', imei);
  nav('playback');
}

// ================================================================
// BOOT — runs after app.js + pages.js both loaded
// All Pages[] are registered here, so nav() will find them.
// ================================================================
(async function boot(){
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email:'admin@fleetcop.com', password:'Admin@123'})
    });
    const data = await res.json();
    if (data.token) {
      M.jwt  = data.token;
      sessionStorage.setItem('fleetos_jwt', M.jwt);
      M.role = data.user?.role  || 'admin';
      M.user = {
        fname: data.user?.fname || 'Fleet',
        lname: data.user?.lname || 'Admin',
        email: data.user?.email || 'admin@fleetcop.com'
      };
      // Hide login page (if visible)
      const lp = document.getElementById('loginPage');
      if (lp) lp.style.display = 'none';
      VM_applyRole();
      nav('dashboard');
      setTimeout(loadBellNotifs, 2000);
      setInterval(loadBellNotifs, 30000);
    }
  } catch { setTimeout(boot, 600); }
})();

