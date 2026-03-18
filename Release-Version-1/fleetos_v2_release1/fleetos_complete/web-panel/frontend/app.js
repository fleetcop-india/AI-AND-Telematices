// ================================================================
// Fleet OS v2.0 — app.js
// All application JavaScript. Loaded by index.html.
// ================================================================

// Inject modals into DOM on load
(function injectModals(){
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = `<!-- === MODALS === -->
<!-- USER MODAL -->
<div class="overlay" id="userModal" onclick="if(event.target===this)closeModal('userModal')">
  <div class="modal"><div class="mhdr"><div><div class="mtitle" id="um-title">Add User</div><div class="msub">Create or update fleet account</div></div><div class="mclose" onclick="closeModal('userModal')">✕</div></div>
    <div class="mbody">
      <input type="hidden" id="um-id">
      <div class="frow"><div class="fg"><label class="flabel">First Name</label><input class="finput" id="um-fname" placeholder="John"></div><div class="fg"><label class="flabel">Last Name</label><input class="finput" id="um-lname" placeholder="Doe"></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Email</label><input class="finput" type="email" id="um-email" placeholder="john@company.com"></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Phone (with country code)</label><input class="finput" id="um-phone" placeholder="+91 9876543210"></div><div class="fg"><label class="flabel">Role</label><select class="fselect" id="um-role"><option value="admin">👑 Admin</option><option value="manager">📊 Manager</option><option value="dealer">🏪 Dealer</option><option value="operator">🎛️ Operator</option><option value="user" selected>👤 User</option><option value="demo">👁️ Demo</option></select></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Manager</label><select class="fselect" id="um-mgr"><option value="">-- No manager --</option></select></div><div class="fg"><label class="flabel">Devices Limit</label><select class="fselect" id="um-limit"><option>Unlimited</option><option>5</option><option>10</option><option>25</option><option>50</option><option>100</option></select></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Sub-accounts Limit</label><input class="finput" type="number" id="um-sub" value="0" min="0"></div><div class="fg"><label class="flabel">Expiration Date</label><input class="finput" type="date" id="um-expiry"></div></div>
      <hr class="fdivider">
      <div class="frow"><div class="fg"><label class="flabel">Password</label><input class="finput" type="password" id="um-pass" placeholder="Leave blank to keep existing"></div><div class="fg"><label class="flabel">Status</label><select class="fselect" id="um-status"><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></div></div>
    </div>
    <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('userModal')">Cancel</button><button class="btn btn-primary" onclick="saveUser()">Save User</button></div>
  </div>
</div>

<!-- DEVICE MODAL -->
<div class="overlay" id="devModal" onclick="if(event.target===this)closeModal('devModal')">
  <div class="modal"><div class="mhdr"><div><div class="mtitle" id="dm-title">Add Device</div><div class="msub">Register GPS tracker or IoT asset</div></div><div class="mclose" onclick="closeModal('devModal')">✕</div></div>
    <div class="mbody">
      <input type="hidden" id="dm-id">
      <div class="frow"><div class="fg"><label class="flabel">Device Name / Plate No.</label><input class="finput" id="dm-name" placeholder="KA01AB1234 · Truck 001"></div><div class="fg"><label class="flabel">IMEI / Device ID</label><input class="finput" id="dm-imei" placeholder="864920068034001" maxlength="15"></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Protocol</label><select class="fselect" id="dm-proto"><option>GT06N</option><option>Concox</option><option>Teltonika</option><option>Meitrack</option><option>Queclink</option><option>AIS140</option><option>TPSL</option><option>JSON_SIM</option><option>NMEA</option></select></div><div class="fg"><label class="flabel">Type</label><select class="fselect" id="dm-type"><option>Car</option><option>Truck</option><option>Bus</option><option>Van</option><option>Bike</option><option>Tractor</option><option>Asset Tracker</option><option>Personal</option></select></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Assign to User</label><select class="fselect" id="dm-user"><option value="">-- Unassigned --</option></select></div><div class="fg"><label class="flabel">Assign Driver</label><select class="fselect" id="dm-driver"><option value="">-- No driver --</option></select></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Speed Limit (km/h)</label><input class="finput" type="number" id="dm-speed" value="80" min="0"></div><div class="fg"><label class="flabel">Fuel Type</label><select class="fselect" id="dm-fuel"><option>Diesel</option><option>Petrol</option><option>CNG</option><option>Electric</option><option>Hybrid</option></select></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Sector / Industry</label><select class="fselect" id="dm-sector"><option>General</option><option>Construction</option><option>Agriculture</option><option>Logistics</option><option>School Bus</option><option>Ambulance</option></select></div><div class="fg"><label class="flabel">Odometer (km)</label><input class="finput" type="number" id="dm-odo" value="0" min="0"></div></div>
      <hr class="fdivider">
      <div class="frow"><div class="fg"><label class="flabel">Notes</label><input class="finput" id="dm-notes" placeholder="Optional notes"></div></div>
      <hr class="fdivider">
      <div class="fsection">Safety &amp; Security</div>
      <div class="frow">
        <div class="fg" style="display:flex;align-items:center;gap:10px;padding:8px;background:#f8fafc;border-radius:8px">
          <label class="flabel" style="margin:0;flex:1">🔒 Safe Parking (Anti-Theft)</label>
          <input type="checkbox" id="dm-safe-park" style="width:18px;height:18px;cursor:pointer">
          <label style="font-size:11px;color:var(--muted)">Alert if vehicle moves while parked</label>
        </div>
        <div class="fg" style="display:flex;align-items:center;gap:10px;padding:8px;background:#fff5f5;border-radius:8px">
          <label class="flabel" style="margin:0;flex:1;color:var(--red)">✂️ Engine Cut State</label>
          <input type="checkbox" id="dm-engine-cut" style="width:18px;height:18px;cursor:pointer">
          <label style="font-size:11px;color:var(--muted)">Currently immobilised</label>
        </div>
      </div>
      <div id="dm-safe-park-coords" style="display:none" class="frow">
        <div class="fg"><label class="flabel">Safe Park Radius (m)</label><input class="finput" type="number" id="dm-sp-radius" value="50" min="10" max="500"></div>
        <div class="fg"><label class="flabel" style="font-size:10px;color:var(--muted)">Lat/Lng set automatically from last GPS</label></div>
      </div>
    </div>
    <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('devModal')">Cancel</button><button class="btn btn-primary" onclick="saveDev()">Save Device</button></div>
  </div>
</div>

<!-- DRIVER MODAL -->
<div class="overlay" id="drvModal" onclick="if(event.target===this)closeModal('drvModal')">
  <div class="modal"><div class="mhdr"><div><div class="mtitle" id="drvm-title">Add Driver</div><div class="msub">Register driver profile and license</div></div><div class="mclose" onclick="closeModal('drvModal')">✕</div></div>
    <div class="mbody">
      <input type="hidden" id="drvm-id">
      <div class="frow"><div class="fg"><label class="flabel">First Name</label><input class="finput" id="drvm-fname" placeholder="Rajesh"></div><div class="fg"><label class="flabel">Last Name</label><input class="finput" id="drvm-lname" placeholder="Kumar"></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Phone</label><input class="finput" id="drvm-phone" placeholder="+91 9876543210"></div><div class="fg"><label class="flabel">Email</label><input class="finput" id="drvm-email" type="email" placeholder="rajesh@company.com"></div></div>
      <hr class="fdivider"><div class="fsection">License Details</div>
      <div class="frow"><div class="fg"><label class="flabel">License Number</label><input class="finput" id="drvm-lic" placeholder="KA0320190123456"></div><div class="fg"><label class="flabel">License Type</label><select class="fselect" id="drvm-lictype"><option>LMV</option><option>HMV</option><option>HGMV</option><option>MCWG</option><option>LMV-TR</option><option>HTV</option><option>PSV</option></select></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Issue Date</label><input class="finput" type="date" id="drvm-issue"></div><div class="fg"><label class="flabel">Expiry Date</label><input class="finput" type="date" id="drvm-expiry"></div></div>
      <hr class="fdivider"><div class="fsection">Assignment</div>
      <div class="frow"><div class="fg"><label class="flabel">Assigned Device</label><select class="fselect" id="drvm-dev"><option value="">-- No device --</option></select></div><div class="fg"><label class="flabel">Status</label><select class="fselect" id="drvm-status"><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Notes</label><input class="finput" id="drvm-notes" placeholder="Optional notes"></div></div>
    </div>
    <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('drvModal')">Cancel</button><button class="btn btn-primary" onclick="saveDrv()">Save Driver</button></div>
  </div>
</div>

<!-- USER DETAIL -->
<div class="overlay" id="userDetailModal" onclick="if(event.target===this)closeModal('userDetailModal')">
  <div class="modal"><div class="mhdr"><div><div class="mtitle" id="udm-title">User Detail</div><div class="msub" id="udm-sub"></div></div><div class="mclose" onclick="closeModal('userDetailModal')">✕</div></div><div class="mbody" id="udm-body"></div><div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('userDetailModal')">Close</button></div></div>
</div>

<!-- CONFIRM -->
<div class="confirm-overlay" id="confirmOvl">
  <div class="confirm-card">
    <div class="confirm-ico" id="conf-ico" style="background:var(--red-bg)">🗑️</div>
    <div class="confirm-title" id="conf-title">Delete?</div>
    <div class="confirm-msg" id="conf-msg">Are you sure?</div>
    <div class="confirm-btns"><button class="btn btn-secondary" onclick="closeConfirm()">Cancel</button><button class="btn btn-danger" onclick="execConfirm()">Delete</button></div>
  </div>
</div>

<!-- ADD ROUTE V2 — full waypoint builder -->
<div class="overlay" id="addRouteModal" onclick="if(event.target===this)closeModal('addRouteModal')">
  <div class="modal" style="max-width:680px;width:95vw"><div class="mhdr">
    <div><div class="mtitle" id="arm-title">New Route</div><div class="msub">Add waypoints · assign owners · set timetable</div></div>
    <div class="mclose" onclick="closeModal('addRouteModal')">✕</div>
  </div>
  <div class="mbody" style="max-height:70vh;overflow-y:auto">
    <input type="hidden" id="arm-id">
    <div class="frow">
      <div class="fg"><label class="flabel">Route Name</label><input class="finput" id="arm-name" placeholder="School Bus Route A"></div>
      <div class="fg"><label class="flabel">Type</label>
        <select class="fselect" id="arm-type">
          <option value="general">General</option>
          <option value="school_bus">School Bus</option>
          <option value="milk_van">Milk Van</option>
          <option value="employee_cab">Employee Cab</option>
          <option value="delivery">Delivery</option>
          <option value="ambulance">Ambulance</option>
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flabel">Schedule</label><input class="finput" id="arm-schedule" placeholder="Mon–Fri 08:00–20:00"></div>
      <div class="fg"><label class="flabel">Speed Limit (km/h)</label><input class="finput" type="number" id="arm-speed" value="60"></div>
      <div class="fg"><label class="flabel">Distance (km)</label><input class="finput" type="number" id="arm-dist" placeholder="0"></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="flabel">Assign Devices</label>
        <div id="arm-devices-checks" style="display:flex;flex-wrap:wrap;gap:5px;padding:8px;border:1px solid var(--border);border-radius:8px;max-height:80px;overflow-y:auto;min-height:36px"></div>
      </div>
    </div>
    <hr class="fdivider">
    <!-- Waypoints -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="fsection" style="margin:0">📍 Waypoints</div>
      <div style="display:flex;gap:5px">
        <button class="btn btn-secondary btn-sm" onclick="armAddPoint()">+ Add Point</button>
        <button class="btn btn-secondary btn-sm" onclick="armImportCSV()">📤 Import CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="armClickMap()">🗺 Click Map</button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
      Point owner = person notified at that stop (parent, shopkeeper, employee, etc.)
    </div>
    <div id="arm-points-list"></div>
    <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:4px" onclick="armAddPoint()">+ Add Another Point</button>
  </div>
  <div class="mfooter">
    <button class="btn btn-secondary" onclick="closeModal('addRouteModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveRouteV2()">💾 Save Route</button>
  </div></div>
</div>

<!-- ADD CHANNEL -->
<div class="overlay" id="addChanModal" onclick="if(event.target===this)closeModal('addChanModal')">
  <div class="modal"><div class="mhdr"><div><div class="mtitle">Add Notification Channel</div></div><div class="mclose" onclick="closeModal('addChanModal')">✕</div></div><div class="mbody">
    <div class="frow"><div class="fg"><label class="flabel">Channel Type</label><select class="fselect" id="chan-type" onchange="updateChanFields()"><option>Firebase FCM</option><option>Twilio SMS</option><option>MSG91 SMS</option><option>SendGrid Email</option><option>SMTP Email</option><option>Webhook</option><option>Telegram</option><option>WhatsApp</option></select></div></div>
    <div id="chan-fields"></div>
  </div><div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('addChanModal')">Cancel</button><button class="btn btn-primary" onclick="toast('Channel added','success','📨');closeModal('addChanModal')">Add</button></div></div>
</div>

<!-- GEOFENCE MODAL -->
<div class="overlay" id="gfModal" onclick="if(event.target===this)closeModal('gfModal')">
  <div class="modal"><div class="mhdr"><div><div class="mtitle" id="gfm-title">New Geo-fence</div><div class="msub">Configure zone name, alerts and vehicles</div></div><div class="mclose" onclick="closeModal('gfModal')">✕</div></div>
    <div class="mbody">
      <input type="hidden" id="gfm-id">
      <div class="frow"><div class="fg"><label class="flabel">Fence Name</label><input class="finput" id="gfm-name" placeholder="Bangalore Depot"></div><div class="fg"><label class="flabel">Colour</label><input class="finput" type="color" id="gfm-color" value="#3B82F6" style="padding:4px;height:38px"></div></div>
      <div class="frow">
        <div class="fg"><label class="flabel">Alert on Entry</label><select class="fselect" id="gfm-entry"><option value="true">Yes</option><option value="false">No</option></select></div>
        <div class="fg"><label class="flabel">Alert on Exit</label><select class="fselect" id="gfm-exit"><option value="true">Yes</option><option value="false">No</option></select></div>
      </div>
      <div class="fg" style="margin:0 0 10px"><label class="flabel">Assign Vehicles (IMEI list)</label>
        <div id="gfm-vehicle-checks" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--border);border-radius:8px;max-height:120px;overflow-y:auto"></div>
      </div>
      <div style="padding:10px;background:#f8fafc;border-radius:8px;font-size:12px;color:var(--muted)" id="gfm-coords-info">Coordinates will be taken from the map drawing.</div>
    </div>
    <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('gfModal')">Cancel</button><button class="btn btn-primary" onclick="saveGeofence()">Save Fence</button></div>
  </div>
</div>

<!-- ADD MAINTENANCE TASK MODAL -->
<div class="overlay" id="addMaintModal" onclick="if(event.target===this)closeModal('addMaintModal')">
  <div class="modal"><div class="mhdr"><div><div class="mtitle" id="maint-modal-title">Add Maintenance Task</div><div class="msub">Set service triggers by odometer, engine hours or days</div></div><div class="mclose" onclick="closeModal('addMaintModal')">✕</div></div>
    <div class="mbody">
      <input type="hidden" id="maint-edit-id">
      <div class="frow"><div class="fg"><label class="flabel">Vehicle / IMEI</label><select class="fselect" id="maint-dev-sel"></select></div><div class="fg"><label class="flabel">Task Type</label><select class="fselect" id="maint-task-type"><option value="oil_change">Oil Change</option><option value="tyre">Tyre Rotation</option><option value="brakes">Brake Inspection</option><option value="service">Full Service</option><option value="battery">Battery Check</option><option value="ac">AC Service</option><option value="custom">Custom</option></select></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Task Title</label><input class="finput" id="maint-title" placeholder="e.g. 50,000 km Oil Change"></div></div>
      <div class="frow">
        <div class="fg"><label class="flabel">Due at Odometer (km)</label><input class="finput" type="number" id="maint-odo" placeholder="50000"></div>
        <div class="fg"><label class="flabel">Due at Engine Hours</label><input class="finput" type="number" id="maint-hrs" placeholder="500"></div>
      </div>
      <div class="frow">
        <div class="fg"><label class="flabel">Due in Days</label><input class="finput" type="number" id="maint-days" placeholder="90"></div>
        <div class="fg"><label class="flabel">Start Date</label><input class="finput" type="date" id="maint-start"></div>
      </div>
      <div class="frow"><div class="fg"><label class="flabel">Notes</label><input class="finput" id="maint-notes" placeholder="Optional notes"></div></div>
    </div>
    <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('addMaintModal')">Cancel</button><button class="btn btn-primary" onclick="saveMaintTask()">Save Task</button></div>
  </div>
</div>

<!-- FIREBASE CONFIG MODAL -->
<div class="overlay" id="firebaseModal" onclick="if(event.target===this)closeModal('firebaseModal')">
  <div class="modal"><div class="mhdr"><div><div class="mtitle">Firebase Configuration</div><div class="msub">Enter your FCM credentials for push notifications</div></div><div class="mclose" onclick="closeModal('firebaseModal')">✕</div></div>
    <div class="mbody">
      <div class="frow"><div class="fg"><label class="flabel">Firebase Project ID</label><input class="finput" id="fb-project" placeholder="your-project-id"></div></div>
      <div class="frow"><div class="fg"><label class="flabel">FCM Server Key</label><input class="finput" type="password" id="fb-key" placeholder="AAAA..."></div></div>
      <div class="frow"><div class="fg"><label class="flabel">Web App API Key</label><input class="finput" id="fb-apikey" placeholder="AIza..."></div></div>
      <p style="font-size:12px;color:var(--muted)">Enter these from Firebase Console → Project Settings → Cloud Messaging</p>
    </div>
    <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('firebaseModal')">Cancel</button><button class="btn btn-primary" onclick="saveFirebaseConfig()">Save &amp; Enable</button></div>
  </div>
</div>

<!-- ENGINE CUT CONFIRM -->
<div class="overlay" id="engineCutModal" onclick="if(event.target===this)closeModal('engineCutModal')">
  <div class="modal" style="max-width:400px"><div class="mhdr"><div><div class="mtitle" id="ecm-title">Engine Cut</div><div class="msub" id="ecm-sub">Immobilise this vehicle?</div></div><div class="mclose" onclick="closeModal('engineCutModal')">✕</div></div>
    <div class="mbody">
      <input type="hidden" id="ecm-imei"><input type="hidden" id="ecm-cmd">
      <div id="ecm-body" style="font-size:14px;color:var(--muted);padding:8px 0"></div>
    </div>
    <div class="mfooter"><button class="btn btn-secondary" onclick="closeModal('engineCutModal')">Cancel</button><button class="btn btn-danger" id="ecm-confirm-btn" onclick="execEngineCut()">Confirm</button></div>
  </div>
</div>`;
})();


