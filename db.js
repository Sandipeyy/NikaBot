const Database = require('better-sqlite3');
const db = new Database('bot.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.pragma('cache_size = -64000');
db.pragma('temp_store = MEMORY');

db.exec(
  `
CREATE TABLE IF NOT EXISTS users(guild TEXT,user TEXT,coins INTEGER DEFAULT 500,last_daily INTEGER DEFAULT 0,PRIMARY KEY(guild,user));
CREATE TABLE IF NOT EXISTS quotes(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT,author TEXT,text TEXT);
CREATE TABLE IF NOT EXISTS settings(guild TEXT PRIMARY KEY,welcome_channel TEXT,welcome_msg TEXT DEFAULT 'Welcome {user} to {server}!',goodbye_channel TEXT,goodbye_msg TEXT DEFAULT '{user} left {server}.');
`,
);

db.exec(
  `
CREATE TABLE IF NOT EXISTS levels(guild TEXT,user TEXT,xp INTEGER DEFAULT 0,last INTEGER DEFAULT 0,PRIMARY KEY(guild,user));
CREATE TABLE IF NOT EXISTS warns(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT,user TEXT,mod TEXT,reason TEXT,at INTEGER);
CREATE TABLE IF NOT EXISTS inv(guild TEXT,user TEXT,item TEXT,qty INTEGER,PRIMARY KEY(guild,user,item));
CREATE TABLE IF NOT EXISTS reminders(id INTEGER PRIMARY KEY AUTOINCREMENT,user TEXT,text TEXT,at INTEGER);
CREATE TABLE IF NOT EXISTS giveaways(msg TEXT PRIMARY KEY,channel TEXT,prize TEXT,ends INTEGER,done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS tempvc(channel TEXT PRIMARY KEY,guild TEXT,owner TEXT);
CREATE TABLE IF NOT EXISTS zoo(guild TEXT,user TEXT,animal TEXT,qty INTEGER DEFAULT 0,PRIMARY KEY(guild,user,animal));
CREATE TABLE IF NOT EXISTS game_stats(guild TEXT,user TEXT,wins INTEGER DEFAULT 0,losses INTEGER DEFAULT 0,hunts INTEGER DEFAULT 0,PRIMARY KEY(guild,user));
CREATE TABLE IF NOT EXISTS lottery(guild TEXT PRIMARY KEY,ends INTEGER,channel TEXT);
CREATE TABLE IF NOT EXISTS lottery_tickets(guild TEXT,user TEXT,n INTEGER DEFAULT 0,PRIMARY KEY(guild,user));
CREATE TABLE IF NOT EXISTS cases(guild TEXT,num INTEGER,type TEXT,user TEXT,mod TEXT,reason TEXT,at INTEGER,PRIMARY KEY(guild,num));
CREATE TABLE IF NOT EXISTS tempbans(guild TEXT,user TEXT,ends INTEGER,PRIMARY KEY(guild,user));
CREATE TABLE IF NOT EXISTS polls(msg TEXT PRIMARY KEY,channel TEXT,ends INTEGER,q TEXT,opts TEXT);
CREATE TABLE IF NOT EXISTS entries(msg TEXT,user TEXT,PRIMARY KEY(msg,user));
`,
);

try {
  db.exec('ALTER TABLE tempvc ADD COLUMN wait TEXT');
} catch {}

try {
  db.exec('ALTER TABLE users ADD COLUMN luck INTEGER DEFAULT 0');
} catch {}

try {
  db.exec('ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0');
} catch {}

try {
  db.exec('ALTER TABLE giveaways ADD COLUMN winners INTEGER DEFAULT 1');
} catch {}

for (const c of [
  'autorole TEXT',
  'levels_on INTEGER DEFAULT 1',
  'tempvc_hub TEXT',
  'level_announce INTEGER DEFAULT 1',
  'xp_rate REAL DEFAULT 1',
  'am_invites INTEGER DEFAULT 0',
  'am_links INTEGER DEFAULT 0',
  'am_badwords TEXT',
  'modlog_channel TEXT',
  'daily_amount INTEGER DEFAULT 250',
  'tempvc_name TEXT',
  'tempvc_interface TEXT',
  'tempvc_cat TEXT',
  'tempvc_limit INTEGER DEFAULT 0',
  'prefix TEXT',
  'disabled_cmds TEXT',
  'welcome_img INTEGER DEFAULT 0',
  'welcome_title TEXT',
  'welcome_sub TEXT',
  'welcome_bg TEXT',
  'welcome_color TEXT',
  'goodbye_img INTEGER DEFAULT 0',
  'goodbye_title TEXT',
  'goodbye_sub TEXT',
  'goodbye_bg TEXT',
  'goodbye_color TEXT',
]) {
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN ${c}`);
  } catch {}
}

db.exec(
  `
CREATE INDEX IF NOT EXISTS idx_levels_xp ON levels(guild, xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_coins ON users(guild, coins DESC);
CREATE INDEX IF NOT EXISTS idx_warns ON warns(guild, user);
CREATE INDEX IF NOT EXISTS idx_quotes ON quotes(guild);
CREATE INDEX IF NOT EXISTS idx_reminders ON reminders(at);
CREATE INDEX IF NOT EXISTS idx_giveaways ON giveaways(done, ends);
`,
);

const sc = new Map();
const xpCd = new Map();
const COLS = db
  .prepare('PRAGMA table_info(settings)')
  .all()
  .map(c => c.name)
  .filter(n => n !== 'guild');

setInterval(() => {
  const n = Date.now();
  for (const [k, t] of xpCd) if (t < n) xpCd.delete(k);
}, 300000).unref();

const lv = x => Math.floor(Math.sqrt(x / 100));

module.exports = {
  lv,
  addXp(g, u, rate = 1) {
    const key = g + ':' + u;
    const t0 = Date.now();
    if ((xpCd.get(key) || 0) > t0) return null;
    xpCd.set(key, t0 + 60000);
    db.prepare('INSERT OR IGNORE INTO levels(guild,user) VALUES(?,?)').run(g, u);
    const r = db.prepare('SELECT * FROM levels WHERE guild=? AND user=?').get(g, u);
    const now = Date.now();
    if (now - r.last < 60000) return null;
    const xp = r.xp + Math.round((15 + Math.floor(Math.random() * 11)) * (rate || 1));
    db.prepare('UPDATE levels SET xp=?,last=? WHERE guild=? AND user=?').run(xp, now, g, u);
    return { xp, level: lv(xp), up: lv(xp) > lv(r.xp) };
  },
  addItem(g, u, item, n) {
    db.prepare(
      'INSERT INTO inv VALUES(?,?,?,?) ON CONFLICT(guild,user,item) DO UPDATE SET qty=qty+?',
    ).run(g, u, item, n, n);
  },
  hasItem(g, u, item) {
    return (
      (db.prepare('SELECT qty FROM inv WHERE guild=? AND user=? AND item=?').get(g, u, item)?.qty
        || 0)
        > 0
    );
  },
  useItem(g, u, item) {
    db.prepare('UPDATE inv SET qty=qty-1 WHERE guild=? AND user=? AND item=?').run(g, u, item);
  },
  db,
  user(g, u) {
    db.prepare('INSERT OR IGNORE INTO users(guild,user) VALUES(?,?)').run(g, u);
    return db.prepare('SELECT * FROM users WHERE guild=? AND user=?').get(g, u);
  },
  addCoins(g, u, n) {
    this.user(g, u);
    db.prepare('UPDATE users SET coins=MAX(0,coins+?) WHERE guild=? AND user=?').run(n, g, u);
  },
  settings(g) {
    const c = sc.get(g);
    if (c && c.t > Date.now()) return c.v;
    db.prepare('INSERT OR IGNORE INTO settings(guild) VALUES(?)').run(g);
    const v = db.prepare('SELECT * FROM settings WHERE guild=?').get(g);
    if (sc.size > 20000) sc.clear();
    sc.set(g, { v, t: Date.now() + 60000 });
    return v;
  },
  setSetting(g, k, v) {
    if (!COLS.includes(k)) return;
    this.settings(g);
    db.prepare(`UPDATE settings SET ${k}=? WHERE guild=?`).run(v, g);
    sc.delete(g);
  },
};
