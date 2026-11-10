// newer versions of the core commands: help menu, info embeds, moderation with cases and mod-log,
// giveaways, polls, streaks, leaderboards
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  version: DJS,
} = require('discord.js');
const store = require('./db');
const { db } = store;
const meta = require('./meta');

const E = (c = 0x5865f2) => new EmbedBuilder().setColor(c);
const pfx = g => g && store.settings(g).prefix || process.env.PREFIX || 'm!';
const ok = u => /^https?:\/\//.test(u || '');
const DUR = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
const parseDur = s => {
  const m = /^(\d+)\s*([smhdw]?)$/i.exec(String(s || '').trim());
  return m ? Number(m[1]) * DUR[(m[2] || 'm').toLowerCase()] : null;
};
const human = ms => {
  const d = Math.floor(ms / 864e5);
  const h = Math.floor(ms % 864e5 / 36e5);
  const m = Math.floor(ms % 36e5 / 6e4);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '<1m';
};
const ts = (ms, f = 'R') => `<t:${Math.floor(ms / 1000)}:${f}>`;
const inviteUrl = () => `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=1099934297175&scope=bot%20applications.commands`;
const linkRow = () => {
  const r = new ActionRowBuilder();
  if (ok(process.env.BASE_URL))
    r.addComponents(
      new ButtonBuilder()
        .setLabel('Website')
        .setStyle(ButtonStyle.Link)
        .setURL(process.env.BASE_URL),
    );
  if (ok(process.env.SUPPORT_URL))
    r.addComponents(
      new ButtonBuilder()
        .setLabel('Support')
        .setStyle(ButtonStyle.Link)
        .setURL(process.env.SUPPORT_URL),
    );
  if (process.env.CLIENT_ID)
    r.addComponents(
      new ButtonBuilder().setLabel('Invite').setStyle(ButtonStyle.Link).setURL(inviteUrl()),
    );
  return r.components.length ? r : null;
};

// help
function helpPayload(client, cat, prefix) {
  const list = client.commandList || [];
  const desc = n => list.find(c => c.data.name === n)?.data.description || '';
  const cats = Object.keys(meta);
  const total = Object.values(meta).flat().length;
  const e = E().setAuthor({
    name: `${client.user.username} help`,
    iconURL: client.user.displayAvatarURL(),
  });

  if (cat && meta[cat])
    e
      .setTitle(cat)
      .setDescription(meta[cat].map(n => `**/${n}** · ${desc(n)}`).join('\n').slice(0, 4000))
      .setFooter({ text: `${prefix}help <command> for usage and shortcuts` });
  else
    e
      .setTitle('Command categories')
      .setDescription(
        `Pick a category below. **${total}** commands, every one also works with the prefix \`${prefix}\`, and many have shortcuts like \`${prefix}cf 100 h\`, \`${prefix}bj 500\`, \`${prefix}hunt\`, \`${prefix}play song\`.`,
      )
      .addFields(
        cats.map(c => ({
          name: c,
          value: meta[c].map(n => `\`${n}\``).join(' ').slice(0, 1000),
          inline: true,
        })),
      )
      .setFooter({ text: `${prefix}help <command> shows usage` });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('help:menu')
    .setPlaceholder('Choose a category…')
    .addOptions(
      [
        { label: 'Overview', value: 'home', emoji: '🏠' },
        ...cats.map(c => ({ label: c, value: c, description: `${meta[c].length} commands` })),
      ],
    );
  const rows = [new ActionRowBuilder().addComponents(menu)];
  const l = linkRow();
  if (l) rows.push(l);
  return { embeds: [e], components: rows };
}

const helpMenu = i =>
  i.update(helpPayload(i.client, i.values[0] === 'home' ? null : i.values[0], pfx(i.guildId)));

// moderation helpers
const CASE = {
  warn: ['warned', '⚠️', 0xf0b232],
  kick: ['kicked', '👢', 0xe67e22],
  ban: ['banned', '🔨', 0xed4245],
  unban: ['unbanned', '✅', 0x23a55a],
  timeout: ['timed out', '🔇', 0xe67e22],
  untimeout: ['unmuted', '🔊', 0x23a55a],
};

function newCase(g, type, user, mod, reason) {
  const num = db.prepare('SELECT COALESCE(MAX(num),0)+1 n FROM cases WHERE guild=?').get(g).n;
  db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?)').run(
    g,
    num,
    type,
    user,
    mod,
    reason,
    Date.now(),
  );
  return num;
}

