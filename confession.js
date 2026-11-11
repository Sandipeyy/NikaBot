// Anonymous confessions. Posts never show the author, but the id is stored so moderators
// can deal with rule-breaking posts (/confession reveal). Members are told this in the footer.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits: P,
} = require('discord.js');
const store = require('./db');
const { db } = store;

db.exec(
  `
CREATE TABLE IF NOT EXISTS confessions (
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
CREATE TABLE IF NOT EXISTS confession_blocks (
  guild TEXT,
  user TEXT,
  PRIMARY KEY (guild, user)
);
`,
);

const COOLDOWN = 5 * 60 * 1000;
const lastSent = new Map();
const INVITE = /(discord\.gg|discord(app)?\.com\/invite)\/\S+/i;

setInterval(() => {
  const now = Date.now();
  for (const [k, t] of lastSent) if (now - t > COOLDOWN) lastSent.delete(k);
}, 60000).unref();

const FOOTER = 'Sent anonymously. Moderators can look up the sender if a post breaks the rules.';

function confessionEmbed(num, text) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Anonymous confession #${num}`)
    .setDescription(text)
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

const openButton = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('conf:new')
      .setLabel('Confess')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🤫'),
  );

function nextNumber(guild) {
  return db.prepare('SELECT COALESCE(MAX(num), 0) + 1 n FROM confessions WHERE guild = ?').get(
    guild,
  ).n;
}

async function publish(guild, row) {
  const s = store.settings(guild.id);
  const channel = guild.channels.cache.get(s.confession_channel);
  if (!channel) throw new Error('The confession channel is missing.');
  const sent = await channel.send({
    embeds: [confessionEmbed(row.num, row.text)],
    allowedMentions: { parse: [] },
  });
  db.prepare(
    "UPDATE confessions SET status = 'posted', channel = ?, msg = ? WHERE guild = ? AND num = ?",
  ).run(channel.id, sent.id, guild.id, row.num);
}

// shared by /confess, the Confess button and the modal. returns the text to show the member.
async function submit(guild, user, raw) {
  const s = store.settings(guild.id);
  if (!s.confession_channel) return 'Confessions are not turned on in this server.';

  if (db.prepare('SELECT 1 FROM confession_blocks WHERE guild = ? AND user = ?').get(
    guild.id,
    user.id,
  )) {
    return 'You cannot send confessions in this server.';
  }

  const text = String(raw || '').trim();
  if (text.length < 10) return 'Write at least 10 characters.';
  if (text.length > 1500) return 'That is too long. Keep it under 1500 characters.';
  if (INVITE.test(text)) return 'Invite links are not allowed in confessions.';

  const key = `${guild.id}:${user.id}`;
  const wait = COOLDOWN - (Date.now() - (lastSent.get(key) || 0));
  if (wait > 0)
    return `Please wait ${Math.ceil(wait / 60000)} more minute(s) before confessing again.`;
  lastSent.set(key, Date.now());

  const num = nextNumber(guild.id);
  const review = s.confession_review && guild.channels.cache.get(s.confession_review);
  db.prepare('INSERT INTO confessions(guild,num,author,text,status,at) VALUES(?,?,?,?,?,?)').run(
    guild.id,
    num,
    user.id,
    text,
    'pending',
    Date.now(),
  );

  if (review) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`conf:ok:${num}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`conf:no:${num}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger),
    );
    const embed = confessionEmbed(num, text).setFooter({
      text: 'Waiting for review. The sender is hidden.',
    });

    try {
      await review.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
      return `Your confession #${num} was sent to the moderators for review.`;
    } catch {
      db.prepare("UPDATE confessions SET status = 'failed' WHERE guild = ? AND num = ?").run(
        guild.id,
        num,
      );
      return 'I could not reach the review channel. Please tell a moderator.';
    }
  }

  try {
    await publish(guild, { num, text });
    return `Your confession was posted as #${num}.`;
  } catch {
    db.prepare("UPDATE confessions SET status = 'failed' WHERE guild = ? AND num = ?").run(
      guild.id,
      num,
    );
    return 'I could not post in the confession channel. Please tell a moderator.';
  }
}

