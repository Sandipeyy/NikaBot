// Honeypot channel: nobody should ever type in it. Spam bots and hacked accounts do,
// so whoever posts there is punished automatically.
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits: P } = require(
  'discord.js',
);
const store = require('./db');
const { db } = store;

db.exec(
  `
CREATE TABLE IF NOT EXISTS honeypot_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild TEXT,
  user TEXT,
  tag TEXT,
  action TEXT,
  content TEXT,
  ok INTEGER,
  at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_honeypot ON honeypot_log(guild, at DESC);
`,
);

const ACTIONS = {
  ban: 'Ban',
  softban: 'Softban (ban and unban to wipe their messages)',
  kick: 'Kick',
  timeout: 'Timeout for 7 days',
};

const EXEMPT = [P.Administrator, P.ManageGuild, P.ManageMessages, P.BanMembers, P.KickMembers];

function noticeEmbed(action) {
  const verb =
    { ban: 'banned', softban: 'banned and unbanned', kick: 'kicked', timeout: 'timed out' }[action]
      || 'removed';

  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Do not type in this channel')
    .setDescription(
      `This channel is a trap for spam bots and hacked accounts.\n\n**Anyone who sends a message here is automatically ${verb}.** Please mute the channel and move on.`,
    );
}

async function postNotice(channel, action) {
  return channel.send({ embeds: [noticeEmbed(action)] });
}

// called for every guild message. returns true if the message was handled.
function check(m, s) {
  if (!s.honeypot_channel || m.channelId !== s.honeypot_channel) return false;
  if (m.author.bot || !m.member) return false;
  if (m.member.permissions.any(EXEMPT) || m.author.id === m.guild.ownerId) return false;
  catchUser(m, s).catch(e => console.error('[honeypot]', e.message));
  return true;
}

async function catchUser(m, s) {
  const action = s.honeypot_action || 'ban';
  const member = m.member;
  const reason = 'Honeypot: sent a message in the trap channel';
  let ok = 1;

  // can't act on someone above the bot's role
  const me = m.guild.members.me;
  const tooHigh = member.roles.highest.position >= me.roles.highest.position;

  // delete first so scam links disappear straight away
  await m.delete().catch(() => {});

  if (tooHigh) {
    ok = 0;
  } else {
    await member.send(
      `You were removed from **${m.guild.name}** automatically for posting in its honeypot channel. If your account was hacked, change your password, then you can rejoin.`,
    ).catch(() => {});

    try {
      if (action === 'ban') await member.ban({ deleteMessageSeconds: 3600, reason });
      else if (action === 'softban') {
        await member.ban({ deleteMessageSeconds: 86400, reason });
        await m.guild.members.unban(member.id, 'Honeypot softban').catch(() => {});
      } else if (action === 'kick') await member.kick(reason);
      else await member.timeout(7 * 864e5, reason);
    } catch {
      ok = 0;
    }
  }

  const type = action === 'timeout' ? 'timeout' : action === 'kick' ? 'kick' : 'ban';

  if (ok) {
    const num = require('./upgrades').newCase(
      m.guild.id,
      type,
      m.author.id,
      m.client.user.id,
      reason,
    );
    await announce(m, action, num, ok);
  } else {
    await announce(m, action, null, ok);
  }

  db.prepare(
    'INSERT INTO honeypot_log(guild,user,tag,action,content,ok,at) VALUES(?,?,?,?,?,?,?)',
  ).run(
    m.guild.id,
    m.author.id,
    m.author.tag,
    action,
    (m.content || '').slice(0, 300),
    ok,
    Date.now(),
  );
}

