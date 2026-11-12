// Per-server numbers for the dashboard Insights page: joins and leaves, busiest channels, popular commands.
// Counts are collected in memory and written to the database every 30 seconds.
const { db } = require('./db');

db.exec(
  `
CREATE TABLE IF NOT EXISTS member_daily (
  guild TEXT,
  date TEXT,
  joins INTEGER DEFAULT 0,
  leaves INTEGER DEFAULT 0,
  PRIMARY KEY (guild, date)
);
CREATE TABLE IF NOT EXISTS chan_daily (
  guild TEXT,
  date TEXT,
  channel TEXT,
  msgs INTEGER DEFAULT 0,
  PRIMARY KEY (guild, date, channel)
);
CREATE TABLE IF NOT EXISTS guild_usage (
  guild TEXT,
  date TEXT,
  command TEXT,
  uses INTEGER DEFAULT 0,
  PRIMARY KEY (guild, date, command)
);
`,
);

const DAY = 86400000;
const today = () => new Date().toISOString().slice(0, 10);
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);

const members = new Map(); // "guild|date" -> { joins, leaves }
const channels = new Map(); // "guild|date|channel" -> messages
const commands = new Map(); // "guild|date|command" -> uses

const bumpMember = (guild, field) => {
  const k = `${guild}|${today()}`;
  const row = members.get(k) || { joins: 0, leaves: 0 };
  row[field]++;
  members.set(k, row);
};

function countMessage(m) {
  const k = `${m.guild.id}|${today()}|${m.channelId}`;
  channels.set(k, (channels.get(k) || 0) + 1);
}

function countCommand(guild, command) {
  if (!guild || !command) return;
  const k = `${guild}|${today()}|${command}`;
  commands.set(k, (commands.get(k) || 0) + 1);
}

function flush() {
  if (!members.size && !channels.size && !commands.size) return;

  const write = db.transaction(() => {
    for (const [k, v] of members) {
      const [guild, date] = k.split('|');
      db.prepare(
        'INSERT INTO member_daily(guild,date,joins,leaves) VALUES(?,?,?,?) ON CONFLICT(guild,date) DO UPDATE SET joins=joins+excluded.joins, leaves=leaves+excluded.leaves',
      ).run(guild, date, v.joins, v.leaves);
    }

    for (const [k, n] of channels) {
      const [guild, date, channel] = k.split('|');
      db.prepare(
        'INSERT INTO chan_daily(guild,date,channel,msgs) VALUES(?,?,?,?) ON CONFLICT(guild,date,channel) DO UPDATE SET msgs=msgs+excluded.msgs',
      ).run(guild, date, channel, n);
    }

    for (const [k, n] of commands) {
      const [guild, date, command] = k.split('|');
      db.prepare(
        'INSERT INTO guild_usage(guild,date,command,uses) VALUES(?,?,?,?) ON CONFLICT(guild,date,command) DO UPDATE SET uses=uses+excluded.uses',
      ).run(guild, date, command, n);
    }
  });

  try {
    write();
    members.clear();
    channels.clear();
    commands.clear();
  } catch (e) {
    console.error('[insights]', e.message);
  }
}

function listen(client) {
  client.on('guildMemberAdd', m => bumpMember(m.guild.id, 'joins'));
  client.on('guildMemberRemove', m => bumpMember(m.guild.id, 'leaves'));
  setInterval(flush, 30000).unref();
}

function report(guild, requested) {
  flush();
  const days = [7, 14, 30].includes(requested) ? requested : 14;
  const now = Date.now();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(now - i * DAY));
  const from = keys[0];

  const memberRows = Object.fromEntries(
    db
      .prepare('SELECT * FROM member_daily WHERE guild = ? AND date >= ?')
      .all(guild, from)
      .map(r => [r.date, r]),
  );
  const series = keys.map(date => ({
    date,
    joins: memberRows[date]?.joins || 0,
    leaves: memberRows[date]?.leaves || 0,
  }));

  const topChannels = db.prepare(
    'SELECT channel, SUM(msgs) n FROM chan_daily WHERE guild = ? AND date >= ? GROUP BY channel ORDER BY n DESC LIMIT 8',
  ).all(guild, from);
  const topCommands = db.prepare(
    'SELECT command, SUM(uses) n FROM guild_usage WHERE guild = ? AND date >= ? GROUP BY command ORDER BY n DESC LIMIT 8',
  ).all(guild, from);
  const messages = db.prepare(
    'SELECT COALESCE(SUM(msgs),0) n FROM chan_daily WHERE guild = ? AND date >= ?',
  ).get(guild, from).n;

  const joins = series.reduce((a, d) => a + d.joins, 0);
  const leaves = series.reduce((a, d) => a + d.leaves, 0);
  return { days, series, joins, leaves, net: joins - leaves, messages, topChannels, topCommands };
}

module.exports = { listen, countMessage, countCommand, report, flush };
