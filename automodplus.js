// Extra auto-moderation checks: message spam, too many mentions, shouting in capitals.
const { PermissionFlagsBits: P } = require('discord.js');

const recent = new Map(); // "guild:user" -> message times
const strikes = new Map(); // "guild:user" -> spam strikes
const WINDOW = 6000;
const LIMIT = 5;

setInterval(() => {
  const now = Date.now();
  for (const [k, list] of recent)
    if (!list.length || now - list[list.length - 1] > 60000) recent.delete(k);
  for (const [k, s] of strikes) if (now - s.last > 60000) strikes.delete(k);
}, 60000).unref();

function check(m, s) {
  if (!(s.am_spam || s.am_mentions || s.am_caps)) return null;
  if (m.member?.permissions.has(P.ManageMessages)) return null;

  if (s.am_mentions) {
    const unique = new Set([...m.mentions.users.keys(), ...m.mentions.roles.keys()]);
    if (m.mentions.everyone) unique.add('everyone');
    if (unique.size >= s.am_mentions) return 'too many mentions';
  }

  if (s.am_caps) {
    const letters = m.content.replace(/[^a-z]/gi, '');
    const upper = letters.replace(/[^A-Z]/g, '').length;
    if (letters.length >= 12 && upper / letters.length * 100 >= s.am_caps)
      return 'too many capital letters';
  }

  if (s.am_spam) {
    const key = `${m.guild.id}:${m.author.id}`;
    const now = Date.now();
    const list = (recent.get(key) || []).filter(t => now - t < WINDOW);
    list.push(now);
    recent.set(key, list);

    if (list.length >= LIMIT) {
      recent.delete(key);
      punish(m, key);
      return 'spam';
    }
  }

  return null;
}

// three bursts in a minute earns a short timeout
function punish(m, key) {
  const now = Date.now();
  const st = strikes.get(key) || { n: 0, last: now };
  st.n = now - st.last > 60000 ? 1 : st.n + 1;
  st.last = now;
  strikes.set(key, st);
  if (st.n < 3 || !m.member?.moderatable) return;

  strikes.delete(key);

  m.member
    .timeout(10 * 60000, 'Auto-moderation: spam')
    .then(() => {
      try {
        require('./upgrades').newCase(
          m.guild.id,
          'timeout',
          m.author.id,
          m.client.user.id,
          'Auto-moderation: spam',
        );
      } catch {}
    })
    .catch(() => {});
}

module.exports = { check };
