// "90" (minutes), "10m", "2h", "1d", "1h30m", "2w" -> milliseconds, or null if it doesn't parse
const UNIT = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };

function parse(text) {
  const t = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
  if (/^\d+$/.test(t)) return Number(t) * UNIT.m;
  if (!/^(\d+[smhdw])+$/.test(t)) return null;
  let total = 0;
  for (const [, n, u] of t.matchAll(/(\d+)([smhdw])/g)) total += Number(n) * UNIT[u];
  return total;
}

function human(ms) {
  const d = Math.floor(ms / 864e5);
  const h = Math.floor(ms % 864e5 / 36e5);
  const m = Math.floor(ms % 36e5 / 6e4);
  const s = Math.floor(ms % 6e4 / 1e3);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && !m && `${s}s`].filter(Boolean).join(
    ' ',
  );
}

module.exports = { parse, human };