// ==================================================================
// FLEET OS v2.0 — COMPLETE SINGLE-FILE FRONTEND
// All JS is inline. No module loader. No dynamic fetching.
// Edit this file to change anything. Restart server after changes.
// ==================================================================

// == Roles =========================================================
const ROLES = {
  admin:    {label:'Admin',    icon:'👑', badge:'badge-red',    crud:true,  sys:true },
  manager:  {label:'Manager',  icon:'📊', badge:'badge-amber',  crud:true,  sys:false},
  dealer:   {label:'Dealer',   icon:'🏪', badge:'badge-orange', crud:true,  sys:false},
  operator: {label:'Operator', icon:'🎛️', badge:'badge-violet', crud:false, sys:false},
  user:     {label:'User',     icon:'👤', badge:'badge-blue',   crud:false, sys:false},
  demo:     {label:'Demo',     icon:'👁️', badge:'badge-green',  crud:false, sys:false},
};
const NAV_ACCESS = {
  admin:    ['dashboard','map','playback','users','devices','drivers','routes','events','maintenance','geofence','reports','notifications','setup','logs','profile'],
  manager:  ['dashboard','map','playback','users','devices','drivers','routes','events','maintenance','geofence','reports','notifications','profile'],
  dealer:   ['dashboard','map','playback','users','devices','drivers','events','reports','profile'],
  operator: ['dashboard','map','playback','devices','events','reports','profile'],
  user:     ['dashboard','map','playback','devices','profile'],
  demo:     ['dashboard','map','profile'],
};
const PAGE_LABELS = {
  dashboard:'Dashboard',map:'Live Map',playback:'Playback',users:'Users',
  devices:'Devices',drivers:'Drivers',routes:'Routes',events:'Events & Alarms',
  maintenance:'Maintenance',geofence:'Geo-fences',reports:'Reports',
  notifications:'Notifications',setup:'Setup',logs:'Audit Log',profile:'Profile'
};
let curRole = 'admin';
let curUser = {fname:'Fleet',lname:'Admin',email:'admin@fleetcop.com'};

// == State =========================================================
let USERS=[], DEVICES=[], DRIVERS=[], EVENTS=[], ROUTES=[], MAINT=[];
let uFilter='all', uSearch='', dFilter='all', dSearch='', drFilter='all', drSearch='';
let evFilter='all', _dashTimer=null;

// == API Layer =====================================================
const API = '/api';
let _jwt = sessionStorage.getItem('fleetos_jwt') || null;

function apiHdr() {
  return {'Content-Type':'application/json','Authorization':_jwt?`Bearer ${_jwt}`:''};
}
async function apiFetch(path, opts={}) {
  let res;
  try { res = await fetch(API+path, {...opts, headers:apiHdr()}); }
  catch { throw new Error('Cannot reach server — is Fleet OS running on :8080?'); }
  let data=null;
  try { data = await res.json(); } catch {}
  if (res.status===401) { if(!opts._silent) doLogout(); return null; }
  if (!res.ok) throw new Error((data&&data.error)||`HTTP ${res.status}`);
  return data;
}
async function apiGet(p)     { return apiFetch(p); }
async function apiPost(p,b)  { return apiFetch(p,{method:'POST', body:JSON.stringify(b)}); }
async function apiPut(p,b)   { return apiFetch(p,{method:'PUT',  body:JSON.stringify(b)}); }
async function apiDel(p)     { return apiFetch(p,{method:'DELETE'}); }

// == Helpers =======================================================
const AVC=['#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#06B6D4','#14B8A6'];
function gc(s){let h=0;for(const c of s)h=(h<<5)-h+c.charCodeAt(0);return AVC[Math.abs(h)%AVC.length]}
function ini(s){return(s||'?').substring(0,2).toUpperCase()}
function eEdit(){return'<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'}
function eDel(){return'<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'}
function eEye(){return'<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'}
function ePlay(){return'<svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>'}
function roleBadge(r){const m={admin:'badge-red',manager:'badge-amber',dealer:'badge-orange',operator:'badge-violet',user:'badge-blue',demo:'badge-green'};const ic={admin:'👑',manager:'📊',dealer:'🏪',operator:'🎛️',user:'👤',demo:'👁️'};return`<span class="badge ${m[r]||'badge-gray'}">${ic[r]||''}${ROLES[r]?.label||r}</span>`;}
function dssColor(s){return s>=80?'var(--green)':s>=60?'var(--amber)':'var(--red)'}
function stBadge(s){const m={online:'badge-green',offline:'badge-gray',idle:'badge-amber',alarm:'badge-red',active:'badge-green',inactive:'badge-gray',suspended:'badge-red',moving:'badge-green',stopped:'badge-gray',never_connected:'badge-gray'};return`<span class="badge ${m[s]||'badge-gray'}">${s==='online'||s==='active'||s==='moving'?'<span class="bdot"></span>':''}${(s||'').charAt(0).toUpperCase()+(s||'').slice(1)}</span>`;}
function fmtDate(d){return d?new Date(d).toLocaleDateString('en-IN'):'—'}
function fmtTs(d){return d?new Date(d).toLocaleString('en-IN'):'—'}
function loadingRow(cols){return`<tr><td colspan="${cols}" style="text-align:center;padding:24px;color:var(--muted)">⏳ Loading...</td></tr>`}
function emptyRow(cols,msg='No data yet'){return`<tr><td colspan="${cols}" style="text-align:center;padding:24px;color:var(--muted)">${msg}</td></tr>`}
function canDo(){return ROLES[curRole]?.crud}
function globalSearch(v) {
  const page = document.querySelector('.page.active')?.id?.replace('page-','');
  const searchMap = {
    users: 'searchU', devices: 'searchD', drivers: 'searchDrv'
  };
  // Forward to page search if available
  const pageSearchFn = searchMap[page];
  if (pageSearchFn && typeof window[pageSearchFn] === 'function') {
    window[pageSearchFn](v);
    // Also update the page-level search input if it exists
    const pageInput = document.querySelector('#page-'+page+' .search-field input');
    if (pageInput && pageInput.value !== v) pageInput.value = v;
  }
}  // TODO: implement global search

// == Toast =========================================================
function toast(msg,type='info',icon=''){
  const t=document.getElementById('toastWrap');
  if(!t){console.log('[toast]',msg);return;}
  const div=document.createElement('div');
  div.className=`toast ${type==='success'?'success':type==='error'?'error':'info'}`;
  div.innerHTML=`${icon?`<span>${icon}</span>`:''}${msg}`;
  t.appendChild(div);
  setTimeout(()=>div.remove(),3500);
}

// == Confirm =======================================================
let _confirmCb=null;
function confirmAction(title,msg,icon,cb){
  const o=document.getElementById('confirmOvl');
  if(!o){if(confirm(msg))cb();return;}
  document.getElementById('conf-title').textContent=title;
  document.getElementById('conf-msg').textContent=msg;
  if(icon)document.getElementById('conf-ico').textContent=icon;
  _confirmCb=cb; o.style.display='flex';
}
function closeConfirm(){const o=document.getElementById('confirmOvl');if(o)o.style.display='none';_confirmCb=null;}
function execConfirm(){closeConfirm();if(_confirmCb)_confirmCb();}
async function confirmDel(type,id,name){
  confirmAction('Delete '+type,`Delete "${name}"? Cannot be undone.`,'🗑️',async()=>{
    try{
      await apiDel('/'+type+'s/'+id);
      toast(name+' deleted','success','🗑️');
      if(type==='user')renderUsers();
      if(type==='device')renderDevs();
      if(type==='driver')renderDrv();
      if(type==='route'||type==='route-v2')loadRoutesList();
    }catch(e){toast('Error: '+e.message,'error');}
  });
}

// == Modal =========================================================
function openModal(id){const e=document.getElementById(id);if(e)e.style.display='flex';}
function closeModal(id){const e=document.getElementById(id);if(e)e.style.display='none';}
function closeNotif(){const p=document.getElementById('notifPanel');if(p)p.style.display='none';}
function toggleNotif(){const p=document.getElementById('notifPanel');if(p)p.style.display=p.style.display==='block'?'none':'block';}
document.addEventListener('click',e=>{const p=document.getElementById('notifPanel');if(p&&p.style.display==='block'&&!e.target.closest('.ico-btn')&&!e.target.closest('#notifPanel'))p.style.display='none';});

