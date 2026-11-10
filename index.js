require('dotenv').config();
const fs = require('fs');

// icons instead of emojis
try {
  require('./iconemoji').patch();
} catch (e) {
  console.warn('[icons] disabled:', e.message);
}

const {
  Client,
  Options,
  AttachmentBuilder,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  PermissionFlagsBits,
} = require('discord.js');
const store = require('./db');
const commands = [
  ...require('./commands'),
  ...require('./commands2'),
  ...require('./commands3'),
  ...require('./commands4'),
  require('./music').command,
  require('./tempvc').command,
  ...require('./welcome').commands,
  ...require('./games').commands,
  ...require('./upgrades').commands,
].slice(0, 100);
const { tick, handleButton } = require('./commands3');
const { helpEmbed } = require('./commands2');
const { usageEmbed } = require('./helpinfo');
const pr = require('./prefixrun');
const usage = require('./usage');
const monitor = require('./monitor');
const map = new Map(commands.map(c => [c.data.name, c]));
const PREFIX = process.env.PREFIX || 'm!';

const client = new Client({
  shards: 'auto', // automatic multi-shard connection once the bot is in 2,500+ servers
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    ThreadManager: 0,
    GuildScheduledEventManager: 0,
    StageInstanceManager: 0,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    guildMembers: {
      interval: 1800,
      filter: () => m => !m.voice?.channelId && m.id !== m.client.user.id,
    },
    users: { interval: 1800, filter: () => u => u.id !== u.client.user.id },
  },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});
client.commandList = commands;

const statuses = [
  c => ({ name: `${PREFIX}help`, type: ActivityType.Listening }),
  c => ({
    name: `with ${c.guilds.cache.size.toLocaleString()} servers!`,
    type: ActivityType.Streaming,
    url: process.env.STREAM_URL || 'https://twitch.tv/discord',
  }),
  c => ({ name: '/help | /daily', type: ActivityType.Playing }),
  c => ({
    name: `${c.guilds.cache.reduce((a, g) => a + g.memberCount, 0).toLocaleString()} members`,
    type: ActivityType.Watching,
  }),
];

client.once('ready', async () => {
  // only re-register slash commands when something changed (daily limit)
  const body = commands.map(c => c.data.toJSON());
  const hash = require('crypto').createHash('sha1').update(JSON.stringify(body)).digest('hex');

  if (!fs.existsSync('.cmdhash') || fs.readFileSync('.cmdhash', 'utf8') !== hash) {
    await new REST().setToken(process.env.BOT_TOKEN).put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body },
    );
    fs.writeFileSync('.cmdhash', hash);
    console.log('Slash commands registered');
  }

  let n = 0;
  const tick = () => client.user.setActivity(statuses[n++ % statuses.length](client));
  tick();
  setInterval(tick, 15000);
  setInterval(
    () => require('./upgrades').tick(client).catch(e => console.error('[tick]', e.message)),
    30000,
  );
  setInterval(
    () => require('./games').tick(client).catch(e => console.error('[lottery]', e.message)),
    30000,
  );
  setInterval(
    () => require('./commands3').tick(client).catch(e => console.error('[tick]', e.message)),
    15000,
  );
  require('./tempvc').cleanup(client);
  monitor.start(client);
  require('./iconemoji').setup(client).catch(e =>
    console.warn('[icons] using normal emojis:', e.message));

  // db backup for hosts with a temporary disk
  const bk = require('./backup');

  bk.announce();
  setTimeout(
    () => bk.backup(store.db).catch(e => console.error('[backup]', e.message)),
    120000,
  ).unref();
  setInterval(
    () => bk.backup(store.db).catch(e => console.error('[backup]', e.message)),
    15 * 60000,
  ).unref();
  console.log(`Logged in as ${client.user.tag}`);
});

const busy = new Map();
const last = new Map(); // one command at a time per user, plus a short cooldown

setInterval(() => {
  const n = Date.now();
  for (const [k, t] of last) if (n - t > 60000) last.delete(k);
  for (const [k, t] of busy) if (t < n) busy.delete(k);
}, 300000).unref();

const gate = uid => {
  const now = Date.now();
  if ((busy.get(uid) || 0) > now) return '⏳ Finish your previous command first.';
  if (now - (last.get(uid) || 0) < 1200) return '⏳ Slow down a little!';
  last.set(uid, now);
  busy.set(uid, now + 90000);
  return null;
};
const release = uid => busy.delete(uid);

