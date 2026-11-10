// swaps emojis for custom icons. the icons are rendered once and uploaded as application emojis,
// if that fails the normal emojis just stay
const { P, EMOJI, COLOR, FILLED, toPath } = require('./icons');
const VER = 1;
const DEFAULT = '#8B95F7';
const ids = new Map(); // icon name -> emoji id
const RE = /(\p{Extended_Pictographic})\uFE0F?/gu;
const ename = n => `ic${VER}_${n}`;
const custom = char => {
  const n = EMOJI[String(char).replace(/\uFE0F/g, '')];
  return n && ids.has(n) ? { id: ids.get(n), name: ename(n) } : null;
};

// skip `code` and code blocks
const rep = (s, strip) =>
  typeof s !== 'string'
    ? s
    : s
      .split(/(```[\s\S]*?```|`[^`\n]*`)/)
      .map((seg, i) =>
        i % 2
          ? seg
          : seg.replace(RE, (m, c) => {
            const e = custom(c);
            return !e ? m : strip ? '' : `<:${e.name}:${e.id}>`;
          }))
      .join('');
const plain = s =>
  typeof s !== 'string'
    ? s
    : rep(s, true).replace(/^\s+/, '').replace(
      /\s{2,}/g,
      ' ',
    ); // footers can't show custom emojis

function fixComponent(c) {
  const x = { ...c };
  const swap = em => em?.name && !em.id && custom(em.name) || em;
  if (x.emoji) x.emoji = swap(x.emoji);
  if (x.options) x.options = x.options.map(o => ({ ...o, emoji: swap(o.emoji) }));
  return x;
}

function emojify(o) {
  if (!ids.size || !o || typeof o !== 'object') return o;
  const out = { ...o };
  if (typeof o.content === 'string') out.content = rep(o.content);

  if (Array.isArray(o.embeds))
    out.embeds = o.embeds.map(e => {
      const j = e?.toJSON ? e.toJSON() : { ...e };
      if (j.title) j.title = rep(j.title);
      if (j.description) j.description = rep(j.description);
      if (j.fields)
        j.fields = j.fields.map(f => ({ ...f, name: rep(f.name), value: rep(f.value) }));
      if (j.footer?.text) j.footer = { ...j.footer, text: plain(j.footer.text) };
      if (j.author?.name) j.author = { ...j.author, name: plain(j.author.name) };
      return j;
    });

  if (Array.isArray(o.components))
    out.components = o.components.map(r => {
      const j = r?.toJSON ? r.toJSON() : { ...r };
      return j.components ? { ...j, components: j.components.map(fixComponent) } : j;
    });

  return out;
}

function patch() {
  const { MessagePayload } = require('discord.js');
  const orig = MessagePayload.prototype.resolveBody;

  MessagePayload.prototype.resolveBody = function () {
    try {
      this.options = emojify(this.options);
    } catch (e) {
      console.error('[icons]', e.message);
    }

    return orig.call(this);
  };
}

async function render(name) {
  const { createCanvas, Path2D } = require('@napi-rs/canvas');
  const c = createCanvas(128, 128);
  const x = c.getContext('2d');
  const col = COLOR[name] || DEFAULT;
  const path = new Path2D(toPath(P[name]));
  x.scale(128 / 24, 128 / 24);
  x.lineWidth = 2.1;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = col;
  x.fillStyle = col;
  if (FILLED.has(name)) x.fill(path);
  x.stroke(path);
  return c.encode('png');
}

async function setup(client) {
  const api = `https://discord.com/api/v10/applications/${client.application.id}/emojis`;
  const H = { authorization: `Bot ${process.env.BOT_TOKEN}`, 'content-type': 'application/json' };
  const have = new Map();
  const r = await fetch(api, { headers: H });
  if (!r.ok) throw new Error(`could not list application emojis (HTTP ${r.status})`);
  for (const e of (await r.json()).items || []) have.set(e.name, e.id);
  let made = 0;

  for (const n of new Set(Object.values(EMOJI))) {
    const en = ename(n);

    if (!have.has(en)) {
      for (let tries = 0; tries < 3 && !have.has(en); tries++) {
        const res = await fetch(
          api,
          {
            method: 'POST',
            headers: H,
            body: JSON.stringify({
              name: en,
              image: `data:image/png;base64,${(await render(n)).toString('base64')}`,
            }),
          },
        );

        if (res.ok) {
          have.set(en, (await res.json()).id);
          made++;
        } else if (res.status === 429) {
          const wait = ((await res.json().catch(() => ({}))).retry_after || 2) * 1000 + 200;
          await new Promise(ok => setTimeout(ok, wait));
        } else {
          console.warn(`[icons] could not create ${en}: HTTP ${res.status}`);
          break;
        }
      }

      await new Promise(ok => setTimeout(ok, 300));
    }

    if (have.has(en)) ids.set(n, have.get(en));
  }

  console.log(`[icons] ${ids.size} icon emojis ready (${made} new)`);
}

module.exports = { setup, patch, emojify, rep, _ids: ids };
