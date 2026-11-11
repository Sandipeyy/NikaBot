// /modlog and /logs: send what happens in the server to a channel.
// modlog = moderation actions, logs = everything else (messages, members, roles, channels, voice, bans).
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require(
  'discord.js',
);
const store = require('./db');

const CATEGORIES = {
  messages: ['log_messages', 'Message edits and deletes'],
  members: ['log_members', 'Joins, leaves, nicknames, roles and timeouts'],
  roles: ['log_roles', 'Role created, deleted or changed'],
  channels: ['log_channels', 'Channel created, deleted or renamed'],
  voice: ['log_voice', 'Voice channel joins, leaves and moves'],
  bans: ['log_bans', 'Bans and unbans'],
};

const COLORS = { green: 0x23a55a, red: 0xed4245, blue: 0x5865f2, orange: 0xe67e22, grey: 0x80848e };

// at most 15 log posts per guild every 10 seconds so a raid can't flood the channel
const buckets = new Map();

function allowed(guildId) {
  const now = Date.now();
  const b = buckets.get(guildId);

  if (!b || b.reset < now) {
    buckets.set(guildId, { n: 1, reset: now + 10000 });
    return true;
  }

  return ++b.n <= 15;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60000).unref();

// post an embed to the log channel if that category is switched on
async function sendLog(guild, category, embed) {
  const s = store.settings(guild.id);
  if (!s.logs_channel || !s[CATEGORIES[category][0]]) return;
  const channel = guild.channels.cache.get(s.logs_channel);
  if (!channel || !allowed(guild.id)) return;
  const perms = channel.permissionsFor(guild.members.me);
  if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) return;
  embed.setTimestamp();
  channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

