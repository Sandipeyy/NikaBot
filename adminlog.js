// Remembers who changed what in the dashboard, so admins can see recent changes.
const { db } = require('./db');

db.exec(
  `
CREATE TABLE IF NOT EXISTS dash_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild TEXT,
  user TEXT,
  name TEXT,
  area TEXT,
  text TEXT,
  at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_dash_audit ON dash_audit(guild, at DESC);
`,
);

function add(guild, user, area, text) {
  db.prepare('INSERT INTO dash_audit(guild,user,name,area,text,at) VALUES(?,?,?,?,?,?)').run(
    guild,
    user.id,
    String(user.global_name || user.username || user.id).slice(0, 60),
    area,
    String(text).slice(0, 300),
    Date.now(),
  );
}

const list = (guild, limit = 25, offset = 0) =>
  db.prepare('SELECT * FROM dash_audit WHERE guild = ? ORDER BY at DESC LIMIT ? OFFSET ?').all(
    guild,
    limit,
    offset,
  );

const count = guild => db.prepare('SELECT COUNT(*) n FROM dash_audit WHERE guild = ?').get(guild).n;

module.exports = { add, list, count };
