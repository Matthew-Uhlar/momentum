// Momentum: offline-first checklist with Supabase sync.
// Local copy lives in localStorage; each checkbox carries a timestamp so edits made on
// different devices merge item by item (the newest change to an item wins).
(() => {
  'use strict';
  const CFG = window.MOMENTUM_CONFIG;
  const PLAN = window.PLAN;
  const ORDER = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
  const TABS = [
    ['daily', 'Today', 'M5 12l4 4L19 6'],
    ['weekly', 'Week', 'M4 7h16M4 12h16M4 17h10'],
    ['monthly', 'Month', 'M5 5h14v14H5zM5 10h14'],
    ['quarterly', 'Quarter', 'M12 4a8 8 0 1 0 8 8h-8z'],
    ['yearly', 'Year', 'M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6L3.4 9.3l6-.8z'],
    ['research', 'Why', 'M12 17v-5M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  ];
  const TITLES = { daily: 'Today', weekly: 'This week', monthly: 'This month', quarterly: 'This quarter', yearly: 'This year', research: 'Why these habits' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mm.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mm.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
    del(k) { try { localStorage.removeItem('mm.' + k); } catch (e) { /* ignore */ } },
  };

  // ---------- Periods ----------
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function mondayOf(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function periodOf(c, now = new Date()) {
    const y = now.getFullYear(), m = now.getMonth();
    if (c === 'daily') return { key: 'd-' + ymd(now), text: `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]}, ${MON[m]} ${now.getDate()}` };
    if (c === 'weekly') { const mo = mondayOf(now), su = new Date(mo); su.setDate(mo.getDate() + 6); return { key: 'w-' + ymd(mo), text: `${MON[mo.getMonth()]} ${mo.getDate()} to ${MON[su.getMonth()]} ${su.getDate()}` }; }
    if (c === 'monthly') return { key: `m-${y}-${pad(m + 1)}`, text: `${MON[m]} ${y}` };
    if (c === 'quarterly') { const q = Math.floor(m / 3) + 1; return { key: `q-${y}-Q${q}`, text: `Q${q} ${y}` }; }
    return { key: 'y-' + y, text: String(y) };
  }
  function lastDays(n) { const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(d); } return out; }
  function activeKeys() { return [...new Set([...ORDER.map(c => periodOf(c).key), ...lastDays(14).map(d => 'd-' + ymd(d))])]; }

  // ---------- Local data ----------
  // data[key] = { items: { itemId: { v: bool, t: ms } }, dirty: bool }
  let data = store.get('data', {});
  const saveData = () => store.set('data', data);
  const isOn = (key, id) => !!(data[key] && data[key].items[id] && data[key].items[id].v);
  const countDone = (key, list) => list.filter(i => isOn(key, i[0])).length;
  function mergeItems(a = {}, b = {}) {
    const out = { ...a };
    for (const [id, val] of Object.entries(b)) {
      if (!val || typeof val.t !== 'number') continue;
      if (!out[id] || val.t > out[id].t) out[id] = { v: !!val.v, t: val.t };
    }
    return out;
  }
  function setItem(key, id, v) {
    const row = data[key] || (data[key] = { items: {}, dirty: false });
    row.items[id] = { v, t: Date.now() };
    row.dirty = true;
    saveData();
  }

  // ---------- Auth (Supabase GoTrue over fetch) ----------
  let session = store.get('session', null);
  async function authCall(path, body) {
    const res = await fetch(CFG.supabaseUrl + '/auth/v1/' + path, {
      method: 'POST', headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(json.msg || json.error_description || json.message || 'Request failed'); e.status = res.status; e.code = json.error_code || json.code; throw e; }
    return json;
  }
  function keepSession(s) {
    session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: { id: s.user.id, email: s.user.email } };
    store.set('session', session);
  }
  let refreshing = null;
  async function token() {
    if (!session) throw Object.assign(new Error('Signed out'), { status: 401 });
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    if (!refreshing) refreshing = authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(keepSession).finally(() => { refreshing = null; });
    await refreshing;
    return session.access_token;
  }
  async function rest(path, opts = {}) {
    const t = await token();
    const res = await fetch(CFG.supabaseUrl + '/rest/v1/' + path, {
      ...opts, headers: { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw Object.assign(new Error(j.message || 'Sync failed'), { status: res.status }); }
    return res.status === 204 || res.status === 201 ? null : res.json();
  }

  // ---------- Sync ----------
  let syncing = false, again = false, lastSync = store.get('lastSync', 0), lastErr = '';
  async function pull(keys) {
    const list = keys.map(k => `"${k}"`).join(',');
    const rows = await rest(`checks?select=period_key,done&period_key=in.(${encodeURIComponent(list)})`);
    for (const r of rows || []) {
      const local = data[r.period_key] || { items: {}, dirty: false };
      const merged = mergeItems(local.items, r.done || {});
      const localAhead = JSON.stringify(merged) !== JSON.stringify(mergeItems({}, r.done || {}));
      data[r.period_key] = { items: merged, dirty: local.dirty || localAhead };
    }
  }
  async function push() {
    const dirty = Object.keys(data).filter(k => data[k].dirty);
    if (!dirty.length) return;
    const rows = dirty.map(k => ({ user_id: session.user.id, period_key: k, done: data[k].items, updated_at: new Date().toISOString() }));
    await rest('checks?on_conflict=user_id,period_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    for (const k of dirty) data[k].dirty = false;
  }
  async function sync() {
    if (!session) return;
    if (syncing) { again = true; return; }
    syncing = true; setSync('busy');
    try {
      const keys = [...new Set([...activeKeys(), ...Object.keys(data).filter(k => data[k].dirty)])];
      await pull(keys);   // merge server state into local first, so the push carries the union
      await push();
      saveData();
      lastSync = Date.now(); store.set('lastSync', lastSync); lastErr = '';
      render();
      setSync('ok');
    } catch (e) {
      saveData();
      if (e.status === 401 || e.status === 400 && /refresh/i.test(e.message)) { signOut('Your session ended. Please sign in again.'); return; }
      lastErr = navigator.onLine === false ? 'Offline. Changes are saved and will sync later.' : (e.message || 'Sync failed');
      setSync('off');
    } finally {
      syncing = false;
      if (again) { again = false; setTimeout(sync, 50); }
    }
  }
  let pushTimer = null;
  const syncSoon = () => { clearTimeout(pushTimer); pushTimer = setTimeout(sync, 500); };
  function setSync(state) {
    const dot = $('syncDot'), txt = $('syncText');
    if (!dot) return;
    dot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'busy' ? 'busy' : state === 'off' ? 'off' : '');
    const pending = Object.values(data).some(r => r.dirty);
    if (state === 'busy') txt.textContent = 'Syncing…';
    else if (state === 'off') txt.textContent = pending ? 'Saved offline' : 'Not synced';
    else txt.textContent = lastSync ? 'Synced ' + new Date(lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Synced';
    $('syncBtn').title = lastErr || 'Tap to sync now';
  }

  // ---------- UI ----------
  let view = store.get('view', 'daily');
  if (!TABS.some(t => t[0] === view)) view = 'daily';

  function renderTabs() {
    const bar = $('tabbar');
    bar.innerHTML = '';
    for (const [id, label, path] of TABS) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === view)); b.id = 'tab-' + id;
      const badge = id === 'research' ? '' : `<span class="n">${countDone(periodOf(id).key, PLAN[id].items)}/${PLAN[id].items.length}</span>`;
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${label}${badge}`;
      b.onclick = () => { view = id; store.set('view', id); render(); window.scrollTo(0, 0); };
      bar.appendChild(b);
    }
  }
  function renderList() {
    const c = view, p = periodOf(c), items = PLAN[c].items, n = countDone(p.key, items);
    $('periodText').textContent = p.text;
    $('meter').hidden = false;
    $('barFill').style.width = Math.round(n / items.length * 100) + '%';
    $('meterText').textContent = `${n}/${items.length}`;
    const main = $('main');
    const ul = document.createElement('ul'); ul.className = 'list';
    for (const [id, title, why, ev, src] of items) {
      const on = isOn(p.key, id);
      const li = document.createElement('li'); li.className = 'item' + (on ? ' done' : '');
      const tag = ev === 'ev' ? `<span class="tag ev">research${src ? ' [' + src + ']' : ''}</span>` : '<span class="tag lo">practice</span>';
      li.innerHTML = `<label><input type="checkbox" id="c-${c}-${id}" ${on ? 'checked' : ''}><span class="box">${CHECK}</span><span class="txt"><strong></strong><span class="why">${tag}<span></span></span></span></label>`;
      li.querySelector('strong').textContent = title;
      li.querySelector('.why > span:last-child').textContent = why;
      li.querySelector('input').addEventListener('change', e => { setItem(p.key, id, e.target.checked); render(); syncSoon(); });
      ul.appendChild(li);
    }
    const parts = [ul];
    if (c === 'daily') {
      const h = document.createElement('div'); h.className = 'history';
      const total = items.length;
      h.innerHTML = '<span class="eyebrow">Last 14 days</span><div class="cells" aria-label="Daily completion for the last 14 days"></div><span class="small">Darker squares mean more of the list was done. Today has an orange outline. Tap a number in the [brackets] under Why to see the source.</span>';
      const cells = h.querySelector('.cells');
      lastDays(14).forEach((d, i, arr) => {
        const k = 'd-' + ymd(d), done = countDone(k, items), f = done / total;
        const el = document.createElement('div');
        el.className = 'cell' + (i === arr.length - 1 ? ' today' : '');
        el.dataset.l = done === 0 ? 0 : f < 0.4 ? 1 : f < 0.8 ? 2 : 3;
        el.title = `${MON[d.getMonth()]} ${d.getDate()}: ${done} of ${total}`;
        cells.appendChild(el);
      });
      parts.push(h);
    }
    main.replaceChildren(...parts);
  }
  function renderResearch() {
    $('periodText').textContent = 'Austin market and the studies behind each item';
    $('meter').hidden = true;
    const node = $('researchTpl').content.cloneNode(true);
    const acct = node.querySelector('#account');
    acct.innerHTML = '<span class="eyebrow">Account</span><span class="email"></span><span class="small last"></span><div style="display:flex;gap:16px;flex-wrap:wrap"><button class="linkbtn" type="button" data-a="sync">Sync now</button><button class="linkbtn" type="button" data-a="out">Sign out</button></div>';
    acct.querySelector('.email').textContent = session ? 'Signed in as ' + session.user.email : '';
    acct.querySelector('.last').textContent = lastSync ? 'Last synced ' + new Date(lastSync).toLocaleString() : 'Not synced yet';
    acct.querySelector('[data-a=sync]').onclick = sync;
    acct.querySelector('[data-a=out]').onclick = () => signOut();
    $('main').replaceChildren(node);
  }
  function render() {
    if (!session) return;
    $('viewTitle').textContent = TITLES[view];
    renderTabs();
    if (view === 'research') renderResearch(); else renderList();
    setSync(syncing ? 'busy' : lastErr ? 'off' : lastSync ? 'ok' : '');
  }

  // ---------- Screens ----------
  let mode = 'in';
  function showAuth(message, isErr) {
    $('appView').hidden = true; $('authView').hidden = false;
    setMode(mode);
    const m = $('authMsg');
    if (message) { m.textContent = message; m.className = 'msg' + (isErr ? ' err' : ''); m.hidden = false; } else m.hidden = true;
  }
  function setMode(m) {
    mode = m;
    $('authSubmit').textContent = m === 'in' ? 'Sign in' : 'Create account';
    $('authSwitch').textContent = m === 'in' ? 'New here? Create an account' : 'Have an account? Sign in';
    $('password').autocomplete = m === 'in' ? 'current-password' : 'new-password';
  }
  function showApp() { $('authView').hidden = true; $('appView').hidden = false; render(); sync(); }
  function signOut(message) {
    session = null; store.del('session'); data = {}; store.del('data'); lastSync = 0; store.del('lastSync');
    showAuth(message || 'Signed out.', !!message);
  }

  $('authSwitch').onclick = () => { setMode(mode === 'in' ? 'up' : 'in'); $('authMsg').hidden = true; };
  $('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('email').value.trim(), password = $('password').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return showAuth('Enter a valid email address.', true);
    if (password.length < 8) return showAuth('Use a password with at least 8 characters.', true);
    const btn = $('authSubmit'); btn.disabled = true;
    try {
      if (mode === 'up') {
        const r = await authCall('signup', { email, password });
        if (r.access_token) { keepSession(r); showApp(); }
        else { setMode('in'); showAuth('Account created. Open the confirmation email, then sign in here.'); }
      } else {
        keepSession(await authCall('token?grant_type=password', { email, password }));
        showApp();
      }
    } catch (err) {
      const msg = /confirm/i.test(err.message) ? 'Confirm your email first. Check your inbox for the link, then sign in.'
        : /invalid/i.test(err.message) ? 'That email and password do not match. Try again.'
        : /already/i.test(err.message) ? 'That email already has an account. Sign in instead.'
        : navigator.onLine === false ? 'You are offline. Connect to sign in.' : err.message;
      showAuth(msg, true);
    } finally { btn.disabled = false; }
  });
  $('syncBtn').onclick = sync;

  // Sync triggers: app comes to the front, network returns, and every 30 seconds while open.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); sync(); } });
  window.addEventListener('online', sync);
  window.addEventListener('focus', () => { render(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 30000);
  // Re-render at midnight-ish boundaries so a new day starts a fresh list.
  let lastDay = ymd(new Date());
  setInterval(() => { const t = ymd(new Date()); if (t !== lastDay) { lastDay = t; render(); sync(); } }, 60000);

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  if (session) showApp(); else showAuth();
})();
