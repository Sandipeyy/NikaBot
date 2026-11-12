// /afk: people who mention you are told you are away. Your next message clears it.
const { SlashCommandBuilder } = require('discord.js');
const { db } = require('./db');
const { human } = require('./duration');

db.exec(
  `
CREATE TABLE IF NOT EXISTS afk (
  guild TEXT,
  user TEXT,
  reason TEXT,
  at INTEGER,
  PRIMARY KEY (guild, user)
);
`,
);

const noticed = new Map(); // channel -> last time we replied about someone being away

function check(m) {
  const mine = db.prepare('SELECT * FROM afk WHERE guild = ? AND user = ?').get(
    m.guild.id,
    m.author.id,
  );

  if (mine) {
    db.prepare('DELETE FROM afk WHERE guild = ? AND user = ?').run(m.guild.id, m.author.id);
    m
      .reply({
        content: `Welcome back ${m.author}, you were away for **${human(Date.now() - mine.at)}**.`,
        allowedMentions: { repliedUser: false, parse: [] },
      })
      .then(x => setTimeout(() => x.delete().catch(() => {}), 8000))
      .catch(() => {});
    return;
  }

  if (!m.mentions.users.size || Date.now() - (noticed.get(m.channelId) || 0) < 8000) return;
  const lines = [];

  for (const u of [...m.mentions.users.values()].slice(0, 5)) {
    if (u.bot || u.id === m.author.id) continue;
    const row = db.prepare('SELECT * FROM afk WHERE guild = ? AND user = ?').get(m.guild.id, u.id);
    if (row)
      lines.push(`**${u.username}** is away: ${row.reason} (<t:${Math.floor(row.at / 1000)}:R>)`);
  }

  if (!lines.length) return;
  noticed.set(m.channelId, Date.now());

  m.reply({
    content: lines.join('\n'),
    allowedMentions: { repliedUser: false, parse: [] },
  }).catch(() => {});
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Let people know you are away')
      .setDMPermission(false)
      .addStringOption(o =>
        o.setName('reason').setDescription('Why you are away').setMaxLength(100)),
    run: i => {
      const reason =
        (i.options.getString('reason') || 'AFK').replace(/<@[!&]?\d+>|@(everyone|here)/g, '').trim()
          || 'AFK';
      db.prepare('INSERT OR REPLACE INTO afk VALUES(?,?,?,?)').run(
        i.guildId,
        i.user.id,
        reason,
        Date.now(),
      );
      return i.reply({ content: `You are now away: ${reason}`, allowedMentions: { parse: [] } });
    },
  },
];

module.exports = { commands, check };
