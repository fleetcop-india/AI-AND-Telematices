// ================================================================
// Fleet OS v2.0 — pages.js  (MVVM ViewModels)
// ================================================================

const T = {
  row:   c => `<tr><td colspan="${c}" style="padding:32px;text-align:center;color:var(--muted)"><span style="font-size:22px">⏳</span><div style="margin-top:8px;font-size:13px">Loading…</div></td></tr>`,
  empty: (c,msg='No data yet') => `<tr><td colspan="${c}" style="padding:40px;text-align:center;color:var(--muted)"><div style="font-size:28px;margin-bottom:8px">📭</div><div style="font-size:13px;font-weight:500">${msg}</div></td></tr>`,
  ts:    d => d ? new Date(d).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : '—',
  date:  d => d ? new Date(d).toLocaleDateString('en-IN',{dateStyle:'medium'}) : '—',
  badge: (cls,txt) => `<span class="badge badge-${cls}">${txt}</span>`,
  roleBadge(r){const m={admin:'red',manager:'amber',dealer:'orange',operator:'violet',user:'blue',demo:'green'};const i={admin:'👑',manager:'📊',dealer:'🏪',operator:'🎛️',user:'👤',demo:'👁️'};return `<span class="badge badge-${m[r]||'gray'}">${i[r]||''}${r}</span>`;},
  stBadge(s){const col={active:'green',online:'green',moving:'green',idle:'amber',stopped:'gray',offline:'gray',never_connected:'gray',inactive:'gray',suspended:'red'};const dot=['active','online','moving'].includes(s)?'<span class="bdot"></span>':'';return `<span class="badge badge-${col[s]||'gray'}">${dot}${(s||'').replace(/_/g,' ')}</span>`;},
  dssBar(score){const s=+score||75,c=s>=80?'#059669':s>=60?'#D97706':'#DC2626';return `<div style="display:flex;align-items:center;gap:8px;min-width:110px"><div style="flex:1;background:var(--border);border-radius:99px;height:6px;overflow:hidden"><div style="width:${s}%;height:100%;background:${c};border-radius:99px"></div></div><span style="font-weight:700;color:${c};min-width:28px;font-size:12px">${s}</span></div>`;},
  pager(pid,iid,total,per=25){const p=document.getElementById(pid),i=document.getElementById(iid);if(!p)return;const pages=Math.ceil(total/per);if(i)i.textContent=`${Math.min(per,total).toLocaleString()} of ${total.toLocaleString()}`;p.innerHTML=Array.from({length:Math.min(pages,7)},(_,j)=>`<div class="pg-btn${j===0?' on':''}" onclick="this.parentNode.querySelectorAll('.pg-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${j+1}</div>`).join('');},
  iconEdit:  '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>',
  iconDel:   '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  iconEye:   '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  iconPlay:  '<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21"/></svg>',
  btn: (cls, icon, cb, tip='') => `<button class="btn-icon ${cls}" onclick="${cb}" title="${tip}" style="width:28px;height:28px">${icon}</button>`,
  acts: (...b) => `<div style="display:flex;gap:3px;align-items:center">${b.join('')}</div>`,
};

function pageHeader(title, sub) {
  return `<div style="margin-bottom:24px"><h1 style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:var(--text);margin:0 0 4px">${title}</h1><p style="font-size:13px;color:var(--muted);margin:0">${sub}</p></div>`;
}
function searchField(placeholder, oninput) {
  return `<div class="search-field" style="margin-left:auto;min-width:220px"><svg width="13" height="13" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input placeholder="${placeholder}" oninput="${oninput}" style="width:100%"></div>`;
}
function statCard(ico, val, lbl, col, bg, onclick='') {
  return `<div class="stat-card"${onclick?` onclick="${onclick}" style="cursor:pointer"`:''}>
    <div class="stat-top"><div class="stat-ico" style="background:${bg}">${ico}</div></div>
    <div class="stat-val" style="color:${col}">${val}</div>
    <div class="stat-lbl">${lbl}</div>
    <div class="stat-bar" style="background:${col}"></div>
  </div>`;
}

Pages['dashboard'] = {
  _timer: null,
  render(el) {
    el.innerHTML = `
      ${pageHeader('Dashboard','Live fleet overview · auto-refreshes every 15 s')}
      <div class="stats-grid sg6" id="dash-stats" style="margin-bottom:24px">
        ${Array(6).fill(0).map(()=>'<div class="stat-card"><div style="height:72px;background:var(--bg);border-radius:10px"></div></div>').join('')}
      </div>
      <div class="stats-grid sg2">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">📡 Live Positions</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="nav('map')">Open Map</button></div></div>
          <div class="tbl-scroll"><table><thead><tr><th>Vehicle</th><th>Driver</th><th>Speed</th><th>Location</th><th>Status</th><th>Last Seen</th></tr></thead>
          <tbody id="dash-live">${T.row(6)}</tbody></table></div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">🔔 Recent Alarms</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="nav('events')">All Events</button></div></div>
          <div class="timeline" id="dash-alerts" style="padding:8px 16px 12px"><div style="padding:28px;text-align:center;color:var(--muted)">⏳</div></div>
        </div>
      </div>`;
    this._load();
    if(this._timer)clearInterval(this._timer);
    this._timer=setInterval(()=>this._load(),15000);
  },
  destroy(){clearInterval(this._timer);this._timer=null;},
  async _load(){
    try{
      const s=await apiGet('/dashboard');if(!s)return;
      const total=+(s.devices?.total||0),moving=+(s.devices?.moving||0),drvs=+(s.drivers?.total||0);
      const dss=+(s.drivers?.avg_dss||0),users=+(s.users?.total||0),alarms=+(s.alarms?.active||0);
      const stColor={moving:'#22c55e',idle:'#f59e0b',stopped:'#94a3b8',offline:'#ef4444',never_connected:'#cbd5e1'};
      V.set('dash-stats',[
        statCard('🟢',moving,   'Moving Now',   '#059669','#ECFDF5',"nav('map')"),
        statCard('📡',total,    'Total Devices','#2563EB','#EFF6FF',"nav('devices')"),
        statCard('🚗',drvs,     'Active Drivers','#7C3AED','#F5F3FF',"nav('drivers')"),
        statCard('👤',users,    'Active Users',  '#D97706','#FFFBEB',"nav('users')"),
        statCard('🚨',alarms,   'Active Alarms', '#DC2626','#FEF2F2',"nav('events')"),
        statCard('⭐',dss||'—', 'Avg DSS Score', dss>=80?'#059669':dss>=60?'#D97706':'#DC2626','#ECFDF5',"nav('drivers')"),
      ].join(''));
      const live=s.live||[];
      V.set('dash-live',live.length?live.map(v=>`<tr onclick="nav('map')" style="cursor:pointer">
        <td><div style="font-weight:600">${v.name}</div><div style="font-size:10px;color:var(--muted)">${v.imei}</div></td>
        <td style="font-size:12px">${v.driver_name||'—'}</td>
        <td style="font-weight:700;color:${(+v.speed||0)>0?'#22c55e':'var(--muted)'}">${(+v.speed||0).toFixed(0)} km/h</td>
        <td style="font-size:11px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.address_short||'—'}</td>
        <td><span style="padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;background:${(stColor[v.status]||'#94a3b8')+'18'};color:${stColor[v.status]||'#94a3b8'}">${(v.status||'offline').toUpperCase()}</span></td>
        <td style="font-size:11px;color:var(--muted)">${T.ts(v.ts)}</td>
      </tr>`).join(''): T.empty(6,'No GPS data yet'));
      const evts=s.events||[];
      V.set('dash-alerts',evts.length?evts.map(e=>`<div class="tl-item">
        <div class="tl-ico" style="background:#FEF2F2;border-radius:10px">⚠️</div>
        <div class="tl-content"><div class="tl-title">${e.alarm_type||'ALARM'} — ${e.device_name||e.imei}</div>
        <div class="tl-sub">${e.address||'No location'}</div></div>
        <span class="tl-time">${T.ts(e.ts)}</span>
      </div>`).join(''):'<div style="padding:32px;text-align:center;color:var(--muted)"><div style="font-size:24px;margin-bottom:8px">✅</div>No recent alarms</div>');
    }catch(e){console.warn('[dash]',e.message);}
  }
};

