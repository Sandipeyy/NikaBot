// Counts command usage per day so the analytics page can show trends.
const { db } = require('./db');
const meta = require('./meta');

db.exec(`
CREATE TABLE IF NOT EXISTS command_daily (
  date TEXT,
  command TEXT,
  uses INTEGER DEFAULT 0,
  PRIMARY KEY (date, command)
);
`);

const DAY = 86400000;
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
const bump = db.prepare(
  'INSERT INTO command_daily(date, command, uses) VALUES(?, ?, 1) ON CONFLICT(date, command) DO UPDATE SET uses = uses + 1',
);

const categoryOf = {};
for (const [category, names] of Object.entries(meta)) names.forEach(n => (categoryOf[n] = category));

function record(command) {
  if (!command) return;
  try {
    bump.run(dayKey(Date.now()), String(command).slice(0, 40));
  } catch (e) {
    console.error('[usage]', e.message);
  }
}

const change = (now, before) => {
  if (before === 0) return now > 0 ? null : 0; // null means brand new
  return Math.round(((now - before) / before) * 100);
};

function report(requested) {
  const days = [7, 30, 90].includes(requested) ? requested : 30;
  const now = Date.now();
  const from = dayKey(now - (days * 2 - 1) * DAY);
  const split = dayKey(now - (days - 1) * DAY);
  const rows = db.prepare('SELECT * FROM command_daily WHERE date >= ?').all(from);

  const current = rows.filter(r => r.date >= split);
  const previous = rows.filter(r => r.date < split);

  const perDay = {};
  current.forEach(r => (perDay[r.date] = (perDay[r.date] || 0) + r.uses));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(now - i * DAY);
    series.push({ date, total: perDay[date] || 0 });
  }

  const sum = list => {
    const out = {};
    list.forEach(r => (out[r.command] = (out[r.command] || 0) + r.uses));
    return out;
  };
  const now_ = sum(current);
  const before = sum(previous);
  const total = series.reduce((a, d) => a + d.total, 0);
  const previousTotal = Object.values(before).reduce((a, n) => a + n, 0);

  const top = Object.entries(now_)
    .map(([name, count]) => ({
      name,
      count,
      share: total ? Math.round((count / total) * 1000) / 10 : 0,
      change: change(count, before[name] || 0),
      category: categoryOf[name] || 'Other',
    }))
    .sort((a, b) => b.count - a.count);

  const movers = top
    .filter(c => c.count >= 3)
    .map(c => ({ ...c, delta: c.count - (before[c.name] || 0) }))
    .sort((a, b) => b.delta - a.delta);

  const categories = {};
  top.forEach(c => (categories[c.category] = (categories[c.category] || 0) + c.count));

  const trackedDays = new Set(current.map(r => r.date)).size;
  const busiest = series.reduce((best, d) => (d.total > (best?.total || 0) ? d : best), null);

  return {
    days,
    series,
    total,
    previousTotal,
    change: change(total, previousTotal),
    average: trackedDays ? Math.round(total / trackedDays) : 0,
    busiest,
    top: top.slice(0, 10),
    rising: movers.filter(m => m.delta > 0).slice(0, 5),
    falling: movers.filter(m => m.delta < 0).slice(-5).reverse(),
    categories: Object.entries(categories)
      .map(([name, count]) => ({ name, count, share: total ? Math.round((count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

module.exports = { record, report };
