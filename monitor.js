// Health monitor: checks the bot every minute, keeps daily uptime numbers,
// opens/closes incidents on its own and knows about planned maintenance.
const { Routes } = require('discord.js');
const { db } = require('./db');

db.exec(
  `
CREATE TABLE IF NOT EXISTS uptime_day (
  date TEXT PRIMARY KEY,
  up_ms INTEGER DEFAULT 0,
  degraded_ms INTEGER DEFAULT 0,
  down_ms INTEGER DEFAULT 0,
  maint_ms INTEGER DEFAULT 0,
  ping_sum INTEGER DEFAULT 0,
  ping_n INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  severity TEXT,
  status TEXT,
  auto INTEGER DEFAULT 0,
  started INTEGER,
  resolved INTEGER
);
CREATE TABLE IF NOT EXISTS incident_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident INTEGER,
  at INTEGER,
  status TEXT,
  message TEXT
);
CREATE TABLE IF NOT EXISTS maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  info TEXT,
  starts INTEGER,
  ends INTEGER,
  cancelled INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS monitor_state (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_incidents_started ON incidents(started);
`,
);

const TICK = 60 * 1000;
const GAP_LIMIT = 150 * 1000; // silence longer than this counts as downtime
const BOOT_GRACE = 3 * 60 * 1000; // give the bot time to log in before calling it down
const DAY = 86400000;
const started = Date.now();

let timer = null;
let badTicks = 0;
let slowTicks = 0;
let firstBadAt = null;
let lastTick = null;
let current = { overall: 'starting', checkedAt: null, components: [] };
const samples = []; // last hour of latency numbers, kept in memory only
let maintCache = { at: 0, active: [], upcoming: [], recent: [] };

const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
const getState = key => db.prepare('SELECT value FROM monitor_state WHERE key = ?').get(key)?.value;
const setState = (key, value) =>
  db.prepare('INSERT OR REPLACE INTO monitor_state(key, value) VALUES(?, ?)').run(
    key,
    String(value),
  );

function withTimeout(promise, ms) {
  return Promise.race(
    [promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))],
  );
}

// split a time range at UTC midnight so each day gets its own share
function splitByDay(from, to) {
  const parts = [];
  let cursor = from;

  while (cursor < to) {
    const next = Math.min((Math.floor(cursor / DAY) + 1) * DAY, to);
    parts.push({ date: dayKey(cursor), ms: next - cursor });
    cursor = next;
  }

  return parts;
}

const COLUMN = {
  operational: 'up_ms',
  degraded: 'degraded_ms',
  outage: 'down_ms',
  maintenance: 'maint_ms',
};

function addTime(from, to, state, ping) {
  const col = COLUMN[state];
  if (!col || to <= from) return;
  const parts = splitByDay(from, to);

  parts.forEach((part, i) => {
    db.prepare('INSERT OR IGNORE INTO uptime_day(date) VALUES(?)').run(part.date);
    db.prepare(`UPDATE uptime_day SET ${col} = ${col} + ? WHERE date = ?`).run(part.ms, part.date);

    if (i === parts.length - 1 && ping >= 0) {
      db.prepare(
        'UPDATE uptime_day SET ping_sum = ping_sum + ?, ping_n = ping_n + 1 WHERE date = ?',
      ).run(Math.round(ping), part.date);
    }
  });
}