Pages['users'] = {
  _filter:'all', _search:'',
  render(el){
    el.innerHTML=`
      ${pageHeader('Users','Fleet accounts, access levels and sub-account hierarchy')}
      <div class="card">
        <div class="card-header">
          <div><span class="card-title">All Users</span><span class="card-sub" id="u-ct-lbl" style="margin-left:10px"></span></div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('users')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import<input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('users',this)"></label>
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
          ${searchField('Search name / email…','searchU(this.value)')}
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th style="width:36px"><input type="checkbox" onclick="selAll(this,'uTable')" style="accent-color:var(--primary)"></th>
          <th>User</th><th>Phone</th><th>Role</th><th>Manager</th><th>Devices</th><th>Last Login</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody id="uTable">${T.row(9)}</tbody></table></div>
        <div class="pagination"><span id="u-pg-info" style="font-size:12px;color:var(--muted)"></span><div class="pg-btns" id="u-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load(){
    const tb=V.$('uTable');if(!tb)return;
    try{
      M.users=await apiGet('/users')||[];
      const f=this._filter,s=this._search;
      const data=M.users.filter(u=>{
        if(f!=='all'&&u.role!==f)return false;
        if(s&&!`${u.fname} ${u.lname} ${u.email}`.toLowerCase().includes(s))return false;
        return true;
      });
      const lbl=V.$('u-ct-lbl');if(lbl)lbl.textContent=`${M.users.length} total`;
      const sbct=V.$('sb-u-ct');if(sbct)sbct.textContent=M.users.length;
      if(!data.length){tb.innerHTML=T.empty(9,'No users found');return;}
      tb.innerHTML=data.map(u=>`<tr>
        <td><input type="checkbox" style="accent-color:var(--primary)"></td>
        <td><div style="display:flex;align-items:center;gap:11px">
          <div style="width:34px;height:34px;border-radius:10px;background:${V.gc(u.email)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0">${V.ini(u.fname)}</div>
          <div><div style="font-weight:600;font-size:13px">${u.fname} ${u.lname}</div><div style="font-size:11px;color:var(--muted)">${u.email}</div></div>
        </div></td>
        <td style="font-size:12px">${u.phone||'—'}</td>
        <td>${T.roleBadge(u.role)}</td>
        <td style="font-size:12px">${u.manager_email||'—'}</td>
        <td><span style="font-weight:600">${u.device_count||0}</span><span style="color:var(--muted)"> / ${u.device_limit||'∞'}</span></td>
        <td style="font-size:11px;color:var(--muted)">${T.ts(u.last_login)||'Never'}</td>
        <td>${T.stBadge(u.status)}</td>
        <td>${T.acts(T.btn('',T.iconEye,`viewUser('${u.id}')`,  'View'),T.btn('edit',T.iconEdit,`openUserModal('${u.id}')`, 'Edit'),T.btn('del',T.iconDel, `confirmDel('user','${u.id}','${u.email}')`, 'Delete'))}</td>
      </tr>`).join('');
      T.pager('u-pager','u-pg-info',data.length);
    }catch(e){tb.innerHTML=T.empty(9,'⚠️ '+e.message);}
  }
};

Pages['devices'] = {
  _filter:'all', _search:'',
  render(el){
    el.innerHTML=`
      ${pageHeader('Devices / Objects','GPS trackers, vehicles and IoT assets')}
      <div class="card">
        <div class="card-header">
          <div><span class="card-title">All Devices</span><span class="card-sub" id="d-ct-lbl" style="margin-left:10px"></span></div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('devices')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import<input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('devices',this)"></label>
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
          ${searchField('Search IMEI or name…','searchD(this.value)')}
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th style="width:36px"></th><th>Device / IMEI</th><th>Protocol</th><th>Type</th><th>Status</th>
          <th>User</th><th>Driver</th><th>Location</th><th>Speed</th><th>Last Seen</th><th>Actions</th>
        </tr></thead><tbody id="dTable">${T.row(11)}</tbody></table></div>
        <div class="pagination"><span id="d-pg-info" style="font-size:12px;color:var(--muted)"></span><div class="pg-btns" id="d-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load(){
    const tb=V.$('dTable');if(!tb)return;
    try{
      M.devices=await apiGet('/devices')||[];
      const f=this._filter,s=this._search;
      const stC={moving:'#22c55e',idle:'#f59e0b',stopped:'#94a3b8',offline:'#ef4444',never_connected:'#cbd5e1'};
      const data=M.devices.filter(d=>{
        if(f!=='all'){const st=d.status||'offline';
          if(f==='online'&&!['moving','idle'].includes(st))return false;
          if(f==='offline'&&!['offline','never_connected'].includes(st))return false;
          if(f==='idle'&&st!=='idle')return false; if(f==='alarm'&&st!=='alarm')return false;}
        if(s&&!`${d.name} ${d.imei}`.toLowerCase().includes(s))return false; return true;
      });
      const lbl=V.$('d-ct-lbl');if(lbl)lbl.textContent=`${M.devices.length} registered`;
      const sbct=V.$('sb-d-ct');if(sbct)sbct.textContent=M.devices.length;
      if(!data.length){tb.innerHTML=T.empty(11,'No devices found');return;}
      tb.innerHTML=data.map(d=>{
        const st=d.status||'offline',col=stC[st]||'#94a3b8';
        const dur=d.state_mins!=null?`<div style="font-size:10px;color:${col};margin-top:2px">${Math.floor(d.state_mins/60)}h ${d.state_mins%60}m</div>`:'';
        return `<tr>
          <td><input type="checkbox" style="accent-color:var(--primary)"></td>
          <td><div style="font-weight:600;font-size:13px">${d.name}${d.engine_cut?'<span style="margin-left:5px;padding:1px 5px;background:#FEF2F2;color:#DC2626;font-size:10px;border-radius:4px;font-weight:700">✂️CUT</span>':''}</div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--muted)">${d.imei}</div></td>
          <td>${T.badge('gray',d.protocol||'—')}</td>
          <td style="font-size:12px">${d.vehicle_type||'—'}</td>
          <td><span style="padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;background:${col}18;color:${col}">${st.replace(/_/g,' ').toUpperCase()}</span>${dur}</td>
          <td style="font-size:12px">${d.user_email||'—'}</td>
          <td style="font-size:12px">${d.driver_name||'—'}</td>
          <td style="font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address_short||'No GPS'}</td>
          <td style="font-family:var(--mono);font-size:12px;font-weight:700;color:${(+d.speed||0)>0?'#22c55e':'var(--muted)'}">${(+d.speed||0).toFixed(0)}</td>
          <td style="font-size:11px;color:var(--muted);white-space:nowrap">${T.ts(d.last_seen)||'Never'}</td>
          <td>${T.acts(T.btn('edit',T.iconEdit,`openDevModal('${d.id}')`, 'Edit'),T.btn('',d.engine_cut?'✅':'✂️',`openEngineCutModal('${d.imei}','${d.name}',${!!d.engine_cut})`,d.engine_cut?'Restore':'Cut'),T.btn('',T.iconPlay,`openPlaybackForImei('${d.imei}')`, 'Playback'),T.btn('del',T.iconDel, `confirmDel('device','${d.id}','${d.name}')`, 'Delete'))}</td>
        </tr>`;
      }).join('');
      T.pager('d-pager','d-pg-info',data.length);
    }catch(e){tb.innerHTML=T.empty(11,'⚠️ '+e.message);}
  }
};

