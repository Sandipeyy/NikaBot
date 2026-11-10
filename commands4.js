const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits: P,
} = require('discord.js');
const crypto = require('crypto');
const store = require('./db');
const { db } = store;

const pick = a => a[Math.floor(Math.random() * a.length)];
const cap = s => s[0].toUpperCase() + s.slice(1);
const S = (n, d) => new SlashCommandBuilder().setName(n).setDescription(d);
const str = (b, n, d, req = true) =>
  b.addStringOption(o => o.setName(n).setDescription(d).setRequired(req));
const E = () => new EmbedBuilder().setColor(0x5865f2);
const nf = m => Object.assign(new Error(m), { nf: 1 });
const J = (url, o = {}) =>
  fetch(
    url,
    {
      signal: AbortSignal.timeout(8000),
      ...o,
      headers: { 'user-agent': 'DiscordBot/1.0', ...o.headers },
    },
  ).then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });

// wrapper for the api commands: defer, run, catch errors
const A = (data, fn) => ({
  data,
  run: async (i) => {
    await i.deferReply();

    try {
      await i.editReply(await fn(i));
    } catch (e) {
      await i.editReply(
        e.nf ? e.message : '⚠️ That service is unavailable right now, try again later.',
      ).catch(() => {});
    }
  },
});
const wmo = c =>
  c === 0
    ? 'Clear ☀️'
    : c < 4
      ? 'Partly cloudy ⛅'
      : c < 50 ? 'Fog 🌫️' : c < 70 ? 'Rain 🌧️' : c < 80 ? 'Snow ❄️' : 'Showers / storm ⛈️';
const img = (url, title) => ({ embeds: [E().setImage(url).setTitle(title || null)] });

const api = [
  A(str(S('weather', 'Current weather'), 'city', 'City name'), async (i) => {
    const g = (await J(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(i.options.getString('city'))}&count=1`,
    )).results?.[0];
    if (!g) throw nf('City not found.');
    const w = (await J(
      `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`,
    )).current;
    return {
      embeds: [
        E
          ()
          .setTitle(`🌍 ${g.name}${g.country ? ', ' + g.country : ''}`)
          .setDescription(wmo(w.weather_code))
          .addFields(
            {
              name: '🌡️ Temp',
              value: `${w.temperature_2m}°C (feels ${w.apparent_temperature}°C)`,
              inline: true,
            },
            { name: '💧 Humidity', value: `${w.relative_humidity_2m}%`, inline: true },
            { name: '💨 Wind', value: `${w.wind_speed_10m} km/h`, inline: true },
          ),
      ],
    };
  }),
  A(str(S('define', 'Dictionary definition'), 'word', 'Word'), async (i) => {
    const d = (await J(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(i.options.getString('word'))}`,
    ).catch(() => {
      throw nf('Word not found.');
    }))[0];
    const m = d.meanings[0];

    return {
      embeds: [
        E().setTitle(`📖 ${d.word} ${d.phonetic || ''}`).setDescription(
          `*${m.partOfSpeech}*\n${m.definitions[0].definition}${m.definitions[0].example ? `\n\n> ${m.definitions[0].example}` : ''}`,
        ),
      ],
    };
  }),
  A(str(S('wiki', 'Wikipedia summary'), 'topic', 'Topic'), async (i) => {
    const d = await J(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(i.options.getString('topic').trim().replace(/ /g, '_'))}`,
    ).catch(() => {
      throw nf('No article found.');
    });
    const e = E
      ()
      .setTitle(d.title)
      .setDescription((d.extract || '').slice(0, 900))
      .setURL(d.content_urls?.desktop?.page || null);
    if (d.thumbnail) e.setThumbnail(d.thumbnail.source);
    return { embeds: [e] };
  }),
  A(S
    ('translate', 'Translate text')
    .addStringOption(o =>
      o.setName('text').setDescription('Text (max 400 chars)').setMaxLength(400).setRequired(true))
    .addStringOption(o =>
      o
        .setName('to')
        .setDescription('Target language')
        .setRequired(true)
        .addChoices(
          ...[
            ['Spanish', 'es'],
            ['French', 'fr'],
            ['German', 'de'],
            ['Italian', 'it'],
            ['Portuguese', 'pt'],
            ['Japanese', 'ja'],
            ['Hindi', 'hi'],
            ['Arabic', 'ar'],
            ['Russian', 'ru'],
            ['English', 'en'],
          ].map(([name, value]) => ({ name, value })),
        ))
    .addStringOption(o =>
      o.setName('from').setDescription('Source language code (default en)')), async (i) => {
    const from = (i.options.getString('from') || 'en').toLowerCase();
    const to = i.options.getString('to');
    const d = await J(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(i.options.getString('text'))}&langpair=${encodeURIComponent(from)}|${to}`,
    );
    return `🌐 ${d.responseData.translatedText}`;
  }),
];

