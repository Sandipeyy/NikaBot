// Starboard: messages that collect enough reactions are copied to a "best of" channel.
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits: P } = require(
  'discord.js',
);
const store = require('./db');
const { db } = store;

db.exec(
  `
CREATE TABLE IF NOT EXISTS starboard (
  guild TEXT,
  message TEXT,
  channel TEXT,
  star_msg TEXT,
  stars INTEGER,
  PRIMARY KEY (guild, message)
);
`,
);

const same = (reaction, emoji) =>
  (reaction.emoji.id ? reaction.emoji.toString() : reaction.emoji.name) === emoji;

async function onReaction(reaction) {
  try {
    if (reaction.partial) await reaction.fetch();
    const msg = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (!msg.guild) return;

    const s = store.settings(msg.guild.id);
    if (!s.starboard_channel || !same(reaction, s.starboard_emoji || '⭐')) return;
    if (msg.channelId === s.starboard_channel || msg.channel.nsfw) return;

    const target = msg.guild.channels.cache.get(s.starboard_channel);
    if (!target) return;

    // don't count the author starring their own message, or bots
    const users = await reaction.users.fetch({ limit: 100 });
    const stars = users.filter(u => !u.bot && u.id !== msg.author?.id).size;

    const row = db.prepare('SELECT * FROM starboard WHERE guild = ? AND message = ?').get(
      msg.guild.id,
      msg.id,
    );
    const need = s.starboard_threshold || 3;
    if (!row && stars < need) return;

    const label = `${s.starboard_emoji || '⭐'} ${stars} · <#${msg.channelId}>`;

    if (row) {
      db.prepare('UPDATE starboard SET stars = ? WHERE guild = ? AND message = ?').run(
        stars,
        msg.guild.id,
        msg.id,
      );
      const post = await target.messages.fetch(row.star_msg).catch(() => null);
      await post?.edit({ content: label });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setAuthor({ name: msg.author?.tag || 'Unknown', iconURL: msg.author?.displayAvatarURL() })
      .setDescription(`${msg.content || ''}\n\n[Jump to message](${msg.url})`.trim())
      .setTimestamp(msg.createdAt);
    const image = msg.attachments.find(a => a.contentType?.startsWith('image/'));
    if (image) embed.setImage(image.url);

    const post = await target.send({
      content: label,
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
    db.prepare('INSERT INTO starboard VALUES(?,?,?,?,?)').run(
      msg.guild.id,
      msg.id,
      msg.channelId,
      post.id,
      stars,
    );
  } catch (e) {
    console.error('[starboard]', e.message);
  }
}

function listen(client) {
  client.on('messageReactionAdd', onReaction);
  client.on('messageReactionRemove', onReaction);
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('starboard')
      .setDescription('Repost popular messages in a best-of channel')
      .setDefaultMemberPermissions(P.ManageGuild)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('setup')
          .setDescription('Choose the channel, how many reactions are needed and the emoji')
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription('Starboard channel')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true))
          .addIntegerOption(o =>
            o
              .setName('stars')
              .setDescription('Reactions needed (default 3)')
              .setMinValue(1)
              .setMaxValue(50))
          .addStringOption(o => o.setName('emoji').setDescription('Emoji to count (default ⭐)')))
      .addSubcommand(s => s.setName('status').setDescription('Show the starboard settings'))
      .addSubcommand(s => s.setName('off').setDescription('Turn the starboard off')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;

      if (sub === 'off') {
        store.setSetting(g, 'starboard_channel', null);
        return i.reply({ content: 'Starboard turned off.', ephemeral: true });
      }

      if (sub === 'status') {
        const s = store.settings(g);
        const total = db.prepare('SELECT COUNT(*) n FROM starboard WHERE guild = ?').get(g).n;
        return i.reply({
          content:
            s.starboard_channel
              ? `Starboard: <#${s.starboard_channel}> · ${s.starboard_emoji || '⭐'} × ${s.starboard_threshold || 3} · ${total} messages so far.`
              : 'The starboard is off.',
          ephemeral: true,
        });
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

      const emoji = (i.options.getString('emoji') || '⭐').trim();
      store.setSetting(g, 'starboard_channel', ch.id);
      store.setSetting(g, 'starboard_threshold', i.options.getInteger('stars') || 3);
      store.setSetting(g, 'starboard_emoji', emoji.slice(0, 60));
      return i.reply({
        content: `Messages with ${i.options.getInteger('stars') || 3} ${emoji} will be copied to ${ch}.`,
        ephemeral: true,
      });
    },
  },
];

module.exports = { commands, listen };
