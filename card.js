// welcome / goodbye cards
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// bundled fonts, render has none installed
for (const [file, fam] of [
  ['Poppins-Regular.ttf', 'Poppins'],
  ['Poppins-Bold.ttf', 'Poppins'],
  ['DejaVuSans.ttf', 'DejaVu'],
  ['DejaVuSans-Bold.ttf', 'DejaVu'],
]) {
  try {
    GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', file), fam);
  } catch {}
}

const FONT = (w, px) => `${w ? w + ' ' : ''}${px}px "Poppins", "DejaVu", sans-serif`;
const dns = require('dns').promises;
const net = require('net');
const cache = new Map();
const priv = ip =>
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|f[cd]|fe80)/i.test(ip);

async function fetchImg(url, trusted) {
  if (cache.has(url)) return cache.get(url);
  const u = new URL(url);

  if (!trusted) {
    // custom backgrounds: https only, public hosts, no redirects
    if (u.protocol !== 'https:' || net.isIP(u.hostname)) throw new Error('bad url');

    if ((await dns.lookup(u.hostname, { all: true })).some(a => priv(a.address)))
      throw new Error('bad host');
  }

  const r = await fetch(
    url,
    { signal: AbortSignal.timeout(6000), redirect: trusted ? 'follow' : 'error' },
  );
  if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/'))
    throw new Error('not an image');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 5e6) throw new Error('image too large');
  const img = await loadImage(buf);
  if (cache.size > 60) cache.clear();
  cache.set(url, img);
  return img;
}

const fit = (x, t, max) => {
  let s = t;
  while (x.measureText(s).width > max && s.length > 3) s = s.slice(0, -2);
  return s === t ? t : s.trimEnd() + '…';
};

async function render(kind, s, { name, avatarUrl, server, count }) {
  const W = 1000;
  const H = 360;
  const c = createCanvas(W, H);
  const x = c.getContext('2d');
  const color = s[kind + '_color'] || (kind === 'welcome' ? '#5865f2' : '#ed4245');
  let drew = false;

  if (s[kind + '_bg'])
    try {
      const im = await fetchImg(s[kind + '_bg']);
      const k = Math.max(W / im.width, H / im.height);
      x.drawImage(im, (W - im.width * k) / 2, (H - im.height * k) / 2, im.width * k, im.height * k);
      drew = true;
    } catch {}

  if (!drew) {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b0d14');
    g.addColorStop(1, color);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }

  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.fillRect(0, 0, W, H);
  const R = 100;
  const cx = 170;
  const cy = H / 2;
  x.save();
  x.beginPath();
  x.arc(cx, cy, R, 0, Math.PI * 2);
  x.closePath();
  x.clip();

  try {
    x.drawImage(await fetchImg(avatarUrl, true), cx - R, cy - R, R * 2, R * 2);
  } catch {
    x.fillStyle = color;
    x.fillRect(cx - R, cy - R, R * 2, R * 2);
  }

  x.restore();
  x.lineWidth = 8;
  x.strokeStyle = color;
  x.beginPath();
  x.arc(cx, cy, R + 5, 0, Math.PI * 2);
  x.stroke();
  const f = t =>
    String
      (t || '')
      .replaceAll('{user}', name)
      .replaceAll('{server}', server)
      .replaceAll('{count}', count);
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillStyle = '#fff';
  x.font = FONT('bold', 66);
  x.fillText(
    fit(
      x,
      f(s[kind + '_title'] || (kind === 'welcome' ? 'WELCOME' : 'GOODBYE')).toUpperCase(),
      620,
    ),
    320,
    125,
  );
  x.fillStyle = color;
  x.font = FONT('bold', 42);
  x.fillText(fit(x, f(s[kind + '_sub'] || '{user}'), 620), 320, 195);
  x.fillStyle = '#d0d4e0';
  x.font = FONT('', 28);
  x.fillText(fit(x, `${server} · ${count} members`, 620), 320, 252);
  return c.encode('png');
}

const rr = (x, a, b, w, h, r) => {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
};

async function avatar(x, url, cx, cy, R, color) {
  x.save();
  x.beginPath();
  x.arc(cx, cy, R, 0, Math.PI * 2);
  x.closePath();
  x.clip();

  try {
    x.drawImage(await fetchImg(url, true), cx - R, cy - R, R * 2, R * 2);
  } catch {
    x.fillStyle = color;
    x.fillRect(cx - R, cy - R, R * 2, R * 2);
  }

  x.restore();
  x.lineWidth = 7;
  x.strokeStyle = color;
  x.beginPath();
  x.arc(cx, cy, R + 4, 0, Math.PI * 2);
  x.stroke();
}

