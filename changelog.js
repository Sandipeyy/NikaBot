// Changelog entries: the ones in changelog.json plus any added by the owner on /admin.
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

db.exec(
  `
CREATE TABLE IF NOT EXISTS changelog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT,
  title TEXT,
  items TEXT,
  at INTEGER
);
`,
);

function fromFile() {
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'changelog.json'), 'utf8'));
    return rows.map(r => ({
      kind: r.kind,
      title: r.title,
      items: r.items || [],
      at: new Date(r.date).getTime(),
    }));
  } catch {
    return [];
  }
}

function list() {
  const stored = db
    .prepare('SELECT * FROM changelog ORDER BY at DESC LIMIT 200')
    .all()
    .map(r => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      items: JSON.parse(r.items || '[]'),
      at: r.at,
    }));
  return [...fromFile(), ...stored].sort((a, b) => b.at - a.at);
}

function add({ kind, title, items }) {
  const t = String(title || '').trim().slice(0, 140);
  if (!t) throw new Error('Give the entry a title.');

  const lines = String
    (items || '')
    .split('\n')
    .map(s => s.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 20);

  db.prepare('INSERT INTO changelog(kind, title, items, at) VALUES(?,?,?,?)').run(
    kind === 'bot' ? 'bot' : 'website',
    t,
    JSON.stringify(lines),
    Date.now(),
  );
}

const remove = id => db.prepare('DELETE FROM changelog WHERE id = ?').run(id);

module.exports = { list, add, remove };