async function handleComponent(i) {
  if (i.customId === 'conf:new') {
    const modal = new ModalBuilder().setCustomId('conf:modal').setTitle('Anonymous confession');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel('Your confession')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1500)
          .setRequired(true),
      ),
    );
    return i.showModal(modal);
  }

  if (i.customId === 'conf:modal' && i.isModalSubmit()) {
    await i.deferReply({ ephemeral: true });
    return i.editReply(await submit(i.guild, i.user, i.fields.getTextInputValue('text')));
  }

  // approve / reject from the review channel
  const [, action, numText] = i.customId.split(':');

  if (!i.memberPermissions.has(P.ManageMessages)) {
    return i.reply({ content: 'Only moderators can review confessions.', ephemeral: true });
  }

  const num = Number(numText);
  const row = db.prepare('SELECT * FROM confessions WHERE guild = ? AND num = ?').get(
    i.guildId,
    num,
  );

  if (!row || row.status !== 'pending') {
    return i.update({ content: 'This confession was already handled.', components: [] });
  }

  if (action === 'no') {
    db.prepare("UPDATE confessions SET status = 'rejected' WHERE guild = ? AND num = ?").run(
      i.guildId,
      num,
    );
    return i.update({ content: `Rejected by ${i.user}.`, components: [] });
  }

  try {
    await publish(i.guild, row);
    return i.update({ content: `Approved by ${i.user}.`, components: [] });
  } catch (e) {
    return i.reply({ content: `Could not post it: ${e.message}`, ephemeral: true });
  }
}

// ---------- helpers for the dashboard
const list = (guild, limit = 30) =>
  db.prepare('SELECT * FROM confessions WHERE guild = ? ORDER BY num DESC LIMIT ?').all(
    guild,
    limit,
  );
const counts = guild =>
  db.prepare('SELECT status, COUNT(*) n FROM confessions WHERE guild = ? GROUP BY status').all(
    guild,
  );
const blocked = guild =>
  db.prepare('SELECT user FROM confession_blocks WHERE guild = ?').all(guild).map(r => r.user);
const block = (guild, user) =>
  db.prepare('INSERT OR IGNORE INTO confession_blocks VALUES(?,?)').run(guild, user);
const unblock = (guild, user) =>
  db.prepare('DELETE FROM confession_blocks WHERE guild = ? AND user = ?').run(guild, user);

async function remove(guild, num) {
  const row = db.prepare('SELECT * FROM confessions WHERE guild = ? AND num = ?').get(
    guild.id,
    num,
  );
  if (!row) return false;

  if (row.channel && row.msg) {
    const ch = guild.channels.cache.get(row.channel);
    await ch?.messages.delete(row.msg).catch(() => {});
  }

  db.prepare("UPDATE confessions SET status = 'deleted' WHERE guild = ? AND num = ?").run(
    guild.id,
    num,
  );
  return true;
}

function postPanel(guild) {
  const s = store.settings(guild.id);
  const channel = guild.channels.cache.get(s.confession_channel);
  if (!channel) throw new Error('Choose a confession channel first.');

  return channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Anonymous confessions')
        .setDescription(
          'Press the button, write what is on your mind and it will be posted here without your name.\nBe kind: hateful or harmful posts will be removed.',
        ),
    ],
    components: [openButton()],
  });
}