// ---------- checks ----------
async function runChecks(client) {
  const components = [];
  const shards = [...client.ws.shards.values()];
  const ready = client.isReady() && shards.length > 0 && shards.every(s => s.status === 0);
  const ping = Math.round(client.ws.ping);

  if (!ready) {
    components.push({
      id: 'gateway',
      name: 'Discord connection',
      status: 'outage',
      detail: 'Not connected to Discord',
      ms: null,
    });
  } else if (ping > 600) {
    components.push({
      id: 'gateway',
      name: 'Discord connection',
      status: 'degraded',
      detail: 'Slow gateway responses',
      ms: ping,
    });
  } else {
    components.push({
      id: 'gateway',
      name: 'Discord connection',
      status: 'operational',
      detail: 'Connected',
      ms: ping >= 0 ? ping : null,
    });
  }

  if (!ready) {
    components.push({
      id: 'api',
      name: 'Discord API',
      status: 'outage',
      detail: 'Waiting for Discord',
      ms: null,
    });
  } else {
    const t0 = Date.now();

    try {
      await withTimeout(client.rest.get(Routes.gateway()), 5000);
      const ms = Date.now() - t0;
      components.push({
        id: 'api',
        name: 'Discord API',
        status: ms > 1500 ? 'degraded' : 'operational',
        detail: ms > 1500 ? 'Slow API responses' : 'Responding',
        ms,
      });
    } catch {
      components.push({
        id: 'api',
        name: 'Discord API',
        status: 'outage',
        detail: 'Requests are failing',
        ms: null,
      });
    }
  }

  try {
    const t0 = Date.now();
    db.prepare('SELECT 1').get();
    const ms = Date.now() - t0;
    components.push({
      id: 'database',
      name: 'Database',
      status: ms > 800 ? 'degraded' : 'operational',
      detail: ms > 800 ? 'Slow queries' : 'Healthy',
      ms,
    });
  } catch {
    components.push({
      id: 'database',
      name: 'Database',
      status: 'outage',
      detail: 'Not responding',
      ms: null,
    });
  }

  components.push({
    id: 'website',
    name: 'Website',
    status: 'operational',
    detail: 'Online',
    ms: null,
  });

  // music is optional (needs ffmpeg etc), so it is shown but never counts against uptime
  let music = false;

  try {
    music = require('./music').enabled();
  } catch {}

  components.push({
    id: 'music',
    name: 'Music player',
    status: music ? 'operational' : 'degraded',
    detail: music ? 'Ready' : 'Unavailable',
    ms: null,
    optional: true,
  });

  return { components, ready };
}

function classify(components) {
  const core = components.filter(c => !c.optional);
  const by = Object.fromEntries(core.map(c => [c.id, c.status]));
  if (by.gateway === 'outage' || by.database === 'outage') return 'outage';
  if (core.some(c => c.status !== 'operational')) return 'degraded';
  return 'operational';
}

// ---------- incidents ----------
function openIncident(title, severity, startedAt, message, auto = 1) {
  const id = db.prepare(
    'INSERT INTO incidents(title, severity, status, auto, started) VALUES(?,?,?,?,?)',
  ).run(title, severity, 'investigating', auto, startedAt).lastInsertRowid;
  db.prepare('INSERT INTO incident_updates(incident, at, status, message) VALUES(?,?,?,?)').run(
    id,
    Date.now(),
    'investigating',
    message,
  );
  if (auto) setState('open_incident', id);
  return id;
}

function addUpdate(id, status, message) {
  const now = Date.now();
  db.prepare('INSERT INTO incident_updates(incident, at, status, message) VALUES(?,?,?,?)').run(
    id,
    now,
    status,
    message,
  );
  db.prepare('UPDATE incidents SET status = ?, resolved = ? WHERE id = ?').run(
    status,
    status === 'resolved' ? now : null,
    id,
  );
  if (status === 'resolved' && String(getState('open_incident')) === String(id))
    setState('open_incident', '');
}

function incidentTitle(components) {
  const down = components.filter(c => c.status === 'outage');
  if (down.some(c => c.id === 'gateway')) return 'The bot lost its connection to Discord';
  if (down.some(c => c.id === 'database')) return 'Database connection lost';
  if (down.length) return 'Discord API requests are failing';
  return 'Slower than usual responses';
}

// ---------- the loop ----------
async function tick(client) {
  const now = Date.now();

  try {
    const { components, ready } = await runChecks(client);
    const booting = !ready && now - started < BOOT_GRACE;
    const health = classify(components);
    refreshMaintenance();
    const inMaintenance = maintCache.active.length > 0;

    let state = health;

    if (booting) state = 'starting';
    else if (inMaintenance && health !== 'operational') state = 'maintenance';

    current = {
      overall: booting ? 'starting' : inMaintenance ? 'maintenance' : health,
      checkedAt: now,
      components,
    };

    const get = id => components.find(c => c.id === id)?.ms ?? null;
    samples.push({ t: now, gateway: get('gateway'), api: get('api'), database: get('database') });
    if (samples.length > 60) samples.shift();

    if (lastTick && state !== 'starting') addTime(lastTick, now, state, get('gateway') ?? -1);

    const openId = Number(getState('open_incident')) || null;

    if (state === 'outage') {
      badTicks++;
      slowTicks = 0;
      firstBadAt = firstBadAt || lastTick || now;

      if (badTicks >= 2 && !openId) {
        openIncident(
          incidentTitle(components),
          'outage',
          firstBadAt,
          'Automatic monitoring noticed the problem. We are looking into it.',
        );
      } else if (openId) {
        db.prepare("UPDATE incidents SET severity = 'outage' WHERE id = ?").run(openId);
      }
    } else if (state === 'degraded') {
      slowTicks++;
      badTicks = 0;
      firstBadAt = firstBadAt || lastTick || now;

      if (slowTicks >= 3 && !openId) {
        openIncident(
          incidentTitle(components),
          'degraded',
          firstBadAt,
          'Some responses are slower than normal. We are keeping an eye on it.',
        );
      }
    } else if (state === 'operational') {
      if (openId) addUpdate(openId, 'resolved', 'Everything is back to normal.');
      badTicks = 0;
      slowTicks = 0;
      firstBadAt = null;
    }

    lastTick = now;
    setState('last_tick', now);
  } catch (e) {
    console.error('[monitor]', e.message);
  }
}

