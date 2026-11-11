const express = require('express');
const crypto = require('crypto');
const secure = require('./secure');
const { ChannelType } = require('discord.js');
const store = require('./db');
const meta = require('./meta');
const site = require('./site');
const { db } = store;
const { esc } = site;
const pages = require('./pages');
const { shell } = require('./layout');
const monitor = require('./monitor');
const usage = require('./usage');
const changelog = require('./changelog');
const adminpages = require('./adminpages');
const adminlog = require('./adminlog');
const honeypot = require('./honeypot');
const verify = require('./verify');
const confession = require('./confession');

// Dashboard modules: [key, type, label, hint]
const MODULES = {
  welcome: {
    icon: '👋',
    title: 'Welcome',
    preview: 'welcome',
    desc: 'Greet new members with a message and an optional image card.',
    fields: [
      ['welcome_channel', 'channel', 'Welcome channel'],
      ['welcome_msg', 'textarea', 'Message', 'Variables: {user} {server} {count}'],
      [
        'welcome_img',
        'toggle',
        'Send an image card',
        'Shows the member avatar, title and background',
      ],
      ['welcome_title', 'text', 'Card title', 'Default: WELCOME'],
      ['welcome_sub', 'text', 'Card subtitle', 'Default: {user}'],
      ['welcome_bg', 'url', 'Background image URL', 'Direct https link to a PNG/JPG (optional)'],
      ['welcome_color', 'color', 'Accent color'],
      ['autorole', 'role', 'Autorole for new members'],
    ],
  },
  goodbye: {
    icon: '🚪',
    title: 'Goodbye',
    preview: 'goodbye',
    desc: 'Say goodbye with a message and an optional image card.',
    fields: [
      ['goodbye_channel', 'channel', 'Goodbye channel'],
      ['goodbye_msg', 'textarea', 'Message', 'Variables: {user} {server} {count}'],
      ['goodbye_img', 'toggle', 'Send an image card'],
      ['goodbye_title', 'text', 'Card title', 'Default: GOODBYE'],
      ['goodbye_sub', 'text', 'Card subtitle', 'Default: {user}'],
      ['goodbye_bg', 'url', 'Background image URL', 'Direct https link to a PNG/JPG (optional)'],
      ['goodbye_color', 'color', 'Accent color'],
    ],
  },
  leveling: {
    icon: '📈',
    title: 'Leveling',
    desc: 'Reward active members with XP, levels and coins.',
    fields: [
      ['levels_on', 'toggle', 'Enable leveling', 'Members earn XP from chatting'],
      ['level_announce', 'toggle', 'Announce level-ups', 'Send a message when someone levels up'],
      ['xp_rate', 'number', 'XP multiplier', '0.5 – 5 (1 = normal)'],
    ],
  },
  automod: {
    icon: '🛡️',
    title: 'Auto-Moderation',
    desc: 'Automatically remove unwanted messages. Members with Manage Messages are ignored.',
    fields: [
      ['am_invites', 'toggle', 'Block invite links'],
      ['am_links', 'toggle', 'Block all links'],
      ['am_badwords', 'textarea', 'Blocked words', 'Comma separated, e.g. word1, word2'],
      ['modlog_channel', 'channel', 'Mod-log channel', 'Where removed messages are logged'],
    ],
  },
  logs: {
    icon: '📜',
    title: 'Logs',
    desc:
      'Record what happens in your server. Moderation actions go to the mod-log, everything else to the log channel.',
    fields: [
      [
        'modlog_channel',
        'channel',
        'Mod-log channel',
        'Bans, kicks, warns, timeouts, removed messages and honeypot catches',
      ],
      [
        'logs_channel',
        'channel',
        'Server log channel',
        'Messages, members, roles, channels, voice and bans',
      ],
      ['log_messages', 'toggle', 'Message edits and deletes'],
      ['log_members', 'toggle', 'Joins, leaves, nicknames, roles and timeouts'],
      ['log_roles', 'toggle', 'Role changes'],
      ['log_channels', 'toggle', 'Channel changes'],
      ['log_voice', 'toggle', 'Voice joins, leaves and moves', 'Can be noisy in busy servers'],
      ['log_bans', 'toggle', 'Bans and unbans'],
    ],
  },
  honeypot: {
    icon: '🍯',
    title: 'Honeypot',
    desc:
      'A trap channel. Anyone without moderator permissions who posts in it is removed automatically, which stops spam bots and hacked accounts.',
    fields: [
      [
        'honeypot_channel',
        'channel',
        'Honeypot channel',
        'Leave empty to turn it off. Run /honeypot setup to create one.',
      ],
      [
        'honeypot_action',
        'select',
        'What happens to them',
        'Members with Manage Messages, Kick or Ban permissions are never touched.',
        [
          ['ban', 'Ban'],
          ['softban', 'Softban (wipes their messages)'],
          ['kick', 'Kick'],
          ['timeout', 'Timeout for 7 days'],
        ],
      ],
    ],
    post: ['Post the warning notice in the channel', 'honeypot_channel'],
    extra: 'honeypot',
  },
  verify: {
    icon: '✅',
    title: 'Verification',
    desc:
      'New members press a button (or answer a small question) to get a role. Hide your other channels from @everyone and show them to that role.',
    fields: [
      ['verify_channel', 'channel', 'Verification channel', 'Where the button is posted'],
      ['verify_role', 'role', 'Verified role', 'Given after verifying. My role must be above it.'],
      ['verify_remove_role', 'role', 'Role to remove', 'Optional, e.g. an Unverified role'],
      [
        'verify_mode',
        'select',
        'How members verify',
        '',
        [['button', 'Button (one click)'], ['question', 'Question (small maths question)']],
      ],
    ],
    post: ['Post the verification button', 'verify_channel'],
    extra: 'verify',
  },
  confession: {
    icon: '🤫',
    title: 'Confessions',
    desc:
      'Members post anonymously with /confess. Moderators can see the sender if a post breaks the rules.',
    fields: [
      ['confession_channel', 'channel', 'Confession channel', 'Where confessions are posted'],
      [
        'confession_review',
        'channel',
        'Review channel',
        'Optional. Moderators approve each confession here before it is posted.',
      ],
    ],
    post: ['Post a button members can press to confess', 'confession_channel'],
    extra: 'confession',
  },
  economy: {
    icon: '💰',
    title: 'Economy',
    desc: 'Tune your server economy.',
    fields: [['daily_amount', 'number', 'Daily reward (coins)', 'Given by /daily']],
  },
  commands: {
    icon: '🧩',
    title: 'Commands',
    desc:
      'Customize the text prefix and disable commands you do not want in this server. Members with Manage Server can still use disabled commands.',
    fields: [
      [
        'prefix',
        'text',
        'Prefix',
        'Used for text commands such as m!help. Max 5 characters, no spaces. Default: m!',
      ],
      ['disabled_cmds', 'cmdlist', 'Disabled commands', 'Tick a command to turn it off here.'],
    ],
  },
  voice: {
    icon: '🔊',
    title: 'Temp Voice',
    desc: 'Settings for channels created from the ➕ Creator channel. Set it up with /vc setup.',
    fields: [
      [
        'tempvc_name',
        'textarea',
        'Channel name template',
        "Use {user} for the member's name. Default: 🔊 {user}'s room",
      ],
      ['tempvc_limit', 'number', 'Default user limit', '0 = unlimited (max 99)'],
    ],
  },
};

