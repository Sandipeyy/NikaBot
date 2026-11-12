// Birthdays: members add theirs, the bot announces them (and gives a role for the day).
// Dates are handled in UTC, so the announcement may arrive a few hours off in some time zones.
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits: P } = require(
  'discord.js',
);
const store = require('./db');
const { db } = store;

db.exec(
  `
CREATE TABLE IF NOT EXISTS birthdays (
  guild TEXT,
  user TEXT,
  month INTEGER,
  day INTEGER,
  PRIMARY KEY (guild, user)
);
CREATE TABLE IF NOT EXISTS birthday_roles (
  guild TEXT,
  user TEXT,
  date TEXT,
  PRIMARY KEY (guild, user)
);
`,
);

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pretty = (m, d) => `${d} ${MONTHS[m - 1]}`;
const isLeap = y => y % 4 === 0 && y % 100 !== 0 || y % 400 === 0;

async function announce(client, guild, s, today) {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const channel = guild.channels.cache.get(s.birthday_channel);

  // people with a Feb 29 birthday celebrate on Feb 28 in years without one
  const rows = db.prepare(
    'SELECT user FROM birthdays WHERE guild = ? AND ((month = ? AND day = ?) OR (? AND month = 2 AND day = 29))',
  ).all(guild.id, month, day, month === 2 && day === 28 && !isLeap(now.getUTCFullYear()) ? 1 : 0);

  // take the role away from yesterday's birthdays
  if (s.birthday_role) {
    for (const old of db.prepare('SELECT * FROM birthday_roles WHERE guild = ? AND date != ?').all(
      guild.id,
      today,
    )) {
      const member = await guild.members.fetch(old.user).catch(() => null);
      await member?.roles.remove(s.birthday_role, 'Birthday is over').catch(() => {});
      db.prepare('DELETE FROM birthday_roles WHERE guild = ? AND user = ?').run(guild.id, old.user);
    }
  }

  const celebrating = [];

  for (const r of rows) {
    const member = await guild.members.fetch(r.user).catch(() => null);
    if (!member) continue;
    celebrating.push(member);

    if (s.birthday_role) {
      await member.roles.add(s.birthday_role, 'Birthday').catch(() => {});
      db.prepare('INSERT OR REPLACE INTO birthday_roles VALUES(?,?,?)').run(
        guild.id,
        r.user,
        today,
      );
    }
  }

  if (celebrating.length && channel) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('Happy birthday! 🎂')
          .setDescription(
            `Wish a happy birthday to ${celebrating.map(m => m.toString()).join(', ')}!`,
          ),
      ],
      allowedMentions: { users: celebrating.map(m => m.id) },
    }).catch(() => {});
  }
}

// runs every few minutes, but only does work once per guild per day
async function tick(client) {
  const today = new Date().toISOString().slice(0, 10);

  for (const guild of client.guilds.cache.values()) {
    const s = store.settings(guild.id);
    if (!s.birthday_channel || s.birthday_last === today) continue;
    store.setSetting(guild.id, 'birthday_last', today);
    await announce(client, guild, s, today).catch(e => console.error('[birthday]', e.message));
  }
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('birthday')
      .setDescription('Birthdays in this server')
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('set')
          .setDescription('Save your birthday')
          .addIntegerOption(o =>
            o
              .setName('month')
              .setDescription('Month number (1-12)')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(12))
          .addIntegerOption(o =>
            o
              .setName('day')
              .setDescription('Day of the month')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(31)))
      .addSubcommand(s => s.setName('remove').setDescription('Forget your birthday'))
      .addSubcommand(s =>
        s
          .setName('view')
          .setDescription("Show someone's birthday")
          .addUserOption(o => o.setName('user').setDescription('Member (default: you)')))
      .addSubcommand(s => s.setName('upcoming').setDescription('The next birthdays in this server'))
      .addSubcommand(s =>
        s
          .setName('setup')
          .setDescription(
            'Choose the announcement channel and an optional role (needs Manage Server)',
          )
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription('Where birthdays are announced')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true))
          .addRoleOption(o => o.setName('role').setDescription('Role given for the day')))
      .addSubcommand(s =>
        s.setName('off').setDescription('Stop announcing birthdays (needs Manage Server)')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;

      if (sub === 'setup' || sub === 'off') {
        if (!i.memberPermissions.has(P.ManageGuild))
          return i.reply({ content: 'You need the Manage Server permission.', ephemeral: true });

        if (sub === 'off') {
          store.setSetting(g, 'birthday_channel', null);
          return i.reply({ content: 'Birthday announcements turned off.', ephemeral: true });
        }

        const role = i.options.getRole('role');

        if (role && (role.managed || role.position >= i.guild.members.me.roles.highest.position)) {
          return i.reply({
            content: `I can't give ${role.name}. Move my role above it.`,
            ephemeral: true,
          });
        }

        store.setSetting(g, 'birthday_channel', i.options.getChannel('channel').id);
        store.setSetting(g, 'birthday_role', role ? role.id : null);
        store.setSetting(g, 'birthday_last', null);
        return i.reply({
          content: 'Birthday announcements are on. Members add theirs with `/birthday set`.',
          ephemeral: true,
        });
      }

      if (sub === 'set') {
        const month = i.options.getInteger('month');
        const day = i.options.getInteger('day');
        if (day > DAYS_IN[month - 1])
          return i.reply({
            content: `${MONTHS[month - 1]} does not have ${day} days.`,
            ephemeral: true,
          });
        db.prepare('INSERT OR REPLACE INTO birthdays VALUES(?,?,?,?)').run(
          g,
          i.user.id,
          month,
          day,
        );
        return i.reply({
          content: `Saved: your birthday is **${pretty(month, day)}**. Everyone in this server can see it.`,
          ephemeral: true,
        });
      }

      if (sub === 'remove') {
        db.prepare('DELETE FROM birthdays WHERE guild = ? AND user = ?').run(g, i.user.id);
        return i.reply({ content: 'Your birthday was removed.', ephemeral: true });
      }

      if (sub === 'view') {
        const user = i.options.getUser('user') || i.user;
        const row = db.prepare('SELECT * FROM birthdays WHERE guild = ? AND user = ?').get(
          g,
          user.id,
        );
        return i.reply({
          content:
            row
              ? `${user.username}'s birthday is **${pretty(row.month, row.day)}**.`
              : `${user.username} has not set a birthday.`,
          ephemeral: true,
        });
      }

      // upcoming: sort by days until the next occurrence
      const now = new Date();
      const todayIndex = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const rows = db
        .prepare('SELECT * FROM birthdays WHERE guild = ?')
        .all(g)
        .map(r => {
          let when = Date.UTC(now.getUTCFullYear(), r.month - 1, r.day);
          if (when < todayIndex) when = Date.UTC(now.getUTCFullYear() + 1, r.month - 1, r.day);
          return { ...r, in: Math.round((when - todayIndex) / 864e5) };
        })
        .sort((a, b) => a.in - b.in)
        .slice(0, 10);

      if (!rows.length)
        return i.reply({
          content: 'Nobody has added a birthday yet. Use `/birthday set`.',
          ephemeral: true,
        });
      const lines = rows.map(r => `<@${r.user}> · ${pretty(r.month, r.day)} · ${r.in === 0 ? '**today**' : `in ${r.in} day${r.in === 1 ? '' : 's'}`}`);

      return i.reply({
        content: lines.join('\n'),
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
    },
  },
];

module.exports = { commands, tick };