// On startup, look at how long we were gone since the last heartbeat.
function recover() {
  const last = Number(getState('last_tick'));
  if (!last) return;
  const now = Date.now();
  const gap = now - last;
  const openId = Number(getState('open_incident')) || null;

  if (openId) addUpdate(openId, 'resolved', 'The bot restarted and is back online.');

  if (gap > GAP_LIMIT) {
    addTime(last, now, 'outage');

    if (!openId) {
      const id = openIncident(
        'The bot was unreachable',
        'outage',
        last,
        'No heartbeat was received from the bot.',
      );
      addUpdate(id, 'resolved', 'The bot came back online and monitoring resumed.');
    }
  } else {
    addTime(last, now, 'operational');
  }
}

function start(client) {
  try {
    recover();
  } catch (e) {
    console.error('[monitor] recover failed:', e.message);
  }

  setTimeout(() => tick(client), 5000).unref();
  timer = setInterval(() => tick(client), TICK);
  timer.unref();
}

// ---------- maintenance ----------
function refreshMaintenance(force) {
  const now = Date.now();
  if (!force && now - maintCache.at < 20000) return maintCache;
  const rows = db.prepare(
    'SELECT * FROM maintenance WHERE cancelled = 0 AND ends >= ? AND starts <= ? ORDER BY starts',
  ).all(now - 14 * DAY, now + 30 * DAY);
  const shape = r => ({ id: r.id, title: r.title, info: r.info, starts: r.starts, ends: r.ends });
  maintCache = {
    at: now,
    active: rows.filter(r => r.starts <= now && r.ends > now).map(shape),
    upcoming: rows.filter(r => r.starts > now).map(shape),
    recent: rows.filter(r => r.ends <= now).reverse().map(shape),
  };
  return maintCache;
}

function addMaintenance({ title, info, starts, ends }) {
  const t = String(title || '').trim().slice(0, 140);
  const s = Number(starts);
  const e = Number(ends);
  if (!t) throw new Error('Give the notice a title.');
  if (!s || !e) throw new Error('Start and end times are required.');
  if (e <= s) throw new Error('The end must be after the start.');
  db.prepare('INSERT INTO maintenance(title, info, starts, ends) VALUES(?,?,?,?)').run(
    t,
    String(info || '').slice(0, 600),
    s,
    e,
  );
  refreshMaintenance(true);
}

function cancelMaintenance(id) {
  db.prepare('UPDATE maintenance SET cancelled = 1 WHERE id = ?').run(id);
  refreshMaintenance(true);
}

// ---------- reading ----------
// small banner shown at the top of every page when something needs attention
function banner() {
  const m = refreshMaintenance();
  if (m.active[0])
    return { tone: 'maintenance', text: `Maintenance in progress: ${m.active[0].title}` };
  if (current.overall === 'outage')
    return { tone: 'outage', text: 'The bot is having problems right now. We are on it.' };
  if (current.overall === 'degraded')
    return { tone: 'degraded', text: 'Some services are running slowly.' };
  const soon = m.upcoming.find(x => x.starts - Date.now() < 72 * 3600 * 1000);
  if (soon) return { tone: 'notice', text: `Planned maintenance: ${soon.title}`, at: soon.starts };
  return null;
}