module.exports = client => {
  const app = express();
  const name = () => client.user?.username || process.env.BOT_NAME || 'NikaBot';
  const invite = () => `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=1099934297175&scope=bot%20applications.commands`;
  const redirect = `${process.env.BASE_URL}/callback`;

  const hidden = /^\/(guild|servers|leaderboard|login|logout|callback|preview|admin)/;
  const L = (req, title, body, extra = '') =>
    shell(
      req,
      name(),
      {
        title,
        body: site.h1(body),
        extra,
        noindex: hidden.test(req.path),
        session: req.session.user,
      },
    );

  app.set('trust proxy', process.env.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');

  try {
    app.use(require('compression')());
  } catch {}

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });

  const hits = new Map();
  setInterval(() => hits.clear(), 60000).unref();

  app.use((req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    n > 120 ? res.status(429).send('Too many requests, slow down.') : next();
  });

  app.use(express.urlencoded({ extended: false, limit: '20kb' }));

  // ---------- Login: an encrypted cookie holds the Discord login (not a file or database), so you stay signed in
  // for 30 days even when the host restarts or wipes its disk. Server lists are fetched from Discord on demand.
  const COOKIE = 'bot_session';
  const DAY = 864e5;
  const guildCache = new Map();
  const parseCookies = req =>
    Object.fromEntries(
      (req.headers.cookie || '')
        .split(';')
        .map(c => c.trim())
        .filter(Boolean)
        .map(c => {
          const i = c.indexOf('=');
          return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
        }),
    );
  const setCookie = (req, res, name, value, maxAge) =>
    res.append(
      'Set-Cookie',
      `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`,
    );
  const saveSession = (req, res) => {
    const s = req.session;
    setCookie(
      req,
      res,
      COOKIE,
      secure.seal({ u: s.user, at: s.at, rt: s.rt, exp: s.exp, iat: s.iat }),
      30 * 86400,
    );
  };

  app.use((req, res, next) => {
    const s = secure.unseal(parseCookies(req)[COOKIE]);
    req.session =
      s?.u && s.iat > Date.now() - 30 * DAY
        ? { user: s.u, at: s.at, rt: s.rt, exp: s.exp, iat: s.iat, guilds: null }
        : {};
    next();
  });

  // returns false when the login is no longer valid; throws on temporary Discord problems
  async function loadGuilds(req, res) {
    const s = req.session;
    const hit = guildCache.get(s.user.id);

    if (hit && hit.t > Date.now()) {
      s.guilds = hit.list;
      return true;
    }

    const get = tok =>
      fetch(
        'https://discord.com/api/users/@me/guilds',
        { headers: { authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(10000) },
      );
    let r = s.exp > Date.now() + 60000 ? await get(s.at) : null;

    if (!r || r.status === 401) {
      // access token expired: renew it with the refresh token
      const rr = await fetch(
        'https://discord.com/api/oauth2/token',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: s.rt || '',
          }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (rr.status >= 400 && rr.status < 500) return false;
      if (!rr.ok) throw new Error('Discord token service error ' + rr.status);
      const nt = await rr.json();
      Object.assign(
        s,
        {
          at: nt.access_token,
          rt: nt.refresh_token || s.rt,
          exp: Date.now() + nt.expires_in * 1000,
        },
      );
      saveSession(req, res);
      r = await get(s.at);
    }

    if (r.status === 429 && hit) {
      s.guilds = hit.list;
      return true;
    }

    if (r.status === 401 || r.status === 403) return false;
    if (!r.ok) throw new Error('Discord guilds error ' + r.status);
    const list = (await r.json()).map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      permissions: g.permissions,
    }));
    if (guildCache.size > 2000) guildCache.clear();
    guildCache.set(s.user.id, { t: Date.now() + 5 * 60000, list });
    s.guilds = list;
    return true;
  }

  const lbCache = new Map();
  let statsC = { t: 0 };
  const auth = async (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');

    try {
      if (await loadGuilds(req, res)) return next();
    } catch (e) {
      console.error('[auth]', e.message);
      return res.status(503).send('Discord is busy right now. Please refresh in a few seconds.');
    }

    res.append('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`);
    res.redirect('/login');
  };
  const canManage = (req, id) =>
    req.session.guilds?.some(g => g.id === id && BigInt(g.permissions) & 0x20n)
      && client.guilds.cache.has(id);
  const icon = g =>
    g.icon
      ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128" alt="">`
      : esc((g.name || '?')[0]);

  app.get('/api/stats', (req, res) => {
    if (statsC.t < Date.now())
      statsC = {
        t: Date.now() + 30000,
        v: {
          servers: client.guilds.cache.size,
          users: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
          commands: client.commandList?.length || 0,
        },
      };
    res.set('Cache-Control', 'public, max-age=30').json(statsC.v);
  });

  app.get('/invite', (req, res) => res.redirect(invite()));

  // ---------- public pages
  app.get('/', (req, res) => {
    const snap = monitor.snapshot(client);
    res.send(L(req, 'Home', pages.landing(client, name(), snap, changelog.list().slice(0, 3))));
  });

  app.get('/features', (req, res) => res.send(L(req, 'Features', pages.features())));
  app.get('/premium', (req, res) => res.send(L(req, 'Premium', pages.premium())));

  app.get('/commands', (req, res) => {
    const prefix = process.env.PREFIX || 'm!';
    res.send(L(req, 'Commands', pages.commands(client, prefix), pages.COMMANDS_SCRIPT));
  });

  app.get('/status', (req, res) => {
    res.send(
      L(req, 'Status', pages.statusPage(monitor.snapshot(client), name()), pages.STATUS_SCRIPT),
    );
  });

  app.get('/analytics', (req, res) => {
    const report = usage.report(parseInt(req.query.days, 10) || 30);
    res.send(
      L(req, 'Analytics', pages.analyticsPage(report), pages.analyticsScript(report.series)),
    );
  });

  app.get('/changelog', (req, res) => {
    res.send(L(req, 'Changelog', pages.changelogPage(changelog.list(), req.query.show)));
  });

  app.get(
    '/api/status',
    (req, res) => res.set('Cache-Control', 'no-store').json(monitor.snapshot(client)),
  );
  app.get(
    '/api/analytics',
    (req, res) =>
      res.set('Cache-Control', 'no-store').json(usage.report(parseInt(req.query.days, 10) || 30)),
  );
  app.get('/api/changelog', (req, res) => res.json(changelog.list()));

  // ---------- Public leaderboard
  app.get('/leaderboard/:id', async (req, res) => {
    const g = client.guilds.cache.get(req.params.id);
    if (!g)
      return res.status(404).send(
        L(req, 'Not found', '<div class=wrap><h2 class=t>Server not found</h2></div>'),
      );
    let ent = lbCache.get(g.id);

    if (!ent || ent.t < Date.now()) {
      const rows = db.prepare('SELECT * FROM levels WHERE guild=? ORDER BY xp DESC LIMIT 50').all(
        g.id,
      );
      const mem = await g.members.fetch({ user: rows.map(r => r.user) }).catch(() => null);
      const list0 = rows.map((r, n) => {
        const m = mem?.get(r.user);
        const L0 = store.lv(r.xp);
        const cur = 100 * L0 * L0;
        const nx = 100 * (L0 + 1) ** 2;
        return `<div class="card lb"><div class=rk>#${n + 1}</div><img src="${esc(m?.displayAvatarURL({ size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt=""><div class=in><b>${esc(m?.displayName || 'Unknown member')}</b><div class=bar><i style="width:${Math.round((r.xp - cur) / (nx - cur) * 100)}%"></i></div></div><div style="text-align:right"><b>Level ${L0}</b><br><small style="color:var(--mut)">${r.xp.toLocaleString()} XP</small></div></div>`;
      }).join('');

      if (lbCache.size > 500) lbCache.clear();
      ent = { t: Date.now() + 30000, list: list0 };
      lbCache.set(g.id, ent);
    }

    const list = ent.list;
    res.send(
      L(
        req,
        `${g.name} leaderboard`,
        `<div class=wrap style="max-width:760px"><h2 class=t>🏆 ${esc(g.name)}</h2><p class=sub>Top members by XP</p>${list || '<p class=sub>Nobody has XP yet. Start chatting!</p>'}</div>`,
      ),
    );
  });

  app.get('/preview/:id/:kind', auth, async (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    if (!['welcome', 'goodbye'].includes(req.params.kind)) return res.sendStatus(404);

    try {
      const u = req.session.user;
      const buf = await require('./card').render(
        req.params.kind,
        store.settings(g.id),
        {
          name: u.global_name || u.username,
          avatarUrl:
            u.avatar
              ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
              : 'https://cdn.discordapp.com/embed/avatars/0.png',
          server: g.name,
          count: g.memberCount,
        },
      );
      res.set('Cache-Control', 'no-store').type('png').send(buf);
    } catch (e) {
      console.error('[preview]', e.message);
      res.status(500).send('Preview unavailable (run npm install)');
    }
  });

  app.get(
    '/docs',
    (req, res) => res.send(L(req, 'Docs', site.docsPage(name(), process.env.PREFIX || 'm!'))),
  );
  app.get('/support', (req, res) => res.redirect(process.env.SUPPORT_URL || '/'));
  const baseUrl = () => (process.env.BASE_URL || site.URL).replace(/\/$/, '');
  const assets = new Map();
  const card = require('./card');
  const asset = (key, fn) => async (req, res) => {
    try {
      if (!assets.has(key)) assets.set(key, await fn());
      res.set('Cache-Control', 'public, max-age=86400').type('png').send(assets.get(key));
    } catch (e) {
      console.error('[asset]', e.message);
      res.sendStatus(500);
    }
  };

  app.get(
    '/favicon.svg',
    (req, res) =>
      res
        .set('Cache-Control', 'public, max-age=86400')
        .type('image/svg+xml')
        .send(site.faviconSvg()),
  );
  app.get(['/favicon-48.png', '/favicon.ico'], asset('48', () => card.renderIcon(48)));
  app.get('/apple-touch-icon.png', asset('180', () => card.renderIcon(180)));
  app.get('/icon-192.png', asset('192', () => card.renderIcon(192)));
  app.get('/icon-512.png', asset('512', () => card.renderIcon(512)));
  app.get(
    '/og.png',
    asset('og', () => card.renderOg(name(), 'Leveling, moderation, music and games')),
  );
  app.get(
    '/site.webmanifest',
    (req, res) =>
      res.type('application/manifest+json').send(
        JSON.stringify({
          name: name(),
          short_name: name(),
          description: 'Discord bot for leveling, moderation, music and games',
          start_url: '/',
          display: 'standalone',
          background_color: '#1e1f22',
          theme_color: '#1e1f22',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        }),
      ),
  );

  app.get(
    '/robots.txt',
    (req, res) =>
      res.type('text').send(
        `User-agent: *\nAllow: /\nDisallow: /guild/\nDisallow: /servers\nDisallow: /leaderboard/\nDisallow: /api/\nDisallow: /preview/\nDisallow: /admin\nDisallow: /login\nDisallow: /callback\n${baseUrl() ? `Sitemap: ${baseUrl()}/sitemap.xml\n` : ''}`,
      ),
  );

  app.get('/sitemap.xml', (req, res) => {
    const d = new Date().toISOString().slice(0, 10);
    const u = [
      ['/', 1],
      ['/features', 0.9],
      ['/commands', 0.9],
      ['/docs', 0.8],
      ['/premium', 0.5],
      ['/status', 0.6],
      ['/analytics', 0.4],
      ['/changelog', 0.4],
      ['/privacy', 0.3],
      ['/terms', 0.3],
    ];

    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u.map(([p, pr]) => `<url><loc>${baseUrl()}${p}</loc><lastmod>${d}</lastmod><priority>${pr}</priority></url>`).join('')}</urlset>`,
    );
  });

  app.get(
    '/privacy',
    (req, res) => res.send(L(req, 'Privacy Policy', site.privacy(name()), site.SPY)),
  );
  app.get(
    '/terms',
    (req, res) => res.send(L(req, 'Terms of Service', site.terms(name()), site.SPY)),
  );

  // ---------- Auth
  app.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    setCookie(req, res, 'bot_oauth', state, 600);
    res.redirect(
      `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&scope=identify%20guilds&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`,
    );
  });

  app.get('/logout', (req, res) => {
    if (req.session.user) guildCache.delete(req.session.user.id);
    res.append('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`);
    res.redirect('/');
  });

  app.get('/callback', async (req, res) => {
    try {
      if (!req.query.code || !req.query.state || req.query.state !== parseCookies(req).bot_oauth)
        return res.status(400).send('Login expired or invalid. <a href="/login">Try again</a>');
      const t = await (await fetch(
        'https://discord.com/api/oauth2/token',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: req.query.code,
            redirect_uri: redirect,
          }),
        },
      )).json();
      if (!t.access_token) throw new Error('no access token');
      const u = await (await fetch(
        'https://discord.com/api/users/@me',
        { headers: { authorization: `Bearer ${t.access_token}` } },
      )).json();
      req.session = {
        user: { id: u.id, username: u.username, global_name: u.global_name, avatar: u.avatar },
        at: t.access_token,
        rt: t.refresh_token,
        exp: Date.now() + t.expires_in * 1000,
        iat: Date.now(),
      };
      saveSession(req, res);
      res.append('Set-Cookie', 'bot_oauth=; Path=/; Max-Age=0');
      res.redirect('/servers');
    } catch (e) {
      console.error('[login]', e.message);
      res.status(500).send('Login failed. <a href="/login">Try again</a>');
    }
  });

  // ---------- Server picker
  app.get('/servers', auth, (req, res) => {
    const mine = req.session.guilds.filter(g => BigInt(g.permissions) & 0x20n).sort((a, b) =>
      client.guilds.cache.has(b.id) - client.guilds.cache.has(a.id));
    const card = g => `<div class="card srv"><div class=ic>${icon(g)}</div><b>${esc(g.name)}</b><br><br>${client.guilds.cache.has(g.id) ? `<a class="btn s" href=/guild/${g.id}>Dashboard</a>` : `<a class="btn s g" href="${esc(invite())}&guild_id=${g.id}&disable_guild_select=true">Set up</a>`}</div>`;
    res.send(
      L(
        req,
        'Servers',
        `<div class=wrap><h2 class=t>Select a server</h2><p class=sub>Hi ${esc(req.session.user.global_name || req.session.user.username)} 👋 Only servers where you have Manage Server are shown.</p><div class=srvs>${mine.map(card).join('') || '<p class=sub>No servers found.</p>'}</div></div>`,
      ),
    );
  });

  const cmdList = (k, v) => {
    const off = String(v || '').split(',');
    return `<div>${Object.entries(meta).map(([c, ns]) => `<b style="display:block;margin-top:12px">${esc(c)}</b><div class=cg>${ns.filter(n => n !== 'help').map(n => `<label class=ck><input type=checkbox name=${k} value=${n} ${off.includes(n) ? 'checked' : ''}> /${n}</label>`).join('')}</div>`).join('')}</div>`;
  };

  // ---------- Dashboard
  const ctx = (req, res) => {
    if (!canManage(req, req.params.id)) {
      res.sendStatus(403);
      return null;
    }

    return client.guilds.cache.get(req.params.id);
  };
  const side = (g, cur) => {
    const link = (
      key,
      href,
      label,
    ) => `<a class="${cur === key ? 'on' : ''}" href="${href}">${label}</a>`;
    const mods = Object
      .entries(MODULES)
      .map(([k, m]) => link(k, `/guild/${g.id}/${k}`, `${m.icon} ${m.title}`))
      .join('');
    return `<aside class=side>${link('overview', `/guild/${g.id}`, '🏠 Overview')}${mods}<b class=sidehead>Admin tools</b>${link('cases', `/guild/${g.id}/cases`, '🔨 Mod cases')}${link('confessions', `/guild/${g.id}/confessions`, '🤫 Confession review')}${link('activity', `/guild/${g.id}/activity`, '🕘 Dashboard activity')}<a href=/leaderboard/${g.id}>🏆 Leaderboard ↗</a><a href=/servers>↩ Servers</a></aside>`;
  };

  app.get('/guild/:id', auth, (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const s = store.settings(g.id);
    const cards = Object
      .entries(MODULES)
      .map((
        [k, m],
      ) => `<a class=card href=/guild/${g.id}/${k}><div class=ico>${m.icon}</div><h3>${m.title}</h3><p>${m.desc}</p></a>`)
      .join('');

    res.send(
      L(
        req,
        g.name,
        `<div class="wrap dash">${side(g, 'overview')}<main>${adminpages.overview(g, s, invite())}<h3 style="margin:26px 0 10px">All settings</h3><div class=grid>${cards}</div></main></div>`,
      ),
    );
  });

  // ---------- admin tools
  const page = (req, g, key, html) =>
    L(req, g.name, `<div class="wrap dash">${side(g, key)}<main>${html}</main></div>`);

  app.get('/guild/:id/cases', auth, (req, res) => {
    const g = ctx(req, res);
    if (g) res.send(page(req, g, 'cases', adminpages.casesPage(g, req.query)));
  });

  app.get('/guild/:id/cases.csv', auth, (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    adminlog.add(g.id, req.session.user, 'Cases', 'exported moderation cases as CSV');
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cases-${g.id}.csv"`,
    }).send(adminpages.casesCsv(g, req.query));
  });

  app.get('/guild/:id/activity', auth, (req, res) => {
    const g = ctx(req, res);
    if (g) res.send(page(req, g, 'activity', adminpages.activityPage(g, req.query)));
  });

  const confessionFlash = {
    deleted: '<div class=ok>Confession deleted.</div>',
    blocked: '<div class=ok>That member can no longer send confessions.</div>',
    unblocked: '<div class=ok>That member can send confessions again.</div>',
    badid: '<div class=warn>Paste a valid user ID.</div>',
  };

  app.get('/guild/:id/confessions', auth, (req, res) => {
    const g = ctx(req, res);
    if (g)
      res.send(
        page(req, g, 'confessions', adminpages.confessionsPage(g, confessionFlash[req.query.t])),
      );
  });

  app.post('/guild/:id/confessions/block', auth, (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const id = String(req.body.user || '').replace(/\D/g, '');
    if (id.length < 5) return res.redirect(`/guild/${g.id}/confessions?t=badid`);
    const unblock = req.body.do === 'unblock';

    if (unblock) confession.unblock(g.id, id);
    else confession.block(g.id, id);

    adminlog.add(
      g.id,
      req.session.user,
      'Confessions',
      `${unblock ? 'unblocked' : 'blocked'} member ${id}`,
    );
    res.redirect(`/guild/${g.id}/confessions?t=${unblock ? 'unblocked' : 'blocked'}`);
  });

  app.post('/guild/:id/confessions/:num/delete', auth, async (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const num = Number(req.params.num);
    await confession.remove(g, num);
    adminlog.add(g.id, req.session.user, 'Confessions', `deleted confession #${num}`);
    res.redirect(`/guild/${g.id}/confessions?t=deleted`);
  });

  app.post('/guild/:id/confessions/:num/reveal', auth, (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const num = Number(req.params.num);
    const row = db.prepare('SELECT author FROM confessions WHERE guild = ? AND num = ?').get(
      g.id,
      num,
    );
    if (!row) return res.sendStatus(404);

    adminlog.add(
      g.id,
      req.session.user,
      'Confessions',
      `revealed the sender of confession #${num}`,
    );
    const log =
      store.settings(g.id).modlog_channel
        && g.channels.cache.get(store.settings(g.id).modlog_channel);
    log?.send({
      content: `🔎 ${esc(req.session.user.username)} revealed the sender of confession #${num} from the dashboard.`,
      allowedMentions: { parse: [] },
    }).catch(() => {});

    const who = g.members.cache.get(row.author);
    const note = `<div class=ok>Confession #${num} was sent by <b>${esc(who ? who.user.tag : 'a member who is not cached')}</b> <code>${esc(row.author)}</code>. This lookup was logged.</div>`;
    res.send(page(req, g, 'confessions', adminpages.confessionsPage(g, note)));
  });

  const flashModule = t => ({
    posted: '<div class=ok>Posted in your channel.</div>',
    postfail:
      "<div class=warn>I could not post there. Check that I can View Channel, Send Messages and Embed Links in that channel.</div>",
    nochan: '<div class=warn>Choose a channel and save first.</div>',
  }[t]
    || '');

  // button that posts the panel / notice for honeypot, verify and confession
  const postBox = (g, key, mod, s) => {
    if (!mod.post) return '';
    return `<div class=card><h3>Post it</h3><form method=post action="/guild/${g.id}/${key}/post"><button class="btn g" ${s[mod.post[1]] ? '' : 'disabled'}>${mod.post[0]}</button>${s[mod.post[1]] ? '' : '<small style="display:block;color:var(--mut);margin-top:6px">Choose a channel and save first.</small>'}</form></div>`;
  };

  app.get('/guild/:id/:mod', auth, (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const mod = MODULES[req.params.mod];
    if (!mod) return res.sendStatus(404);
    const s = store.settings(g.id);
    let warn = '';
    let fix = '';
    const T = req.query.t;

    if (mod.preview) {
      const chId = s[mod.preview + '_channel'];
      const ch = chId && g.channels.cache.get(chId);

      if (!chId) warn = 'No channel is selected, so nothing will be sent yet.';
      else if (ch) {
        const miss = [
          'ViewChannel',
          'SendMessages',
          'AttachFiles',
          'EmbedLinks',
        ].filter(p => !ch.permissionsFor(g.members.me)?.has(p));

        if (miss.length) {
          warn = `I can't post in #${esc(ch.name)}. Missing permissions: ${miss.map(p => p.replace(/([A-Z])/g, ' $1').trim()).join(', ')}.`;
          fix = `<form method=post action="/guild/${g.id}/${req.params.mod}/fixperms" style="margin-top:10px"><button class="btn s">Fix permissions automatically</button></form><small style="display:block;margin-top:8px">If that doesn't work: open the channel's settings, go to Permissions, add my role and allow View Channel, Send Messages, Embed Links and Attach Files.</small>`;
        }
      }
    }

    const chans = g.channels.cache.filter(c => c.type === ChannelType.GuildText);
    const roles = g.roles.cache.filter(r => r.id !== g.id && !r.managed);
    const opt = (items, sel, pre) =>
      '<option value="">— none —</option>'
        + items.map(i => `<option value=${i.id} ${i.id === sel ? 'selected' : ''}>${pre}${esc(i.name)}${pre === '#' && !i.permissionsFor?.(g.members.me)?.has(['ViewChannel', 'SendMessages']) ? ' (bot cannot post here)' : ''}</option>`).join(
          '',
        );
    const field = ([k, t, label, hint, options]) => {
      const h = hint ? `<small>${esc(hint)}</small>` : '';
      if (t === 'toggle')
        return `<div class="fr tg"><div><b>${label}</b>${h}</div><label class=sw><input type=checkbox name=${k} value=1 ${s[k] ? 'checked' : ''}><span></span></label></div>`;
      const inp =
        t === 'select'
          ? `<select name=${k}>${(options || []).map(([v, l]) => `<option value=${v} ${(s[k] || options[0][0]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
          : t === 'channel'
            ? `<select name=${k}>${opt([...chans.values()], s[k], '#')}</select>`
            : t === 'role'
              ? `<select name=${k}>${opt([...roles.values()], s[k], '')}</select>`
              : t === 'number'
                ? `<input type=number step=0.1 name=${k} value="${esc(s[k])}">`
                : t === 'cmdlist'
                  ? cmdList(k, s[k])
                  : t === 'text' || t === 'url'
                    ? `<input name=${k} value="${esc(s[k])}" maxlength=300>`
                    : t === 'color'
                      ? `<input type=color name=${k} value="${esc(s[k] || (k.startsWith('goodbye') ? '#ed4245' : '#5865f2'))}" style="height:46px;padding:4px">`
                      : `<textarea name=${k} rows=3>${esc(s[k])}</textarea>`;
      return `<div class=fr><b>${label}</b>${h}${inp}</div>`;
    };

    res.send(
      L(
        req,
        mod.title,
        `<div class="wrap dash">${side(g, req.params.mod)}<main><h2 style="margin:0 0 6px">${mod.icon} ${mod.title}</h2><p style="color:var(--mut);margin-top:0">${mod.desc}</p>
${req.query.saved ? '<div class=ok>✅ Settings saved</div>' : ''}${T === 'ok' ? '<div class=ok>✅ Test message sent. Check your channel in Discord.</div>' : T === 'nochan' ? '<div class=warn>⚠️ Choose a channel and save first.</div>' : T === 'fail' ? '<div class=warn>⚠️ I could not send the test message. Check my permissions in that channel.</div>' : T === 'permok' ? '<div class=ok>✅ Permissions fixed. Send the test message again.</div>' : T === 'permfail' ? '<div class=warn>⚠️ Discord would not let me change that channel. Open Channel Settings → Permissions and allow my role to View Channel, Send Messages, Embed Links and Attach Files (or give my role Administrator).</div>' : ''}${flashModule(T)}${warn ? `<div class=warn>⚠️ ${warn}${fix}</div>` : ''}${mod.preview ? `<div class=card><b>Preview</b>${!s[mod.preview + '_img'] ? '<small style="display:block;color:#f0b232;margin-bottom:4px">The image card is OFF, so only your text message is sent. Turn on “Send an image card” below and save.</small>' : ''}<small style="display:block;color:var(--mut)">Updates after you save. Uses your own avatar as a sample.</small><form method=post action="/guild/${g.id}/${req.params.mod}/test" style="margin-top:10px"><button class="btn g s">Send a test message to Discord</button></form><img src="/preview/${g.id}/${mod.preview}?t=${Date.now()}" alt="preview" style="width:100%;border-radius:12px;margin-top:10px"></div>` : ''}<form method=post class=card>${mod.fields.map(field).join('')}<br><button class=btn>Save changes</button></form>${postBox(g, req.params.mod, mod, s)}${mod.extra ? adminpages.extra(mod.extra, g, s) : ''}</main></div>`,
      ),
    );
  });

  app.post('/guild/:id/:mod/post', auth, async (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const kind = req.params.mod;
    const s = store.settings(g.id);
    let t = 'postfail';

    try {
      if (kind === 'verify') {
        const issue = verify.problem(g);
        if (issue) throw new Error(issue);
        await verify.postPanel(g);
        t = 'posted';
      } else if (kind === 'honeypot') {
        const ch = g.channels.cache.get(s.honeypot_channel);

        if (!ch) t = 'nochan';
        else {
          await honeypot.postNotice(ch, s.honeypot_action || 'ban');
          t = 'posted';
        }
      } else if (kind === 'confession') {
        await confession.postPanel(g);
        t = 'posted';
      } else return res.sendStatus(404);
    } catch (e) {
      console.error('[post]', e.message);
    }

    if (t === 'posted')
      adminlog.add(g.id, req.session.user, MODULES[kind].title, 'posted the panel in Discord');
    res.redirect(`/guild/${g.id}/${kind}?t=${t}`);
  });

  app.post('/guild/:id/:mod/fixperms', auth, async (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const kind = req.params.mod;
    if (!['welcome', 'goodbye'].includes(kind)) return res.sendStatus(404);
    const ch = g.channels.cache.get(store.settings(g.id)[kind + '_channel']);
    let t = 'permfail';

    if (ch)
      try {
        await ch.permissionOverwrites.edit(
          g.members.me,
          { ViewChannel: true, SendMessages: true, EmbedLinks: true, AttachFiles: true },
          { reason: 'Dashboard: fix bot permissions' },
        );
        t = 'permok';
      } catch (e) {
        console.error('[fixperms]', e.message);
      }

    res.redirect(`/guild/${g.id}/${kind}?t=${t}`);
  });

  app.post('/guild/:id/:mod/test', auth, async (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const kind = req.params.mod;
    if (!['welcome', 'goodbye'].includes(kind)) return res.sendStatus(404);
    let t = 'fail';

    try {
      if (!store.settings(g.id)[kind + '_channel']) t = 'nochan';
      else {
        const m = await g.members.fetch(req.session.user.id);
        t = await require('./welcome').sendGreeting(m, kind) ? 'ok' : 'fail';
      }
    } catch (e) {
      console.error('[test]', e.message);
    }

    res.redirect(`/guild/${g.id}/${kind}?t=${t}`);
  });

  app.post('/guild/:id/:mod', auth, (req, res) => {
    const g = ctx(req, res);
    if (!g) return;
    const mod = MODULES[req.params.mod];
    if (!mod) return res.sendStatus(404);

    const before = { ...store.settings(g.id) };
    const changed = [];

    for (const f of mod.fields) {
      const [k, t] = f;
      let v = req.body[k];

      if (t === 'toggle') v = v ? 1 : 0;
      else if (t === 'number') {
        v = Number(v);
        if (!Number.isFinite(v)) continue;
        v =
          k === 'tempvc_limit'
            ? Math.min(99, Math.max(0, Math.round(v)))
            : k === 'xp_rate'
              ? Math.min(5, Math.max(0.5, v))
              : Math.min(100000, Math.max(1, Math.round(v)));
      } else if (t === 'select')
        v = (f[4] || []).some(o => o[0] === v) ? v : f[4]?.[0]?.[0] ?? null;
      else if (t === 'channel') v = g.channels.cache.has(v) ? v : null;
      else if (t === 'role') v = g.roles.cache.has(v) ? v : null;
      else if (t === 'cmdlist')
        v =
          []
            .concat(req.body[k] || [])
            .filter(n => n !== 'help' && Object.values(meta).flat().includes(n))
            .join(',')
            || null;
      else if (t === 'color') v = /^#[0-9a-f]{6}$/i.test(v || '') ? v : null;
      else if (t === 'url') v = /^https:\/\/\S{3,290}$/.test(v || '') ? v : null;
      else if (t === 'text')
        v =
          (k === 'prefix'
            ? String(v ?? '').replace(/\s/g, '').slice(0, 5)
            : String(v ?? '').slice(0, 100))
            || null;
      else v = String(v ?? '').slice(0, 1000) || null;

      if ((before[k] ?? null) !== (v ?? null) && !(t === 'toggle' && !!before[k] === !!v))
        changed.push(f[2]);
      store.setSetting(g.id, k, v);
    }

    if (changed.length)
      adminlog.add(g.id, req.session.user, mod.title, `changed ${changed.join(', ')}`);
    res.redirect(`/guild/${g.id}/${req.params.mod}?saved=1`);
  });

  app.get('/guild/:id/welcome-old', (req, res) => res.redirect(`/guild/${req.params.id}`));

  // ---------- owner admin (status notices, incidents, changelog)
  const owners = () => (process.env.OWNER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);

  const ownerOnly = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!owners().includes(req.session.user.id))
      return res.status(403).send(L(req, 'Not allowed', pages.notFound()));
    next();
  };

  // forms only count if they were sent from our own pages
  const sameSite = (req, res, next) => {
    const from = req.headers.origin || req.headers.referer || '';
    if (from && process.env.BASE_URL && !from.startsWith(baseUrl())) return res.sendStatus(403);
    next();
  };

  const act = fn => (req, res) => {
    let msg = 'Saved.';

    try {
      fn(req);
    } catch (e) {
      msg = e.message;
    }

    res.redirect('/admin?m=' + encodeURIComponent(msg.slice(0, 120)));
  };

  app.get('/admin', ownerOnly, (req, res) => {
    const snap = monitor.snapshot(client);
    const mine = changelog.list().filter(e => e.id);
    const body = pages.adminPage(snap, mine, req.query.m ? String(req.query.m).slice(0, 120) : '');
    res.send(L(req, 'Admin', body, pages.ADMIN_SCRIPT));
  });

  app.post('/admin/maintenance', ownerOnly, sameSite, act(req => monitor.addMaintenance(req.body)));
  app.post(
    '/admin/maintenance/:id/cancel',
    ownerOnly,
    sameSite,
    act(req => monitor.cancelMaintenance(Number(req.params.id))),
  );
  app.post('/admin/incidents', ownerOnly, sameSite, act(req => monitor.manualIncident(req.body)));
  app.post(
    '/admin/incidents/:id/update',
    ownerOnly,
    sameSite,
    act(req => monitor.postUpdate(Number(req.params.id), req.body.status, req.body.message)),
  );
  app.post(
    '/admin/incidents/:id/delete',
    ownerOnly,
    sameSite,
    act(req => monitor.deleteIncident(Number(req.params.id))),
  );
  app.post('/admin/changelog', ownerOnly, sameSite, act(req => changelog.add(req.body)));
  app.post(
    '/admin/changelog/:id/delete',
    ownerOnly,
    sameSite,
    act(req => changelog.remove(Number(req.params.id))),
  );

  app.use((req, res) => res.status(404).send(L(req, 'Page not found', pages.notFound())));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[web]', err.message);
    if (res.headersSent) return;
    if (req.path.startsWith('/api/'))
      return res.status(500).json({ error: 'Something went wrong' });
    res.status(500).send(L(req, 'Something went wrong', pages.serverError()));
  });

  app.listen(process.env.PORT || 3000, () => console.log('Website on', process.env.BASE_URL));
};