function guard(i, m) {
  if (!m) return null;
  if (m.id === i.guild.ownerId) return "You can't do that to the server owner.";
  if (m.id === i.user.id) return "You can't do that to yourself.";
  if (m.id === i.client.user.id) return "I can't do that to myself.";
  if (m.roles.highest.position >= i.guild.members.me.roles.highest.position)
    return 'My role is not high enough. Move my role above theirs.';
  if (i.user.id !== i.guild.ownerId && m.roles.highest.position >= i.member.roles.highest.position)
    return 'That member has an equal or higher role than you.';
  return null;
}

async function done(i, type, target, reason, extra = '') {
  const num = newCase(i.guildId, type, target.id, i.user.id, reason);
  const [verb, icon, color] = CASE[type];
  const log = E
    (color)
    .setAuthor({ name: `Case #${num} · ${type}` })
    .setDescription(`${icon} **${target.username}** (${target.id}) was ${verb}${extra}.`)
    .addFields(
      { name: 'Reason', value: reason.slice(0, 1000) },
      { name: 'Moderator', value: `${i.user}`, inline: true },
    )
    .setTimestamp();
  if (type !== 'unban' && type !== 'untimeout')
    target.send({
      embeds: [
        E
          (color)
          .setTitle(`You were ${verb} in ${i.guild.name}`)
          .setDescription(`**Reason:** ${reason.slice(0, 1000)}${extra}`)
          .setTimestamp(),
      ],
    }).catch(() => {});
  const lc =
    store.settings(i.guildId).modlog_channel
      && i.guild.channels.cache.get(store.settings(i.guildId).modlog_channel);
  lc?.send({ embeds: [log] }).catch(() => {});
  return i.reply({ embeds: [log] });
}

const reasonOpt = o =>
  o.setName('reason').setDescription('Reason (shown to the member and logged)').setMaxLength(500);
const mod = (name, desc, perm) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(desc)
    .setDefaultMemberPermissions(perm)
    .setDMPermission(false);