function uptime(days = 30) {
  const now = Date.now();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(now - i * DAY));

  const rows = db.prepare(`SELECT * FROM uptime_day WHERE date >= ?`).all(keys[0]);
  const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
  const incidentRows = db.prepare('SELECT started FROM incidents WHERE started >= ?').all(
    now - days * DAY,
  );
  const perDay = {};

  incidentRows.forEach(r => {
    const k = dayKey(r.started);
    perDay[k] = (perDay[k] || 0) + 1;
  });

  let available = 0;
  let tracked = 0;
  let down = 0;
  let pingSum = 0;
  let pingN = 0;

  const list = keys.map(date => {
    const r = byDate[date];
    const incidents = perDay[date] || 0;
    if (!r) return { date, status: 'none', uptime: null, down: 0, incidents };

    const ok = r.up_ms + r.degraded_ms;
    const total = ok + r.down_ms;
    available += ok;
    tracked += total;
    down += r.down_ms;
    pingSum += r.ping_sum;
    pingN += r.ping_n;

    if (total <= 0)
      return {
        date,
        status: r.maint_ms > 0 ? 'maintenance' : 'none',
        uptime: null,
        down: 0,
        incidents,
      };

    const pct = ok / total * 100;
    let status = 'operational';

    if (pct < 98) status = 'outage';
    else if (pct < 99.9) status = 'degraded';

    return { date, status, uptime: Math.round(pct * 100) / 100, down: r.down_ms, incidents };
  });

  return {
    days: list,
    availability: tracked > 0 ? Math.round(available / tracked * 10000) / 100 : null,
    downtime: down,
    avgPing: pingN ? Math.round(pingSum / pingN) : null,
    incidentCount: incidentRows.length,
  };
}

function incidentList(days = 30) {
  const since = Date.now() - days * DAY;
  const rows = db.prepare(
    "SELECT * FROM incidents WHERE started >= ? OR status != 'resolved' ORDER BY started DESC LIMIT 100",
  ).all(since);
  const updates = db.prepare('SELECT * FROM incident_updates WHERE incident = ? ORDER BY at DESC');
  const shaped = rows.map(r => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    status: r.status,
    auto: !!r.auto,
    started: r.started,
    resolved: r.resolved,
    duration: (r.resolved || Date.now()) - r.started,
    updates: updates.all(r.id).map(u => ({ at: u.at, status: u.status, message: u.message })),
  }));
  return {
    active: shaped.filter(i => i.status !== 'resolved'),
    past: shaped.filter(i => i.status === 'resolved'),
  };
}

function snapshot(client) {
  const shards = [...client.ws.shards.values()];
  const m = refreshMaintenance();
  return {
    overall: current.overall,
    checkedAt: current.checkedAt,
    components: current.components,
    ping: Math.round(client.ws.ping),
    botUptime: Date.now() - started,
    servers: client.guilds.cache.size,
    users: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
    commands: client.commandList?.length || 0,
    memory: Math.round(process.memoryUsage().rss / 1048576),
    shards: shards.map(s => ({ id: s.id, ready: s.status === 0, ping: Math.round(s.ping) })),
    uptime: uptime(30),
    incidents: incidentList(30),
    maintenance: { active: m.active, upcoming: m.upcoming, recent: m.recent.slice(0, 5) },
    latency: samples.slice(),
    time: Date.now(),
  };
}

// ---------- owner actions ----------
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function manualIncident({ title, severity, message }) {
  const t = clean(title, 140);
  if (!t) throw new Error('Give the incident a title.');
  return openIncident(
    t,
    severity === 'outage' ? 'outage' : 'degraded',
    Date.now(),
    clean(message, 600) || 'We are investigating.',
    0,
  );
}

function postUpdate(id, status, message) {
  const ok = ['investigating', 'monitoring', 'resolved'].includes(status) ? status : 'monitoring';
  addUpdate(
    id,
    ok,
    clean(message, 600)
      || (ok === 'resolved' ? 'This incident has been resolved.' : 'Update posted.'),
  );
}

function deleteIncident(id) {
  db.prepare('DELETE FROM incident_updates WHERE incident = ?').run(id);
  db.prepare('DELETE FROM incidents WHERE id = ?').run(id);
  if (String(getState('open_incident')) === String(id)) setState('open_incident', '');
}

module.exports = {
  start,
  snapshot,
  uptime,
  incidentList,
  banner,
  refreshMaintenance,
  addMaintenance,
  cancelMaintenance,
  manualIncident,
  postUpdate,
  deleteIncident,
  current: () => current,
  _splitByDay: splitByDay,
  _classify: classify,
};