// gif reactions (nekos.best)
const RX = {
  hug: ['hugs', 1],
  kiss: ['kisses', 1],
  pat: ['pats', 1],
  slap: ['slaps', 1],
  dance: ['is dancing', 0],
  cry: ['is crying', 0],
};
const reactions = Object.entries(RX).map(([n, [verb, t]]) => {
  const b = S(n, t ? `${cap(n)} someone` : `${cap(n)} with a GIF`);
  if (t) b.addUserOption(o => o.setName('user').setDescription('Who?').setRequired(true));
  return A(
    b,
    async (i) => ({
      embeds: [
        E().setDescription(
          `**${i.user.username}** ${verb}${t ? ` **${i.options.getUser('user').username}**` : ''}`,
        ).setImage((await J(`https://nekos.best/api/v2/${n}`)).results[0].url),
      ],
    }),
  );
});

// commands that don't need an api
const wyr = [
  'Be able to fly or be invisible?',
  'Always be 10 min late or 20 min early?',
  'Have unlimited money or unlimited time?',
  'Live without music or without movies?',
  'Fight 1 horse-sized duck or 100 duck-sized horses?',
  'Never use social media again or never watch TV again?',
];
const truths = [
  'What is your biggest fear?',
  'What is the last lie you told?',
  'What is your most embarrassing moment?',
  'Who was your first crush?',
  'What is a habit you secretly hate about yourself?',
];
const dares = [
  'Send your most recent photo.',
  'Talk in rhymes for the next 5 messages.',
  'Change your nickname to something silly for 1 hour.',
  'Type with your eyes closed for your next message.',
  'Say something nice about everyone online.',
];
const cd = new Map();
const earn = (name, desc, sec, min, max, lines, fail) => ({
  data: S(name, desc),
  run: i => {
    const k = name + i.guildId + i.user.id;
    const left = (cd.get(k) || 0) - Date.now();
    if (left > 0)
      return i.reply({ content: `⏳ Try again in ${Math.ceil(left / 1000)}s.`, ephemeral: true });
    cd.set(k, Date.now() + sec * 1000);
    if (Math.random() < 0.2) return i.reply(fail);
    const n = min + Math.floor(Math.random() * (max - min + 1));
    store.addCoins(i.guildId, i.user.id, n);
    i.reply(`${pick(lines)} **+${n}** coins`);
  },
});
const deny = (i, m) => i.reply({ content: m, ephemeral: true });