Pages['drivers'] = {
  _filter:'all', _search:'',
  render(el){
    el.innerHTML=`
      ${pageHeader('Drivers','Driver profiles, licenses, DSS scores and assignments')}
      <div class="card">
        <div class="card-header">
          <div><span class="card-title">All Drivers</span><span class="card-sub" id="dr-ct-lbl" style="margin-left:10px"></span></div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('drivers')">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import<input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('drivers',this)"></label>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('drTable','drivers')">⬇ Export</button>
            <button class="btn btn-primary btn-sm" onclick="openDrvModal()">+ Add Driver</button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="fchip on" onclick="filterDrv('all',this)">All</div>
          <div class="fchip" onclick="filterDrv('active',this)">Active</div>
          <div class="fchip" onclick="filterDrv('inactive',this)">Inactive</div>
          <div class="fchip" onclick="filterDrv('risk',this)">⚠ High Risk</div>
          <div class="fchip" onclick="filterDrv('expire',this)">⏳ Expiring</div>
          ${searchField('Search name or license…','searchDrv(this.value)')}
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th style="width:36px"><input type="checkbox" onclick="selAll(this,'drTable')" style="accent-color:var(--primary)"></th>
          <th>Driver</th><th>License No.</th><th>Type</th><th>Expiry</th><th>Vehicle</th><th style="min-width:140px">DSS Score</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody id="drTable">${T.row(9)}</tbody></table></div>
        <div class="pagination"><span id="dr-pg-info" style="font-size:12px;color:var(--muted)"></span><div class="pg-btns" id="dr-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load(){
    const tb=V.$('drTable');if(!tb)return;
    try{
      M.drivers=await apiGet('/drivers')||[];
      const f=this._filter,s=this._search,today=new Date();
      const data=M.drivers.filter(d=>{
        if(f==='active'&&!d.is_active)return false; if(f==='inactive'&&d.is_active)return false;
        if(f==='risk'&&(+d.dss_score||75)>=60)return false;
        if(f==='expire'){const exp=d.lic_expiry?new Date(d.lic_expiry):null;if(!exp||Math.floor((exp-today)/86400000)>90)return false;}
        if(s&&!`${d.fname} ${d.lname} ${d.phone||''}`.toLowerCase().includes(s))return false; return true;
      });
      const lbl=V.$('dr-ct-lbl');if(lbl)lbl.textContent=`${M.drivers.length} registered`;
      const sbct=V.$('sb-dr-ct');if(sbct)sbct.textContent=M.drivers.length;
      if(!data.length){tb.innerHTML=T.empty(9,'No drivers found');return;}
      tb.innerHTML=data.map(d=>{
        const exp=d.lic_expiry?new Date(d.lic_expiry):null,exDays=exp?Math.floor((exp-today)/86400000):null;
        const exStyle=exDays!=null?(exDays<0?'color:#DC2626;font-weight:600':exDays<90?'color:#D97706':''):'';
        return `<tr>
          <td><input type="checkbox" style="accent-color:var(--primary)"></td>
          <td><div style="display:flex;align-items:center;gap:11px">
            <div style="width:34px;height:34px;border-radius:10px;background:${V.gc(d.fname)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0">${V.ini(d.fname)}</div>
            <div><div style="font-weight:600;font-size:13px">${d.fname} ${d.lname}</div><div style="font-size:11px;color:var(--muted)">${d.phone||'No phone'}</div></div>
          </div></td>
          <td style="font-family:var(--mono);font-size:12px">${d.lic_number||'—'}</td>
          <td>${T.badge('gray',d.lic_type||'LMV')}</td>
          <td style="font-size:12px;${exStyle}">${T.date(d.lic_expiry)}${exDays!=null&&exDays<0?' ⚠️':''}</td>
          <td style="font-size:12px">${d.device_name||'<span style="color:var(--muted)">Unassigned</span>'}</td>
          <td><div style="display:flex;align-items:center;gap:8px;min-width:110px"><div style="flex:1;background:var(--border);border-radius:99px;height:6px;overflow:hidden"><div style="width:${d.dss_score||75}%;height:100%;background:${(+d.dss_score||75)>=80?'#059669':(+d.dss_score||75)>=60?'#D97706':'#DC2626'};border-radius:99px"></div></div><span style="font-weight:700;color:${(+d.dss_score||75)>=80?'#059669':(+d.dss_score||75)>=60?'#D97706':'#DC2626'};min-width:28px;font-size:12px">${d.dss_score||75}</span></div></td>
          <td>${T.stBadge(d.is_active?'active':'inactive')}</td>
          <td>${T.acts(T.btn('edit',T.iconEdit,`openDrvModal('${d.id}')`, 'Edit'),T.btn('del',T.iconDel, `confirmDel('driver','${d.id}','${d.fname} ${d.lname}')`, 'Delete'))}</td>
        </tr>`;
      }).join('');
      T.pager('dr-pager','dr-pg-info',data.length);
    }catch(e){tb.innerHTML=T.empty(9,'⚠️ '+e.message);}
  }
};

Pages['events'] = {
  _filter:'all',
  render(el){
    el.innerHTML=`
      ${pageHeader('Events & Alarms','Real-time and historical events from all devices')}
      <div class="stats-grid sg4" id="ev-stats" style="margin-bottom:24px"></div>
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
          <th style="width:36px"><input type="checkbox" style="accent-color:var(--primary)"></th>
          <th style="width:40px"></th><th>Type</th><th>IMEI</th><th>Details</th><th>Location</th><th>Time</th><th>Status</th>
        </tr></thead><tbody id="evTable">${T.row(8)}</tbody></table></div>
      </div>`;
    this._load();
  },
  async _load(){
    const tb=V.$('evTable');if(!tb)return;
    try{
      M.events=await apiGet('/events')||[];
      const icoMap={overspeed:'⚡',geofence:'📍',panic:'🚨',power:'🔋',idle:'😴',maintenance:'🔧'};
      const spd=M.events.filter(e=>e.type==='overspeed').length,geo=M.events.filter(e=>e.type==='geofence').length,pan=M.events.filter(e=>e.type==='panic').length;
      V.set('ev-stats',[statCard('⚡',spd,'Overspeed','#DC2626','#FEF2F2'),statCard('📍',geo,'Geofence','#2563EB','#EFF6FF'),statCard('🚨',pan,'Panic','#DC2626','#FEF2F2'),statCard('📊',M.events.length,'Total (24h)','#059669','#ECFDF5')].join(''));
      const sbct=V.$('sb-ev-badge');if(sbct)sbct.textContent=M.events.length;
      const f=this._filter,data=f==='all'?M.events:M.events.filter(e=>e.type===f);
      if(!data.length){tb.innerHTML=T.empty(8,'No events in the last 24 hours');return;}
      tb.innerHTML=data.map(e=>`<tr>
        <td><input type="checkbox" style="accent-color:var(--primary)"></td>
        <td style="font-size:20px;text-align:center">${icoMap[e.type]||'⚠️'}</td>
        <td>${T.badge('red',(e.type||'ALARM').toUpperCase())}</td>
        <td style="font-family:var(--mono);font-size:12px">${e.imei}</td>
        <td style="font-size:12px">${e.data?JSON.stringify(e.data).slice(0,60):'—'}</td>
        <td style="font-size:12px">${e.address||'—'}</td>
        <td style="font-size:11px;color:var(--muted);white-space:nowrap">${T.ts(e.ts)}</td>
        <td>${T.badge('amber','Active')}</td>
      </tr>`).join('');
    }catch(e){tb.innerHTML=T.empty(8,'⚠️ '+e.message);}
  }
};

Pages['routes'] = {
  render(el){
    el.innerHTML=`
      ${pageHeader('Routes','Waypoint chains · Point owners · Timetables · Deviation tracking')}
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="openAddRouteModal()">+ New Route</button>
        <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('routes')">⬇ Template</button>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import CSV<input type="file" accept=".csv" style="display:none" onchange="bulkImportEntity('routes',this)"></label>
        <span id="routes-summary" style="margin-left:auto;font-size:12px;color:var(--muted)"></span>
      </div>
      <div style="display:flex;gap:16px;height:calc(100vh - 280px);min-height:480px">
        <div style="width:360px;flex-shrink:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px" id="routes-list-body">
          <div style="padding:32px;text-align:center;color:var(--muted)">⏳ Loading routes…</div>
        </div>
        <div style="flex:1;background:var(--white);border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--sh);overflow:hidden">
          <div id="route-builder-map" style="width:100%;height:100%"></div>
        </div>
      </div>`;
    if(!window._routeMap){requestAnimationFrame(()=>{const mapEl=V.$('route-builder-map');if(mapEl&&typeof L!=='undefined'){window._routeMap=L.map('route-builder-map').setView([12.9716,77.5946],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(window._routeMap);window._routeMarkers=[];window._routePolyline=null;}});}
    else{setTimeout(()=>window._routeMap?.invalidateSize(),200);}
    loadRoutesList();
  }
};

Pages['maintenance'] = {
  render(el){
    el.innerHTML=`
      ${pageHeader('Maintenance','Service tasks — odometer, engine hours & date triggers')}
      <div class="stats-grid sg4" id="maint-stats" style="margin-bottom:24px"></div>
      <div class="card">
        <div class="card-header"><span class="card-title">🔧 Maintenance Tasks</span>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="downloadMaintTemplate()">⬇ Template</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">📤 Import<input type="file" accept=".csv" style="display:none" onchange="bulkImportMaint(this)"></label>
            <button class="btn btn-primary btn-sm" onclick="openAddMaintModal()">+ Add Task</button>
          </div>
        </div>
        <div class="tbl-scroll"><table><thead><tr>
          <th>Vehicle</th><th>Task</th><th>Type</th><th>Due Odometer</th><th>Due Hours</th><th>Due Days</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody id="maintTable">${T.row(8)}</tbody></table></div>
      </div>`;
    this._load();
  },
  async _load(){
    const tb=V.$('maintTable');if(!tb)return;
    try{
      M.maint=await apiGet('/maintenance')||[];
      const total=M.maint.length,overdue=M.maint.filter(m=>m.computed_status==='overdue').length;
      const dueSoon=M.maint.filter(m=>m.computed_status==='due_soon').length,done=M.maint.filter(m=>m.status==='done').length;
      V.set('maint-stats',[statCard('📋',total,'Total Tasks','#2563EB','#EFF6FF'),statCard('🚨',overdue,'Overdue','#DC2626','#FEF2F2'),statCard('⚠️',dueSoon,'Due Soon','#D97706','#FFFBEB'),statCard('✅',done,'Completed','#059669','#ECFDF5')].join(''));
      const sbct=V.$('sb-maint-ct');if(sbct){sbct.textContent=overdue+dueSoon;sbct.style.display=(overdue+dueSoon)>0?'':'none';}
      if(!M.maint.length){tb.innerHTML=T.empty(8,'No tasks yet — click + Add Task');return;}
      const stM={overdue:'red',due_soon:'amber',ok:'green',done:'blue',pending:'gray'};
      tb.innerHTML=M.maint.map(m=>{const cs=m.status==='done'?'done':(m.computed_status||m.status||'ok');return `<tr>
        <td style="font-weight:600">${m.device_name||m.imei}</td><td>${m.title}</td>
        <td>${T.badge('gray',(m.task_type||'service').replace(/_/g,' '))}</td>
        <td style="font-family:var(--mono);font-size:12px">${m.due_odometer?Number(m.due_odometer).toLocaleString()+' km':'—'}</td>
        <td style="font-family:var(--mono);font-size:12px">${m.due_engine_hours?m.due_engine_hours+' h':'—'}</td>
        <td style="font-family:var(--mono);font-size:12px">${m.due_days?m.due_days+' d':'—'}</td>
        <td>${T.badge(stM[cs]||'gray',cs.replace(/_/g,' '))}</td>
        <td>${T.acts(m.status!=='done'?T.btn('','✅',`markMaintDone('${m.id}')`, 'Done'):'',T.btn('del',T.iconDel,`deleteMaintTask('${m.id}')`, 'Delete'))}</td>
      </tr>`;}).join('');
    }catch(e){tb.innerHTML=T.empty(8,'⚠️ '+e.message);}
  }
};

Pages['geofence'] = {
  render(el){
    el.innerHTML=`
      ${pageHeader('Geo-fences','Draw polygon & circle zones — entry/exit alerts per vehicle')}
      <div style="display:flex;gap:16px;height:calc(100vh - 260px);min-height:480px">
        <div style="width:340px;flex-shrink:0;background:var(--white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--sh);display:flex;flex-direction:column;overflow:hidden">
          <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
            <span style="font-weight:700;font-size:14px">Fence List</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="gfDrawMode('polygon')">✏️ Polygon</button>
              <button class="btn btn-secondary btn-sm" onclick="gfDrawMode('circle')">⭕ Circle</button>
            </div>
          </div>
          <div id="gf-draw-hint" style="margin:10px 12px;padding:8px 12px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;font-size:12px;color:#0369A1">
            Select ✏️ Polygon or ⭕ Circle then draw on the map →
          </div>
          <div style="flex:1;overflow-y:auto" id="gf-list"><div style="padding:32px;text-align:center;color:var(--muted)">⏳ Loading…</div></div>
        </div>
        <div style="flex:1;background:var(--white);border-radius:var(--radius);border:1px solid var(--border);box-shadow:var(--sh);overflow:hidden;position:relative">
          <div id="gf-map" style="width:100%;height:100%;min-height:400px"></div>
        </div>
      </div>`;
    if(!window._gfMap){requestAnimationFrame(()=>{const mapEl=V.$('gf-map');if(mapEl&&typeof L!=='undefined'){window._gfMap=L.map('gf-map').setView([12.9716,77.5946],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(window._gfMap);window._gfLayer=L.featureGroup().addTo(window._gfMap);window._gfFences=[];window._gfPendingCoords=null;window._gfPendingShape='polygon';}});}
    else{setTimeout(()=>window._gfMap?.invalidateSize(),200);}
    loadGeofences();
  }
};

Pages['notifications'] = {
  render(el){
    el.innerHTML=`
      ${pageHeader('Notification Hub','Per-user-level alert settings & history')}
      <div class="stats-grid sg3" style="margin-bottom:24px">
        ${statCard('📨','<span id="notif-stat-total">—</span>','Total Notifications','#2563EB','#EFF6FF')}
        ${statCard('🔔','<span id="notif-stat-unread">—</span>','Unread','#D97706','#FFFBEB')}
        ${statCard('✅','10','Event Types','#059669','#ECFDF5')}
      </div>
      <div class="stats-grid sg2">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">⚙️ Alert Matrix</span>
            <div class="card-actions"><button class="btn btn-primary btn-sm" onclick="saveNotifSettings()">💾 Save</button></div></div>
          <div style="overflow-x:auto"><table style="min-width:440px"><thead><tr>
            <th style="text-align:left;padding:12px 16px">EVENT TYPE</th>
            <th style="text-align:center;padding:12px">Beginner</th><th style="text-align:center;padding:12px">Medium</th><th style="text-align:center;padding:12px">Pro</th>
          </tr></thead><tbody id="notif-matrix-body"><tr><td colspan="4" style="padding:28px;text-align:center;color:var(--muted)">⏳</td></tr></tbody></table></div>
          <div style="padding:12px 16px;border-top:1px solid var(--border);font-size:12px;color:var(--muted);display:flex;align-items:center;gap:10px">
            🔥 Firebase: <span id="notif-firebase-status">Not configured</span>
            <button class="btn btn-secondary btn-sm" onclick="openModal('firebaseModal')">Configure</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">📋 History</span>
            <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="markNotifsRead()">✓ Mark All Read</button></div></div>
          <div style="max-height:400px;overflow-y:auto"><table><thead><tr><th>Time</th><th>Event</th><th>Device</th><th>Message</th></tr></thead>
            <tbody id="notif-history-body"><tr><td colspan="4" style="padding:28px;text-align:center;color:var(--muted)">⏳</td></tr></tbody></table></div>
        </div>
      </div>`;
    this._load();
  },
  async _load(){
    try{
      const data=await apiGet('/notifications');if(!data)return;
      const{settings=[],history=[],unread=0}=data;
      const e=(id,v)=>{const el=V.$(id);if(el)el.textContent=v;};
      e('notif-stat-total',history.length);e('notif-stat-unread',unread);
      const sbct=V.$('sb-notif-ct');if(sbct){sbct.textContent=unread;sbct.style.display=unread>0?'':'none';}
      const EL={ignition_on:'🔑 Ignition ON',ignition_off:'🔑 Ignition OFF',charging_off:'🔌 Charging Off',vehicle_added:'🚗 Vehicle Added',geofence_entry:'📍 Geofence Entry',geofence_exit:'↩ Geofence Exit',engine_cut:'✂️ Engine Cut'};
      const evts=[...new Set(settings.map(s=>s.event_type))];
      const smap={};settings.forEach(s=>smap[s.event_type+'_'+s.user_level]=s.enabled);
      V.set('notif-matrix-body',evts.length?evts.map(ev=>`<tr><td style="padding:10px 16px;font-size:13px">${EL[ev]||ev}</td>${['beginner','medium','pro'].map(lvl=>`<td style="text-align:center;padding:10px"><input type="checkbox" data-ev="${ev}" data-lvl="${lvl}" ${smap[ev+'_'+lvl]?'checked':''} onchange="notifMatrixChange(this)" style="width:17px;height:17px;cursor:pointer;accent-color:var(--primary)"></td>`).join('')}</tr>`).join(''):'<tr><td colspan="4" style="padding:28px;text-align:center;color:var(--muted)">No settings found</td></tr>');
      V.set('notif-history-body',history.length?history.map(h=>`<tr><td style="font-size:11px;white-space:nowrap;color:var(--muted)">${T.ts(h.ts)}</td><td>${T.badge('blue',h.event_type||'—')}</td><td style="font-size:12px">${h.imei||'—'}</td><td style="font-size:12px">${h.title||h.body||'—'}</td></tr>`).join(''):'<tr><td colspan="4" style="padding:28px;text-align:center;color:var(--muted)">No notifications yet</td></tr>');
    }catch(e){console.warn('[notif]',e.message);}
  }
};

Pages['reports'] = {
  render(el){
    el.innerHTML=`
      ${pageHeader('Reports','Generate and export fleet analytics')}
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">Report Generator</span></div>
        <div style="padding:20px 24px">
          <div class="frow">
            <div class="fg"><label class="flabel">Report Type</label>
              <select class="fselect" id="rpt-type"><option>Fleet Status</option><option>Driver Safety Score</option><option>Alarm Report</option><option>Mileage Report</option><option>Idle Time Report</option></select></div>
            <div class="fg"><label class="flabel">Device</label><select class="fselect" id="rpt-dev"><option value="">All Devices</option></select></div>
          </div>
          <div class="frow">
            <div class="fg"><label class="flabel">From Date</label><input class="finput" type="date" id="rpt-from"></div>
            <div class="fg"><label class="flabel">To Date</label><input class="finput" type="date" id="rpt-to"></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:4px">
            <button class="btn btn-primary" onclick="genReport()" style="min-width:120px">▶ Generate</button>
            <button class="btn btn-secondary" onclick="exportRptCSV('report')">⬇ CSV</button>
            <button class="btn btn-danger btn-sm" onclick="exportReportPDF()">⬇ PDF</button>
          </div>
        </div>
      </div>
      <div class="card" id="rpt-card" style="display:none">
        <div class="card-header"><span class="card-title" id="rpt-title">Report</span>
          <div class="card-actions"><button class="btn btn-secondary btn-sm" onclick="exportRptCSV('report')">⬇ Export CSV</button></div></div>
        <div class="tbl-scroll"><table><thead><tr id="rpt-head"></tr></thead><tbody id="rpt-table"></tbody></table></div>
      </div>`;
    this._init();
  },
  async _init(){
    try{
      const devs=await apiGet('/devices')||[];
      const sel=V.$('rpt-dev');if(!sel)return;
      sel.innerHTML='<option value="">All Devices</option>'+devs.map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');
      const to=new Date(),from=new Date(to-7*86400000),fmt=d=>d.toISOString().slice(0,10);
      const fd=V.$('rpt-from'),td=V.$('rpt-to');
      if(fd&&!fd.value)fd.value=fmt(from);if(td&&!td.value)td.value=fmt(to);
    }catch{}
  }
};

Pages['logs'] = {
  render(el){
    el.innerHTML=`
      ${pageHeader('Audit Log','Login history, CRUD actions, API calls and alarms')}
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
        <div class="pagination"><span id="log-pg-info" style="font-size:12px;color:var(--muted)"></span><div class="pg-btns" id="log-pager"></div></div>
      </div>`;
    this._load();
  },
  async _load(){
    const tb=V.$('logTable');if(!tb)return;
    try{
      const data=await apiGet('/audit')||[];
      if(!data.length){tb.innerHTML=T.empty(7,'No audit events yet');return;}
      const am={LOGIN:'green',LOGIN_FAILED:'red',CREATE:'blue',UPDATE:'amber',DELETE:'red',ALARM:'red',ENGINE_CUT:'red',ENGINE_RESTORE:'green'};
      tb.innerHTML=data.map(l=>`<tr>
        <td style="font-size:11px;white-space:nowrap;color:var(--muted)">${T.ts(l.ts)}</td>
        <td style="font-size:12px">${l.user_email||'—'}</td>
        <td>${T.badge(am[l.action]||'gray',l.action||'—')}</td>
        <td style="font-size:12px">${l.resource||'—'}</td>
        <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${l.ip_addr||'—'}</td>
        <td>${T.badge(l.status==='OK'?'green':'red',l.status||'—')}</td>
        <td style="font-size:11px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.detail||'—'}</td>
      </tr>`).join('');
      T.pager('log-pager','log-pg-info',data.length);
    }catch(e){tb.innerHTML=T.empty(7,'⚠️ '+e.message);}
  }
};

Pages['setup'] = {
  render(el){
    el.innerHTML=`
      ${pageHeader('Setup & Configuration','System settings, roles and integrations')}
      <div class="stats-grid sg3">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">⚙️ Server Config</span></div>
          <div style="padding:20px 24px">
            <div class="fg" style="margin-bottom:14px"><label class="flabel">GPS Server Host</label><input class="finput" value="127.0.0.1"></div>
            <div class="frow"><div class="fg"><label class="flabel">GPS Port</label><input class="finput" value="6001"></div><div class="fg"><label class="flabel">Mgmt Port</label><input class="finput" value="6002"></div></div>
            <div class="fg" style="margin-bottom:16px"><label class="flabel">PostgreSQL DSN</label><input class="finput" value="postgresql://fleetos:fleetos123@127.0.0.1:5432/fleetos"></div>
            <button class="btn btn-primary btn-sm" onclick="toast('Config saved','success','⚙️')">Save Config</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">🔑 API Keys</span></div>
          <div style="padding:20px 24px">
            <div class="fg" style="margin-bottom:14px"><label class="flabel">Geocoder</label><select class="fselect"><option>OpenStreetMap (free)</option><option>Google Maps</option><option>MapBox</option></select></div>
            <div class="fg" style="margin-bottom:14px"><label class="flabel">Geocoder API Key</label><input class="finput" type="password" placeholder="blank = OSM free"></div>
            <div class="fg" style="margin-bottom:14px"><label class="flabel">Firebase Project ID</label><input class="finput" placeholder="your-project-id"></div>
            <div class="fg" style="margin-bottom:16px"><label class="flabel">SMS API Key</label><input class="finput" type="password" placeholder="MSG91 / Twilio"></div>
            <button class="btn btn-primary btn-sm" onclick="toast('Keys saved','success','🔑')">Save Keys</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">🛡️ Access Roles</span></div>
          <div style="padding:4px 0">
            ${[['👑','Admin','red','Full access — all panels, users, system config, logs','Full'],['📊','Manager','amber','All devices, ack alarms, reports, notifications','Ops'],['🏪','Dealer','orange','Sub-accounts and own client devices','Dealer'],['🎛️','Operator','violet','Assigned devices only, can send commands','Ops'],['👤','User','blue','Own devices only, read access','Read'],['👁️','Demo','green','Read-only, sample data only','Demo']].map(([ico,name,col,desc,badge])=>`
              <div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--border)">
                <div style="width:36px;height:36px;border-radius:10px;background:var(--${col}-bg,#f8fafc);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${ico}</div>
                <div style="flex:1"><div style="font-weight:600;font-size:13px">${name}</div><div style="font-size:11px;color:var(--muted)">${desc}</div></div>
                <span class="badge badge-${col}">${badge}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }
};

Pages['profile'] = {
  render(el){
    el.innerHTML=`
      ${pageHeader('My Profile','Account settings and security')}
      <div class="stats-grid sg2">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">👤 Account</span></div>
          <div style="padding:20px 24px">
            <div class="frow"><div class="fg"><label class="flabel">First Name</label><input class="finput" value="${M.user?.fname||''}"></div><div class="fg"><label class="flabel">Last Name</label><input class="finput" value="${M.user?.lname||''}"></div></div>
            <div class="fg" style="margin-bottom:14px"><label class="flabel">Email</label><input class="finput" type="email" value="${M.user?.email||''}"></div>
            <div class="frow"><div class="fg"><label class="flabel">Role</label><input class="finput" value="${M.role||'admin'}" readonly style="background:var(--bg)"></div><div class="fg"><label class="flabel">Timezone</label><select class="fselect"><option>Asia/Kolkata (IST +5:30)</option><option>UTC</option></select></div></div>
            <button class="btn btn-primary btn-sm" onclick="toast('Profile updated','success','✅')">Save Profile</button>
          </div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><span class="card-title">🔐 Security</span></div>
          <div style="padding:20px 24px">
            <div class="fg" style="margin-bottom:14px"><label class="flabel">Current Password</label><input class="finput" type="password" placeholder="••••••••"></div>
            <div class="fg" style="margin-bottom:14px"><label class="flabel">New Password</label><input class="finput" type="password" placeholder="Min 8 characters"></div>
            <div class="fg" style="margin-bottom:18px"><label class="flabel">Confirm Password</label><input class="finput" type="password" placeholder="Repeat new password"></div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary btn-sm" onclick="toast('Password changed','success','🔐')">Change Password</button>
              <button class="btn btn-danger btn-sm" onclick="doLogout()">Sign Out</button>
            </div>
          </div>
        </div>
      </div>`;
  }
};

Pages['playback'] = {
  _track:[], _pos:0, _playing:false, _speed:1, _timer:null, _pbMap:null, _vtype:'Car',
  render(el){
    el.style.cssText='padding:0;height:calc(100vh - 56px);overflow:hidden;display:flex';
    el.innerHTML=`<div id="pb-shell" style="display:flex;width:100%;height:100%;background:#0f172a">
      <div style="width:300px;flex-shrink:0;background:#1e293b;display:flex;flex-direction:column;overflow-y:auto;border-right:1px solid rgba(255,255,255,.07)">
        <div style="padding:16px 16px 10px;border-bottom:1px solid rgba(255,255,255,.07)">
          <div style="font-size:16px;font-weight:800;color:#f1f5f9;letter-spacing:-0.3px">Route Playback</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">Select device &amp; date range</div>
        </div>
        <div style="padding:14px 16px 0">
          <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:#475569;text-transform:uppercase;margin-bottom:6px">Device / IMEI</div>
          <select id="pb-device" onchange="Pages.playback._onDeviceChange(this.value)" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#e2e8f0;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;cursor:pointer;box-sizing:border-box">
            <option value="">— Select device —</option>
          </select>
        </div>
        <div style="padding:14px 16px 0">
          <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:#475569;text-transform:uppercase;margin-bottom:8px">Date &amp; Time Range</div>
          <div style="margin-bottom:8px">
            <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;font-weight:500">Date</div>
            <input type="date" id="pb-date" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#e2e8f0;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;box-sizing:border-box;cursor:pointer" oninput="Pages.playback._onDateChange()">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><div style="font-size:11px;color:#94a3b8;margin-bottom:4px;font-weight:500">From</div>
              <input type="time" id="pb-from" value="00:00" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#e2e8f0;border-radius:8px;padding:9px 10px;font-size:13px;outline:none;box-sizing:border-box"></div>
            <div><div style="font-size:11px;color:#94a3b8;margin-bottom:4px;font-weight:500">To</div>
              <input type="time" id="pb-to" value="23:59" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#e2e8f0;border-radius:8px;padding:9px 10px;font-size:13px;outline:none;box-sizing:border-box"></div>
          </div>
        </div>
        <div style="padding:14px 16px 0">
          <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:#475569;text-transform:uppercase;margin-bottom:8px">Vehicle Type</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${[['Car','🚗','#2563eb'],['Bike','🏍️','#7c3aed'],['Bus','🚌','#16a34a'],['Truck','🚛','#b45309'],['Auto','🛺','#0891b2'],['Mini Truck','🚐','#dc2626']].map(([n,i,c])=>`<div class="pb-vcard${n==='Car'?' active':''}" id="pvc-${n}" onclick="pbSetVType('${n}',this)" style="background:#0f172a;border:1.5px solid ${n==='Car'?c:'rgba(255,255,255,.08)'};border-radius:10px;padding:10px 8px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;transition:all .18s"><span style="font-size:22px">${i}</span><span style="font-size:10px;font-weight:700;color:${n==='Car'?c:'#94a3b8'};letter-spacing:.4px">${n.toUpperCase()}</span></div>`).join('')}
          </div>
        </div>
        <div style="padding:16px"><button onclick="loadPB()" style="width:100%;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:.3px">⬇ Load Track</button></div>
        <div style="border-top:1px solid rgba(255,255,255,.07)">
          <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:#475569;text-transform:uppercase;padding:12px 16px 6px">Statistics</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,.06)">
            ${[['pb-dist','Distance','—'],['pb-dur','Duration','—'],['pb-max','Max Speed','—'],['pb-avg','Avg Speed','—'],['pb-stops','Stops','—'],['pb-pts','GPS Points','—']].map(([id,lbl,val])=>`<div style="background:#1e293b;padding:12px 14px"><div style="font-size:9px;font-weight:700;letter-spacing:.8px;color:#475569;text-transform:uppercase;margin-bottom:4px">${lbl}</div><div id="${id}" style="font-size:16px;font-weight:800;color:#f1f5f9;font-family:var(--mono)">${val}</div></div>`).join('')}
          </div>
        </div>
        <div style="flex:1"></div>
        <div style="padding:12px 16px"><button onclick="pbExport()" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#94a3b8;border-radius:10px;padding:10px;font-size:12px;font-weight:600;cursor:pointer">⬇ Export CSV</button></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;min-width:0;position:relative">
        <div style="flex:1;position:relative;min-height:0">
          <div id="pb-map" style="width:100%;height:100%"></div>
          <div id="pb-empty" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#334155;pointer-events:none;z-index:2">
            <div style="font-size:56px;margin-bottom:14px;opacity:.3">🗺️</div>
            <div style="font-size:15px;font-weight:600;opacity:.5">Select a device and load a track</div>
            <div style="font-size:12px;opacity:.3;margin-top:6px">GPS history will appear here</div>
          </div>
          <div id="pb-hud" style="display:none;position:absolute;bottom:16px;left:16px;background:rgba(15,23,42,.88);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 14px;font-size:12px;color:#94a3b8;font-family:var(--mono);z-index:500;line-height:2;pointer-events:none">
            <div>🕐 <span id="pb-hud-ts" style="color:#e2e8f0;font-weight:600">—</span></div>
            <div>📍 <span id="pb-hud-coord" style="color:#e2e8f0">—</span></div>
            <div>⚡ <span id="pb-hud-speed" style="color:#e2e8f0">— km/h</span> &nbsp;🧭 <span id="pb-hud-hdg" style="color:#e2e8f0">—°</span></div>
          </div>
        </div>
        <div style="background:#1e293b;border-top:1px solid rgba(255,255,255,.07);padding:12px 16px;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:8px">
            <button onclick="pbRestart()" title="Restart" style="width:36px;height:36px;border-radius:9px;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">⏮</button>
            <button onclick="pbStep(-10)" title="-10" style="width:36px;height:36px;border-radius:9px;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">−10</button>
            <button id="pb-playbtn" onclick="pbToggle()" style="width:44px;height:44px;border-radius:11px;background:#2563eb;border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">▶</button>
            <button onclick="pbStep(10)" title="+10" style="width:36px;height:36px;border-radius:9px;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">+10</button>
            <button onclick="pbGoEnd()" title="End" style="width:36px;height:36px;border-radius:9px;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">⏭</button>
            <div style="display:flex;gap:3px;margin-left:4px;flex-shrink:0">
              ${[1,2,5,10,30].map(s=>`<div onclick="pbSpd(${s},this)" style="padding:6px 10px;border-radius:7px;background:${s===1?'#2563eb':'#0f172a'};border:1px solid ${s===1?'#2563eb':'rgba(255,255,255,.1)'};color:${s===1?'#fff':'#64748b'};font-size:11px;font-weight:700;cursor:pointer;font-family:var(--mono)">${s}×</div>`).join('')}
            </div>
            <div id="pb-tline" style="flex:1;position:relative;cursor:pointer;margin:0 8px" onmousedown="Pages.playback._seekStart(event)">
              <div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden"><div id="pb-prog" style="height:100%;background:linear-gradient(90deg,#2563eb,#7c3aed);width:0%;border-radius:3px"></div></div>
              <div id="pb-thumb" style="position:absolute;top:50%;width:14px;height:14px;background:#fff;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 0 3px #2563eb;left:0%;pointer-events:none"></div>
            </div>
            <div id="pb-ts" style="background:#0f172a;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:700;color:#e2e8f0;font-family:var(--mono);white-space:nowrap;min-width:72px;text-align:center;flex-shrink:0">--:--:--</div>
          </div>
        </div>
      </div>
    </div>`;
    this._initMap();
    this._populateDevices();
    const di=V.$('pb-date');if(di&&!di.value)di.value=new Date().toISOString().slice(0,10);
    const fi=V.$('pb-from'),ti=V.$('pb-to');
    if(fi&&!fi.value)fi.value='00:00'; if(ti&&!ti.value)ti.value='23:59';
  },
  _initMap(){requestAnimationFrame(()=>{const mapEl=V.$('pb-map');if(!mapEl||this._pbMap)return;this._pbMap=L.map('pb-map',{zoomControl:true}).setView([20.5937,78.9629],5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(this._pbMap);});},
  async _populateDevices(){const sel=V.$('pb-device');if(!sel)return;try{const devs=await apiGet('/devices');sel.innerHTML='<option value="">— Select device —</option>'+(devs||[]).map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');const pre=localStorage.getItem('pb_preload_imei');if(pre){sel.value=pre;this._onDeviceChange(pre);localStorage.removeItem('pb_preload_imei');}}catch(e){console.warn('[pb devices]',e);}},
  async _onDeviceChange(imei){if(!imei)return;const di=V.$('pb-date');if(!di)return;try{const dates=await apiGet('/playback-dates/'+imei);if(Array.isArray(dates)&&dates.length)di.value=dates[0];else di.value=new Date().toISOString().slice(0,10);}catch{}},
  _onDateChange(){const imei=V.$('pb-device')?.value;if(imei)this._onDeviceChange(imei);},
  _seekStart(e){const tl=V.$('pb-tline');if(!tl||!this._track.length)return;const rect=tl.getBoundingClientRect();const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));this._pos=Math.round(pct*(this._track.length-1));_pbUpdateMarker();}
};

async function viewUser(id){
  try{
    const u=await apiGet('/users/'+id);
    _ensureModal('userDetailModal',`<div class="overlay" id="userDetailModal" style="display:none" onclick="if(event.target===this)closeModal('userDetailModal')"><div class="modal"><div class="mhdr"><div><div class="mtitle" id="udm-title">User Detail</div><div class="msub" id="udm-sub"></div></div><div class="mclose" onclick="closeModal('userDetailModal')">✕</div></div><div class="mbody" id="udm-body"></div><div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('userDetailModal')">Close</button></div></div></div>`);
    const title=V.$('udm-title'),sub=V.$('udm-sub'),body=V.$('udm-body');
    if(title)title.textContent=u.fname+' '+u.lname;
    if(sub)sub.textContent=u.email;
    if(body)body.innerHTML=`<table style="width:100%;font-size:13px;border-collapse:collapse">${Object.entries(u).filter(([k])=>!k.includes('hash')).map(([k,v])=>`<tr style="border-bottom:1px solid var(--border)"><td style="padding:9px 12px;color:var(--muted);font-weight:600;width:140px;font-size:12px">${k}</td><td style="padding:9px 12px">${v??'—'}</td></tr>`).join('')}</table>`;
    openModal('userDetailModal');
  }catch(e){toast('Error: '+e.message,'error');}
}

async function genReport(){
  const rc=V.$('rpt-card'),rt=V.$('rpt-title'),rh=V.$('rpt-head'),rb=V.$('rpt-table');
  if(!rb)return; if(rc)rc.style.display='';
  rb.innerHTML=T.row(8);
  try{
    const from=V.$('rpt-from')?.value,dev=V.$('rpt-dev')?.value||'';
    const p=new URLSearchParams({type:'fleet',date:from||new Date().toISOString().slice(0,10)});
    if(dev)p.set('imei',dev);
    const data=await apiGet('/report?'+p.toString());
    if(!Array.isArray(data)||!data.length){rb.innerHTML=T.empty(8,'No data for selected range');return;}
    const cols=Object.keys(data[0]);
    if(rh)rh.innerHTML=cols.map(c=>`<th>${c.replace(/_/g,' ').toUpperCase()}</th>`).join('');
    rb.innerHTML=data.map(row=>`<tr>${cols.map(c=>`<td style="font-size:12px">${row[c]??'—'}</td>`).join('')}</tr>`).join('');
    if(rt)rt.textContent=(V.$('rpt-type')?.value||'Fleet')+' Report';
  }catch(e){rb.innerHTML=`<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--red)">Error: ${e.message}</td></tr>`;}
}

function filterU(f,el){if(Pages['users'])Pages['users']._filter=f;document.querySelectorAll('#page-users .fchip').forEach(c=>c.classList.remove('on'));if(el)el.classList.add('on');Pages['users']?._load();}
function filterD(f,el){if(Pages['devices'])Pages['devices']._filter=f;document.querySelectorAll('#page-devices .fchip').forEach(c=>c.classList.remove('on'));if(el)el.classList.add('on');Pages['devices']?._load();}
function filterDrv(f,el){if(Pages['drivers'])Pages['drivers']._filter=f;document.querySelectorAll('#page-drivers .fchip').forEach(c=>c.classList.remove('on'));if(el)el.classList.add('on');Pages['drivers']?._load();}
function filterEv(f,el){if(Pages['events'])Pages['events']._filter=f;document.querySelectorAll('#page-events .fchip').forEach(c=>c.classList.remove('on'));if(el)el.classList.add('on');Pages['events']?._load();}
function searchU(v){if(Pages['users']){Pages['users']._search=v.toLowerCase();Pages['users']._load();}}
function searchD(v){if(Pages['devices']){Pages['devices']._search=v.toLowerCase();Pages['devices']._load();}}
function searchDrv(v){if(Pages['drivers']){Pages['drivers']._search=v.toLowerCase();Pages['drivers']._load();}}
function openPlayback(imei){if(imei)localStorage.setItem('pb_preload_imei',imei);nav('playback');}

// ================================================================
// BOOT — fires after app.js + pages.js fully loaded
// ================================================================
// ── GPS Data Table ──────────────────────────────────────────────────
Pages['gpsdata'] = {
  _data: [], _imei: '', _page: 1, _pageSize: 50,
  render(el) {
    el.innerHTML = `
<div style="padding:18px;height:100%;display:flex;flex-direction:column;gap:12px;overflow:hidden">
  <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
    <div>
      <div style="font-size:20px;font-weight:800;color:var(--text)">GPS Data Log</div>
      <div style="font-size:12px;color:var(--muted)">Live position packets received from devices</div>
    </div>
    <div style="flex:1"></div>
    <select id="gps-imei-sel" onchange="Pages['gpsdata']._filterImei(this.value)"
      style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;background:var(--white);font-size:13px;min-width:180px">
      <option value="">All Devices</option>
    </select>
    <select id="gps-page-size" onchange="Pages['gpsdata']._pageSize=+this.value;Pages['gpsdata']._page=1;Pages['gpsdata']._render()"
      style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;background:var(--white);font-size:13px">
      <option value="50">50 rows</option>
      <option value="100">100 rows</option>
      <option value="200">200 rows</option>
      <option value="500">500 rows</option>
    </select>
    <button class="btn btn-secondary btn-sm" onclick="Pages['gpsdata']._load()">↺ Refresh</button>
    <button class="btn btn-secondary btn-sm" onclick="exportCSV('gpsTable','gps_data')">⬇ Export CSV</button>
  </div>

  <div style="flex:1;overflow:auto;border-radius:10px;border:1px solid var(--border)">
    <table id="gpsTable" style="width:100%;border-collapse:collapse;font-size:11.5px;white-space:nowrap">
      <thead>
        <tr id="gps-hdr" style="position:sticky;top:0;background:var(--bg);z-index:2">
          <th style="${thS}">#</th>
          <th style="${thS}">DT</th>
          <th style="${thS}">IMEI</th>
          <th style="${thS}">Lat</th>
          <th style="${thS}">Lng</th>
          <th style="${thS}">Alt</th>
          <th style="${thS}">Course</th>
          <th style="${thS}">Speed</th>
          <th style="${thS}">Sat</th>
          <th style="${thS}">Valid</th>
          <th style="${thS}">Ignition</th>
          <th style="${thS}">Motion</th>
          <th style="${thS}">Alarm</th>
          <th style="${thS}">Engine Cut</th>
          <th style="${thS}">Voltage</th>
          <th style="${thS}">GSM</th>
          <th style="${thS}">MCC</th>
          <th style="${thS}">MNC</th>
          <th style="${thS}">LAC</th>
          <th style="${thS}">CID</th>
          <th style="${thS}">Protocol</th>
          <th style="${thS}">Sequence</th>
        </tr>
      </thead>
      <tbody id="gps-tbody"><tr><td colspan="22" style="text-align:center;padding:40px;color:var(--muted)">Loading...</td></tr></tbody>
    </table>
  </div>

  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;font-size:13px;color:var(--muted)">
    <span id="gps-total"></span>
    <div style="flex:1"></div>
    <button class="btn btn-secondary btn-sm" id="gps-prev" onclick="Pages['gpsdata']._changePage(-1)">← Prev</button>
    <span id="gps-page-lbl" style="min-width:80px;text-align:center"></span>
    <button class="btn btn-secondary btn-sm" id="gps-next" onclick="Pages['gpsdata']._changePage(1)">Next →</button>
  </div>
</div>`.replace(/\$\{thS\}/g, 'padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);border-bottom:2px solid var(--border);background:var(--bg);white-space:nowrap');
    this._load();
  },

  async _load() {
    try {
      const rows = await apiGet('/gps-data?limit=5000');
      if (!rows) return;
      this._data = Array.isArray(rows) ? rows : (rows.rows || []);
      // Populate IMEI selector
      const imeis = [...new Set(this._data.map(r => r.imei).filter(Boolean))];
      const sel = document.getElementById('gps-imei-sel');
      if (sel) {
        sel.innerHTML = '<option value="">All Devices (' + this._data.length + ')</option>' +
          imeis.map(i => `<option value="${i}">${i}</option>`).join('');
        if (this._imei) sel.value = this._imei;
      }
      this._page = 1;
      this._render();
    } catch(e) { toast('Failed to load GPS data: ' + e.message, 'error'); }
  },

  _filterImei(imei) {
    this._imei = imei;
    this._page = 1;
    this._render();
  },

  _changePage(dir) {
    const filtered = this._imei ? this._data.filter(r => r.imei === this._imei) : this._data;
    const pages = Math.ceil(filtered.length / this._pageSize);
    this._page = Math.max(1, Math.min(pages, this._page + dir));
    this._render();
  },

  _render() {
    const filtered = this._imei ? this._data.filter(r => r.imei === this._imei) : this._data;
    const pages    = Math.max(1, Math.ceil(filtered.length / this._pageSize));
    const start    = (this._page - 1) * this._pageSize;
    const slice    = filtered.slice(start, start + this._pageSize);

    const totalEl = document.getElementById('gps-total');
    const pageLbl = document.getElementById('gps-page-lbl');
    const prev    = document.getElementById('gps-prev');
    const next    = document.getElementById('gps-next');
    if (totalEl) totalEl.textContent = filtered.length.toLocaleString() + ' records';
    if (pageLbl) pageLbl.textContent = 'Page ' + this._page + ' / ' + pages;
    if (prev) prev.disabled = this._page <= 1;
    if (next) next.disabled = this._page >= pages;

    const bdS  = 'padding:7px 10px;border-bottom:1px solid var(--border)';
    const ok   = '<span style="color:#10B981;font-weight:700">ON</span>';
    const off  = '<span style="color:#EF4444">OFF</span>';
    const dash = '<span style="color:var(--muted)">—</span>';

    const tbody = document.getElementById('gps-tbody');
    if (!tbody) return;

    if (!slice.length) {
      tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;padding:40px;color:var(--muted)">No data found</td></tr>';
      return;
    }

    tbody.innerHTML = slice.map((r, i) => {
      const rowN  = start + i + 1;
      const dt    = r.dt || r.ts || r.timestamp || '';
      const lat   = r.lat != null ? (+r.lat).toFixed(6) : '—';
      const lng   = r.lng || r.lon; const lngF = lng != null ? (+lng).toFixed(6) : '—';
      const alt   = r.altitude   != null ? (+r.altitude).toFixed(1) + ' m' : dash;
      const crs   = r.course     != null ? (+r.course).toFixed(0) + '°' : dash;
      const spd   = r.speed      != null ? (+r.speed).toFixed(1) + ' kph' : dash;
      const sat   = r.sat        != null ? r.sat : dash;
      const valid = r.valid === true || r.valid === 1 || r.valid === '1' || r.valid === 'true';
      const ign   = r.ignition   === true || r.ignition === 1 || r.ignition === '1';
      const mot   = r.motion     === true || r.motion   === 1;
      const cut   = r.blocked    === true || r.blocked  === 1;
      const volt  = r.power      != null ? (+r.power).toFixed(2) + 'V' : (r.batterylevel != null ? r.batterylevel+'%' : dash);
      const rssi  = r.rssi       != null ? r.rssi : dash;
      const mcc   = r.mcc        != null ? r.mcc : dash;
      const mnc   = r.mnc        != null ? r.mnc : dash;
      const lac   = r.lac        != null ? r.lac : dash;
      const cid   = r.cid        != null ? r.cid : dash;
      const proto = r.protocol   || 'GT06N';
      const seq   = r.sequence   || r.iccid || dash;
      const alarm = r.alarm1status || r.alarm || '';
      const alarmCell = alarm && alarm !== '0' && alarm !== 'false'
        ? `<span style="background:#FEF2F2;color:#DC2626;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700">${alarm}</span>`
        : dash;
      const mapsLink = lat !== '—' ? `<a href="https://maps.google.com?q=${lat},${lngF}" target="_blank" style="color:var(--primary);text-decoration:none">${lat},${lngF}</a>` : '—';

      return `<tr style="background:${rowN%2===0?'var(--bg)':'var(--white)'}">
        <td style="${bdS};color:var(--muted)">${rowN}</td>
        <td style="${bdS};font-family:var(--mono);font-size:11px">${dt}</td>
        <td style="${bdS};font-family:var(--mono);font-size:11px;font-weight:600">${r.imei||dash}</td>
        <td style="${bdS}">${lat}</td>
        <td style="${bdS}">${lngF}</td>
        <td style="${bdS}">${alt}</td>
        <td style="${bdS}">${crs}</td>
        <td style="${bdS}">${spd}</td>
        <td style="${bdS}">${sat}</td>
        <td style="${bdS}">${valid ? ok : off}</td>
        <td style="${bdS}">${ign ? ok : off}</td>
        <td style="${bdS}">${mot ? ok : off}</td>
        <td style="${bdS}">${alarmCell}</td>
        <td style="${bdS}">${cut ? '<span style="color:#EF4444;font-weight:700">CUT</span>' : dash}</td>
        <td style="${bdS}">${volt}</td>
        <td style="${bdS}">${rssi}</td>
        <td style="${bdS}">${mcc}</td>
        <td style="${bdS}">${mnc}</td>
        <td style="${bdS}">${lac}</td>
        <td style="${bdS}">${cid}</td>
        <td style="${bdS}"><span style="background:var(--primary-light);color:var(--primary);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700">${proto}</span></td>
        <td style="${bdS}">${seq}</td>
      </tr>`;
    }).join('');
  }
};


(async function boot(){
  try{
    const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@fleetcop.com',password:'Admin@123'})});
    const data=await res.json();
    if(data.token){
      M.jwt=data.token; sessionStorage.setItem('fleetos_jwt',M.jwt);
      M.role=data.user?.role||'admin';
      M.user={fname:data.user?.fname||'Fleet',lname:data.user?.lname||'Admin',email:data.user?.email||'admin@fleetcop.com'};
      const lp=document.getElementById('loginPage');if(lp)lp.style.display='none';
      VM_applyRole(); nav('dashboard');
      setTimeout(loadBellNotifs,2000); setInterval(loadBellNotifs,30000);
    }
  }catch{setTimeout(boot,600);}
})();