const manage = P.ManageGuild;

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('confess')
      .setDescription('Post an anonymous confession in this server')
      .setDMPermission(false)
      .addStringOption(o =>
        o
          .setName('text')
          .setDescription('What do you want to confess?')
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1500)),
    run: async (i) => {
      await i.deferReply({ ephemeral: true });
      return i.editReply(await submit(i.guild, i.user, i.options.getString('text')));
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('confession')
      .setDescription('Manage anonymous confessions')
      .setDefaultMemberPermissions(manage)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('setup')
          .setDescription('Choose the confession channel (and an optional review channel)')
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription('Where confessions are posted')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true))
          .addChannelOption(o =>
            o
              .setName('review')
              .setDescription('Moderators approve each confession here first')
              .addChannelTypes(ChannelType.GuildText)))
      .addSubcommand(s =>
        s.setName('panel').setDescription('Post a button members can press to confess'))
      .addSubcommand(s =>
        s
          .setName('reveal')
          .setDescription('Show who sent a confession (logged in the mod-log)')
          .addIntegerOption(o =>
            o
              .setName('number')
              .setDescription('Confession number')
              .setRequired(true)
              .setMinValue(1)))
      .addSubcommand(s =>
        s
          .setName('delete')
          .setDescription('Delete a posted confession')
          .addIntegerOption(o =>
            o
              .setName('number')
              .setDescription('Confession number')
              .setRequired(true)
              .setMinValue(1)))
      .addSubcommand(s =>
        s
          .setName('block')
          .setDescription('Stop a member from sending confessions')
          .addUserOption(o =>
            o.setName('user').setDescription('Member to block').setRequired(true)))
      .addSubcommand(s =>
        s
          .setName('unblock')
          .setDescription('Let a member send confessions again')
          .addUserOption(o =>
            o.setName('user').setDescription('Member to unblock').setRequired(true)))
      .addSubcommand(s => s.setName('off').setDescription('Turn confessions off')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;

      if (sub === 'off') {
        store.setSetting(g, 'confession_channel', null);
        return i.reply({ content: 'Confessions turned off.', ephemeral: true });
      }

      if (sub === 'setup') {
        const channel = i.options.getChannel('channel');
        const review = i.options.getChannel('review');

        for (const c of [channel, review].filter(Boolean)) {
          if (!c.permissionsFor(i.guild.members.me)?.has(
            ['ViewChannel', 'SendMessages', 'EmbedLinks'],
          )) {
            return i.reply({
              content: `I can't send embeds in ${c}. Give me View Channel, Send Messages and Embed Links there.`,
              ephemeral: true,
            });
          }
        }

        store.setSetting(g, 'confession_channel', channel.id);
        store.setSetting(g, 'confession_review', review ? review.id : null);
        return i.reply({
          content: `Confessions will be posted in ${channel}${review ? ` after moderators approve them in ${review}` : ''}. Members use \`/confess\`. Run \`/confession panel\` to add a button.`,
          ephemeral: true,
        });
      }

      if (sub === 'panel') {
        try {
          await postPanel(i.guild);
          return i.reply({ content: 'Posted the confession button.', ephemeral: true });
        } catch (e) {
          return i.reply({ content: e.message, ephemeral: true });
        }
      }

      if (sub === 'block' || sub === 'unblock') {
        const user = i.options.getUser('user');

        if (sub === 'block') block(g, user.id);
        else unblock(g, user.id);

        return i.reply({
          content: `${user} can ${sub === 'block' ? 'no longer' : 'now'} send confessions.`,
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
      }

      const num = i.options.getInteger('number');
      const row = db.prepare('SELECT * FROM confessions WHERE guild = ? AND num = ?').get(g, num);
      if (!row) return i.reply({ content: `There is no confession #${num}.`, ephemeral: true });

      if (sub === 'delete') {
        await remove(i.guild, num);
        return i.reply({ content: `Confession #${num} deleted.`, ephemeral: true });
      }

      // reveal: leave a trace so moderators can't do it unnoticed
      const modlog =
        store.settings(g).modlog_channel
          && i.guild.channels.cache.get(store.settings(g).modlog_channel);

      modlog?.send({
        content: `🔎 ${i.user} revealed the sender of confession #${num}.`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
      return i.reply({
        content: `Confession #${num} was sent by <@${row.author}> (\`${row.author}\`).`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
    },
  },
];

module.exports = {
  commands,
  handleComponent,
  postPanel,
  list,
  counts,
  blocked,
  block,
  unblock,
  remove,
};