const local = [
  {
    data: S('roleinfo', 'Info about a role').addRoleOption(o =>
      o.setName('role').setDescription('Role').setRequired(true)),
    run: i => {
      const r = i.options.getRole('role');
      i.reply({
        embeds: [
          E
            ()
            .setColor(r.color || 0x5865f2)
            .setTitle(r.name)
            .addFields(
              { name: 'ID', value: r.id, inline: true },
              { name: 'Members', value: String(r.members?.size ?? '?'), inline: true },
              { name: 'Color', value: r.hexColor, inline: true },
              { name: 'Created', value: `<t:${Math.floor(r.createdTimestamp / 1000)}:R>` },
            ),
        ],
      });
    },
  },
  {
    data: S('invite', 'Invite the bot / links'),
    run: i => {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Add to Discord')
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=1099934297175&scope=bot%20applications.commands`,
          ),
      );
      if (/^https?:/.test(process.env.BASE_URL || ''))
        row.addComponents(
          new ButtonBuilder()
            .setLabel('Website')
            .setStyle(ButtonStyle.Link)
            .setURL(process.env.BASE_URL),
        );
      if (/^https?:/.test(process.env.SUPPORT_URL || ''))
        row.addComponents(
          new ButtonBuilder()
            .setLabel('Support')
            .setStyle(ButtonStyle.Link)
            .setURL(process.env.SUPPORT_URL),
        );
      i.reply({ content: 'Thanks for using the bot! 💙', components: [row] });
    },
  },
  {
    data: S
      ('say', 'Make the bot say something')
      .setDefaultMemberPermissions(P.ManageMessages)
      .setDMPermission(false)
      .addStringOption(o =>
        o.setName('text').setDescription('Message').setMaxLength(1800).setRequired(true)),
    run: async (i) => {
      await i.channel.send({
        content: i.options.getString('text'),
        allowedMentions: { parse: [] },
      });
      i.reply({ content: 'Sent.', ephemeral: true });
    },
  },
  {
    // more mod stuff
    data: S
      ('slowmode', 'Set channel slowmode')
      .setDefaultMemberPermissions(P.ManageChannels)
      .setDMPermission(false)
      .addIntegerOption(o =>
        o
          .setName('seconds')
          .setDescription('0 to disable')
          .setMinValue(0)
          .setMaxValue(21600)
          .setRequired(true)),
    run: async (i) => {
      try {
        await i.channel.setRateLimitPerUser(i.options.getInteger('seconds'));
        i.reply(`🐌 Slowmode set to ${i.options.getInteger('seconds')}s.`);
      } catch {
        deny(i, 'Missing permissions.');
      }
    },
  },
  {
    data: S
      ('nick', 'Change a nickname')
      .setDefaultMemberPermissions(P.ManageNicknames)
      .setDMPermission(false)
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o =>
        o.setName('nickname').setDescription('New nickname (empty resets)').setMaxLength(32)),
    run: async (i) => {
      try {
        await i.options.getMember('user').setNickname(i.options.getString('nickname') || null);
        i.reply('✅ Nickname updated.');
      } catch {
        deny(i, "I can't change that nickname.");
      }
    },
  },
  {
    data: S
      ('role', 'Add or remove a role')
      .setDefaultMemberPermissions(P.ManageRoles)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('add')
          .setDescription('Give a role')
          .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
          .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
      .addSubcommand(s =>
        s
          .setName('remove')
          .setDescription('Take a role')
          .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
          .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))),
    run: async (i) => {
      const r = i.options.getRole('role');
      const m = i.options.getMember('user');
      if (r.managed
        || i.member.roles.highest.position <= r.position && i.guild.ownerId !== i.user.id)
        return deny(i, "You can't manage that role.");

      try {
        i.options.getSubcommand() === 'add' ? await m.roles.add(r) : await m.roles.remove(r);
        i.reply(
          `✅ Done: ${r.name} ${i.options.getSubcommand() === 'add' ? 'added to' : 'removed from'} ${m}.`,
        );
      } catch {
        deny(i, 'I cannot manage that role (move my role higher).');
      }
    },
  },
];

const extra = [
  A(str(S('github', 'GitHub profile'), 'user', 'Username or profile link'), async (i) => {
    const user = i.options
      .getString('user')
      .trim()
      .replace(/^@/, '')
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .split(/[\/?#]/)
      [0];
    if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(user))
      throw nf('That is not a valid GitHub username.');
    const headers = {
      'user-agent': 'DiscordBot/1.0',
      accept: 'application/vnd.github+json',
      ...process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
    };
    const r = await fetch(
      `https://api.github.com/users/${user}`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (r.status === 404) throw nf('GitHub user not found.');
    if (r.status === 403 || r.status === 429)
      throw nf(
        'GitHub rate limit reached, try again later. (The bot owner can set GITHUB_TOKEN to raise it.)',
      );
    if (!r.ok) throw nf(`GitHub returned an error (${r.status}).`);
    const u = await r.json();
    const repos = await fetch(
      `https://api.github.com/users/${user}/repos?sort=updated&per_page=3`,
      { headers, signal: AbortSignal.timeout(8000) },
    ).then(x => x.ok ? x.json() : []).catch(() => []);
    const e = E
      ()
      .setTitle(u.name ? `${u.name} (@${u.login})` : `@${u.login}`)
      .setURL(u.html_url)
      .setThumbnail(u.avatar_url)
      .setDescription(u.bio || '*No bio*')
      .addFields(
        { name: 'Repos', value: String(u.public_repos), inline: true },
        { name: 'Followers', value: String(u.followers), inline: true },
        { name: 'Following', value: String(u.following), inline: true },
        {
          name: 'Joined',
          value: `<t:${Math.floor(new Date(u.created_at).getTime() / 1000)}:D>`,
          inline: true,
        },
      );
    if (u.location) e.addFields({ name: 'Location', value: u.location, inline: true });
    if (u.company) e.addFields({ name: 'Company', value: u.company, inline: true });

    if (repos.length)
      e.addFields({
        name: 'Recently updated',
        value: repos.map(x => `[${x.name}](${x.html_url})${x.language ? ` · ${x.language}` : ''} · ⭐ ${x.stargazers_count}`).join(
          '\n',
        ),
      });

    return { embeds: [e] };
  }),
];

module.exports = [...api, ...reactions, ...local, ...extra];