// rank card
async function renderRank({ name, avatarUrl, level, rank, xp, need, color = '#5865f2' }) {
  const W = 934;
  const H = 282;
  const c = createCanvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#1e1f22';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#2b2d31';
  rr(x, 16, 16, W - 32, H - 32, 26);
  x.fill();
  await avatar(x, avatarUrl, 150, 141, 82, color);
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.fillStyle = '#fff';
  x.font = FONT('bold', 44);
  x.fillText(fit(x, name, 360), 270, 118);
  x.textAlign = 'right';
  x.fillStyle = '#b5bac1';
  x.font = FONT('bold', 28);
  x.fillText(`RANK #${rank}`, 880, 72);
  x.fillStyle = color;
  x.font = FONT('bold', 52);
  x.fillText(`LEVEL ${level}`, 880, 126);
  x.fillStyle = '#b5bac1';
  x.font = FONT('', 26);
  x.fillText(`${xp.toLocaleString()} / ${need.toLocaleString()} XP`, 880, 176);
  x.fillStyle = '#3a3c42';
  rr(x, 270, 194, 610, 42, 21);
  x.fill();
  const w = Math.max(42, Math.round(610 * Math.min(1, xp / need)));
  const g = x.createLinearGradient(270, 0, 880, 0);
  g.addColorStop(0, color);
  g.addColorStop(1, '#8b95f7');
  x.fillStyle = g;
  rr(x, 270, 194, w, 42, 21);
  x.fill();
  return c.encode('png');
}

// level up banner
async function renderLevelUp({ name, avatarUrl, level, color = '#5865f2' }) {
  const W = 700;
  const H = 200;
  const c = createCanvas(W, H);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1e1f22');
  g.addColorStop(1, color);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.fillRect(0, 0, W, H);
  await avatar(x, avatarUrl, 110, 100, 70, color);
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillStyle = '#fff';
  x.font = FONT('bold', 44);
  x.fillText('LEVEL UP!', 215, 70);
  x.fillStyle = '#e3e5ff';
  x.font = FONT('', 30);
  x.fillText(fit(x, name, 330), 215, 118);
  x.fillStyle = '#b5bac1';
  x.font = FONT('', 24);
  x.fillText('+100 coins', 215, 155);
  x.textAlign = 'right';
  x.fillStyle = '#fff';
  x.font = FONT('bold', 84);
  x.fillText(String(level), 660, 100);
  return c.encode('png');
}

// logo drawn on canvas
function drawLogo(x, ox, oy, k) {
  const g = x.createLinearGradient(0, oy + 17 * k, 0, oy + 172 * k);
  g.addColorStop(0, '#6d78f2');
  g.addColorStop(1, '#4752c4');
  x.lineCap = 'round';
  x.strokeStyle = g;
  x.lineWidth = 34 * k;
  x.beginPath();
  x.moveTo(ox + 42 * k, oy + 172 * k);
  x.lineTo(ox + 42 * k, oy + 92 * k);
  x.arc(ox + 100 * k, oy + 92 * k, 58 * k, Math.PI, 0);
  x.lineTo(ox + 158 * k, oy + 172 * k);
  x.stroke();
  x.fillStyle = '#fff';

  for (const cx of [80, 120]) {
    x.beginPath();
    x.arc(ox + cx * k, oy + 108 * k, 9 * k, 0, Math.PI * 2);
    x.fill();
  }

  x.strokeStyle = '#f2f3f5';
  x.lineWidth = 7 * k;
  x.beginPath();
  x.moveTo(ox + 84 * k, oy + 132 * k);
  x.quadraticCurveTo(ox + 100 * k, oy + 144 * k, ox + 116 * k, oy + 132 * k);
  x.stroke();
}

async function renderIcon(size) {
  const c = createCanvas(size, size);
  const x = c.getContext('2d');
  x.fillStyle = '#2b2d31';
  rr(x, 0, 0, size, size, size * 0.22);
  x.fill();
  drawLogo(x, 0, 0, size / 200);
  return c.encode('png');
}

async function renderOg(name, tagline) {
  const W = 1200;
  const H = 630;
  const c = createCanvas(W, H);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1e1f22');
  g.addColorStop(1, '#33364a');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  drawLogo(x, 90, 130, 2.1);
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.fillStyle = '#fff';
  x.font = FONT('bold', 86);
  x.fillText(fit(x, name, 640), 520, 290);
  x.fillStyle = '#b5bac1';
  x.font = FONT('', 40);
  x.fillText(fit(x, tagline, 640), 520, 360);
  x.fillStyle = '#8b95f7';
  x.font = FONT('bold', 30);
  x.fillText('Leveling · Moderation · Music · Economy', 520, 440);
  return c.encode('png');
}

module.exports = { render, renderRank, renderLevelUp, renderIcon, renderOg };