const box = text => '```\n' + String(text).replace(/```/g, "'''").slice(0, 900) + '\n```';
const who = u => `${u} (${u.tag ?? u.username})\n\`${u.id}\``;
const E = color => new EmbedBuilder().setColor(color);

// ---------- events
function listen(client) {
  client.on('messageDelete', m => {
    if (!m.guild || m.author?.bot) return;
    const e = E(COLORS.red).setTitle('Message deleted');

    if (m.partial || !m.author) {
      e.setDescription(
        `A message was deleted in ${m.channel}. It was too old to show what it said.`,
      );
    } else {
      e.setDescription(`By ${who(m.author)} in ${m.channel}`);
      if (m.content) e.addFields({ name: 'Content', value: box(m.content) });
      if (m.attachments.size)
        e.addFields({
          name: 'Attachments',
          value: [...m.attachments.values()].map(a => a.name).join(', ').slice(0, 500),
        });
    }

    sendLog(m.guild, 'messages', e);
  });

  client.on('messageUpdate', (before, after) => {
    if (!after.guild || !after.author || after.author.bot || before.content === after.content)
      return;
    if (before.partial || !before.content) return;
    const e = E
      (COLORS.orange)
      .setTitle('Message edited')
      .setDescription(`By ${who(after.author)} in ${after.channel} · [jump](${after.url})`)
      .addFields(
        { name: 'Before', value: box(before.content) },
        { name: 'After', value: box(after.content || '(empty)') },
      );
    sendLog(after.guild, 'messages', e);
  });

  client.on('messageDeleteBulk', (msgs, channel) => {
    if (!channel.guild) return;
    const e = E(COLORS.red).setTitle('Messages purged').setDescription(
      `${msgs.size} messages were deleted in ${channel}.`,
    );
    sendLog(channel.guild, 'messages', e);
  });

  client.on('guildMemberAdd', m => {
    const age = Math.floor(m.user.createdTimestamp / 1000);
    const e = E
      (COLORS.green)
      .setTitle('Member joined')
      .setThumbnail(m.user.displayAvatarURL())
      .setDescription(`${who(m.user)}\nAccount created <t:${age}:R>`)
      .setFooter({ text: `${m.guild.memberCount} members` });

    sendLog(m.guild, 'members', e);
  });

  client.on('guildMemberRemove', m => {
    const roles = m.roles?.cache.filter(r => r.id !== m.guild.id).map(r => r.toString()).join(' ');
    const e = E
      (COLORS.red)
      .setTitle('Member left')
      .setThumbnail(m.user.displayAvatarURL())
      .setDescription(who(m.user));
    if (roles) e.addFields({ name: 'Roles', value: roles.slice(0, 1000) });
    sendLog(m.guild, 'members', e);
  });

  client.on('guildMemberUpdate', (before, after) => {
    if (before.partial) return;
    const base = () =>
      E(COLORS.blue).setAuthor({ name: after.user.tag, iconURL: after.user.displayAvatarURL() });

    if (before.nickname !== after.nickname) {
      sendLog(
        after.guild,
        'members',
        base().setTitle('Nickname changed').addFields(
          { name: 'Before', value: before.nickname || '(none)', inline: true },
          { name: 'After', value: after.nickname || '(none)', inline: true },
        ),
      );
    }

    const added = after.roles.cache.filter(r => !before.roles.cache.has(r.id));
    const removed = before.roles.cache.filter(r => !after.roles.cache.has(r.id));

    if (added.size || removed.size) {
      const e = base().setTitle('Roles changed');
      if (added.size) e.addFields({ name: 'Added', value: added.map(r => r.toString()).join(' ') });
      if (removed.size)
        e.addFields({ name: 'Removed', value: removed.map(r => r.toString()).join(' ') });
      sendLog(after.guild, 'members', e);
    }

    if (before.communicationDisabledUntilTimestamp !== after.communicationDisabledUntilTimestamp) {
      const until = after.communicationDisabledUntilTimestamp;
      sendLog(
        after.guild,
        'members',
        base().setTitle(
          until && until > Date.now() ? 'Member timed out' : 'Timeout removed',
        ).setDescription(
          until && until > Date.now()
            ? `Until <t:${Math.floor(until / 1000)}:f>`
            : 'The timeout ended or was removed.',
        ),
      );
    }
  });

  client.on('guildBanAdd', async (ban) => {
    const e = E(COLORS.red).setTitle('Member banned').setDescription(who(ban.user));
    const full = await ban.fetch().catch(() => null);
    if (full?.reason) e.addFields({ name: 'Reason', value: full.reason.slice(0, 500) });
    sendLog(ban.guild, 'bans', e);
  });

  client.on('guildBanRemove', ban => {
    sendLog(
      ban.guild,
      'bans',
      E(COLORS.green).setTitle('Member unbanned').setDescription(who(ban.user)),
    );
  });

  client.on('roleCreate', r => {
    sendLog(
      r.guild,
      'roles',
      E(COLORS.green).setTitle('Role created').setDescription(`${r} (${r.name})`),
    );
  });

  client.on('roleDelete', r => {
    sendLog(
      r.guild,
      'roles',
      E(COLORS.red).setTitle('Role deleted').setDescription(`**${r.name}**`),
    );
  });

  client.on('roleUpdate', (a, b) => {
    const changes = [];
    if (a.name !== b.name) changes.push(`Name: **${a.name}** → **${b.name}**`);
    if (a.color !== b.color)
      changes.push(
        `Color: #${a.color.toString(16).padStart(6, '0')} → #${b.color.toString(16).padStart(6, '0')}`,
      );

    if (!a.permissions.equals(b.permissions)) {
      const diff = a.permissions.missing(b.permissions).concat(
        b.permissions.missing(a.permissions),
      );
      changes.push(
        `Permissions changed (${diff.slice(0, 6).join(', ')}${diff.length > 6 ? ', …' : ''})`,
      );
    }

    if (changes.length)
      sendLog(
        b.guild,
        'roles',
        E(COLORS.blue).setTitle('Role updated').setDescription(`${b}\n${changes.join('\n')}`),
      );
  });

  client.on('channelCreate', c => {
    if (!c.guild) return;
    sendLog(
      c.guild,
      'channels',
      E(COLORS.green).setTitle('Channel created').setDescription(`${c} (${c.name})`),
    );
  });

  client.on('channelDelete', c => {
    if (!c.guild) return;
    sendLog(
      c.guild,
      'channels',
      E(COLORS.red).setTitle('Channel deleted').setDescription(`**#${c.name}**`),
    );
  });

  client.on('channelUpdate', (a, b) => {
    if (!b.guild || a.name === b.name) return;

    sendLog(
      b.guild,
      'channels',
      E(COLORS.blue).setTitle('Channel renamed').setDescription(
        `${b}\n**${a.name}** → **${b.name}**`,
      ),
    );
  });

  client.on('voiceStateUpdate', (a, b) => {
    const guild = b.guild || a.guild;
    const user = b.member?.user || a.member?.user;
    if (!guild || !user || user.bot || a.channelId === b.channelId) return;
    let text;

    if (!a.channelId) text = `${user} joined ${b.channel}`;
    else if (!b.channelId) text = `${user} left ${a.channel}`;
    else text = `${user} moved from ${a.channel} to ${b.channel}`;

    sendLog(guild, 'voice', E(COLORS.grey).setTitle('Voice activity').setDescription(text));
  });
}

// ---------- commands
const manage = PermissionFlagsBits.ManageGuild;

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('modlog')
      .setDescription('Choose where moderation actions are logged')
      .setDefaultMemberPermissions(manage)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('set')
          .setDescription('Log bans, kicks, warns, timeouts and removed messages in a channel')
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription('Channel for the mod-log')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)))
      .addSubcommand(s => s.setName('off').setDescription('Stop logging moderation actions'))
      .addSubcommand(s => s.setName('status').setDescription('Show the current mod-log channel')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const s = store.settings(i.guildId);

      if (sub === 'status') {
        return i.reply({
          content:
            s.modlog_channel
              ? `Mod-log is going to <#${s.modlog_channel}>.`
              : 'Mod-log is turned off.',
          ephemeral: true,
        });
      }

      if (sub === 'off') {
        store.setSetting(i.guildId, 'modlog_channel', null);
        return i.reply({ content: 'Mod-log turned off.', ephemeral: true });
      }

      const channel = i.options.getChannel('channel');
      const perms = channel.permissionsFor(i.guild.members.me);

      if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return i.reply({
          content: `I can't send embeds in ${channel}. Give me View Channel, Send Messages and Embed Links there first.`,
          ephemeral: true,
        });
      }

      store.setSetting(i.guildId, 'modlog_channel', channel.id);
      return i.reply({
        content: `Moderation actions will be logged in ${channel}.`,
        ephemeral: true,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('logs')
      .setDescription('Log messages, members, roles, channels, voice and bans')
      .setDefaultMemberPermissions(manage)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('setup')
          .setDescription('Pick the channel for server logs')
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription('Channel for logs')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)))
      .addSubcommand(s =>
        s
          .setName('toggle')
          .setDescription('Turn one type of log on or off')
          .addStringOption(o =>
            o
              .setName('type')
              .setDescription('What to log')
              .setRequired(true)
              .addChoices(
                ...Object.entries(CATEGORIES).map(([k, v]) => ({
                  name: `${k}: ${v[1]}`.slice(0, 100),
                  value: k,
                })),
              ))
          .addBooleanOption(o =>
            o.setName('enabled').setDescription('On or off').setRequired(true)))
      .addSubcommand(s => s.setName('status').setDescription('Show what is being logged'))
      .addSubcommand(s => s.setName('off').setDescription('Turn logging off')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;

      if (sub === 'setup') {
        const channel = i.options.getChannel('channel');
        const perms = channel.permissionsFor(i.guild.members.me);

        if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
          return i.reply({
            content: `I can't send embeds in ${channel}. Give me View Channel, Send Messages and Embed Links there first.`,
            ephemeral: true,
          });
        }

        store.setSetting(g, 'logs_channel', channel.id);
        return i.reply({
          content: `Logs will go to ${channel}. Use \`/logs toggle\` to choose what is logged, or the dashboard.`,
          ephemeral: true,
        });
      }

      if (sub === 'off') {
        store.setSetting(g, 'logs_channel', null);
        return i.reply({ content: 'Logging turned off.', ephemeral: true });
      }

      if (sub === 'toggle') {
        const [column, label] = CATEGORIES[i.options.getString('type')];
        const on = i.options.getBoolean('enabled');
        store.setSetting(g, column, on ? 1 : 0);
        return i.reply({ content: `${label}: **${on ? 'on' : 'off'}**.`, ephemeral: true });
      }

      const s = store.settings(g);
      const lines = Object.entries(CATEGORIES).map((
        [k, [col, label]],
      ) => `${s[col] ? '✅' : '⬜'} **${k}** · ${label}`);

      return i.reply({
        embeds: [
          E(COLORS.blue).setTitle('Server logs').setDescription(
            `Channel: ${s.logs_channel ? `<#${s.logs_channel}>` : '**not set**'}\n\n${lines.join('\n')}`,
          ),
        ],
        ephemeral: true,
      });
    },
  },
];

module.exports = { commands, listen, sendLog, CATEGORIES };
