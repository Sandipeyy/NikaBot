// /suggest: members post ideas, everyone votes with buttons, staff approve or deny.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits: P,
} = require('discord.js');
const store = require('./db');
const { db } = store;

db.exec(
  `
CREATE TABLE IF NOT EXISTS suggestions (
  guild TEXT,
  num INTEGER,
  author TEXT,
  text TEXT,
  status TEXT,
  channel TEXT,
  msg TEXT,
  at INTEGER,
  PRIMARY KEY (guild, num)
);
CREATE TABLE IF NOT EXISTS suggestion_votes (
  guild TEXT,
  num INTEGER,
  user TEXT,
  vote INTEGER,
  PRIMARY KEY (guild, num, user)
);
`,
);

const COLORS = { open: 0x5865f2, approved: 0x23a55a, denied: 0xed4245 };
const LABEL = { open: 'Open', approved: 'Approved', denied: 'Denied' };
const lastSent = new Map();

function votes(guild, num) {
  const rows = db.prepare(
    'SELECT vote, COUNT(*) n FROM suggestion_votes WHERE guild = ? AND num = ? GROUP BY vote',
  ).all(guild, num);
  return { up: rows.find(r => r.vote === 1)?.n || 0, down: rows.find(r => r.vote === -1)?.n || 0 };
}

function render(row) {
  const v = votes(row.guild, row.num);
  const embed = new EmbedBuilder()
    .setColor(COLORS[row.status])
    .setTitle(`Suggestion #${row.num}`)
    .setDescription(row.text)
    .addFields(
      { name: 'Status', value: LABEL[row.status], inline: true },
      { name: 'Votes', value: `👍 ${v.up}   👎 ${v.down}`, inline: true },
    )
    .setFooter({ text: `Suggested by ${row.author_name || 'a member'}` });

  const open = row.status === 'open';
  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sg:up:${row.num}`)
      .setLabel('Agree')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👍'),
    new ButtonBuilder()
      .setCustomId(`sg:down:${row.num}`)
      .setLabel('Disagree')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👎'),
  );
  const staffRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sg:ok:${row.num}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!open),
    new ButtonBuilder()
      .setCustomId(`sg:no:${row.num}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!open),
  );
  return { embeds: [embed], components: [voteRow, staffRow] };
}

async function handleComponent(i) {
  const [, action, numText] = i.customId.split(':');
  const num = Number(numText);
  const row = db.prepare('SELECT * FROM suggestions WHERE guild = ? AND num = ?').get(
    i.guildId,
    num,
  );
  if (!row) return i.reply({ content: 'That suggestion no longer exists.', ephemeral: true });

  if (action === 'up' || action === 'down') {
    if (row.status !== 'open')
      return i.reply({ content: 'Voting is closed for this suggestion.', ephemeral: true });
    const vote = action === 'up' ? 1 : -1;
    const prev = db.prepare(
      'SELECT vote FROM suggestion_votes WHERE guild = ? AND num = ? AND user = ?',
    ).get(i.guildId, num, i.user.id);

    if (prev?.vote === vote) {
      db.prepare('DELETE FROM suggestion_votes WHERE guild = ? AND num = ? AND user = ?').run(
        i.guildId,
        num,
        i.user.id,
      );
    } else {
      db.prepare('INSERT OR REPLACE INTO suggestion_votes VALUES(?,?,?,?)').run(
        i.guildId,
        num,
        i.user.id,
        vote,
      );
    }

    return i.update(render({ ...row, author_name: authorName(i.message) }));
  }

  if (!i.memberPermissions.has(P.ManageMessages)) {
    return i.reply({
      content: 'Only moderators can approve or deny suggestions.',
      ephemeral: true,
    });
  }

  const status = action === 'ok' ? 'approved' : 'denied';
  db.prepare('UPDATE suggestions SET status = ? WHERE guild = ? AND num = ?').run(
    status,
    i.guildId,
    num,
  );
  return i.update(render({ ...row, status, author_name: authorName(i.message) }));
}

// the footer already holds the name, reuse it so we don't need to fetch the user again
const authorName = msg => (msg.embeds[0]?.footer?.text || '').replace('Suggested by ', '');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('suggest')
      .setDescription('Suggestions for this server')
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('new')
          .setDescription('Post a suggestion')
          .addStringOption(o =>
            o
              .setName('text')
              .setDescription('Your idea')
              .setRequired(true)
              .setMinLength(10)
              .setMaxLength(1500)))
      .addSubcommand(s =>
        s
          .setName('setup')
          .setDescription('Choose where suggestions are posted (needs Manage Server)')
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription('Suggestion channel')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)))
      .addSubcommand(s =>
        s.setName('off').setDescription('Turn suggestions off (needs Manage Server)')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;

      if (sub === 'setup' || sub === 'off') {
        if (!i.memberPermissions.has(P.ManageGuild))
          return i.reply({ content: 'You need the Manage Server permission.', ephemeral: true });

        if (sub === 'off') {
          store.setSetting(g, 'suggest_channel', null);
          return i.reply({ content: 'Suggestions turned off.', ephemeral: true });
        }

        const ch = i.options.getChannel('channel');

        if (!ch.permissionsFor(i.guild.members.me)?.has(
          ['ViewChannel', 'SendMessages', 'EmbedLinks'],
        )) {
          return i.reply({
            content: `I can't send embeds in ${ch}. Give me View Channel, Send Messages and Embed Links there.`,
            ephemeral: true,
          });
        }

        store.setSetting(g, 'suggest_channel', ch.id);
        return i.reply({
          content: `Suggestions will be posted in ${ch}. Members use \`/suggest new\`.`,
          ephemeral: true,
        });
      }

      const channel = i.guild.channels.cache.get(store.settings(g).suggest_channel);
      if (!channel)
        return i.reply({
          content: 'Suggestions are not turned on in this server.',
          ephemeral: true,
        });

      const key = `${g}:${i.user.id}`;
      const wait = 60000 - (Date.now() - (lastSent.get(key) || 0));
      if (wait > 0)
        return i.reply({
          content: `Please wait ${Math.ceil(wait / 1000)} more seconds.`,
          ephemeral: true,
        });
      lastSent.set(key, Date.now());

      const num = db.prepare(
        'SELECT COALESCE(MAX(num), 0) + 1 n FROM suggestions WHERE guild = ?',
      ).get(g).n;
      const row = {
        guild: g,
        num,
        author: i.user.id,
        text: i.options.getString('text'),
        status: 'open',
        author_name: i.user.tag,
      };
      const sent = await channel.send({
        ...render(row),
        allowedMentions: { parse: [] },
      }).catch(() => null);
      if (!sent)
        return i.reply({ content: 'I could not post in the suggestion channel.', ephemeral: true });

      db.prepare(
        'INSERT INTO suggestions(guild,num,author,text,status,channel,msg,at) VALUES(?,?,?,?,?,?,?,?)',
      ).run(g, num, i.user.id, row.text, 'open', channel.id, sent.id, Date.now());
      return i.reply({
        content: `Your suggestion was posted as #${num} in ${channel}.`,
        ephemeral: true,
      });
    },
  },
];

const recent = (guild, limit = 20) =>
  db.prepare('SELECT * FROM suggestions WHERE guild = ? ORDER BY num DESC LIMIT ?').all(
    guild,
    limit,
  );

module.exports = { commands, handleComponent, recent };
