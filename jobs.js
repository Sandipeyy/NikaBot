// Housekeeping that runs every ten minutes: expired cooldowns, old log rows, members who never verified.
const { PermissionFlagsBits: P } = require('discord.js');
const store = require('./db');
const { db } = store;

// make sure the tables we clean up exist, whatever order modules load in
for (const m of ['./honeypot', './adminlog', './afk', './insights', './usage']) require(m);

const DAY = 86400000;

function cleanup() {
  const now = Date.now();
  const date = days => new Date(now - days * DAY).toISOString().slice(0, 10);
  db.prepare('DELETE FROM cooldowns WHERE until < ?').run(now);
  db.prepare('DELETE FROM honeypot_log WHERE at < ?').run(now - 90 * DAY);
  db.prepare('DELETE FROM dash_audit WHERE at < ?').run(now - 180 * DAY);
  db.prepare('DELETE FROM afk WHERE at < ?').run(now - 60 * DAY);

  for (const table of ['command_daily', 'member_daily', 'chan_daily', 'guild_usage']) {
    db.prepare(`DELETE FROM ${table} WHERE date < ?`).run(date(400));
  }
}

// kick members who joined more than N hours ago and still don't have the verified role
async function kickUnverified(client) {
  const rows = db.prepare(
    'SELECT guild FROM settings WHERE verify_role IS NOT NULL AND verify_kick_hours > 0',
  ).all();

  for (const { guild: id } of rows) {
    const guild = client.guilds.cache.get(id);
    if (!guild || !guild.members.me.permissions.has(P.KickMembers)) continue;
    const s = store.settings(id);
    if (!guild.roles.cache.has(s.verify_role) || guild.memberCount > 5000) continue;

    await guild.members.fetch().catch(() => {});
    const limit = Date.now() - s.verify_kick_hours * 36e5;
    const me = guild.members.me.roles.highest.position;
    const late = guild.members.cache.filter(m =>
      !m.user.bot
        && !m.roles.cache.has(s.verify_role)
        && m.joinedTimestamp
        && m.joinedTimestamp < limit
        && !m.permissions.has(P.ManageMessages)
        && m.roles.highest.position < me).first(25);

    let kicked = 0;

    for (const m of late) {
      await m.send(
        `You were removed from **${guild.name}** because you did not verify in time. You are welcome to join again.`,
      ).catch(() => {});
      const ok = await m.kick('Did not verify in time').then(() => true).catch(() => false);

      if (ok) {
        kicked++;

        try {
          require('./upgrades').newCase(id, 'kick', m.id, client.user.id, 'Did not verify in time');
        } catch {}
      }
    }

    const log = s.modlog_channel && guild.channels.cache.get(s.modlog_channel);
    if (kicked)
      log?.send(
        `🧹 Removed **${kicked}** member${kicked === 1 ? '' : 's'} who did not verify within ${s.verify_kick_hours} hours.`,
      ).catch(() => {});
  }
}

async function run(client) {
  try {
    cleanup();
    await kickUnverified(client);
  } catch (e) {
    console.error('[jobs]', e.message);
  }
}

module.exports = { run, cleanup, kickUnverified };
