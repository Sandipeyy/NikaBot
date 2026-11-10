const {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits: P,
} = require('discord.js');
const store = require('./db');
const fmt = (t, user, guild) =>
  String
    (t || '{user}')
    .replaceAll('{user}', `<@${user.id}>`)
    .replaceAll('{server}', guild.name)
    .replaceAll('{count}', guild.memberCount);

// sends the welcome/goodbye message (and card), used by the join/leave events and /welcome test
async function sendGreeting(m, kind, channel) {
  const s = store.settings(m.guild.id);
  const ch = channel || s[kind + '_channel'] && m.guild.channels.cache.get(s[kind + '_channel']);
  if (!ch?.isTextBased()) return false;
  const p = { content: fmt(s[kind + '_msg'], m.user, m.guild) };

  if (s[kind + '_img']) {
    try {
      p.files = [
        new AttachmentBuilder(
          await require('./card').render(
            kind,
            s,
            {
              name: m.user.username,
              avatarUrl: m.user.displayAvatarURL({ extension: 'png', size: 256 }),
              server: m.guild.name,
              count: m.guild.memberCount,
            },
          ),
          { name: kind + '.png' },
        ),
      ];
    } catch (e) {
      console.error('[card]', e.message);
    }
  }

  return ch.send(p).then(
    () => true,
    e => {
      console.error('[greet] send failed:', e.message);
      return false;
    },
  );
}

const make = kind => ({
  data: new SlashCommandBuilder()
    .setName(kind)
    .setDescription(`Set up ${kind} messages and image cards`)
    .setDefaultMemberPermissions(P.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s =>
      s
        .setName('channel')
        .setDescription(`Set the ${kind} channel`)
        .addChannelOption(o =>
          o
            .setName('channel')
            .setDescription('Text channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)))
    .addSubcommand(s =>
      s
        .setName('message')
        .setDescription('Set the message ({user} {server} {count})')
        .addStringOption(o =>
          o.setName('text').setDescription('Message').setMaxLength(500).setRequired(true)))
    .addSubcommand(s =>
      s
        .setName('image')
        .setDescription('Turn the image card on or off')
        .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)))
    .addSubcommand(s => s.setName('test').setDescription('Send a preview here'))
    .addSubcommand(s => s.setName('settings').setDescription('Show the current settings'))
    .addSubcommand(s => s.setName('off').setDescription(`Disable ${kind} messages`)),
  run: async (i) => {
    const sub = i.options.getSubcommand();
    const g = i.guildId;

    if (sub === 'channel') {
      const ch = i.options.getChannel('channel');
      store.setSetting(g, kind + '_channel', ch.id);
      return i.reply(`✅ ${kind} channel set to ${ch}. Try \`/${kind} test\`.`);
    }

    if (sub === 'message') {
      store.setSetting(g, kind + '_msg', i.options.getString('text'));
      return i.reply('✅ Message saved.');
    }

    if (sub === 'image') {
      const on = i.options.getBoolean('enabled');
      store.setSetting(g, kind + '_img', on ? 1 : 0);
      return i.reply(
        on
          ? '✅ Image card enabled. Customize the title, colors and background on the website dashboard.'
          : '✅ Image card disabled.',
      );
    }

    if (sub === 'off') {
      store.setSetting(g, kind + '_channel', null);
      return i.reply(`✅ ${kind} messages disabled.`);
    }

    if (sub === 'test') {
      await i.deferReply({ ephemeral: true });
      const ok = await sendGreeting(i.member, kind, i.channel);
      return i.editReply(
        ok
          ? '✅ Sent above.'
          : "❌ I couldn't post here. I need View Channel, Send Messages, Attach Files and Embed Links.",
      );
    }

    const s = store.settings(g);
    i.reply({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`${kind} settings`)
          .addFields(
            {
              name: 'Channel',
              value: s[kind + '_channel'] ? `<#${s[kind + '_channel']}>` : 'Not set',
              inline: true,
            },
            { name: 'Image card', value: s[kind + '_img'] ? 'On' : 'Off', inline: true },
            { name: 'Message', value: String(s[kind + '_msg'] || '').slice(0, 500) || '—' },
          ),
      ],
    });
  },
});

module.exports = { commands: [make('welcome'), make('goodbye')], sendGreeting };
