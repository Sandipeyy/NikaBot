// backups for hosts that wipe the disk on restart (render free tier)
// the db is gzipped + encrypted and posted to a private channel, restored on boot if bot.db is missing
const fs = require('fs');
const zlib = require('zlib');
const { encrypt, decrypt } = require('./secure');
const API = 'https://discord.com/api/v10';
const DB = 'bot.db';
const NAME = 'bot.db.enc';
const chan = () => process.env.BACKUP_CHANNEL_ID;
const H = () => ({ authorization: `Bot ${process.env.BOT_TOKEN}` });
const recent = async () => {
  const r = await fetch(`${API}/channels/${chan()}/messages?limit=50`, { headers: H() });
  if (!r.ok) throw new Error(`cannot read the backup channel (HTTP ${r.status})`);
  return (await r.json()).filter(m => m.attachments?.some(a => a.filename === NAME));
};

async function restore() {
  if (!chan() || fs.existsSync(DB)) return;
  const m = (await recent())[0];
  if (!m) return console.log('[backup] no backup found, starting with an empty database');
  const buf = Buffer.from(
    await (await fetch(m.attachments.find(a => a.filename === NAME).url)).arrayBuffer(),
  );
  fs.writeFileSync(DB, zlib.gunzipSync(decrypt(buf)));
  console.log(`[backup] database restored from the backup made ${m.timestamp}`);
}

let last = -1;

async function backup(db, force) {
  if (!chan()) return;
  const n = db.prepare('SELECT total_changes() n').get().n;
  if (!force && n === last) return;
  const tmp = 'bot-backup.tmp';
  await db.backup(tmp);
  const data = encrypt(zlib.gzipSync(fs.readFileSync(tmp)));
  fs.unlinkSync(tmp);
  const form = new FormData();
  form.append(
    'payload_json',
    JSON.stringify({
      content: `Database backup ${new Date().toISOString()} · ${(data.length / 1024).toFixed(0)} KB (encrypted). Keep this channel private.`,
    }),
  );
  form.append('files[0]', new Blob([data]), NAME);
  const r = await fetch(
    `${API}/channels/${chan()}/messages`,
    { method: 'POST', headers: H(), body: form },
  );
  if (!r.ok) throw new Error(`upload failed (HTTP ${r.status}) ${(await r.text()).slice(0, 120)}`);
  last = n;
  for (const old of (await recent()).slice(5))
    await fetch(
      `${API}/channels/${chan()}/messages/${old.id}`,
      { method: 'DELETE', headers: H() },
    ).catch(() => {}); // keep the 5 newest
}

function announce() {
  if (chan())
    console.log('[backup] enabled: the database is backed up every 15 minutes and on shutdown');
  else
    console.warn(
      `[backup] DISABLED: data lives only on this server's disk${process.env.RENDER ? ' and Render wipes it on every restart or sleep (settings, coins and levels will reset!). Set BACKUP_CHANNEL_ID or attach a Render disk.' : '.'}`,
    );
}

module.exports = { restore, backup, announce };