const { PermissionFlagsBits: P } = require('discord.js');
const NOREASON = 'No reason provided';

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show all commands by category, or how to use one command')
      .addStringOption(o =>
        o.setName('command').setDescription('Command name, e.g. daily').setAutocomplete(true)),
    run: i => {
      const c = i.options.getString('command');
      return i.reply(
        c
          ? { embeds: [require('./helpinfo').usageEmbed(i.client, c, pfx(i.guildId))] }
          : helpPayload(i.client, null, pfx(i.guildId)),
      );
    },
  },
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('Check the bot latency'),
    run: async (i) => {
      const t = Date.now();
      const m = await i.reply({ content: '🏓 Pinging…', fetchReply: true });
      await i.editReply({
        content: '',
        embeds: [
          E().setTitle('🏓 Pong!').addFields(
            { name: 'Gateway', value: `${Math.round(i.client.ws.ping)} ms`, inline: true },
            { name: 'Round trip', value: `${Date.now() - t} ms`, inline: true },
          ),
        ],
      });
    },
  },
  {
    data: new SlashCommandBuilder().setName('botinfo').setDescription('Bot statistics and links'),
    run: i => {
      const c = i.client;
      const s = Math.floor(process.uptime() * 1000);
      return i.reply({
        embeds: [
          E
            ()
            .setAuthor({ name: c.user.username, iconURL: c.user.displayAvatarURL() })
            .setThumbnail(c.user.displayAvatarURL())
            .addFields(
              { name: 'Servers', value: String(c.guilds.cache.size), inline: true },
              {
                name: 'Users',
                value: String(c.guilds.cache.reduce((a, g) => a + g.memberCount, 0)),
                inline: true,
              },
              { name: 'Commands', value: String(c.commandList.length), inline: true },
              { name: 'Ping', value: `${Math.round(c.ws.ping)} ms`, inline: true },
              { name: 'Uptime', value: human(s), inline: true },
              {
                name: 'Memory',
                value: `${Math.round(process.memoryUsage().rss / 1048576)} MB`,
                inline: true,
              },
              { name: 'Versions', value: `Node ${process.version} · discord.js ${DJS}` },
            ),
        ],
        components: linkRow() ? [linkRow()] : [],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('avatar')
      .setDescription("Show a user's avatar in full size")
      .addUserOption(o => o.setName('user').setDescription('User')),
    run: async (i) => {
      const u = i.options.getUser('user') || i.user;
      const m = i.options.getMember('user') || (u.id === i.user.id ? i.member : null);
      const g = u.displayAvatarURL({ size: 1024 });
      const s = m?.avatar ? m.displayAvatarURL({ size: 1024 }) : null;
      const row = new ActionRowBuilder().addComponents(
        ...['png', 'jpg', 'webp'].map(x =>
          new ButtonBuilder()
            .setLabel(x.toUpperCase())
            .setStyle(ButtonStyle.Link)
            .setURL(u.displayAvatarURL({ extension: x, size: 1024 }))),
      );
      return i.reply({
        embeds: [
          E().setAuthor({ name: u.username }).setTitle('Avatar').setImage(g),
          ...s && s !== g ? [E().setTitle('Server avatar').setImage(s)] : [],
        ],
        components: [row],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Detailed information about a member')
      .addUserOption(o => o.setName('user').setDescription('User')),
    run: async (i) => {
      const base = i.options.getUser('user') || i.user;
      const u = await i.client.users.fetch(base.id, { force: true }).catch(() => base);
      const m =
        i.options.getMember('user')
          || (u.id === i.user.id ? i.member : await i.guild.members.fetch(u.id).catch(() => null));
      const e = E
        (m?.displayColor || 0x5865f2)
        .setAuthor({ name: u.username, iconURL: u.displayAvatarURL() })
        .setThumbnail(u.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: u.id, inline: true },
          { name: 'Name', value: m?.displayName || u.globalName || u.username, inline: true },
          { name: 'Bot', value: u.bot ? 'Yes' : 'No', inline: true },
          {
            name: 'Created',
            value: `${ts(u.createdTimestamp, 'D')} (${ts(u.createdTimestamp)})`,
            inline: true,
          },
        );

      if (m) {
        e.addFields({
          name: 'Joined',
          value: `${ts(m.joinedTimestamp, 'D')} (${ts(m.joinedTimestamp)})`,
          inline: true,
        });
        if (m.premiumSince)
          e.addFields({
            name: 'Boosting since',
            value: ts(m.premiumSinceTimestamp, 'D'),
            inline: true,
          });
        if (m.communicationDisabledUntilTimestamp > Date.now())
          e.addFields({
            name: 'Timed out until',
            value: ts(m.communicationDisabledUntilTimestamp),
            inline: true,
          });
        const roles = m.roles.cache.filter(r => r.id !== i.guildId).sort((a, b) =>
          b.position - a.position);
        e.addFields({
          name: `Roles (${roles.size})`,
          value:
            roles.size
              ? [...roles.values()].slice(0, 12).map(r => `${r}`).join(' ')
                + (roles.size > 12 ? ` +${roles.size - 12}` : '')
              : 'None',
        });
        const keys = [
          'Administrator',
          'ManageGuild',
          'ManageChannels',
          'ManageRoles',
          'ManageMessages',
          'KickMembers',
          'BanMembers',
          'ModerateMembers',
        ].filter(p => m.permissions.has(p));
        if (keys.length) e.addFields({ name: 'Key permissions', value: keys.join(', ') });
      }

      const fl = u.flags?.toArray().map(f => f.replace(/([A-Z])/g, ' $1').trim());
      if (fl?.length) e.addFields({ name: 'Badges', value: fl.join(', ') });
      if (u.bannerURL()) e.setImage(u.bannerURL({ size: 1024 }));
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('serverinfo').setDescription(
      'Detailed information about this server',
    ),
    run: async (i) => {
      const g = i.guild;
      const ch = g.channels.cache;
      const n = t => ch.filter(c => c.type === t).size;
      const roles = g.roles.cache.size - 1;
      const e = E
        ()
        .setTitle(g.name)
        .setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
          {
            name: 'Created',
            value: `${ts(g.createdTimestamp, 'D')} (${ts(g.createdTimestamp)})`,
            inline: true,
          },
          { name: 'ID', value: g.id, inline: true },
          { name: 'Members', value: g.memberCount.toLocaleString(), inline: true },
          {
            name: 'Channels',
            value: `${n(ChannelType.GuildText)} text · ${n(ChannelType.GuildVoice)} voice · ${n(ChannelType.GuildCategory)} categories`,
            inline: true,
          },
          { name: 'Roles', value: String(roles), inline: true },
          {
            name: 'Boosts',
            value: `Level ${g.premiumTier} · ${g.premiumSubscriptionCount || 0} boosts`,
            inline: true,
          },
          { name: 'Emojis', value: String(g.emojis.cache.size), inline: true },
          {
            name: 'Verification',
            value: ['None', 'Low', 'Medium', 'High', 'Very high'][g.verificationLevel] || '?',
            inline: true,
          },
        );
      if (g.description) e.setDescription(g.description);
      if (g.bannerURL()) e.setImage(g.bannerURL({ size: 1024 }));
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('joke').setDescription('Get a random joke'),
    run: async (i) => {
      await i.deferReply();

      try {
        const d = await (await fetch(
          'https://icanhazdadjoke.com/',
          {
            headers: { accept: 'application/json', 'user-agent': 'DiscordBot/1.0' },
            signal: AbortSignal.timeout(6000),
          },
        )).json();
        return i.editReply({ embeds: [E(0xf1c40f).setDescription(`😂 ${d.joke}`)] });
      } catch {
        return i.editReply({
          embeds: [
            E(0xf1c40f).setDescription(
              '😂 Why do programmers prefer dark mode? Because light attracts bugs.',
            ),
          ],
        });
      }
    },
  },
  {
    data: new SlashCommandBuilder().setName('fact').setDescription('Get a random fun fact'),
    run: async (i) => {
      await i.deferReply();

      try {
        const d = await (await fetch(
          'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
          { signal: AbortSignal.timeout(6000) },
        )).json();
        return i.editReply({ embeds: [E(0x3498db).setDescription(`💡 ${d.text}`)] });
      } catch {
        return i.editReply({
          embeds: [E(0x3498db).setDescription('💡 Octopuses have three hearts.')],
        });
      }
    },
  },
  {
    // economy
    data: new SlashCommandBuilder().setName('daily').setDescription(
      'Claim your daily coins (streak bonus up to +60%)',
    ),
    run: i => {
      const g = i.guildId;
      const r = store.user(g, i.user.id);
      const now = Date.now();
      const since = now - r.last_daily;

      if (since < 864e5)
        return i.reply({
          embeds: [
            E(0xf0b232).setDescription(
              `⏳ You already claimed today. Come back ${ts(r.last_daily + 864e5)}.\nStreak: **${r.streak || 0}** 🔥`,
            ),
          ],
          ephemeral: true,
        });

      const streak = since < 1728e5 ? (r.streak || 0) + 1 : 1;
      const base = store.settings(g).daily_amount || 250;
      const amt = Math.round(base * (1 + Math.min(streak - 1, 6) * 0.1));
      store.addCoins(g, i.user.id, amt);
      db.prepare('UPDATE users SET last_daily=?, streak=? WHERE guild=? AND user=?').run(
        now,
        streak,
        g,
        i.user.id,
      );

      return i.reply({
        embeds: [
          E(0x23a55a).setTitle('🎁 Daily reward').setDescription(
            `You received **${amt.toLocaleString()}** coins!\n🔥 Streak: **${streak}** day${streak > 1 ? 's' : ''}${streak < 7 ? ` · +10% more tomorrow` : ' · max bonus!'}`,
          ),
        ],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Server leaderboards')
      .addStringOption(o =>
        o
          .setName('type')
          .setDescription('Which board')
          .addChoices(
            { name: 'Coins', value: 'coins' },
            { name: 'XP / levels', value: 'xp' },
            { name: 'Animals', value: 'animals' },
          )),
    run: i => i.reply(board(i, i.options.getString('type') || 'coins')),
  },
  {
    data: new SlashCommandBuilder().setName('levels').setDescription('XP leaderboard'),
    run: i => i.reply(board(i, 'xp')),
  },
  {
    // polls and giveaways
    data: new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Create a poll (yes/no, or up to 9 options)')
      .setDMPermission(false)
      .addStringOption(o =>
        o.setName('question').setDescription('The question').setMaxLength(250).setRequired(true))
      .addStringOption(o =>
        o.setName('options').setDescription(
          'Separate with | e.g. Pizza | Burger | Tacos (empty = yes/no)',
        ))
      .addStringOption(o =>
        o.setName('duration').setDescription('Auto-close after e.g. 30m, 2h, 1d')),
    run: async (i) => {
      const opts = (i.options.getString('options') || '')
        .split('|')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 9);
      const multi = opts.length >= 2;
      const ms = parseDur(i.options.getString('duration'));
      const em =
        multi
          ? ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'].slice(0, opts.length)
          : ['👍', '👎'];
      const labels = multi ? opts : ['Yes', 'No'];
      const e = E
        ()
        .setAuthor({ name: `Poll by ${i.user.username}`, iconURL: i.user.displayAvatarURL() })
        .setTitle(i.options.getString('question'))
        .setDescription(
          em.map((x, n) => `${x} ${labels[n]}`).join('\n')
            + (ms ? `\n\nCloses ${ts(Date.now() + ms)}` : ''),
        );
      const m = await i.reply({ embeds: [e], fetchReply: true });
      for (const x of em) await m.react(x).catch(() => {});
      if (ms && ms >= 30000 && ms <= 30 * 864e5)
        db.prepare('INSERT INTO polls VALUES(?,?,?,?,?)').run(
          m.id,
          m.channelId,
          Date.now() + ms,
          i.options.getString('question'),
          JSON.stringify(em.map((x, n) => ({ e: x, t: labels[n] }))),
        );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Run giveaways with multiple winners')
      .setDefaultMemberPermissions(P.ManageGuild)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('start')
          .setDescription('Start a giveaway')
          .addStringOption(o =>
            o.setName('prize').setDescription('Prize').setMaxLength(200).setRequired(true))
          .addStringOption(o =>
            o.setName('duration').setDescription('e.g. 30m, 2h, 1d').setRequired(true))
          .addIntegerOption(o =>
            o
              .setName('winners')
              .setDescription('Number of winners (1-10)')
              .setMinValue(1)
              .setMaxValue(10)))
      .addSubcommand(s =>
        s
          .setName('end')
          .setDescription('End a giveaway now')
          .addStringOption(o =>
            o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
      .addSubcommand(s =>
        s
          .setName('reroll')
          .setDescription('Pick new winners')
          .addStringOption(o =>
            o.setName('message_id').setDescription('Giveaway message ID').setRequired(true))),
    run: async (i) => {
      const sub = i.options.getSubcommand();

      if (sub === 'start') {
        const ms = parseDur(i.options.getString('duration'));
        if (!ms || ms < 30000 || ms > 30 * 864e5)
          return i.reply({
            content: 'Duration must be between 30 seconds and 30 days, for example `2h`.',
            ephemeral: true,
          });
        const prize = i.options.getString('prize');
        const w = i.options.getInteger('winners') || 1;
        const ends = Date.now() + ms;
        const m = await i.reply({
          embeds: [
            E(0xf1c40f).setTitle(`🎁 ${prize}`).setDescription(
              `Press the button to enter!\n\nEnds ${ts(ends)}\nWinners: **${w}**\nHosted by ${i.user}`,
            ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('gw:enter')
                .setLabel('Enter giveaway')
                .setEmoji('🎉')
                .setStyle(ButtonStyle.Success),
            ),
          ],
          fetchReply: true,
        });

        return void db.prepare(
          'INSERT INTO giveaways(msg,channel,prize,ends,winners) VALUES(?,?,?,?,?)',
        ).run(m.id, m.channelId, prize, ends, w);
      }

      const g = db.prepare('SELECT * FROM giveaways WHERE msg=?').get(
        i.options.getString('message_id').trim(),
      );
      if (!g || !i.guild.channels.cache.has(g.channel))
        return i.reply({
          content: 'I could not find that giveaway in this server.',
          ephemeral: true,
        });

      if (sub === 'end') {
        if (g.done)
          return i.reply({
            content: 'That giveaway already ended. Use `reroll` to pick new winners.',
            ephemeral: true,
          });
        await endGiveaway(i.client, g);
        return i.reply({ content: '✅ Giveaway ended.', ephemeral: true });
      }

      if (!g.done) return i.reply({ content: 'That giveaway is still running.', ephemeral: true });
      const win = pickWinners(g);
      return i.reply(
        win.length
          ? `🎉 New winner${win.length > 1 ? 's' : ''}: ${win.map(w => `<@${w}>`).join(', ')}! You won **${g.prize}**!`
          : 'Nobody entered that giveaway.',
      );
    },
  },
  {
    // moderation
    data: mod(
      'warn',
      'Warn a member (3 warnings = 1 hour timeout)',
      P.ModerateMembers,
    ).addUserOption(o =>
      o.setName('user').setDescription('Member').setRequired(true)).addStringOption(reasonOpt),
    run: async (i) => {
      const u = i.options.getUser('user');
      const m = i.options.getMember('user');
      const r = i.options.getString('reason') || NOREASON;
      const e = guard(i, m);
      if (e) return i.reply({ content: e, ephemeral: true });
      db.prepare('INSERT INTO warns(guild,user,mod,reason,at) VALUES(?,?,?,?,?)').run(
        i.guildId,
        u.id,
        i.user.id,
        r.slice(0, 300),
        Date.now(),
      );
      const n = db.prepare('SELECT COUNT(*) n FROM warns WHERE guild=? AND user=?').get(
        i.guildId,
        u.id,
      ).n;
      let extra = ` (warning ${n})`;

      if (n >= 3 && m) {
        try {
          await m.timeout(36e5, '3 warnings');
          extra += ' · automatically timed out for 1 hour';
        } catch {}
      }

      return done(i, 'warn', u, r, extra);
    },
  },
  {
    data: mod('kick', 'Kick a member', P.KickMembers).addUserOption(o =>
      o.setName('user').setDescription('Member').setRequired(true)).addStringOption(reasonOpt),
    run: async (i) => {
      const u = i.options.getUser('user');
      const m = i.options.getMember('user');
      const r = i.options.getString('reason') || NOREASON;
      if (!m) return i.reply({ content: 'That user is not in this server.', ephemeral: true });
      const e = guard(i, m);
      if (e) return i.reply({ content: e, ephemeral: true });
      await u.send({
        embeds: [
          E(0xe67e22).setTitle(`You were kicked from ${i.guild.name}`).setDescription(
            `**Reason:** ${r}`,
          ),
        ],
      }).catch(() => {});

      try {
        await m.kick(r);
      } catch {
        return i.reply({ content: "I couldn't kick that member.", ephemeral: true });
      }

      return done(i, 'kick', u, r);
    },
  },
  {
    data: mod
      ('ban', 'Ban a member (optionally temporary)', P.BanMembers)
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption(reasonOpt)
      .addStringOption(o =>
        o.setName('duration').setDescription('Temporary ban, e.g. 7d (empty = permanent)'))
      .addIntegerOption(o =>
        o
          .setName('delete_days')
          .setDescription('Delete their messages from the last N days (0-7)')
          .setMinValue(0)
          .setMaxValue(7)),
    run: async (i) => {
      const u = i.options.getUser('user');
      const m = i.options.getMember('user');
      const r = i.options.getString('reason') || NOREASON;
      const e = guard(i, m);
      const ms = i.options.getString('duration') ? parseDur(i.options.getString('duration')) : null;
      if (e) return i.reply({ content: e, ephemeral: true });
      if (i.options.getString('duration') && !ms)
        return i.reply({
          content: 'Invalid duration, use something like `7d` or `12h`.',
          ephemeral: true,
        });

      await u.send({
        embeds: [
          E(0xed4245).setTitle(`You were banned from ${i.guild.name}`).setDescription(
            `**Reason:** ${r}${ms ? `\nThis ban lasts ${human(ms)}.` : ''}`,
          ),
        ],
      }).catch(() => {});

      try {
        await i.guild.members.ban(
          u,
          { reason: r, deleteMessageSeconds: (i.options.getInteger('delete_days') || 0) * 86400 },
        );
      } catch {
        return i.reply({ content: "I couldn't ban that user.", ephemeral: true });
      }

      if (ms)
        db.prepare('INSERT OR REPLACE INTO tempbans VALUES(?,?,?)').run(
          i.guildId,
          u.id,
          Date.now() + ms,
        );
      return done(i, 'ban', u, r, ms ? ` for ${human(ms)}` : '');
    },
  },
  {
    data: mod('unban', 'Unban a user by ID', P.BanMembers).addStringOption(o =>
      o.setName('user_id').setDescription('User ID').setRequired(true)).addStringOption(reasonOpt),
    run: async (i) => {
      const id = i.options.getString('user_id').trim();
      const r = i.options.getString('reason') || NOREASON;

      try {
        await i.guild.members.unban(id, r);
      } catch {
        return i.reply({
          content: 'Could not unban. Check the ID and that the user is banned.',
          ephemeral: true,
        });
      }

      db.prepare('DELETE FROM tempbans WHERE guild=? AND user=?').run(i.guildId, id);
      const u = await i.client.users.fetch(id).catch(() => ({ id, username: id }));
      return done(i, 'unban', u, r);
    },
  },
  {
    data: mod
      ('timeout', 'Mute a member for a while (use "off" to remove)', P.ModerateMembers)
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o =>
        o.setName('duration').setDescription('e.g. 10m, 2h, 1d, or off').setRequired(true))
      .addStringOption(reasonOpt),
    run: async (i) => {
      const u = i.options.getUser('user');
      const m = i.options.getMember('user');
      const r = i.options.getString('reason') || NOREASON;
      const d = i.options.getString('duration').toLowerCase();
      if (!m) return i.reply({ content: 'That user is not in this server.', ephemeral: true });
      const e = guard(i, m);
      if (e) return i.reply({ content: e, ephemeral: true });

      if (d === 'off') {
        await m.timeout(null, r).catch(() => {});
        return done(i, 'untimeout', u, r);
      }

      const ms = parseDur(d);
      if (!ms || ms > 28 * 864e5)
        return i.reply({
          content: 'Use a duration up to 28 days, like `10m`, `2h` or `1d`.',
          ephemeral: true,
        });

      try {
        await m.timeout(ms, r);
      } catch {
        return i.reply({ content: "I couldn't time out that member.", ephemeral: true });
      }

      return done(i, 'timeout', u, r, ` for ${human(ms)}`);
    },
  },
  {
    data: mod(
      'purge',
      'Delete recent messages (optionally only from one user)',
      P.ManageMessages,
    ).addIntegerOption(o =>
      o
        .setName('amount')
        .setDescription('1-100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)).addUserOption(o =>
      o.setName('user').setDescription('Only delete this user\'s messages')),
    run: async (i) => {
      const u = i.options.getUser('user');
      const n = i.options.getInteger('amount');
      let msgs = await i.channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (!msgs) return i.reply({ content: "I can't read this channel.", ephemeral: true });
      msgs = [...msgs.values()].filter(x => (!u || x.author.id === u.id) && x.id !== i.id).slice(
        0,
        n,
      );
      const d = await i.channel.bulkDelete(msgs, true).catch(() => null);
      return i.reply({
        content:
          d
            ? `🧹 Deleted **${d.size}** message${d.size === 1 ? '' : 's'}${u ? ` from ${u.username}` : ''}. (Discord can't bulk-delete messages older than 14 days.)`
            : 'Failed. I need Manage Messages.',
        ephemeral: true,
      });
    },
  },
  {
    data: mod(
      'warnings',
      'View a member\'s moderation history',
      P.ModerateMembers,
    ).addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),
    run: i => {
      const u = i.options.getUser('user');
      const rows = db.prepare(
        'SELECT * FROM cases WHERE guild=? AND user=? ORDER BY num DESC LIMIT 10',
      ).all(i.guildId, u.id);
      const total = db.prepare('SELECT COUNT(*) n FROM cases WHERE guild=? AND user=?').get(
        i.guildId,
        u.id,
      ).n;
      const w = db.prepare('SELECT COUNT(*) n FROM warns WHERE guild=? AND user=?').get(
        i.guildId,
        u.id,
      ).n;

      return i.reply({
        ephemeral: true,
        embeds: [
          E(0xe67e22).setAuthor({
            name: `${u.username} · ${w} warning${w === 1 ? '' : 's'} · ${total} case${total === 1 ? '' : 's'}`,
            iconURL: u.displayAvatarURL(),
          }).setDescription(
            rows.map(r => `**#${r.num}** ${CASE[r.type]?.[1] || ''} \`${r.type}\` ${ts(r.at, 'd')} by <@${r.mod}>\n> ${r.reason}`).join(
              '\n',
            )
              || 'Clean record.',
          ),
        ],
      });
    },
  },
  {
    data: mod('clearwarns', "Clear a member's warnings", P.ModerateMembers).addUserOption(o =>
      o.setName('user').setDescription('Member').setRequired(true)),
    run: i => {
      const u = i.options.getUser('user');
      const n = db.prepare('DELETE FROM warns WHERE guild=? AND user=?').run(
        i.guildId,
        u.id,
      ).changes;
      return i.reply({
        content: `🧹 Cleared **${n}** warning${n === 1 ? '' : 's'} for ${u.username}.`,
      });
    },
  },
];

function board(i, type) {
  const g = i.guildId;
  const medal = ['🥇', '🥈', '🥉'];
  let rows;
  let line;
  let title;
  let mine;

  if (type === 'xp') {
    rows = db.prepare('SELECT user, xp v FROM levels WHERE guild=? ORDER BY xp DESC LIMIT 10').all(
      g,
    );
    line = r => `Level **${store.lv(r.v)}** · ${r.v.toLocaleString()} XP`;
    title = '📈 XP leaderboard';
    mine = db.prepare(
      'SELECT COUNT(*)+1 n FROM levels WHERE guild=? AND xp>COALESCE((SELECT xp FROM levels WHERE guild=? AND user=?),0)',
    ).get(g, g, i.user.id).n;
  } else if (type === 'animals') {
    rows = db.prepare(
      'SELECT user, SUM(qty) v FROM zoo WHERE guild=? GROUP BY user ORDER BY v DESC LIMIT 10',
    ).all(g);
    line = r => `**${r.v.toLocaleString()}** animals`;
    title = '🐾 Animal collectors';
    mine = null;
  } else {
    rows = db.prepare(
      'SELECT user, coins v FROM users WHERE guild=? ORDER BY coins DESC LIMIT 10',
    ).all(g);
    line = r => `**${r.v.toLocaleString()}** coins`;
    title = '💰 Richest members';
    mine = db.prepare('SELECT COUNT(*)+1 n FROM users WHERE guild=? AND coins>?').get(
      g,
      store.user(g, i.user.id).coins,
    ).n;
  }

  const e = E().setTitle(title).setDescription(
    rows.map((r, n) => `${medal[n] || `**${n + 1}.**`} <@${r.user}> · ${line(r)}`).join('\n')
      || 'Nobody yet. Start playing!',
  );

  if (mine) e.setFooter({ text: `Your rank: #${mine}` });
  return {
    embeds: [e],
    components:
      type === 'xp' && ok(process.env.BASE_URL)
        ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('Full leaderboard')
              .setStyle(ButtonStyle.Link)
              .setURL(`${process.env.BASE_URL.replace(/\/$/, '')}/leaderboard/${g}`),
          ),
        ]
        : [],
  };
}

function pickWinners(g) {
  const ids = db.prepare('SELECT user FROM entries WHERE msg=?').all(g.msg).map(x => x.user);
  const win = [];
  while (win.length < Math.min(g.winners || 1, ids.length))
    win.push(ids.splice(Math.floor(Math.random() * ids.length), 1)[0]);
  return win;
}

async function endGiveaway(client, g) {
  db.prepare('UPDATE giveaways SET done=1 WHERE msg=?').run(g.msg);
  const win = pickWinners(g);
  const ch = await client.channels.fetch(g.channel).catch(() => null);
  if (!ch) return win;

  ch.messages
    .fetch(g.msg)
    .then(m =>
      m.edit({
        embeds: [
          E(0x95a5a6).setTitle(`🎁 ${g.prize}`).setDescription(
            `**Giveaway ended**\nWinner${win.length === 1 ? '' : 's'}: ${win.map(w => `<@${w}>`).join(', ') || 'nobody'}`,
          ),
        ],
        components: [],
      }))
    .catch(() => {});

  ch.send(
    win.length
      ? `🎉 Congratulations ${win.map(w => `<@${w}>`).join(', ')}! You won **${g.prize}**!`
      : `No one entered the giveaway for **${g.prize}**.`,
  ).catch(() => {});
  return win;
}

// background jobs: temp bans and poll results
async function tick(client) {
  for (const b of db.prepare('SELECT * FROM tempbans WHERE ends<=?').all(Date.now())) {
    db.prepare('DELETE FROM tempbans WHERE guild=? AND user=?').run(b.guild, b.user);
    client.guilds
      .cache
      .get(b.guild)
      ?.members
      .unban(b.user, 'Temporary ban expired')
      .catch(() => {});
  }

  for (const p of db.prepare('SELECT * FROM polls WHERE ends<=?').all(Date.now())) {
    db.prepare('DELETE FROM polls WHERE msg=?').run(p.msg);
    const ch = await client.channels.fetch(p.channel).catch(() => null);
    const m = ch && await ch.messages.fetch(p.msg).catch(() => null);
    if (!m) continue;
    const opts = JSON.parse(p.opts);
    const counts = opts.map(o => Math.max(0, (m.reactions.cache.get(o.e)?.count || 1) - 1));
    const tot = counts.reduce((a, b) => a + b, 0) || 1;

    m.edit({
      embeds: [
        E(0x95a5a6).setTitle(`📊 ${p.q}`).setDescription(
          opts.map((
            o,
            n,
          ) => `${o.e} ${o.t}: **${counts[n]}** (${Math.round(counts[n] / tot * 100)}%)`).join('\n')
            + '\n\n**Poll closed**',
        ),
      ],
    }).catch(() => {});
  }
}

module.exports = { commands, helpPayload, helpMenu, endGiveaway, tick };