async function announce(m, action, num, ok) {
  const s = store.settings(m.guild.id);
  const embed = new EmbedBuilder()
    .setColor(ok ? 0xed4245 : 0xe67e22)
    .setAuthor({ name: num ? `Case #${num} · honeypot` : 'Honeypot' })
    .setDescription(
      ok
        ? `🍯 **${m.author.tag}** (${m.author.id}) posted in the honeypot and was removed (${action}).`
        : `🍯 **${m.author.tag}** (${m.author.id}) posted in the honeypot but I could not ${action} them. Check my role position and permissions.`,
    )
    .setTimestamp();

  if (m.content)
    embed.addFields({
      name: 'Message',
      value: '```\n' + m.content.replace(/```/g, "'''").slice(0, 900) + '\n```',
    });

  const modlog = s.modlog_channel && m.guild.channels.cache.get(s.modlog_channel);
  modlog?.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

function recent(guildId, limit = 15) {
  return db.prepare('SELECT * FROM honeypot_log WHERE guild = ? ORDER BY at DESC LIMIT ?').all(
    guildId,
    limit,
  );
}

const total = guildId =>
  db.prepare('SELECT COUNT(*) n FROM honeypot_log WHERE guild = ?').get(guildId).n;

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('honeypot')
      .setDescription('Trap channel that removes spam bots and hacked accounts')
      .setDefaultMemberPermissions(P.ManageGuild)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('setup')
          .setDescription('Turn a channel into a honeypot (a new one is created if you pick none)')
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription('Existing channel to use')
              .addChannelTypes(ChannelType.GuildText))
          .addStringOption(o =>
            o
              .setName('action')
              .setDescription('What happens to whoever posts there (default: ban)')
              .addChoices(...Object.entries(ACTIONS).map(([value, name]) => ({ name, value })))))
      .addSubcommand(s =>
        s
          .setName('action')
          .setDescription('Change what happens to people who post in the honeypot')
          .addStringOption(o =>
            o
              .setName('action')
              .setDescription('New action')
              .setRequired(true)
              .addChoices(...Object.entries(ACTIONS).map(([value, name]) => ({ name, value })))))
      .addSubcommand(s =>
        s.setName('status').setDescription('Show the honeypot settings and recent catches'))
      .addSubcommand(s => s.setName('off').setDescription('Turn the honeypot off')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;
      const s = store.settings(g);

      if (sub === 'off') {
        store.setSetting(g, 'honeypot_channel', null);
        return i.reply({
          content: 'Honeypot turned off. The channel itself was not deleted.',
          ephemeral: true,
        });
      }

      if (sub === 'action') {
        const action = i.options.getString('action');
        store.setSetting(g, 'honeypot_action', action);
        return i.reply({
          content: `Honeypot action set to **${ACTIONS[action]}**.`,
          ephemeral: true,
        });
      }

      if (sub === 'status') {
        const rows = recent(g, 5);
        const lines =
          rows.length
            ? rows.map(r => `<t:${Math.floor(r.at / 1000)}:R> **${r.tag}** (${r.action}${r.ok ? '' : ', failed'})`).join(
              '\n',
            )
            : 'No one has fallen for it yet.';

        return i.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('Honeypot')
              .addFields(
                {
                  name: 'Channel',
                  value: s.honeypot_channel ? `<#${s.honeypot_channel}>` : 'Not set',
                  inline: true,
                },
                {
                  name: 'Action',
                  value: ACTIONS[s.honeypot_action || 'ban'].split(' (')[0],
                  inline: true,
                },
                { name: 'Caught so far', value: String(total(g)), inline: true },
                { name: 'Latest', value: lines },
              ),
          ],
          ephemeral: true,
        });
      }

      // setup
      const action = i.options.getString('action') || s.honeypot_action || 'ban';
      const me = i.guild.members.me;
      const needed =
        action === 'timeout' ? P.ModerateMembers : action === 'kick' ? P.KickMembers : P.BanMembers;

      if (!me.permissions.has([needed, P.ManageMessages])) {
        return i.reply({
          content:
            'I need the Manage Messages permission and the permission for that action (Ban Members, Kick Members or Moderate Members).',
          ephemeral: true,
        });
      }

      await i.deferReply({ ephemeral: true });
      let channel = i.options.getChannel('channel');
      let created = false;

      if (!channel) {
        channel = await i.guild.channels.create({
          name: 'do-not-type-here',
          type: ChannelType.GuildText,
          topic: 'Honeypot: anyone who types here is removed automatically.',
          reason: 'Honeypot setup',
        });
        created = true;
      }

      store.setSetting(g, 'honeypot_channel', channel.id);
      store.setSetting(g, 'honeypot_action', action);
      await postNotice(channel, action).catch(() => {});

      return i.editReply(
        `Honeypot is active in ${channel}${created ? ' (new channel)' : ''}. Anyone without moderator permissions who posts there will get: **${ACTIONS[action].split(' (')[0]}**.\n`
          + 'Tip: put the channel near the top of the list so bots find it first, and set a mod-log with `/modlog set` to see every catch.',
      );
    },
  },
];

module.exports = { commands, check, postNotice, recent, total, ACTIONS };