client.on('interactionCreate', async (i) => {
  if (i.guildId && i.customId?.startsWith('mu:'))
    return require('./music').handleButton(i).catch(console.error);
  if (i.isStringSelectMenu?.() && i.customId === 'help:menu')
    return require('./upgrades').helpMenu(i).catch(console.error);

  if (i.isAutocomplete()) {
    const q = i.options.getFocused().toLowerCase();
    return i.respond(
      commands
        .map(c => c.data.name)
        .filter(n => n.includes(q))
        .slice(0, 25)
        .map(n => ({ name: n, value: n })),
    ).catch(() => {});
  }

  if (i.guildId && i.customId?.startsWith('vc:'))
    return require('./tempvc').handleComponent(i).catch(console.error);
  if (i.isButton() && i.guildId) return handleButton(i).catch(console.error);
  if (!i.isChatInputCommand() || !i.guildId) return;
  const off = (store.settings(i.guildId).disabled_cmds || '').split(',');
  if (off.includes(i.commandName) && !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return i.reply({
      content: 'This command is disabled in this server.',
      ephemeral: true,
    }).catch(() => {});
  const uid = i.user.id;
  const now = Date.now();
  if ((busy.get(uid) || 0) > now)
    return i.reply({
      content: '⏳ Finish your previous command first.',
      ephemeral: true,
    }).catch(() => {});
  if (now - (last.get(uid) || 0) < 1200)
    return i.reply({ content: '⏳ Slow down a little!', ephemeral: true }).catch(() => {});
  last.set(uid, now);
  busy.set(uid, now + 90000);

  try {
    usage.record(i.commandName);
    await map.get(i.commandName)?.run(i);
  } catch (e) {
    console.error(`[cmd:${i.commandName}]`, e.message);
    const m = 'Something went wrong, please try again.';
    (i.deferred || i.replied
      ? i.editReply(m)
      : i.reply({ content: m, ephemeral: true })).catch(() => {});
  } finally {
    busy.delete(uid);
  }
});

const INVITE = /(discord\.gg|discord(app)?\.com\/invite)\/\S+/i;
const LINK = /https?:\/\/\S+/i;

function automod(m, s) {
  if (!(s.am_invites || s.am_links || s.am_badwords)
    || m.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return null;
  const t = m.content;
  if (s.am_invites && INVITE.test(t)) return 'invite link';
  if (s.am_links && LINK.test(t)) return 'link';
  const lower = t.toLowerCase();
  if ((s.am_badwords || '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
    .some(w => lower.includes(w))) return 'blocked word';
  return null;
}

async function sendLevelUp(m, level) {
  try {
    const buf = await require('./card').renderLevelUp({
      name: m.member?.displayName || m.author.username,
      avatarUrl: m.author.displayAvatarURL({ extension: 'png', size: 256 }),
      level,
    });
    await m.channel.send({
      content: `🎉 ${m.author}`,
      files: [new AttachmentBuilder(buf, { name: 'levelup.png' })],
    });
  } catch {
    m.channel.send(`🎉 ${m.author} reached **level ${level}**! (+100 coins)`).catch(() => {});
  }
}

// text commands: help, ping and the fun ones
function prefixCmd(m, pfx) {
  const [cmd, ...args] = m.content.slice(pfx.length).trim().match(/"[^"]*"|\S+/g) || [];
  const name = (cmd || '').toLowerCase();

  if (name === 'help') {
    m.reply(
      args[0]
        ? { embeds: [usageEmbed(client, args[0], pfx)] }
        : require('./upgrades').helpPayload(client, null, pfx),
    ).catch(() => {});
    return true;
  }

  if (name === 'ping') {
    m.reply(`🏓 ${client.ws.ping}ms`).catch(() => {});
    return true;
  }

  if (pr.handle(m, name, args, pfx, { gate, release })) return true;
  const p = require('./fun').prefixReply(name, args, m);

  if (p) {
    m.reply(p).catch(() => {});
    return true;
  }

  return false;
}

client.on('messageCreate', m => {
  if (m.author.bot || !m.guild) return;
  const S = store.settings(m.guild.id);
  const why = automod(m, S);

  if (why) {
    m.delete().catch(() => {});
    m.channel
      .send(`${m.author}, your message was removed (${why}).`)
      .then(x => setTimeout(() => x.delete().catch(() => {}), 5000))
      .catch(() => {});
    const log = S.modlog_channel && m.guild.channels.cache.get(S.modlog_channel);

    log?.send(
      `🚫 Removed message from ${m.author} in ${m.channel} (${why}):\n>>> ${m.content.slice(0, 500)}`,
    ).catch(() => {});

    return;
  }

  const c = m.content.toLowerCase().trim();
  const pfx = S.prefix || PREFIX;

  if (c.startsWith(pfx.toLowerCase()) && prefixCmd(m, pfx)) return;
  else if (S.levels_on) {
    const r = store.addXp(m.guild.id, m.author.id, S.xp_rate);

    if (r?.up) {
      store.addCoins(m.guild.id, m.author.id, 100);
      if (S.level_announce) sendLevelUp(m, r.level);
    }
  }
});

const fmt = (t, m) =>
  t
    .replaceAll('{user}', `<@${m.id}>`)
    .replaceAll('{server}', m.guild.name)
    .replaceAll('{count}', m.guild.memberCount);
const send = (m, kind) =>
  require('./welcome').sendGreeting(m, kind).catch(e => console.error('[greet]', e.message));

client.on('guildMemberAdd', m => {
  send(m, 'welcome');
  const r = store.settings(m.guild.id).autorole;
  if (r) m.roles.add(r).catch(() => {});
});

client.on('guildMemberRemove', m => send(m, 'goodbye'));

client.on('channelDelete', ch => require('./tempvc').onChannelDelete(ch));

client.on('voiceStateUpdate', (o, n) => {
  require('./tempvc').onVoiceState(o, n).catch(console.error);
  require('./music').checkEmpty(o);
});

require('./music').init(client);
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
process.on('uncaughtException', e => console.error('[uncaughtException]', e));
client.on('error', e => console.error('[client]', e)).on(
  'shardError',
  e => console.error('[shard]', e),
);

for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, async () => {
    console.log('Shutting down…');

    try {
      await Promise.race(
        [require('./backup').backup(store.db, true), new Promise(r => setTimeout(r, 20000))],
      );
    } catch (e) {
      console.error('[backup]', e.message);
    }

    client.destroy();

    try {
      store.db.close();
    } catch {}

    process.exit(0);
  });

client.login(process.env.BOT_TOKEN);
require('./dashboard')(client);