// == Misc UI =======================================================
function refreshData(){const page=document.querySelector('.page.active')?.id?.replace('page-','');if(page)nav(page);toast('Refreshed','success','🔄');}
function selAll(cb,tableId){const t=document.getElementById(tableId);if(!t)return;t.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=cb.checked);}
function setTab(el){const parent=el.closest('.tabs-row,.card-header');if(parent)parent.querySelectorAll('.tab-item').forEach(t=>t.classList.remove('on'));el.classList.add('on');}
function exportCSV(tableId,filename){const tbl=document.getElementById(tableId);if(!tbl){toast('No data','warn');return;}const rows=[];tbl.closest('table').querySelectorAll('tr').forEach(tr=>{rows.push(Array.from(tr.querySelectorAll('th,td')).map(c=>'"'+c.innerText.replace(/"/g,'""')+'"').join(','));});const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(rows.join('\n'));a.download=(filename||'export')+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();toast('Exported','success','⬇');}
function exportRptCSV(name){const tbl=document.querySelector('#rpt-table')?.closest('table');if(!tbl){toast('Generate a report first','warn','⚠️');return;}const rows=[];tbl.querySelectorAll('tr').forEach(tr=>{rows.push(Array.from(tr.querySelectorAll('th,td')).map(c=>'"'+c.innerText.replace(/"/g,'""')+'"').join(','));});const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(rows.join('\n'));a.download=(name||'report')+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();}
function exportReportPDF(){toast('Use browser Print → Save as PDF','info','🖨️');window.print();}
function ackAll(){confirmAction('Acknowledge All','Mark all alarms acknowledged?','✓',()=>{toast('All alarms acknowledged','success','✅');setTimeout(renderEv,200);});}
function buildPager(pid,iid,total,perPage){const pager=document.getElementById(pid);const info=document.getElementById(iid);if(!pager)return;const pages=Math.ceil(total/perPage);if(info)info.textContent=`Showing 1–${Math.min(perPage,total)} of ${total}`;pager.innerHTML=Array.from({length:Math.min(pages,5)},(_,i)=>`<div class="pg-btn ${i===0?'on':''}">${i+1}</div>`).join('');}
function filterDrv(f,el){drFilter=f;document.querySelectorAll('#page-drivers .fchip').forEach(c=>c.classList.remove('on'));if(el)el.classList.add('on');renderDrv();}
function filterEv(f,el){evFilter=f;document.querySelectorAll('#page-events .fchip').forEach(c=>c.classList.remove('on'));if(el)el.classList.add('on');renderEv();}
function downloadTemplate(entity){const t={devices:'imei,name,protocol,vehicle_type,speed_limit,fuel_type\n864920068034001,KA01AB1234,GT06N,Car,80,Diesel\n',drivers:'fname,lname,phone,email,lic_number,lic_type,lic_expiry\nRajesh,Kumar,+91 9876543210,rajesh@co.com,KA0320190123,LMV,2030-01-01\n',users:'fname,lname,email,phone,role,device_limit\nFleet,User,user@company.com,+91 9876543210,user,10\n'};const csv=t[entity]||'';const a=document.createElement('a');a.href='data:text/csv,'+encodeURIComponent(csv);a.download=entity+'_template.csv';a.click();}
async function bulkImportEntity(entity,input){const file=input.files[0];if(!file)return;const text=await file.text();const lines=text.split('\n').filter(l=>l.trim());if(lines.length<2){toast('Empty file','error');return;}const headers=lines[0].split(',').map(h=>h.trim().replace(/"/g,''));const rows=lines.slice(1).map(line=>{const vals=line.split(',').map(v=>v.trim().replace(/"/g,''));const obj={};headers.forEach((h,i)=>{if(vals[i])obj[h]=vals[i];});return obj;}).filter(r=>Object.keys(r).length>0);if(!rows.length){toast('No data rows','error');return;}try{const res=await apiPost('/bulk/'+entity,{rows});toast(`Imported ${res.inserted} ${entity}`,'success','📤');if(entity==='devices')renderDevs();if(entity==='drivers')renderDrv();if(entity==='users')renderUsers();}catch(e){toast('Import error: '+e.message,'error');}input.value='';}

// == Auth ==========================================================
function doLogout(){_jwt=null;sessionStorage.removeItem('fleetos_jwt');location.reload();}
function applyRole(){
  const rc=ROLES[curRole];const allowed=NAV_ACCESS[curRole];
  const sn=document.getElementById('sb-uname');if(sn)sn.textContent=curUser.fname+' '+curUser.lname;
  const sr=document.getElementById('sb-urole');if(sr)sr.textContent=curRole+' · '+curUser.email;
  const sa=document.getElementById('sb-ava');if(sa)sa.textContent=(curUser.fname[0]||'?').toUpperCase();
  ['dashboard','map','playback','users','devices','drivers','routes','events','maintenance','geofence','reports','notifications','setup','logs','profile'].forEach(p=>{
    const el=document.getElementById('nav-'+p);if(el)el.style.display=allowed.includes(p)?'':'none';
  });
  const sysEl=document.getElementById('sys-sect');if(sysEl)sysEl.style.display=(curRole==='admin'||curRole==='manager')?'':'none';
  ['btn-add-user','btn-add-dev','btn-add-drv'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=rc?.crud?'':'none';});
}

// == Navigation ====================================================
function nav(page){
  if(!NAV_ACCESS[curRole]?.includes(page)){toast('Access denied','error','🚫');return;}
  if(page!=='dashboard'&&_dashTimer){clearInterval(_dashTimer);_dashTimer=null;}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('active'));
  const pg=document.getElementById('page-'+page);if(pg)pg.classList.add('active');
  const nv=document.getElementById('nav-'+page);if(nv)nv.classList.add('active');
  const tb=document.getElementById('tb-section');if(tb)tb.textContent=PAGE_LABELS[page]||page;
  closeNotif();
  const renderFns={
    dashboard:renderDash, map:renderMap, users:renderUsers, devices:renderDevs,
    drivers:renderDrv, events:renderEv, routes:renderRoutes, maintenance:renderMaint,
    geofence:renderGeofence, notifications:renderNotif, reports:renderReports,
    logs:renderLogs, playback:renderPlayback
  };
  if(renderFns[page])renderFns[page]();
  if(page==='map'){
    setTimeout(()=>{
      if(_liveMap){ _liveMap.invalidateSize(); }
      else { renderMap(); }
    },200);
  }
}

// == Dashboard =====================================================
async function renderDash(){
  if(_dashTimer){clearInterval(_dashTimer);_dashTimer=null;}
  await _fetchDash();
  _dashTimer=setInterval(_fetchDash,15000);
}
async function _fetchDash(){
  try{
    const s=await apiGet('/dashboard');if(!s)return;
    const total  = parseInt(s.devices?.total||0);
    const moving = parseInt(s.devices?.moving||0);
    const drvs   = parseInt(s.drivers?.total||0);
    const dss    = parseInt(s.drivers?.avg_dss||0);
    const users  = parseInt(s.users?.total||0);
    const alarms = parseInt(s.alarms?.active||0);
    const live   = s.live||[];
    const events = s.events||[];
    const el=document.getElementById('dash-stats');
    if(el)el.innerHTML=`
      <div class="stat-card" style="cursor:pointer" onclick="nav('map')"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">🟢</div></div><div class="stat-val" style="color:var(--green)">${moving}</div><div class="stat-lbl">Moving Now</div><div class="stat-bar" style="background:var(--green)"></div></div>
      <div class="stat-card" style="cursor:pointer" onclick="nav('devices')"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">📡</div></div><div class="stat-val">${total}</div><div class="stat-lbl">Total Devices</div><div class="stat-bar" style="background:var(--primary)"></div></div>
      <div class="stat-card" style="cursor:pointer" onclick="nav('drivers')"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">🚗</div></div><div class="stat-val">${drvs}</div><div class="stat-lbl">Active Drivers</div><div class="stat-bar" style="background:var(--primary)"></div></div>
      <div class="stat-card" style="cursor:pointer" onclick="nav('users')"><div class="stat-top"><div class="stat-ico" style="background:var(--amber-bg)">👤</div></div><div class="stat-val">${users}</div><div class="stat-lbl">Active Users</div><div class="stat-bar" style="background:var(--amber)"></div></div>
      <div class="stat-card" style="cursor:pointer" onclick="nav('events')"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">🚨</div></div><div class="stat-val" style="color:var(--red)">${alarms}</div><div class="stat-lbl">Active Alarms</div><div class="stat-bar" style="background:var(--red)"></div></div>
      <div class="stat-card" style="cursor:pointer" onclick="nav('drivers')"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">⭐</div></div><div class="stat-val" style="color:${dssColor(dss)}">${dss||'—'}</div><div class="stat-lbl">Avg Driver Score</div><div class="stat-bar" style="background:var(--green)"></div></div>`;
    const lt=document.getElementById('dash-live');
    if(lt){
      const stC={moving:'#22c55e',idle:'#f59e0b',stopped:'#64748b',offline:'#ef4444',never_connected:'#94a3b8'};
      lt.innerHTML=live.length?live.map(v=>`<tr onclick="nav('map')">
        <td><div style="font-weight:600">${v.name}</div><div style="font-size:10px;color:var(--muted)">${v.imei}</div></td>
        <td style="font-size:12px">${v.driver_name||'—'}</td>
        <td style="font-weight:700;color:${(parseFloat(v.speed)||0)>0?'#22c55e':'var(--muted)'}">${(parseFloat(v.speed)||0).toFixed(0)} km/h</td>
        <td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.address_short||'—'}</td>
        <td><span style="padding:2px 7px;border-radius:99px;background:${(stC[v.status]||'#94a3b8')+'22'};color:${stC[v.status]||'#94a3b8'};font-size:11px;font-weight:700">${(v.status||'offline').toUpperCase()}</span></td>
        <td style="font-size:11px;color:var(--muted)">${fmtTs(v.ts)||'Never'}</td>
      </tr>`).join(''):'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">No GPS data yet</td></tr>';
    }
    const al=document.getElementById('dash-alerts');
    if(al){
      al.innerHTML=events.length?events.map(e=>`<div class="tl-item">
        <div class="tl-ico" style="background:var(--red-bg)">⚠️</div>
        <div class="tl-content"><div class="tl-title">${e.alarm_type||'ALARM'} — ${e.device_name||e.imei}</div>
        <div class="tl-sub">${e.address||'—'}</div></div>
        <span class="tl-time">${fmtTs(e.ts)}</span>
      </div>`).join(''):'<div style="padding:24px;text-align:center;color:var(--muted)">✅ No recent alerts</div>';
    }
    const dct=document.getElementById('sb-d-ct');if(dct)dct.textContent=total;
    const dsub=document.getElementById('dash-sub');if(dsub)dsub.textContent='Fleet overview · '+new Date().toLocaleString('en-IN');
  }catch(e){console.warn('[dash]',e.message);}
}

// == Users =========================================================
async function renderUsers(){
  const tb=document.getElementById('uTable');if(!tb)return;
  tb.innerHTML=loadingRow(11);
  try{
    USERS=(await apiGet('/users'))||[];
    if(!Array.isArray(USERS))throw new Error('Invalid response');
    let data=USERS.filter(u=>{
      if(uFilter!=='all'&&u.role!==uFilter)return false;
      if(uSearch&&!`${u.fname} ${u.lname} ${u.email}`.toLowerCase().includes(uSearch))return false;
      return true;
    });
    if(!data.length){tb.innerHTML=emptyRow(11,'No users found');return;}
    tb.innerHTML=data.map(u=>`<tr>
      <td><input type="checkbox"></td>
      <td><div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:50%;background:${gc(u.email)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">${ini(u.fname)}</div>
        <div><div style="font-weight:600">${u.fname} ${u.lname}</div><div style="font-size:11px;color:var(--muted)">${u.email}</div></div>
      </div></td>
      <td class="mono" style="font-size:12px">${u.phone||'—'}</td>
      <td>${roleBadge(u.role)}</td>
      <td style="font-size:12px">${u.manager_email||'—'}</td>
      <td>${u.device_count||0} / ${u.device_limit||'∞'}</td>
      <td>${u.sub_limit||0}</td>
      <td class="mono" style="font-size:11px">${fmtDate(u.expiry)||'Unlimited'}</td>
      <td class="mono" style="font-size:11px">${fmtTs(u.last_login)||'Never'}</td>
      <td>${stBadge(u.status)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn-icon" onclick="viewUser('${u.id}')" title="View">${eEye()}</button>
        ${canDo()?`<button class="btn-icon edit" onclick="editUser('${u.id}')">${eEdit()}</button>
        <button class="btn-icon del" onclick="confirmDel('user','${u.id}','${u.email}')">${eDel()}</button>`:''}
      </div></td>
    </tr>`).join('');
    const ct=document.getElementById('sb-u-ct');if(ct)ct.textContent=USERS.length;
    const lbl=document.getElementById('u-ct-lbl');if(lbl)lbl.textContent=USERS.length+' total';
    buildPager('u-pager','u-pg-info',data.length,20);
  }catch(e){tb.innerHTML=emptyRow(11,'⚠️ '+e.message);}
}
function filterU(f,el){uFilter=f;document.querySelectorAll('#page-users .fchip').forEach(c=>c.classList.remove('on'));if(el)el.classList.add('on');renderUsers();}
function searchU(v){uSearch=v.toLowerCase();renderUsers();}

// == User Modal ====================================================
async function openUserModal(id){
  document.getElementById('um-id').value=id||'';
  document.getElementById('um-title').textContent=id?'Edit User':'Add User';
  ['um-fname','um-lname','um-email','um-pass'].forEach(f=>{const e=document.getElementById(f);if(e)e.value='';});
  document.getElementById('um-role').value='user';
  document.getElementById('um-status').value='active';
  document.getElementById('um-sub').value='0';
  const mgrSel=document.getElementById('um-mgr');
  if(mgrSel){try{const u=await apiGet('/users');mgrSel.innerHTML='<option value="">-- No manager --</option>'+(u||[]).filter(x=>['admin','manager'].includes(x.role)).map(x=>`<option value="${x.id}">${x.fname} ${x.lname}</option>`).join('');}catch{}}
  if(id){try{const u=await apiGet('/users/'+id);
    document.getElementById('um-fname').value=u.fname||'';
    document.getElementById('um-lname').value=u.lname||'';
    document.getElementById('um-email').value=u.email||'';
    document.getElementById('um-phone').value=u.phone||'';
    document.getElementById('um-role').value=u.role||'user';
    document.getElementById('um-status').value=u.status||'active';
    document.getElementById('um-sub').value=u.sub_limit||0;
    if(u.manager_id)document.getElementById('um-mgr').value=u.manager_id;
  }catch(e){toast('Error: '+e.message,'error');}}
  openModal('userModal');
}
async function saveUser(){
  const id=document.getElementById('um-id').value;
  const b={fname:document.getElementById('um-fname').value.trim(),lname:document.getElementById('um-lname').value.trim(),email:document.getElementById('um-email').value.trim(),phone:document.getElementById('um-phone')?.value||'',role:document.getElementById('um-role').value,status:document.getElementById('um-status').value,sub_limit:parseInt(document.getElementById('um-sub')?.value)||0,manager_id:document.getElementById('um-mgr')?.value||null};
  const pass=document.getElementById('um-pass')?.value;
  if(pass)b.password=pass;
  if(!id&&!pass){toast('Password required','error');return;}
  if(!b.fname||!b.email){toast('Name and email required','error');return;}
  try{if(id)await apiPut('/users/'+id,b);else await apiPost('/users',{...b,password:pass});toast(id?'User updated':'User created','success','👤');closeModal('userModal');renderUsers();}catch(e){toast('Error: '+e.message,'error');}
}
function editUser(id){openUserModal(id);}
async function viewUser(id){
  try{const u=await apiGet('/users/'+id);
    const b=document.getElementById('udm-body');
    if(b)b.innerHTML=`<table style="width:100%;font-size:13px;border-collapse:collapse">${Object.entries(u).filter(([k])=>!k.includes('hash')).map(([k,v])=>`<tr style="border-bottom:1px solid var(--border)"><td style="padding:7px 10px;color:var(--muted);font-weight:600;width:140px">${k}</td><td style="padding:7px 10px">${v??'—'}</td></tr>`).join('')}</table>`;
    document.getElementById('udm-title').textContent=u.fname+' '+u.lname;
    document.getElementById('udm-sub').textContent=u.email;
    openModal('userDetailModal');
  }catch(e){toast('Error: '+e.message,'error');}
}

// == Devices =======================================================
async function renderDevs(){
  const tb=document.getElementById('dTable');if(!tb)return;
  tb.innerHTML=loadingRow(10);
  try{
    DEVICES=(await apiGet('/devices'))||[];
    if(!Array.isArray(DEVICES))throw new Error('Invalid response');
    const stC={moving:'#22c55e',idle:'#f59e0b',stopped:'#94a3b8',offline:'#ef4444',never_connected:'#cbd5e1'};
    let data=DEVICES.filter(d=>{
      if(dFilter!=='all'){const st=d.status||'offline';
        if(dFilter==='online'&&!['moving','idle'].includes(st))return false;
        if(dFilter==='offline'&&!['offline','never_connected'].includes(st))return false;
      }
      if(dSearch&&!`${d.name} ${d.imei}`.toLowerCase().includes(dSearch))return false;
      return true;
    });
    if(!data.length){tb.innerHTML=emptyRow(10,'No devices found');return;}
    tb.innerHTML=data.map(d=>{
      const st=d.status||'offline';
      const col=stC[st]||'#94a3b8';
      const dur=d.state_mins!=null?`${Math.floor(d.state_mins/60)}h ${d.state_mins%60}m`:'';
      return `<tr>
        <td><input type="checkbox"></td>
        <td><div style="font-weight:600">${d.name}</div>
            <div class="mono" style="font-size:10px;color:var(--muted)">${d.imei}</div>
            <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px">
              ${d.engine_cut?'<span style="font-size:10px;color:#dc2626;font-weight:700">✂️CUT</span>':''}
              ${d.safe_parking?'<span style="font-size:10px;color:#7c3aed;font-weight:700">🔒</span>':''}
            </div></td>
        <td><span class="badge badge-gray">${d.protocol||'—'}</span></td>
        <td style="font-size:12px">${d.vehicle_type||'—'}</td>
        <td><span style="padding:2px 7px;border-radius:99px;background:${col}22;color:${col};font-size:11px;font-weight:700">${st.replace(/_/g,' ').toUpperCase()}</span>
            ${dur?`<div style="font-size:10px;color:${col}">${dur}</div>`:''}</td>
        <td style="font-size:12px">${d.user_email||'—'}</td>
        <td style="font-size:12px">${d.driver_name||'—'}</td>
        <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address_short||'No GPS'}</td>
        <td class="mono" style="color:${(parseFloat(d.speed)||0)>0?'#22c55e':'var(--muted)'}">${(parseFloat(d.speed)||0).toFixed(0)} km/h</td>
        <td style="font-size:11px;color:var(--muted)">${fmtTs(d.last_seen)||'Never'}</td>
        <td><div style="display:flex;gap:3px">
          ${canDo()?`<button class="btn-icon edit" onclick="editDev('${d.id}')">${eEdit()}</button>
          <button class="btn-icon" onclick="openEngineCutModal('${d.imei}','${d.name}',${!!d.engine_cut})" style="color:${d.engine_cut?'#16a34a':'#dc2626'}">${d.engine_cut?'✅':'✂️'}</button>
          <button class="btn-icon del" onclick="confirmDel('device','${d.id}','${d.name}')">${eDel()}</button>`:''}
          <button class="btn-icon" onclick="openPlaybackForImei('${d.imei}')" title="Playback">${ePlay()}</button>
        </div></td>
      </tr>`;
    }).join('');
    const ct=document.getElementById('sb-d-ct');if(ct)ct.textContent=DEVICES.length;
    const lbl=document.getElementById('d-ct-lbl');if(lbl)lbl.textContent=DEVICES.length+' registered';
    buildPager('d-pager','d-pg-info',data.length,20);
  }catch(e){tb.innerHTML=emptyRow(10,'⚠️ '+e.message);}
}
function filterD(f,el){dFilter=f;document.querySelectorAll('#page-devices .fchip').forEach(c=>c.classList.remove('on'));if(el)el.classList.add('on');renderDevs();}
function searchD(v){dSearch=v.toLowerCase();renderDevs();}

// == Device Modal ==================================================
async function openDevModal(id){
  document.getElementById('dm-id').value=id||'';
  document.getElementById('dm-title').textContent=id?'Edit Device':'Add Device';
  ['dm-name','dm-imei','dm-odo','dm-notes'].forEach(f=>{const e=document.getElementById(f);if(e)e.value='';});
  document.getElementById('dm-speed').value='80';
  const spCb=document.getElementById('dm-safe-park');if(spCb)spCb.checked=false;
  const ecCb=document.getElementById('dm-engine-cut');if(ecCb)ecCb.checked=false;
  const spDiv=document.getElementById('dm-safe-park-coords');if(spDiv)spDiv.style.display='none';
  if(spCb)spCb.onchange=function(){if(spDiv)spDiv.style.display=this.checked?'':'none';};
  try{
    const users=await apiGet('/users');const drivers=await apiGet('/drivers');
    const uSel=document.getElementById('dm-user');
    if(uSel)uSel.innerHTML='<option value="">-- Unassigned --</option>'+(users||[]).map(u=>`<option value="${u.id}">${u.fname} ${u.lname} (${u.email})</option>`).join('');
    const dSel=document.getElementById('dm-driver');
    if(dSel)dSel.innerHTML='<option value="">-- No driver --</option>'+(drivers||[]).map(d=>`<option value="${d.id}">${d.fname} ${d.lname}</option>`).join('');
  }catch{}
  if(id){try{const d=await apiGet('/devices/'+id);
    document.getElementById('dm-name').value=d.name||'';document.getElementById('dm-imei').value=d.imei||'';
    document.getElementById('dm-proto').value=d.protocol||'GT06N';document.getElementById('dm-type').value=d.vehicle_type||'Car';
    document.getElementById('dm-speed').value=d.speed_limit||80;document.getElementById('dm-fuel').value=d.fuel_type||'Diesel';
    document.getElementById('dm-odo').value=d.odometer||0;document.getElementById('dm-notes').value=d.notes||'';
    if(spCb)spCb.checked=!!d.safe_parking;if(ecCb)ecCb.checked=!!d.engine_cut;
    const spR=document.getElementById('dm-sp-radius');if(spR)spR.value=d.safe_parking_radius||50;
    if(d.safe_parking&&spDiv)spDiv.style.display='';
    const uSel=document.getElementById('dm-user');if(uSel&&d.assigned_user_id)uSel.value=d.assigned_user_id;
    const dSel=document.getElementById('dm-driver');if(dSel&&d.assigned_driver_id)dSel.value=d.assigned_driver_id;
  }catch(e){toast('Error loading device: '+e.message,'error');}}
  openModal('devModal');
}
async function saveDev(){
  const id=document.getElementById('dm-id').value;
  const body={name:document.getElementById('dm-name').value.trim(),imei:document.getElementById('dm-imei').value.trim(),protocol:document.getElementById('dm-proto').value,vehicle_type:document.getElementById('dm-type').value,speed_limit:parseInt(document.getElementById('dm-speed').value)||80,fuel_type:document.getElementById('dm-fuel').value,odometer:parseFloat(document.getElementById('dm-odo').value)||0,notes:document.getElementById('dm-notes').value.trim(),assigned_user_id:document.getElementById('dm-user').value||null,assigned_driver_id:document.getElementById('dm-driver').value||null,safe_parking:document.getElementById('dm-safe-park').checked,safe_parking_radius:parseInt(document.getElementById('dm-sp-radius')?.value)||50,engine_cut:document.getElementById('dm-engine-cut').checked};
  if(!body.name||!body.imei){toast('Name and IMEI required','error');return;}
  try{if(id)await apiPut('/devices/'+id,body);else await apiPost('/devices',body);toast(id?'Device updated':'Device added','success','📡');closeModal('devModal');renderDevs();}catch(e){toast('Error: '+e.message,'error');}
}
function editDev(id){openDevModal(id);}

// == Engine Cut ====================================================
function openEngineCutModal(imei,name,isCut){
  document.getElementById('ecm-imei').value=imei;document.getElementById('ecm-cmd').value=isCut?'engine_restore':'engine_cut';
  document.getElementById('ecm-title').textContent=isCut?'Restore Engine':'Engine Cut';
  document.getElementById('ecm-body').innerHTML=isCut?`<p>Restore engine on <b>${name}</b>?</p>`:`<p>Cut engine on <b>${name}</b>?<br><span style="color:#dc2626;font-weight:700">⚠️ Vehicle will be immobilised.</span></p>`;
  const btn=document.getElementById('ecm-confirm-btn');if(btn){btn.textContent=isCut?'✅ Restore':'✂️ Cut Engine';btn.style.background=isCut?'#16a34a':'#dc2626';}
  openModal('engineCutModal');
}
async function execEngineCut(){
  const imei=document.getElementById('ecm-imei').value;const cmd=document.getElementById('ecm-cmd').value;
  try{await apiPost('/device-commands',{imei,command:cmd});toast(cmd==='engine_cut'?'Engine cut sent':'Engine restored','success',cmd==='engine_cut'?'✂️':'✅');closeModal('engineCutModal');renderDevs();}catch(e){toast('Error: '+e.message,'error');}
}

// == Drivers =======================================================
async function renderDrv(){
  const tb=document.getElementById('drTable');if(!tb)return;
  tb.innerHTML=loadingRow(9);
  try{
    DRIVERS=(await apiGet('/drivers'))||[];
    if(!Array.isArray(DRIVERS))throw new Error('Invalid response');
    let data=DRIVERS.filter(d=>{
      if(drFilter==='active'&&!d.is_active)return false;
      if(drFilter==='inactive'&&d.is_active)return false;
      if(drSearch&&!`${d.fname} ${d.lname} ${d.phone||''}`.toLowerCase().includes(drSearch))return false;
      return true;
    });
    if(!data.length){tb.innerHTML=emptyRow(9,'No drivers yet');return;}
    const today=new Date();
    tb.innerHTML=data.map(d=>{
      const expiry=d.lic_expiry?new Date(d.lic_expiry):null;
      const exDays=expiry?Math.floor((expiry-today)/86400000):null;
      const exStyle=exDays!=null?(exDays<0?'color:var(--red)':exDays<90?'color:var(--amber)':''):'';
      const dss=parseInt(d.dss_score)||0;
      return `<tr>
        <td><input type="checkbox"></td>
        <td><div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:${gc(d.fname)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">${ini(d.fname)}</div>
          <div><div style="font-weight:600">${d.fname} ${d.lname}</div><div style="font-size:11px;color:var(--muted)">${d.phone||'—'}</div></div>
        </div></td>
        <td class="mono" style="font-size:12px">${d.lic_number||'—'}</td>
        <td><span class="badge badge-gray">${d.lic_type||'LMV'}</span></td>
        <td class="mono" style="font-size:12px;${exStyle}">${fmtDate(d.lic_expiry)||'—'}${exDays!=null&&exDays<0?' ⚠':''}</td>
        <td style="font-size:12px">${d.device_name||d.assigned_imei||'Unassigned'}</td>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:var(--border);border-radius:4px;height:6px;overflow:hidden"><div style="width:${dss}%;height:100%;background:${dssColor(dss)};border-radius:4px"></div></div>
          <span style="font-weight:700;color:${dssColor(dss)};min-width:28px">${dss}</span>
        </div></td>
        <td>0 km</td>
        <td>${stBadge(d.is_active?'active':'inactive')}</td>
        <td><div style="display:flex;gap:4px">
          ${canDo()?`<button class="btn-icon edit" onclick="editDrv('${d.id}')">${eEdit()}</button>
          <button class="btn-icon del" onclick="confirmDel('driver','${d.id}','${d.fname} ${d.lname}')">${eDel()}</button>`:''}
        </div></td>
      </tr>`;
    }).join('');
    const ct=document.getElementById('sb-dr-ct');if(ct)ct.textContent=DRIVERS.length;
    const lbl=document.getElementById('dr-ct-lbl');if(lbl)lbl.textContent=DRIVERS.length+' registered';
    buildPager('dr-pager','dr-pg-info',data.length,20);
  }catch(e){tb.innerHTML=emptyRow(9,'⚠️ '+e.message);}
}
function searchDrv(v){drSearch=v.toLowerCase();renderDrv();}

// == Driver Modal ==================================================
async function openDrvModal(id){
  document.getElementById('drvm-id').value=id||'';
  document.getElementById('drvm-title').textContent=id?'Edit Driver':'Add Driver';
  ['drvm-fname','drvm-lname','drvm-phone','drvm-email','drvm-lic','drvm-notes'].forEach(f=>{const e=document.getElementById(f);if(e)e.value='';});
  const devSel=document.getElementById('drvm-dev');
  if(devSel){try{const d=await apiGet('/devices');devSel.innerHTML='<option value="">-- No device --</option>'+(d||[]).map(x=>`<option value="${x.id}">${x.name} (${x.imei})</option>`).join('');}catch{}}
  if(id){try{const d=await apiGet('/drivers/'+id);
    document.getElementById('drvm-fname').value=d.fname||'';document.getElementById('drvm-lname').value=d.lname||'';
    document.getElementById('drvm-phone').value=d.phone||'';document.getElementById('drvm-email').value=d.email||'';
    document.getElementById('drvm-lic').value=d.lic_number||'';
    if(d.lic_expiry)document.getElementById('drvm-expiry').value=d.lic_expiry?.slice(0,10)||'';
    if(d.assigned_imei)document.getElementById('drvm-dev').value=d.assigned_imei;
    document.getElementById('drvm-status').value=d.is_active?'active':'inactive';
  }catch(e){toast('Error: '+e.message,'error');}}
  openModal('drvModal');
}
async function saveDrv(){
  const id=document.getElementById('drvm-id').value;
  const b={fname:document.getElementById('drvm-fname').value.trim(),lname:document.getElementById('drvm-lname').value.trim(),phone:document.getElementById('drvm-phone')?.value||'',email:document.getElementById('drvm-email')?.value||'',lic_number:document.getElementById('drvm-lic')?.value||'',lic_expiry:document.getElementById('drvm-expiry')?.value||null,is_active:document.getElementById('drvm-status')?.value==='active'};
  const devVal=document.getElementById('drvm-dev')?.value;if(devVal)b.assigned_imei=DEVICES?.find(d=>d.id===devVal)?.imei||devVal;
  if(!b.fname||!b.lname){toast('First and last name required','error');return;}
  try{if(id)await apiPut('/drivers/'+id,b);else await apiPost('/drivers',b);toast(id?'Driver updated':'Driver added','success','🚗');closeModal('drvModal');renderDrv();}catch(e){toast('Error: '+e.message,'error');}
}
function editDrv(id){openDrvModal(id);}

// == Events ========================================================
async function renderEv(){
  const tb=document.getElementById('evTable');if(!tb)return;
  tb.innerHTML=loadingRow(7);
  try{
    EVENTS=await apiGet('/events')||[];
    if(!Array.isArray(EVENTS))EVENTS=[];
    const sm=document.getElementById('ev-stats');
    if(sm){const spd=EVENTS.filter(e=>e.type==='overspeed').length,geo=EVENTS.filter(e=>e.type==='geofence').length,pan=EVENTS.filter(e=>e.type==='panic').length;
      sm.innerHTML=`<div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">⚡</div></div><div class="stat-val" style="color:var(--red)">${spd}</div><div class="stat-lbl">Overspeed</div></div><div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">📍</div></div><div class="stat-val">${geo}</div><div class="stat-lbl">Geofence</div></div><div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">🚨</div></div><div class="stat-val" style="color:var(--red)">${pan}</div><div class="stat-lbl">Panic</div></div><div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">📊</div></div><div class="stat-val">${EVENTS.length}</div><div class="stat-lbl">Total (24h)</div></div>`;}
    if(!EVENTS.length){tb.innerHTML=emptyRow(7,'No events in the last 24h');return;}
    const icoMap={overspeed:'⚡',geofence:'📍',panic:'🚨',power:'🔋',idle:'😴',maintenance:'🔧'};
    let filtered=evFilter==='all'?EVENTS:EVENTS.filter(e=>e.type===evFilter);
    tb.innerHTML=filtered.map(e=>`<tr>
      <td><input type="checkbox"></td>
      <td><span style="font-size:16px">${icoMap[e.type]||'⚠️'}</span></td>
      <td><span class="badge badge-red">${(e.type||'ALARM').toUpperCase()}</span></td>
      <td class="mono" style="font-size:12px">${e.imei}</td>
      <td style="font-size:12px">${e.data?JSON.stringify(e.data).slice(0,60):'—'}</td>
      <td style="font-size:12px">${e.address||'—'}</td>
      <td class="mono" style="font-size:11px">${fmtTs(e.ts)}</td>
      <td><span class="badge badge-amber">Active</span></td>
      <td></td>
    </tr>`).join('');
    const badge=document.getElementById('sb-ev-badge');if(badge)badge.textContent=EVENTS.length;
  }catch(e){tb.innerHTML=emptyRow(7,'Error: '+e.message);}
}

// == Notifications =================================================
async function renderNotif(){
  try{
    const data=await apiGet('/notifications');if(!data)return;
    const {settings=[],history=[],unread=0}=data;
    const el=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    el('notif-stat-total',history.length);el('notif-stat-unread',unread);
    const sbct=document.getElementById('sb-notif-ct');if(sbct){sbct.textContent=unread;sbct.style.display=unread>0?'':'none';}
    const EVENT_LABELS={ignition_on:'🔑 Ignition ON',ignition_off:'🔑 Ignition OFF',charging_off:'🔌 Charging Off',vehicle_added:'🚗 Vehicle Added',geofence_entry:'📍 Geofence Entry',geofence_exit:'↩ Geofence Exit',engine_cut:'✂️ Engine Cut'};
    const events=[...new Set(settings.map(s=>s.event_type))];
    const levels=['beginner','medium','pro'];
    const smap={};settings.forEach(s=>{smap[s.event_type+'_'+s.user_level]=s.enabled;});
    const tbody=document.getElementById('notif-matrix-body');
    if(tbody)tbody.innerHTML=events.map(ev=>`<tr><td style="padding:8px 14px;font-size:13px">${EVENT_LABELS[ev]||ev}</td>${levels.map(lvl=>`<td style="text-align:center;padding:8px"><input type="checkbox" data-ev="${ev}" data-lvl="${lvl}" ${smap[ev+'_'+lvl]?'checked':''} onchange="notifMatrixChange(this)" style="width:16px;height:16px;cursor:pointer"></td>`).join('')}</tr>`).join('');
    const hbody=document.getElementById('notif-history-body');
    if(hbody)hbody.innerHTML=history.length?history.map(h=>`<tr><td class="mono" style="font-size:11px">${fmtTs(h.ts)}</td><td><span class="badge badge-blue" style="font-size:10px">${h.event_type||'—'}</span></td><td style="font-size:12px">${h.imei||'—'}</td><td style="font-size:12px">${h.title||h.body||'—'}</td></tr>`).join(''):'<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">No notifications yet</td></tr>';
    const bell=document.getElementById('notif-bell-list');
    if(bell)bell.innerHTML=history.slice(0,5).map(h=>`<div class="np-item"><div class="np-ico" style="background:var(--primary-light)">🔔</div><div><div class="np-text">${h.title||h.event_type||'Alert'}</div><div class="np-sub">${h.imei||''} · ${fmtTs(h.ts)||''}</div></div></div>`).join('')||'<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">No notifications</div>';
  }catch(e){console.warn('[notif]',e.message);}
}
let _notifChanges={};
function notifMatrixChange(cb){_notifChanges[cb.dataset.ev+'_'+cb.dataset.lvl]={event_type:cb.dataset.ev,user_level:cb.dataset.lvl,enabled:cb.checked};}
async function saveNotifSettings(){if(!Object.keys(_notifChanges).length){toast('No changes','info');return;}try{await apiPut('/notifications',{settings:Object.values(_notifChanges)});_notifChanges={};toast('Settings saved','success','🔔');}catch(e){toast('Error: '+e.message,'error');}}
async function markNotifsRead(){try{await apiPut('/notifications',{mark_read:true});toast('All marked read','success','✅');renderNotif();const sbct=document.getElementById('sb-notif-ct');if(sbct)sbct.style.display='none';}catch(e){toast('Error: '+e.message,'error');}}
function saveFirebaseConfig(){toast('Firebase config saved','success','🔥');const el=document.getElementById('notif-firebase-status');if(el)el.textContent='Configured ✅';closeModal('firebaseModal');}

// == Audit Log =====================================================
async function renderLogs(){
  const tb=document.getElementById('logTable');if(!tb)return;
  tb.innerHTML=loadingRow(7);
  try{
    const data=await apiGet('/audit')||[];
    if(!data.length){tb.innerHTML=emptyRow(7,'No audit events yet');return;}
    const am={LOGIN:'badge-green',LOGIN_FAILED:'badge-red',CREATE:'badge-blue',UPDATE:'badge-amber',DELETE:'badge-red',ALARM:'badge-red',ENGINE_CUT:'badge-red',ENGINE_RESTORE:'badge-green'};
    tb.innerHTML=data.map(l=>`<tr>
      <td class="mono" style="font-size:11px">${fmtTs(l.ts)}</td>
      <td class="mono" style="font-size:11px">${l.user_email||'—'}</td>
      <td><span class="badge ${am[l.action]||'badge-gray'}">${l.action||'—'}</span></td>
      <td style="font-size:12px">${l.resource||'—'}</td>
      <td class="mono" style="font-size:11px">${l.ip_addr||'—'}</td>
      <td><span class="badge ${l.status==='OK'?'badge-green':'badge-red'}">${l.status||'—'}</span></td>
      <td style="font-size:11px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.detail||'—'}</td>
    </tr>`).join('');
  }catch(e){tb.innerHTML=emptyRow(7,'Error: '+e.message);}
}

// == Reports =======================================================
async function renderReports(){
  try{const devs=await apiGet('/devices')||[];const sel=document.getElementById('rpt-dev');if(!sel)return;sel.innerHTML='<option>All Devices</option>'+devs.map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');const to=new Date(),from=new Date(to-7*86400000);const fmt=d=>d.toISOString().slice(0,10);const fd=document.getElementById('rpt-from'),td=document.getElementById('rpt-to');if(fd&&!fd.value)fd.value=fmt(from);if(td&&!td.value)td.value=fmt(to);}catch{}
}
async function genReport(){
  const rptCard=document.getElementById('rpt-card'),rptTitle=document.getElementById('rpt-title'),rptHead=document.getElementById('rpt-head'),rptTable=document.getElementById('rpt-table');
  if(!rptTable)return;if(rptCard)rptCard.style.display='';
  rptTable.innerHTML='<tr><td colspan="8" style="padding:20px;text-align:center">⏳ Generating…</td></tr>';
  try{const from=document.getElementById('rpt-from')?.value;const devEl=document.getElementById('rpt-dev');const dev=devEl?.value&&devEl.value!=='All Devices'?devEl.value:'';const p=new URLSearchParams({type:'fleet',date:from||new Date().toISOString().slice(0,10)});if(dev)p.set('imei',dev);const data=await apiGet('/report?'+p.toString());if(!Array.isArray(data)||!data.length){rptTable.innerHTML='<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--muted)">No data found</td></tr>';return;}const cols=Object.keys(data[0]);if(rptHead)rptHead.innerHTML=cols.map(c=>`<th>${c.replace(/_/g,' ').toUpperCase()}</th>`).join('');rptTable.innerHTML=data.map(row=>`<tr>${cols.map(c=>`<td style="font-size:12px">${row[c]??'—'}</td>`).join('')}</tr>`).join('');}catch(e){rptTable.innerHTML=`<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--red)">Error: ${e.message}</td></tr>`;}
}

// == Playback ======================================================
function openPlayback(imei,date){localStorage.setItem('fleetos_jwt',_jwt||'');if(imei)localStorage.setItem('pb_preload_imei',imei);window.open('/playback.html','_blank');}
function loadPB(){const imei=document.getElementById('pb-device')?.value;if(!imei){toast('Select a device first','warn','⚠️');return;}openPlayback(imei,document.getElementById('pb-date')?.value);}
function pbToggle(){if(window._pbToggle)window._pbToggle();}
function pbRestart(){if(window._pbRestart)window._pbRestart();}
function pbGoEnd(){if(window._pbGoEnd)window._pbGoEnd();}
function pbStep(n){if(window._pbStep)window._pbStep(n);}
function pbSpd(x,el){if(window._pbSpd)window._pbSpd(x,el);}
function pbSetVType(t,el){if(window._pbSetVType)window._pbSetVType(t,el);}
function pbExport(){if(window._pbExport)window._pbExport();}
async function loadPBDates(imei){
  if(!imei) return;
  const dateInput = document.getElementById('pb-date');
  const fromInput = document.getElementById('pb-from');
  const toInput   = document.getElementById('pb-to');
  if(!dateInput) return;
  // Always set today as default so input is visible and usable
  if(!dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
  if(fromInput && !fromInput.value) fromInput.value = '00:00';
  if(toInput   && !toInput.value)   toInput.value   = '23:59';
  try {
    const dates = await apiGet('/playback-dates/'+imei);
    if(Array.isArray(dates) && dates.length) {
      dateInput.value = dates[0]; // most recent date that has GPS data
    }
  } catch(e) { console.warn('[loadPBDates]', e.message); }
}
async function renderPlayback(){
  // Populate device selector in playback panel
  const sel = document.getElementById('pb-device');
  if(!sel) return;
  try {
    const devs = await apiGet('/devices');
    sel.innerHTML = '<option value="">-- Select device --</option>' +
      (devs||[]).map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');
    // Set today's date
    const dateInput = document.getElementById('pb-date');
    if(dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
    // Pre-select if coming from map/devices page
    const preload = localStorage.getItem('pb_preload_imei');
    if(preload){ sel.value = preload; loadPBDates(preload); localStorage.removeItem('pb_preload_imei'); }
  } catch(e){ console.warn('[renderPlayback]',e.message); }
}

function initPB(){}

// == Bell notifications ============================================
async function loadBellNotifs(){try{const data=await apiGet('/notifications');const {history=[],unread=0}=data||{};const bell=document.getElementById('notif-bell-list');if(bell)bell.innerHTML=history.slice(0,5).map(h=>`<div class="np-item"><div class="np-ico" style="background:var(--primary-light)">🔔</div><div><div class="np-text">${h.title||h.event_type||'Alert'}</div><div class="np-sub">${fmtTs(h.ts)}</div></div></div>`).join('')||'<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">No notifications</div>';const sbct=document.getElementById('sb-notif-ct');if(sbct){sbct.textContent=unread;sbct.style.display=unread>0?'':'none';}}catch{}}

// == Auth / Role ===================================================

// == Auto-login (dev mode — remove when adding login back) ==========
(async function autoLogin(){
  try{
    const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@fleetcop.com',password:'Admin@123'})});
    const data=await res.json();
    if(data.token){
      _jwt=data.token;sessionStorage.setItem('fleetos_jwt',_jwt);
      curRole=data.user?.role||'admin';
      curUser={fname:data.user?.fname||'Fleet',lname:data.user?.lname||'Admin',email:data.user?.email||'admin@fleetcop.com'};
      document.getElementById('loginPage').style.display='none';
      applyRole();nav('dashboard');
      setTimeout(loadBellNotifs,2000);
      setInterval(loadBellNotifs,30000);
    }
  }catch{setTimeout(autoLogin,500);}  // server not ready yet — retry
})();

// ==================================================================
// LIVE MAP (inline — was page-map.html)
// ==================================================================
// == map state =========================================
let _liveMap = null, _liveMarkers = {};
let _mapDevs = [];
let _stateDurations = {}; // {imei: {h,m,status}}
let _liveMapTimer = null;

async function renderMap(){
  try {
    if (!_liveMap) { _initLiveMap(()=>{ renderMap(); }); return; }
    const devs = await apiGet('/live');
    if(!devs || !Array.isArray(devs)) return;
    _mapDevs = devs;

    const currentImeis = new Set(devs.map(d=>d.imei));
    Object.keys(_liveMarkers).forEach(imei => {
      if (!currentImeis.has(imei)) { _liveMap.removeLayer(_liveMarkers[imei].marker); delete _liveMarkers[imei]; }
    });

    const withGPS = devs.filter(d => d.latitude && d.longitude);
    withGPS.forEach(d => {
      const lat = parseFloat(d.latitude), lng = parseFloat(d.longitude);
      const spd = parseFloat(d.speed) || 0;
      const popup = buildMapPopup(d);
      if (_liveMarkers[d.imei]) {
        _liveMarkers[d.imei].marker.setLatLng([lat,lng]).setIcon(_liveMarkerIcon(d));
        _liveMarkers[d.imei].marker.getPopup().setContent(popup);
      } else {
        const marker = L.marker([lat,lng], {icon: _liveMarkerIcon(d)}).bindPopup(popup).addTo(_liveMap);
        _liveMarkers[d.imei] = {marker, status: d.status};
      }
    });
    if (!withGPS.length) _liveMap.setView([20.5937, 78.9629], 5);
    else if (withGPS.length === 1) _liveMap.setView([parseFloat(withGPS[0].latitude), parseFloat(withGPS[0].longitude)], 13);

    // == Sidebar vehicle list ======================================
    const listEl = document.getElementById('map-sidebar-list');
    if (listEl) {
      const filter = document.getElementById('map-filter-sel')?.value || 'all';
      const filtered = filter==='all' ? devs : devs.filter(d => d.status===filter);
      listEl.innerHTML = filtered.map(d => {
        const spd = parseFloat(d.speed)||0;
        const igns = d.ignition ? '<span class="msv-pill pill-ignOn">🔑 ON</span>' : '<span class="msv-pill pill-ignOff">🔑 OFF</span>';
        const cutPill = d.engine_cut ? '<span class="msv-pill pill-cut">✂️ CUT</span>' : '';
        const satPill = `<span class="msv-pill pill-stopped">🛰${d.satellites||0}</span>`;
        const chgPill = d.charging ? '<span class="msv-pill pill-ignOn">⚡</span>' : '';
        const stPill = `<span class="msv-pill pill-${d.status||'offline'}">${(d.status||'offline').toUpperCase()}</span>`;
        const svg = _vehSvgMap(d.vehicle_type||'car', d.status, d.heading||0);
        // Use server-side state_mins if available, else use cached duration
        const serverDur = d.state_mins != null ? {h:Math.floor(d.state_mins/60),m:d.state_mins%60} : null;
        const dur = serverDur || _stateDurations[d.imei];
        const durStr = dur ? `${dur.h}h ${dur.m}m` : '';
        const durColor = d.status==='moving'?'#22c55e':d.status==='idle'?'#f59e0b':d.status==='stopped'?'#94a3b8':'#ef4444';
        return `<div class="msv-row" id="msv-${d.imei}">
          <div class="msv-icon" onclick="if(_liveMap&&${!!d.latitude}){_liveMap.setView([${d.latitude||20},${d.longitude||78}],15);_liveMarkers['${d.imei}']?.marker.openPopup();}">${svg}</div>
          <div class="msv-info" style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
              <div class="msv-name">${d.name}</div>
              <div style="display:flex;gap:3px;flex-shrink:0">
                <button title="Playback" onclick="openPlaybackForImei('${d.imei}')"
                  style="border:none;background:none;cursor:pointer;font-size:11px;padding:1px 4px;border-radius:4px;background:#1e293b;color:#94a3b8">=</button>
                <button title="${d.engine_cut?'Restore':'Cut Engine'}" onclick="openEngineCutModal('${d.imei}','${d.name}',${!!d.engine_cut})"
                  style="border:none;cursor:pointer;font-size:10px;padding:1px 5px;border-radius:4px;background:${d.engine_cut?'#16a34a':'#7f1d1d'};color:#fff">
                  ${d.engine_cut?'✅':'✂️'}</button>
              </div>
            </div>
            <div class="msv-sub" style="margin-top:2px">
              <span style="color:${durColor};font-weight:700">${stPill.replace(/[<][^>]*[>]/g,'').trim()} ${durStr}</span>
              ${d.address_short?`<span style="overflow:hidden;max-width:100px;white-space:nowrap;text-overflow:ellipsis;color:#475569">${d.address_short}</span>`:''}
            </div>
            <div class="msv-stats" style="margin-top:3px">
              ${igns}${chgPill}${cutPill}
              <span class="msv-pill pill-stopped" title="Satellites">🛰${d.satellites||0}</span>
              ${d.driver_name?`<span class="msv-pill" style="background:#f0fdf4;color:#16a34a">👤${d.driver_name.split(' ')[0]}</span>`:''}
              ${d.safe_parking?'<span class="msv-pill" style="background:#f5f3ff;color:#7c3aed">🔒Parked</span>':''}
              ${(d.in_geofences||[]).map(g=>`<span class="msv-pill" style="background:#eff6ff;color:#3b82f6;font-size:9px">📍${g}</span>`).join('')}
              ${d.status==='never_connected'?'<span class="msv-pill" style="background:#f1f5f9;color:#94a3b8;font-size:9px">Never seen</span>':''}
            </div>
            <div style="font-size:10px;color:#64748b;margin-top:2px">
              ${spd.toFixed(0)} km/h &nbsp;·&nbsp; ${d.last_seen||d.ts?'Last: '+fmtTs(d.last_seen||d.ts):'Never seen'}
            </div>
          </div>
        </div>`;
      }).join('');
    }

    const ct = document.getElementById('map-live-count');
    if (ct) ct.textContent = `${withGPS.length}/${devs.length} w/GPS`;
    const lr = document.getElementById('map-last-refresh');
    if (lr) lr.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN');
    // Start auto-refresh if not running
    if (!_liveMapTimer) {
      _liveMapTimer = setInterval(()=>{
        if(document.getElementById('page-map')?.classList.contains('active')) renderMap();
      }, 20000);
    }
    // Load state durations async (non-blocking)
    _loadStateDurations(devs);

    // Populate playback device selector
    const sel = document.getElementById('pb-device');
    if (sel) sel.innerHTML = '<option value="">— Select device —</option>' + devs.map(d=>`<option value="${d.imei}">${d.name} (${d.imei})</option>`).join('');
  } catch(e) { console.warn('[renderMap]', e.message); }
}

function onMapVisible() {
  setTimeout(()=>{
    if (_liveMap) { _liveMap.invalidateSize(); return; }
    renderMap(); // triggers _initLiveMap on first visit
  }, 150);
}

function _initLiveMap(cb) {
  if (_liveMap) { if(cb) cb(); return; }
  const el = document.getElementById('live-map');
  if (!el) return;
  // Wait two frames so display:block and height are settled
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (_liveMap) { if(cb) cb(); return; }
    _liveMap = L.map('live-map', {zoomControl: true, attributionControl: true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(_liveMap);
    _liveMap.setView([20.5937, 78.9629], 5); // India center
    if(cb) cb();
  }));
}

function _markerIcon(status) {
  const colors = {online:'#22C55E', idle:'#F59E0B', offline:'#94A3B8', alarm:'#EF4444'};
  const c = colors[status] || colors.offline;
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${c};border:2px solid #fff;box-shadow:0 0 6px ${c}88;"></div>`,
    iconSize: [14,14], iconAnchor: [7,7], popupAnchor: [0,-10]
  });
}

function _liveMarkerIcon(dev) {
  const status = dev.status || 'offline';
  const svg = _vehSvgMap(dev.vehicle_type||'car', status, dev.heading||0);
  const blob = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return L.icon({iconUrl: blob, iconSize:[24,24], iconAnchor:[12,12], popupAnchor:[0,-14]});
}

function _vehSvgMap(type, status, heading) {
  const hue = {moving:'#22c55e',idle:'#f59e0b',stopped:'#64748b',offline:'#ef4444'}[status]||'#3b82f6';
  const r = heading||0;
  const body = /bike|motor/i.test(type) ? `<ellipse cx="12" cy="12" rx="4" ry="10" fill="${hue}"/><ellipse cx="12" cy="5" rx="3" ry="4" fill="${hue}" opacity=".7"/>` :
               /bus|coach/i.test(type)  ? `<rect x="4" y="2" width="16" height="20" rx="3" fill="${hue}"/><rect x="5" y="3" width="14" height="5" rx="1" fill="white" opacity=".5"/>` :
               /truck/i.test(type)      ? `<rect x="3" y="2" width="18" height="20" rx="2" fill="${hue}"/><rect x="4" y="3" width="16" height="6" rx="1" fill="white" opacity=".4"/>` :
               /auto|rick/i.test(type)  ? `<path d="M4 14 Q6 4 12 4 Q18 4 20 14 L20 22 L4 22 Z" fill="${hue}"/><rect x="6" y="8" width="12" height="7" rx="2" fill="white" opacity=".3"/>` :
               `<rect x="5" y="3" width="14" height="18" rx="4" fill="${hue}"/><rect x="6" y="4" width="12" height="6" rx="2" fill="white" opacity=".5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${r},12,12)">${body}</g></svg>`;
}

function applyMapFilter() {
  const f = document.getElementById('map-filter-sel')?.value || 'all';
  // Filter map markers
  Object.entries(_liveMarkers).forEach(([imei, info]) => {
    const d = (_mapDevs||[]).find(x=>x.imei===imei);
    const st = d?.status || info.status || 'offline';
    const show = f === 'all' || st === f;
    if (show) info.marker.addTo(_liveMap);
    else _liveMap.removeLayer(info.marker);
  });
  // Re-render sidebar list with filter
  const listEl = document.getElementById('map-sidebar-list');
  if (listEl && _mapDevs) {
    const filtered = f === 'all' ? _mapDevs : _mapDevs.filter(d => (d.status||'offline') === f);
    const ct = document.getElementById('map-live-count');
    if (ct) ct.textContent = `${filtered.length}/${_mapDevs.length}`;
    // Trigger sidebar re-render via renderMap (it reads the filter itself)
    renderMap();
  }
}

function fitMapBounds() {
  if (!_liveMap) return;
  const pts = Object.values(_liveMarkers).map(m => m.marker.getLatLng());
  if (pts.length) _liveMap.fitBounds(L.latLngBounds(pts), {padding:[30,30]});
}

async function _loadStateDurations(devs){
  if(!devs||!devs.length) return;
  const sample=devs.filter(d=>d.latitude).slice(0,10);
  for(const d of sample){
    try{
      const r=await apiGet('/vehicle-state/'+d.imei);
      if(r&&r.duration_min!==undefined){
        const h=Math.floor(r.duration_min/60),m=r.duration_min%60;
        _stateDurations[d.imei]={h,m,status:r.status};
      }
    }catch{}
  }
}

function buildMapPopup(d){
  const spd=parseFloat(d.speed)||0;
  const dur=_stateDurations[d.imei];
  const durStr=dur?`${dur.h}h ${dur.m}m`:'—';
  const lat=parseFloat(d.latitude||0).toFixed(5);
  const lng=parseFloat(d.longitude||0).toFixed(5);
  return `<div style="min-width:200px;font-family:sans-serif">
    <div style="font-weight:800;font-size:14px;margin-bottom:4px">${d.name}</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">${d.imei}</div>
    <table style="font-size:12px;width:100%;border-collapse:collapse">
      <tr><td style="color:#64748b;padding:2px 0">🚀 Speed</td><td style="font-weight:700">${spd.toFixed(0)} km/h</td></tr>
      <tr><td style="color:#64748b;padding:2px 0">🔑 Ignition</td><td style="font-weight:700;color:${d.ignition?'#16a34a':'#ef4444'}">${d.ignition?'ON':'OFF'}</td></tr>
      <tr><td style="color:#64748b;padding:2px 0">⚡ Charging</td><td>${d.charging?'Yes':'No'}</td></tr>
      <tr><td style="color:#64748b;padding:2px 0">🛰 Satellites</td><td>${d.satellites||0}</td></tr>
      <tr><td style="color:#64748b;padding:2px 0">📍 Location</td><td class="mono" style="font-size:10px">${lat}, ${lng}</td></tr>
      ${d.address_short?`<tr><td style="color:#64748b;padding:2px 0">🏠 Address</td><td style="font-size:11px">${d.address_short}</td></tr>`:''}
      ${d.driver_name?`<tr><td style="color:#64748b;padding:2px 0">👤 Driver</td><td>${d.driver_name}</td></tr>`:''}
      <tr><td style="color:#64748b;padding:2px 0">⏱ State</td><td style="font-weight:700">${d.status||'unknown'} ${durStr}</td></tr>
      <tr><td style="color:#64748b;padding:2px 0">🕐 Last seen</td><td>${d.ts?new Date(d.ts).toLocaleString('en-IN'):'Never'}</td></tr>
      ${d.engine_cut?'<tr><td colspan="2" style="color:#dc2626;font-weight:700;padding-top:4px">✂️ ENGINE IMMOBILISED</td></tr>':''}
    </table>
    ${(d.in_geofences||[]).length?`<div style="margin-top:4px;font-size:11px;color:#3b82f6">📍 In: ${(d.in_geofences||[]).join(', ')}</div>`:''}
    ${d.safe_parking?'<div style="margin-top:2px;font-size:11px;color:#7c3aed;font-weight:600">🔒 Safe Parking Active</div>':''}
    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      <button onclick="openPlaybackForImei('${d.imei}')"
        style="flex:1;padding:5px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;min-width:60px">= Replay</button>
      <button onclick="nav('events')"
        style="flex:1;padding:5px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;min-width:60px">🔔 Alerts</button>
      <button onclick="openEngineCutModal('${d.imei}','${d.name}',${!!d.engine_cut})"
        style="flex:1;padding:5px;background:${d.engine_cut?'#16a34a':'#dc2626'};color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;min-width:60px">
        ${d.engine_cut?'✅ Restore':'✂️ Cut'}</button>
    </div>
  </div>`;
}

function openPlaybackForImei(imei){
  localStorage.setItem('pb_preload_imei',imei);openPlayback();
}



// ==================================================================
// ROUTES (inline — was page-routes.html)
// ==================================================================
// == routes state =========================================
let _routeMap = null, _routePoints = [], _routeMapClick = false;
let _routeMarkers = [], _routePolyline = null;
const OWNER_LABELS={general:'General',school_bus:'Parent',milk_van:'Shop Owner',employee_cab:'Employee',delivery:'Recipient',ambulance:'Contact'};

async function renderRoutes(){
  if(!_routeMap) _initRouteMap();
  await loadRoutesList();
}

function _initRouteMap(){
  if(_routeMap) return;
  const el = document.getElementById('route-builder-map');
  if(!el) return;
  _routeMap = L.map('route-builder-map').setView([12.9716,77.5946],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(_routeMap);
  _routeMap.on('click',function(e){
    if(!_routeMapClick) return;
    armAddPoint(e.latlng.lat, e.latlng.lng);
    _routeMapClick = false;
    openModal('addRouteModal');
  });
}

async function loadRoutesList(){
  const body = document.getElementById('routes-list-body');
  if(!body) return;
  try {
    ROUTES = await apiGet('/routes-v2') || [];
    const sum = document.getElementById('routes-summary');
    if(sum) sum.textContent = `${ROUTES.length} routes`;
    if(!ROUTES.length){
      body.innerHTML='<div style="padding:24px;text-align:center;color:var(--muted)">No routes yet — click + New Route</div>';
      return;
    }
    body.innerHTML = ROUTES.map(r=>`
      <div class="rcard" id="rcard-${r.id}" onclick="selectRoute('${r.id}')">
        <div class="rcard-name">${r.name}
          <span class="badge badge-${r.is_active?'green':'gray'}" style="font-size:10px;margin-left:6px">${r.is_active?'Active':'Inactive'}</span>
          <span class="badge badge-blue" style="font-size:10px">${(r.route_type||'general').replace(/_/g,' ')}</span>
        </div>
        <div class="rcard-meta">
          <span>📍 ${r.point_count||0} stops</span>
          <span>🚗 ${r.device_count||0} devices</span>
          <span>📏 ${r.distance_km||0} km</span>
          <span>🗓 ${r.schedule||'—'}</span>
          <span>⚡ ${r.events_today||0} events today</span>
        </div>
        <div style="display:flex;gap:5px;margin-top:8px">
          ${canDo()?`<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editRouteV2('${r.id}')">✏️ Edit</button>
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();showRouteDeviation('${r.id}')">📊 Stats</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();confirmDel('route-v2','${r.id}','${r.name}')">🗑</button>`:''}</div>
      </div>`).join('');
  } catch(e){ if(body) body.innerHTML='<div style="padding:20px;color:var(--red)">Error: '+e.message+'</div>'; }
}

function selectRoute(id){
  document.querySelectorAll('.rcard').forEach(c=>c.classList.remove('selected'));
  const el=document.getElementById('rcard-'+id); if(el) el.classList.add('selected');
  apiGet('/routes-v2/'+id).then(r=>{
    if(!r||!r.points||!r.points.length) return;
    if(!_routeMap) { _initRouteMap(); setTimeout(()=>_plotRoutePoints(r.points),300); return; }
    _plotRoutePoints(r.points);
  }).catch(()=>{});
}

function _plotRoutePoints(pts){
  _routeMarkers.forEach(m=>_routeMap.removeLayer(m)); _routeMarkers=[];
  if(_routePolyline){_routeMap.removeLayer(_routePolyline);_routePolyline=null;}
  const lls=pts.map(p=>[parseFloat(p.lat),parseFloat(p.lng)]);
  _routePolyline=L.polyline(lls,{color:'#3b82f6',weight:4,opacity:.75}).addTo(_routeMap);
  pts.forEach((p,i)=>{
    const c=i===0?'#16a34a':i===pts.length-1?'#dc2626':'#3b82f6';
    const ic=L.divIcon({className:'',iconSize:[26,26],iconAnchor:[13,13],
      html:`<div style="width:26px;height:26px;border-radius:50%;background:${c};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${i+1}</div>`});
    const ownerStr=p.owner_name?`<br>👤 ${p.owner_name}${p.owner_phone?' · '+p.owner_phone:''}`:'';    const timeStr=p.planned_arrival?`<br>⏰ ${p.planned_arrival}${p.planned_departure?' → '+p.planned_departure:''}`:'';    const mk=L.marker([p.lat,p.lng],{icon:ic}).bindPopup(`<b>#${i+1} ${p.name}</b>${ownerStr}${timeStr}`).addTo(_routeMap);
    _routeMarkers.push(mk);
  });
  if(lls.length>1) _routeMap.fitBounds(L.polyline(lls).getBounds(),{padding:[30,30]});
  else if(lls.length===1) _routeMap.setView(lls[0],14);
}

async function openAddRouteModal(){
  _routePoints=[];
  document.getElementById('arm-id').value='';
  document.getElementById('arm-title').textContent='New Route';
  ['arm-name','arm-schedule','arm-dist'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('arm-speed').value='60';
  document.getElementById('arm-type').value='general';
  armRenderPoints();
  // Ensure devices are loaded even if map was never visited
  if(!_mapDevs || !_mapDevs.length){
    try{ _mapDevs = await apiGet('/live') || []; }catch{}
  }
  const dc=document.getElementById('arm-devices-checks'); if(dc){ dc.innerHTML='';
    (_mapDevs||[]).forEach(d=>{const lbl=document.createElement('label');
      lbl.style.cssText='display:flex;align-items:center;gap:4px;font-size:12px;padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer';
      lbl.innerHTML=`<input type="checkbox" value="${d.id||d.imei}"> ${d.name}`;dc.appendChild(lbl);});
  }
  openModal('addRouteModal');
}

async function editRouteV2(id){
  const r=await apiGet('/routes-v2/'+id); if(!r) return;
  _routePoints=(r.points||[]).map(p=>({name:p.name,lat:+p.lat,lng:+p.lng,
    owner_name:p.owner_name||'',owner_phone:p.owner_phone||'',owner_type:p.owner_type||'general',
    planned_arrival:p.planned_arrival||'',planned_departure:p.planned_departure||'',radius_m:p.radius_m||100}));
  document.getElementById('arm-id').value=id;
  document.getElementById('arm-title').textContent='Edit Route';
  document.getElementById('arm-name').value=r.name;
  document.getElementById('arm-schedule').value=r.schedule||'';
  document.getElementById('arm-speed').value=r.speed_limit||60;
  document.getElementById('arm-dist').value=r.distance_km||0;
  document.getElementById('arm-type').value=r.route_type||'general';
  armRenderPoints();
  const dc=document.getElementById('arm-devices-checks'); if(dc){ dc.innerHTML='';
    const assigned=(r.assigned_devices||[]).map(d=>d.id);
    (_mapDevs||[]).forEach(d=>{const lbl=document.createElement('label');
      lbl.style.cssText='display:flex;align-items:center;gap:4px;font-size:12px;padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer';
      lbl.innerHTML=`<input type="checkbox" value="${d.id||d.imei}" ${assigned.includes(d.id)?'checked':''}> ${d.name}`;dc.appendChild(lbl);});
  }
  openModal('addRouteModal');
}

function armAddPoint(lat,lng){
  const type=document.getElementById('arm-type')?.value||'general';
  _routePoints.push({name:'Stop '+(_routePoints.length+1),lat:lat||12.9716,lng:lng||77.5946,
    owner_name:'',owner_phone:'',owner_type:OWNER_LABELS[type]||'General',
    planned_arrival:'',planned_departure:'',radius_m:100});
  armRenderPoints();
}

function armClickMap(){
  toast('Click on the map to place the next waypoint','info','🗺');
  _routeMapClick=true;
  closeModal('addRouteModal');
}

function armImportCSV(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.csv';
  inp.onchange=async()=>{
    const text=await inp.files[0].text();
    const lines=text.split('\n').filter(l=>l.trim());
    const hdrs=lines[0].split(',').map(h=>h.trim().toLowerCase());
    lines.slice(1).forEach(line=>{
      const vals=line.split(',').map(v=>v.trim().replace(/"/g,''));
      const obj={};hdrs.forEach((h,i)=>{if(vals[i]) obj[h]=vals[i];});
      if(obj.lat&&obj.lng) _routePoints.push({name:obj.name||obj.stop_name||'Stop '+(_routePoints.length+1),
        lat:+obj.lat,lng:+obj.lng,owner_name:obj.owner_name||'',owner_phone:obj.owner_phone||'',
        owner_type:obj.owner_type||'general',planned_arrival:obj.planned_arrival||'',
        planned_departure:obj.planned_departure||'',radius_m:+(obj.radius_m)||100});
    });
    armRenderPoints();
    toast(`${_routePoints.length} waypoints imported`,'success','📤');
  };inp.click();
}

function armMovePoint(i,dir){
  const j=i+dir; if(j<0||j>=_routePoints.length) return;
  [_routePoints[i],_routePoints[j]]=[_routePoints[j],_routePoints[i]];armRenderPoints();
}

function armRenderPoints(){
  const el=document.getElementById('arm-points-list');if(!el)return;el.innerHTML='';
  if(!_routePoints.length){
    el.innerHTML='<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">No waypoints — click + Add Point or Import CSV</div>';return;
  }
  _routePoints.forEach((p,i)=>{
    const row=document.createElement('div');
    row.style.cssText='background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:7px';
    row.innerHTML=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <div style="width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div>
      <input class="finput" value="${p.name}" style="flex:1;padding:4px 8px;font-size:12px" onchange="_routePoints[${i}].name=this.value" placeholder="Stop name">
      <button onclick="armMovePoint(${i},-1)" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px" title="Up">↑</button>
      <button onclick="armMovePoint(${i},1)" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px" title="Down">↓</button>
      <button onclick="_routePoints.splice(${i},1);armRenderPoints()" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:16px;padding:2px">✕</button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:5px">
      <div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">LAT</div>
        <input class="finput" type="number" step="0.00001" value="${p.lat}" style="padding:4px 8px;font-size:12px" onchange="_routePoints[${i}].lat=+this.value"></div>
      <div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">LNG</div>
        <input class="finput" type="number" step="0.00001" value="${p.lng}" style="padding:4px 8px;font-size:12px" onchange="_routePoints[${i}].lng=+this.value"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:5px">
      <div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">OWNER</div>
        <input class="finput" value="${p.owner_name}" placeholder="Ramesh Kumar" style="padding:4px 8px;font-size:11px" onchange="_routePoints[${i}].owner_name=this.value"></div>
      <div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">PHONE</div>
        <input class="finput" value="${p.owner_phone}" placeholder="+91..." style="padding:4px 8px;font-size:11px" onchange="_routePoints[${i}].owner_phone=this.value"></div>
      <div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">ROLE</div>
        <input class="finput" value="${p.owner_type}" placeholder="Parent/Shop" style="padding:4px 8px;font-size:11px" onchange="_routePoints[${i}].owner_type=this.value"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px">
      <div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">ARRIVAL</div>
        <input class="finput" type="time" value="${p.planned_arrival}" style="padding:4px 8px;font-size:11px" onchange="_routePoints[${i}].planned_arrival=this.value"></div>
      <div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">DEPARTURE</div>
        <input class="finput" type="time" value="${p.planned_departure}" style="padding:4px 8px;font-size:11px" onchange="_routePoints[${i}].planned_departure=this.value"></div>
      <div><div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">RADIUS (m)</div>
        <input class="finput" type="number" value="${p.radius_m}" style="padding:4px 8px;font-size:11px" onchange="_routePoints[${i}].radius_m=+this.value"></div>
    </div>`;
    el.appendChild(row);
  });
}

async function saveRouteV2(){
  const name=document.getElementById('arm-name').value.trim();
  if(!name){toast('Route name required','error');return;}
  const id=document.getElementById('arm-id').value;
  const deviceIds=[...document.querySelectorAll('#arm-devices-checks input:checked')].map(c=>c.value);
  const body={name,route_type:document.getElementById('arm-type').value,
    schedule:document.getElementById('arm-schedule').value,
    speed_limit:+document.getElementById('arm-speed').value||60,
    distance_km:+document.getElementById('arm-dist').value||0,
    points:_routePoints,device_ids:deviceIds};
  try{
    if(id) await apiPut('/routes-v2/'+id,body); else await apiPost('/routes-v2',body);
    toast('Route saved','success','🛣'); closeModal('addRouteModal'); loadRoutesList();
  }catch(e){toast('Error: '+e.message,'error');}
}

async function showRouteDeviation(id){
  const hud=document.getElementById('route-deviation-hud');
  const content=document.getElementById('rdh-content');
  if(!hud||!content) return;
  try{
    const evs=await apiGet('/route-events');
    const re=(evs||[]).filter(e=>e.route_id===id);
    const onTime=re.filter(e=>(+e.delay_min||0)<=0).length;
    const late=re.filter(e=>(+e.delay_min||0)>0).length;
    const avgDev=re.length?(re.reduce((a,e)=>a+(+e.deviation_m||0),0)/re.length).toFixed(0):0;
    content.innerHTML=`<div style="font-size:11px;margin-bottom:3px">Events today: <b>${re.length}</b></div>
      <div style="font-size:11px;color:#22c55e">✅ On time: <b>${onTime}</b></div>
      <div style="font-size:11px;color:#ef4444">⚠️ Late: <b>${late}</b></div>
      <div style="font-size:11px;color:#94a3b8">📏 Avg dev: <b>${avgDev} m</b></div>`;
    hud.style.display='';
  }catch{}
}

// ==================================================================
// MAINTENANCE (inline — was page-maintenance.html)
// ==================================================================
async function renderMaint(){
  const tb = document.getElementById('maintTable'); if(!tb) return;
  tb.innerHTML = loadingRow(8);
  try {
    MAINT = await apiGet('/maintenance') || []; if(!Array.isArray(MAINT)){MAINT=[];}
    const total=MAINT.length, overdue=MAINT.filter(m=>m.computed_status==='overdue').length;
    const dueSoon=MAINT.filter(m=>m.computed_status==='due_soon').length, done=MAINT.filter(m=>m.status==='done').length;
    const sm=document.getElementById('maint-stats');
    if(sm) sm.innerHTML=`
      <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--primary-light)">📋</div></div><div class="stat-val">${total}</div><div class="stat-lbl">Total Tasks</div><div class="stat-bar" style="background:var(--primary)"></div></div>
      <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--red-bg)">🚨</div></div><div class="stat-val" style="color:var(--red)">${overdue}</div><div class="stat-lbl">Overdue</div><div class="stat-bar" style="background:var(--red)"></div></div>
      <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--amber-bg)">⚠️</div></div><div class="stat-val" style="color:var(--amber)">${dueSoon}</div><div class="stat-lbl">Due Soon</div><div class="stat-bar" style="background:var(--amber)"></div></div>
      <div class="stat-card"><div class="stat-top"><div class="stat-ico" style="background:var(--green-bg)">✅</div></div><div class="stat-val" style="color:var(--green)">${done}</div><div class="stat-lbl">Completed</div><div class="stat-bar" style="background:var(--green)"></div></div>`;
    const sbct=document.getElementById('sb-maint-ct');
    if(sbct){sbct.textContent=overdue+dueSoon;sbct.style.display=(overdue+dueSoon)>0?'':'none';}
    if(!MAINT.length){tb.innerHTML=emptyRow(8,'No maintenance tasks yet — click + Add Task');return;}
    const stMap={overdue:'badge-red',due_soon:'badge-amber',ok:'badge-green',done:'badge-blue',pending:'badge-gray'};
    tb.innerHTML=MAINT.map(m=>{
      const cs=m.status==='done'?'done':(m.computed_status||m.status||'ok');
      return `<tr>
        <td style="font-weight:600">${m.device_name||m.imei}</td>
        <td>${m.title}</td>
        <td><span class="badge badge-gray" style="text-transform:capitalize">${(m.task_type||'').replace('_',' ')}</span></td>
        <td class="mono" style="font-size:12px">${m.due_odometer?m.due_odometer.toLocaleString()+' km':'—'}</td>
        <td class="mono" style="font-size:12px">${m.due_engine_hours?m.due_engine_hours+' h':'—'}</td>
        <td class="mono" style="font-size:12px">${m.due_days?m.due_days+' days':'—'}</td>
        <td><span class="badge ${stMap[cs]||'badge-gray'}">${cs.replace('_',' ')}</span></td>
        <td>
          ${m.status!=='done'?`<button class="btn btn-icon" title="Mark Done" onclick="markMaintDone('${m.id}')">✅</button>`:''}
          <button class="btn btn-icon" title="Delete" onclick="deleteMaintTask('${m.id}')" style="color:var(--red)">🗑</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e){tb.innerHTML=emptyRow(8,'Error: '+e.message);}
}

function openAddMaintModal(){
  document.getElementById('maint-edit-id').value='';
  document.getElementById('maint-modal-title').textContent='Add Maintenance Task';
  ['maint-title','maint-odo','maint-hrs','maint-days','maint-notes'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const sel=document.getElementById('maint-dev-sel'); if(sel){sel.innerHTML='';
    (_mapDevs||[]).forEach(d=>sel.add(new Option(d.name+' ('+d.imei+')',d.imei)));
    if(!sel.options.length) apiGet('/devices').then(devs=>{(devs||[]).forEach(d=>sel.add(new Option(d.name+' ('+d.imei+')',d.imei)));});
  }
  const sd=document.getElementById('maint-start'); if(sd) sd.value=new Date().toISOString().slice(0,10);
  openModal('addMaintModal');
}

async function saveMaintTask(){
  const id=document.getElementById('maint-edit-id').value;
  const body={imei:document.getElementById('maint-dev-sel').value,
    task_type:document.getElementById('maint-task-type').value,
    title:document.getElementById('maint-title').value.trim(),
    due_odometer:parseFloat(document.getElementById('maint-odo').value)||null,
    due_engine_hours:parseFloat(document.getElementById('maint-hrs').value)||null,
    due_days:parseInt(document.getElementById('maint-days').value)||null,
    start_date:document.getElementById('maint-start').value||null,
    notes:document.getElementById('maint-notes').value.trim()||null};
  if(!body.imei||!body.title){toast('IMEI and title required','error');return;}
  try{
    if(id) await apiPut('/maintenance/'+id,body); else await apiPost('/maintenance',body);
    toast('Task saved','success','🔧'); closeModal('addMaintModal'); renderMaint();
  }catch(e){toast('Error: '+e.message,'error');}
}

async function markMaintDone(id){
  try{await apiPut('/maintenance/'+id,{status:'done'});toast('Marked done','success','✅');renderMaint();}
  catch(e){toast('Error: '+e.message,'error');}
}

async function deleteMaintTask(id){
  confirmAction('Delete Task','This task will be permanently deleted.','🗑️',async()=>{
    try{await apiDel('/maintenance/'+id);toast('Deleted','success');renderMaint();}
    catch(e){toast('Error: '+e.message,'error');}
  });
}

function downloadMaintTemplate(){
  const csv='imei,task_type,title,due_odometer,due_engine_hours,due_days\n352312097033263,oil_change,50k Oil Change,50000,,\n352312097033263,service,Full Service,,500,90\n';
  const a=document.createElement('a');a.href='data:text/csv,'+encodeURIComponent(csv);a.download='maintenance_template.csv';a.click();
}

async function bulkImportMaint(input){
  const file=input.files[0];if(!file)return;
  const text=await file.text();
  const lines=text.split('\n').filter(l=>l.trim());
  const headers=lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
  const rows=lines.slice(1).map(line=>{
    const vals=line.split(',').map(v=>v.trim().replace(/"/g,''));
    const obj={};headers.forEach((h,i)=>{if(vals[i]) obj[h]=vals[i];});return obj;
  }).filter(r=>r.imei&&r.title);
  if(!rows.length){toast('No valid rows found','error');return;}
  try{
    const res=await apiPost('/bulk/maintenance',{rows});
    toast(`Imported ${res.inserted||0} tasks`+(res.errors?.length?' ('+res.errors.length+' errors)':''),'success','📤');
    renderMaint();
  }catch(e){toast('Import failed: '+e.message,'error');}
  input.value='';
}

// ==================================================================
// GEOFENCES (inline — was page-geofence.html)
// ==================================================================
// == geofence state =========================================
let _gfMap=null,_gfLayer=null,_gfFences=[],_gfPendingCoords=null,_gfPendingShape='polygon';

async function renderGeofence(){
  if(!_gfMap) _initGfMap();
  await loadGeofences();
}

function _initGfMap(){
  if(_gfMap) return;
  _gfMap=L.map('gf-map').setView([12.9716,77.5946],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(_gfMap);
  _gfLayer=L.featureGroup().addTo(_gfMap);
}

async function loadGeofences(){
  try{
    _gfFences=await apiGet('/geofences')||[];
    if(_gfLayer) _gfLayer.clearLayers();
    _gfFences.forEach(f=>drawFenceOnMap(f));
    const listEl=document.getElementById('gf-list');if(!listEl) return;
    if(!_gfFences.length){listEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">No fences yet. Draw one on the map →</div>';return;}
    listEl.innerHTML=_gfFences.map(f=>{
      const imeis=JSON.parse(typeof f.assigned_imeis==='string'?f.assigned_imeis:'[]');
      return `<div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer" onclick="focusFence('${f.id}')">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="width:10px;height:10px;border-radius:50%;background:${f.color||'#3b82f6'};display:inline-block;flex-shrink:0"></span>
          <span style="font-weight:600;font-size:13px">${f.name}</span>
          <span class="badge badge-blue" style="font-size:10px;margin-left:auto">${f.shape}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap">
          <span>🚗 ${imeis.length} vehicles</span>
          ${f.alert_entry?'<span>📥 Entry</span>':''}${f.alert_exit?'<span>📤 Exit</span>':''}
          <span>${f.is_active?'🟢 Active':'🔴 Inactive'}</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 8px" onclick="editGf(event,'${f.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 8px" onclick="deleteGf(event,'${f.id}')">Delete</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){console.warn('[geofence]',e.message);}
}

function drawFenceOnMap(f){
  if(!_gfMap||!_gfLayer) return;
  try{
    const coords=typeof f.coordinates==='string'?JSON.parse(f.coordinates):f.coordinates;
    const style={color:f.color||'#3b82f6',fillOpacity:0.15,weight:2};
    if(f.shape==='circle'&&coords.lat) L.circle([coords.lat,coords.lng],{radius:coords.radius_m||500,...style}).bindTooltip(f.name).addTo(_gfLayer);
    else if(Array.isArray(coords)&&coords.length>0) L.polygon(coords,style).bindTooltip(f.name).addTo(_gfLayer);
  }catch{}
}

function gfDrawMode(shape){
  if(!_gfMap){_initGfMap();setTimeout(()=>gfDrawMode(shape),300);return;}
  _gfPendingShape=shape;_gfPendingCoords=null;
  const hint=document.getElementById('gf-draw-hint');
  if(shape==='polygon'){
    if(hint)hint.textContent='Click map to add polygon points. Double-click to finish.';
    const pts=[];let poly=null;
    _gfMap.off('click');_gfMap.off('dblclick');
    _gfMap.on('click',function(e){
      pts.push([e.latlng.lat,e.latlng.lng]);
      if(poly)_gfMap.removeLayer(poly);
      if(pts.length>1) poly=L.polygon(pts,{color:'#3b82f6',fillOpacity:.15}).addTo(_gfMap);
    });
    _gfMap.on('dblclick',function(){
      _gfMap.off('click');_gfMap.off('dblclick');
      if(pts.length<3){toast('Need at least 3 points','error');return;}
      _gfPendingCoords=pts;if(poly)_gfLayer.addLayer(poly);openGfModal();
    });
  } else {
    if(hint)hint.textContent='Click map center for circle zone.';
    _gfMap.off('click');_gfMap.off('dblclick');
    _gfMap.once('click',function(e){
      _gfPendingCoords={lat:e.latlng.lat,lng:e.latlng.lng,radius_m:500};
      L.circle([e.latlng.lat,e.latlng.lng],{radius:500,color:'#3b82f6',fillOpacity:.15}).addTo(_gfLayer);
      openGfModal();
    });
  }
}

async function openGfModal(fence){
  // Ensure devices loaded
  if(!_mapDevs || !_mapDevs.length){
    try{ _mapDevs = await apiGet('/live') || []; }catch{}
  }
  document.getElementById('gfm-id').value=fence?fence.id:'';
  document.getElementById('gfm-title').textContent=fence?'Edit Fence':'New Geo-fence';
  document.getElementById('gfm-name').value=fence?fence.name:'';
  document.getElementById('gfm-color').value=fence?fence.color:'#3B82F6';
  document.getElementById('gfm-entry').value=fence?(fence.alert_entry?'true':'false'):'true';
  document.getElementById('gfm-exit').value=fence?(fence.alert_exit?'true':'false'):'true';
  const vc=document.getElementById('gfm-vehicle-checks');vc.innerHTML='';
  const assigned=fence?JSON.parse(typeof fence.assigned_imeis==='string'?fence.assigned_imeis:'[]'):[];
  (_mapDevs||[]).forEach(d=>{
    const chk=document.createElement('label');
    chk.style.cssText='display:flex;align-items:center;gap:4px;font-size:12px;padding:3px 6px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer';
    chk.innerHTML=`<input type="checkbox" value="${d.imei}" ${assigned.includes(d.imei)?'checked':''}> ${d.name}`;
    vc.appendChild(chk);
  });
  const ci=document.getElementById('gfm-coords-info');
  if(ci) ci.textContent=fence?'Existing coordinates loaded':`Shape: ${_gfPendingShape}`;
  openModal('gfModal');
}

async function saveGeofence(){
  const id=document.getElementById('gfm-id').value;
  const name=document.getElementById('gfm-name').value.trim();
  if(!name){toast('Name required','error');return;}
  const imeis=[...document.querySelectorAll('#gfm-vehicle-checks input:checked')].map(c=>c.value);
  const body={name,color:document.getElementById('gfm-color').value,shape:_gfPendingShape,
    coordinates:_gfPendingCoords||[],assigned_imeis:imeis,
    alert_entry:document.getElementById('gfm-entry').value==='true',
    alert_exit:document.getElementById('gfm-exit').value==='true'};
  try{
    if(id) await apiPut('/geofences/'+id,body); else await apiPost('/geofences',body);
    toast('Fence saved','success','🔲');closeModal('gfModal');_gfPendingCoords=null;loadGeofences();
  }catch(e){toast('Error: '+e.message,'error');}
}

async function deleteGf(e,id){e.stopPropagation();
  confirmAction('Delete Fence','Remove this fence?','🗑️',async()=>{
    try{await apiDel('/geofences/'+id);toast('Deleted','success');loadGeofences();}
    catch(ex){toast(ex.message,'error');}
  });
}

function editGf(e,id){e.stopPropagation();
  const f=_gfFences.find(x=>x.id===id);if(!f)return;
  _gfPendingShape=f.shape;
  _gfPendingCoords=typeof f.coordinates==='string'?JSON.parse(f.coordinates):f.coordinates;
  openGfModal(f);
}

function focusFence(id){
  const f=_gfFences.find(x=>x.id===id);if(!f||!_gfMap) return;
  try{
    const c=typeof f.coordinates==='string'?JSON.parse(f.coordinates):f.coordinates;
    if(f.shape==='circle'&&c.lat) _gfMap.setView([c.lat,c.lng],14);
    else if(Array.isArray(c)&&c.length>0) _gfMap.fitBounds(L.polygon(c).getBounds());
  }catch{}
}

// ================================================================
// SETUP PAGE
// ================================================================
function renderSetup() {}
function updateChanFields() {}

// ================================================================
// LOGIN STUBS (page hidden in dev mode)
// ================================================================
function doLogin(){}
function sendOtp(){}
function switchLoginTab(t){}
function switchOtpStep(s){}
function verifyOtp(){}
