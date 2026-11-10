// Branding, SEO tags, legal pages and docs for the website
const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  ).replace(/\p{Extended_Pictographic}/gu, c => '&#' + c.codePointAt(0) + ';');
const LAST = 'November 10, 2026';

// logo: a small sun on a dark tile
const sunPaths = `<circle cx="16" cy="16" r="5.2" fill="#ffc43d"/><g stroke="#ffc43d" stroke-width="2.2" stroke-linecap="round"><path d="M16 4.5v3M16 24.5v3M4.5 16h3M24.5 16h3M7.9 7.9l2.1 2.1M22 22l2.1 2.1M7.9 24.1L10 22M22 10l2.1-2.1"/></g>`;
const logo = (size = 32) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#241d52"/>${sunPaths}</svg>`;
const faviconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#241d52"/>${sunPaths}</svg>`;

// ---------- Icons (inline SVG, replace every emoji on the website)
const { P, EMOJI } = require('./icons');
const icon = (
  n,
  s,
) => `<svg class="ic" viewBox="0 0 24 24"${s ? ` width="${s}" height="${s}"` : ''} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.sparkles}</svg>`;

// swap every known emoji in the rendered page for an inline SVG icon (user content is entity-encoded, so it is never touched)
const iconize = html =>
  html.replace(/(\p{Extended_Pictographic})\uFE0F?/gu, (m, c) => EMOJI[c] ? icon(EMOJI[c]) : m);
const h1 = body =>
  /<h1[\s>]/.test(body)
    ? body
    : body.replace(
      /<h2 class=t([^>]*)>([\s\S]*?)<\/h2>/,
      '<h1 class=t$1>$2</h1>',
    ); // exactly one h1 per page (SEO)

// ---------- SEO
const META = {
  Home: 'NikaBot is a free Discord bot with leveling, moderation, music, economy, games, welcome cards, tickets and giveaways, plus a live status page and web dashboard.',
  Features: 'Everything NikaBot can do: leveling, auto-moderation, music, economy, games, temporary voice channels, tickets, giveaways and welcome cards.',
  Commands: 'Searchable list of every NikaBot command with descriptions, grouped by category.',
  Docs: 'Setup guides for welcome cards, leveling, auto-moderation, temporary voice channels, music, tickets and giveaways.',
  Premium: 'Everything is free. See pricing and upcoming premium options.',
  Status: 'Live status of NikaBot: Discord connection, API, database, latency, 30-day uptime, incidents and planned maintenance.',
  Analytics: 'Which NikaBot commands are used the most and how usage is trending.',
  Changelog: 'Every update to the bot and the website, newest first.',
  'Privacy Policy': 'How the bot collects, uses and protects data, and your privacy rights.',
  'Terms of Service': 'The rules for using the bot and website.',
  'Page not found': 'This page does not exist.',
};

// everything that goes inside <head>
function head({ title, path, name, base, noindex }) {
  const home = title === 'Home';
  const full = home ? `${name}: free Discord bot for leveling, moderation and music` : `${title} · ${name}`;
  const desc = META[title] || META.Home;
  const url = base + (path || '/');
  const img = base + '/og.png';

  const ld = home
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', name, url: base + '/' },
          { '@type': 'Organization', name, url: base + '/', logo: base + '/icon-512.png' },
          {
            '@type': 'SoftwareApplication',
            name,
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Discord',
            description: META.Home,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
          {
            '@type': 'FAQPage',
            mainEntity: FAQS.map(([q, a]) => ({
              '@type': 'Question',
              name: q,
              acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
            })),
          },
        ],
      }).replace(/</g, '\\u003c')}</script>`
    : '';

  const robots = noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#14112b" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f6f4fd" media="(prefers-color-scheme: light)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(full)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-48.png" sizes="48x48" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:wght@400..800&display=swap">
<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
${ld}`;
}

// ---------- shared page builders
const contact = () => `${process.env.SUPPORT_URL ? `our <a href="${esc(process.env.SUPPORT_URL)}">support server</a>` : 'our support server'}${process.env.CONTACT_EMAIL ? ` or <a href="mailto:${esc(process.env.CONTACT_EMAIL)}">${esc(process.env.CONTACT_EMAIL)}</a>` : ''}`;
const OP = () =>
  process.env.OPERATOR_NAME ? esc(process.env.OPERATOR_NAME) : 'the operator of this bot';
const legal = (
  active,
  icon,
  title,
  intro,
  tldr,
  secs,
) => `<div class="wrap legal" style="max-width:1060px"><div class=tabs><a class="${active === 'privacy' ? 'on' : ''}" href=/privacy>🔒 Privacy Policy</a><a class="${active === 'terms' ? 'on' : ''}" href=/terms>📜 Terms of Service</a></div>
<h2 class=t style="text-align:left;margin:8px 0 4px">${title}</h2><p style="color:var(--mut);margin:0 0 16px">Effective ${LAST} · Version 2.0</p><p style="max-width:760px">${intro}</p>
<div class=tldr>${tldr.map(([ic, h, d]) => `<div class=card><div class=ico>${ic}</div><b>${h}</b><p>${d}</p></div>`).join('')}</div>
<div class=lgrid><nav class=lside><b>On this page</b>${secs.map((s, n) => `<a href="#s${n + 1}">${n + 1}. ${s[0]}</a>`).join('')}</nav><div class=lbody>${secs.map((s, n) => `<h2 id="s${n + 1}">${n + 1}. ${s[0]}</h2>${s[1]}`).join('')}</div></div></div>`;
const SPY = `<script>(()=>{const l=[...document.querySelectorAll('.lside a')],h=l.map(a=>document.querySelector(a.getAttribute('href')));const f=()=>{let c=0;h.forEach((e,n)=>{if(e&&e.getBoundingClientRect().top<140)c=n});l.forEach((a,n)=>a.classList.toggle('on',n===c))};addEventListener('scroll',f,{passive:true});f()})()</script>`;
const tbl = (
  head,
  rows,
) => `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;

const privacy = n =>
  legal(
    'privacy',
    '🔒',
    'Privacy Policy',
    `This Privacy Policy explains what personal data <b>${esc(n)}</b> ("the Bot", "we", "us") collects, why we collect it, who we share it with, how long we keep it, and the choices you have. It applies to the Bot on Discord and to this website. ${OP() === 'the operator of this bot' ? '' : `The Bot is operated by <b>${OP()}</b>.`}`,
    [
      [
        '🔒',
        'No message archive',
        'We read messages live to run commands, XP and auto-moderation, but we do not store them.',
      ],
      ['🛡', 'Never sold', 'We do not sell your data and we do not run ads or profiling.'],
      [
        '✅',
        'You are in control',
        'Ask us to access or delete your data at any time, or remove the Bot from your server.',
      ],
      [
        '🌐',
        'Third parties',
        'Some commands send what you type to outside services. They are all listed below.',
      ],
    ],
    [
      [
        'Who we are',
        `<p>${OP() === 'the operator of this bot' ? 'The Bot is run by an independent operator.' : `The Bot is operated by <b>${OP()}</b>.`} For privacy questions and requests, contact us via ${contact()}. For the purposes of laws such as the GDPR, the operator is the data controller for the data described here.</p>`,
      ],
      [
        'Data we collect',
        tbl(
          ['Data', 'Why we use it', 'How long we keep it'],
          [
            [
              'Discord user, server, channel and role IDs, plus the usernames and avatars Discord sends us',
              'Run commands, leaderboards, rank and welcome cards',
              'While the Bot is in the server',
            ],
            [
              'Coins, items, animals, XP, levels, luck, game statistics, lottery tickets',
              'Economy, leveling and games',
              'Until you ask us to delete it',
            ],
            [
              'Moderation cases, warnings, temporary bans',
              'Server moderation history for administrators',
              'Until deleted by an administrator or on request',
            ],
            [
              'Server settings: channels, messages, auto-mod words, image links, prefix, disabled commands',
              'Dashboard configuration',
              'Until you reset them or remove the Bot',
            ],
            [
              'Text you submit to a command: reminders, polls, giveaway entries, ticket and voice channel records',
              'Provide that feature',
              'Reminders are deleted after delivery; polls and giveaways after they end',
            ],
            [
              'Website login: user ID, username, avatar and your server list (Discord scopes <i>identify</i> and <i>guilds</i>)',
              'Let you manage your servers',
              'Encrypted login cookie for up to 30 days',
            ],
            [
              'Encrypted database backups (the data in this table) stored in a private Discord channel owned by the operator',
              'Restore your data if the host restarts or loses its disk',
              'The 5 most recent backups; older ones are deleted automatically',
            ],
            [
              'Website server logs: IP address, browser, pages visited',
              'Security and abuse prevention',
              'Kept by the hosting provider, normally up to 30 days',
            ],
            [
              'Health checks: online status, ping and daily command counts',
              'Public status page',
              'Daily totals are kept, no personal data',
            ],
          ],
        ),
      ],
      [
        'What we do not collect',
        '<ul><li><b>Message content</b> is not stored. The only exceptions are text you deliberately submit to a command, and the text of a message removed by auto-moderation, which is posted to the mod-log channel your server administrators chose.</li><li><b>Voice audio</b> is never recorded or listened to. The Bot only plays music into voice channels.</li><li><b>Direct messages</b> are not read. The Bot only sends DMs for moderation notices, reminders and invites you trigger.</li><li>We do not collect payment details, passwords, precise location or contact lists.</li></ul>',
      ],
      [
        'How we use data',
        '<p>We use data only to provide and improve the Bot, keep servers safe, prevent abuse and fix problems, and to meet legal obligations. Under the GDPR our legal bases are performing the service you asked for, our legitimate interest in running and protecting the Bot, and your consent where we ask for it.</p>',
      ],
      [
        'Third-party services',
        `<p>To answer certain commands, the Bot sends the text you provide to outside services. Their own privacy policies apply.</p>${tbl(['Service', 'Used for', 'What is sent'], [
    ['Discord', 'Everything the Bot does', 'Events and messages Discord delivers to bots'], ['SoundCloud, Audius, Internet Archive, Jamendo, radio-browser.info', 'Music search and streaming', 'Your search text; the hosting server\'s IP address'],
    ['Open-Meteo, Wikipedia, dictionaryapi.dev, MyMemory, GitHub', '/weather, /wiki, /define, /translate, /github', 'The city, topic, word, text or username you type'], ['icanhazdadjoke, uselessfacts, meme-api, nekos.best, Open Trivia DB', 'Jokes, facts, memes, GIFs, trivia', 'No personal data'],
    ['AI provider set by the operator', '/chat', 'The message you submit to /chat'], ['Image hosts you choose', 'Welcome and goodbye card backgrounds', 'The Bot downloads the image link an administrator enters'], ['Hosting provider', 'Runs the Bot and website', 'Website visitor IP addresses and request logs']])}`,
      ],
      [
        'Cookies',
        `${tbl(['Cookie', 'Purpose', 'Lifetime'], [['Login cookie', 'Keeps you signed in to the dashboard. It is encrypted and holds your Discord ID, username, avatar and Discord login tokens (strictly necessary)', 'Up to 30 days, or until you log out']])}<p>We do not use advertising, analytics or tracking cookies.</p>`,
      ],
      [
        'Retention and deletion',
        `<p>We keep data only as long as described above. When the Bot is removed from a server, that server's data stops being used and can be deleted on request. To have your own data deleted, contact us via ${contact()} with your Discord user ID. We will confirm once it is done, normally within 30 days. Some data may remain in backups for a short time before it is overwritten.</p>`,
      ],
      [
        'Your rights',
        `<p>Depending on where you live (for example under the GDPR, UK GDPR or CCPA/CPRA) you may have the right to access your data, correct it, delete it, restrict or object to its use, receive a copy in a portable format, and withdraw consent. You also have the right to complain to your local data protection authority. We do not sell or share personal information for cross-context advertising, and we do not respond differently to "Do Not Track" signals because we do not track you. To use your rights, contact ${contact()}.</p>`,
      ],
      [
        'International transfers',
        '<p>The Bot and the services listed above may process data in countries other than yours, including the United States. Where required, we rely on appropriate safeguards such as standard contractual clauses used by those providers.</p>',
      ],
      [
        'Children',
        '<p>The Bot is intended for people who meet Discord\'s minimum age (13, or higher where local law requires). We do not knowingly collect data from younger children. If you believe a child has given us data, contact us and we will delete it.</p>',
      ],
      [
        'Security',
        '<p>We protect data with access controls, encrypted connections (HTTPS) and limited access for administrators. No online service is perfectly secure, so we cannot guarantee absolute security. If a breach affects your data we will notify affected users and authorities as the law requires.</p>',
      ],
      [
        'Changes to this policy',
        '<p>We may update this policy. When we do, we will change the effective date above, and for material changes we will announce them in the support server or on this page. Continued use after a change means you accept it.</p>',
      ],
      ['Contact', `<p>Privacy questions, access or deletion requests: ${contact()}.</p>`],
    ],
  );

const terms = n =>
  legal(
    'terms',
    '📜',
    'Terms of Service',
    `These Terms of Service ("Terms") are the rules for using <b>${esc(n)}</b> ("the Bot") and this website. By adding the Bot to a server, using its commands or using the website, you agree to these Terms and to our <a href="/privacy">Privacy Policy</a>. If you do not agree, please do not use the Bot.`,
    [
      ['✅', 'Be fair', 'Do not abuse the Bot, exploit bugs or attack the service.'],
      [
        '🎰',
        'Virtual only',
        'Coins, items and games have no real-world value. No real-money gambling.',
      ],
      [
        '🎵',
        'Respect copyright',
        'Music comes from third-party services and you are responsible for what you play.',
      ],
      [
        '🛡',
        'Admins decide',
        'Server administrators are responsible for how the Bot is used in their server.',
      ],
    ],
    [
      [
        'Who may use the Bot',
        '<p>You must be old enough to use Discord in your country (at least 13) and comply with the <a href="https://discord.com/terms">Discord Terms of Service</a> and <a href="https://discord.com/guidelines">Community Guidelines</a>. If you add the Bot to a server, you confirm you have permission to manage that server. If you use the Bot on behalf of an organization, you confirm you may bind it to these Terms.</p>',
      ],
      [
        'Acceptable use',
        '<p>You agree not to:</p><ul><li>abuse, overload, scrape, reverse-engineer or try to disrupt the Bot, the website or their infrastructure;</li><li>exploit bugs, use scripts or multiple accounts to gain an unfair advantage, or trade virtual items for real money;</li><li>use the Bot for harassment, hate speech, spam, scams, malware or any illegal activity;</li><li>use the Bot to infringe copyright or other rights, or to target minors with unsafe content;</li><li>attempt to access data, settings or servers you are not authorized to manage;</li><li>use music, AI or lookup features to produce or distribute unlawful or harmful content.</li></ul>',
      ],
      [
        'Server administrators',
        '<p>Administrators are responsible for how the Bot is configured and used in their server, including moderation actions, auto-moderation rules, welcome and goodbye content, mod-log channels and informing their members about data handling. Moderation tools are aids, not guarantees; the Bot can make mistakes and administrators remain responsible for the actions taken in their servers.</p>',
      ],
      [
        'Virtual currency, games and gambling-style features',
        '<p>Coins, items, animals, XP, levels and luck are virtual, have no monetary value, cannot be bought, sold, transferred or exchanged for real money or anything of value, and may be changed, reset or removed at any time. Games such as slots, roulette, blackjack, crash and lottery use virtual coins only and are for entertainment. Do not use the Bot to run real-money gambling.</p>',
      ],
      [
        'Music, voice and third-party content',
        '<p>Music, images, memes, GIFs and other content come from third-party services. We do not host or own that content and do not endorse it. You are responsible for the content you request, for respecting copyright and for following the terms of those services. The Bot only plays audio into voice channels; it does not record voice. Content may be unavailable at any time.</p>',
      ],
      [
        'AI features',
        '<p>The <code>/chat</code> command uses a third-party AI model. Answers can be inaccurate, incomplete or inappropriate, so do not rely on them for medical, legal, financial or safety decisions. Do not submit sensitive personal data. The text you submit is sent to the AI provider as described in the Privacy Policy.</p>',
      ],
      [
        'Your content',
        '<p>You keep ownership of what you submit (for example polls, reminders and custom messages). You give us a limited, non-exclusive license to store, process and display it as needed to run the Bot. You promise that you have the right to submit it and that it does not break the law or these Terms.</p>',
      ],
      [
        'Premium features',
        '<p>If paid features are offered in future, their price, billing terms and refund rules will be shown clearly before you buy and will form part of these Terms.</p>',
      ],
      [
        'Availability and changes',
        '<p>The Bot is provided on an "as is" and "as available" basis. We may add, change, limit or discontinue features, commands or the whole service at any time, and we cannot guarantee uninterrupted, secure or error-free operation or that data will never be lost.</p>',
      ],
      [
        'Suspension and termination',
        '<p>We may restrict, suspend or block users or servers that break these Terms or harm the service, with or without notice. You can stop using the Bot at any time by removing it from your server. Sections that by their nature should survive termination (such as liability limits) will continue to apply.</p>',
      ],
      [
        'Disclaimer of warranties',
        '<p>To the maximum extent permitted by law, we make no warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, accuracy and non-infringement.</p>',
      ],
      [
        'Limitation of liability',
        '<p>To the maximum extent permitted by law, we and the operator are not liable for any indirect, incidental, special, consequential or punitive damages, or for loss of data, profits, goodwill or virtual items, arising from your use of or inability to use the Bot. Where liability cannot be excluded, it is limited to the greater of the amount you paid us in the last 12 months or USD 50.</p>',
      ],
      [
        'Indemnity',
        '<p>You agree to defend and hold us harmless from claims, damages and costs arising from your misuse of the Bot, your content or your breach of these Terms.</p>',
      ],
      [
        'Governing law and disputes',
        `<p>These Terms are governed by the laws of ${process.env.LEGAL_JURISDICTION ? esc(process.env.LEGAL_JURISDICTION) : 'the jurisdiction where the operator is based'}, without regard to conflict-of-law rules. Please contact us first to try to resolve any dispute informally. Nothing in these Terms limits mandatory consumer rights that apply where you live.</p>`,
      ],
      [
        'General',
        '<p>If part of these Terms is found unenforceable, the rest stays in effect. Our failure to enforce a right is not a waiver. These Terms and the Privacy Policy are the entire agreement between you and us about the Bot. You may not transfer your rights under these Terms; we may transfer ours.</p>',
      ],
      [
        'Changes to these Terms',
        '<p>We may update these Terms. We will change the effective date above, and for material changes we will announce them in the support server or on this page. Continuing to use the Bot after an update means you accept the new Terms.</p>',
      ],
      [
        'Contact',
        `<p>Questions about these Terms or to report abuse: ${contact()}.</p><p style="font-size:13px">${esc(n)} is not affiliated with or endorsed by Discord Inc. or any of the third-party services mentioned.</p>`,
      ],
    ],
  );

const how = () => `<h2 class=t>Up and running in 3 steps</h2><p class=sub>No coding. No setup headaches.</p><div class=steps>
<div class="card step"><div class=n>1</div><h3>Add the bot</h3><p>Click “Add to Discord” and choose your server.</p></div>
<div class="card step"><div class=n>2</div><h3>Customize</h3><p>Open the dashboard to set welcome cards, leveling and auto-moderation.</p></div>
<div class="card step"><div class=n>3</div><h3>Enjoy</h3><p>Use <code>/help</code> to explore every command. Everything just works.</p></div></div>`;
const FAQS = [
  ['Is it free?', 'Yes. Every command and the dashboard are free to use.'],
  [
    'What permissions does it need?',
    'Send Messages, Embed Links, Attach Files, Manage Messages (auto-mod), Manage Channels and Move Members (temp voice), Manage Roles (autorole), Connect and Speak (music). The “Add to Discord” link already asks for these.',
  ],
  [
    'How do I set up welcome messages?',
    'Run <code>/welcome channel</code>, or open the dashboard and choose Welcome. You can turn on an image card and choose its title, color and background.',
  ],
  [
    "Why isn't music playing?",
    'YouTube blocks most cloud hosts, so the bot searches SoundCloud, Audius and the Internet Archive instead (and plays direct links and Spotify track links). <code>/music debug</code> tests every source and shows exactly what is blocked.',
  ],
  [
    'How do I disable a command or change the prefix?',
    'Open the dashboard, choose Commands, then tick the commands to disable or set a new prefix.',
  ],
  [
    'Where do I get help?',
    'Use <code>/help command:name</code>, read the <a href="/docs">docs</a>, or join the support server from the footer.',
  ],
];
const faq = () => `<h2 class=t>Frequently asked questions</h2><div style="max-width:760px;margin:0 auto">${FAQS.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;

const docsPage = (
  n,
  prefix,
) => `<div class="wrap legal docs" style="max-width:820px"><h2 class=t style="text-align:left;margin-bottom:4px">📚 Documentation</h2><p style="color:var(--mut)">Everything you need to set up ${esc(n)}. Use <code>${esc(prefix)}help</code> or <code>/help</code> in Discord anytime.</p>
<div class=toc><b>Guides</b><a href="#start">Quick start</a><a href="#welcome">Welcome &amp; goodbye cards</a><a href="#levels">Leveling and rank cards</a><a href="#automod">Auto-moderation</a><a href="#voice">Temporary voice channels</a><a href="#music">Music</a><a href="#tickets">Tickets and giveaways</a><a href="#prefix">Prefix commands &amp; shortcuts</a></div>
<h2 id=start>Quick start</h2><p>1) Add the bot with the “Add to Discord” button. 2) Open the <a href="/servers">dashboard</a> and pick your server. 3) Use <code>/help</code> to see all commands, or <code>/help command:daily</code> for details on one.</p>
<h2 id=welcome>Welcome &amp; goodbye cards</h2><p>Run <code>/welcome channel #welcome</code>, then <code>/welcome image enabled:true</code> and <code>/welcome test</code> to preview. Customize the title, accent color and background image on the dashboard. Variables: <code>{user}</code> <code>{server}</code> <code>{count}</code>. Same for <code>/goodbye</code>.</p>
<h2 id=levels>Leveling and rank cards</h2><p>Members earn XP by chatting (60-second cooldown). <code>/rank</code> shows an image rank card and <code>/levels</code> the leaderboard. A public leaderboard page is available at <code>/leaderboard/&lt;server id&gt;</code>. Change the XP multiplier in the dashboard.</p>
<h2 id=automod>Auto-moderation</h2><p>Dashboard → Auto-Moderation: block invite links, all links or custom words, and choose a mod-log channel. Members with Manage Messages are never affected. Use <code>/warn</code>; 3 warnings give a 1-hour timeout.</p>
<h2 id=voice>Temporary voice channels</h2><p>Run <code>/vc setup</code> once. Members who join <b>➕ Creator</b> get their own channel with a button panel to rename, limit, lock, trust, kick or transfer it. It is deleted when empty.</p>
<h2 id=music>Music</h2><p>Join a voice channel and run <code>/music play song name</code>. Songs and artist names both work, and unclear matches show a result picker (or use <code>/music search</code> to always choose). Sources: SoundCloud, Audius, Internet Archive, Jamendo, direct audio links, Spotify track links (found on the other sources), Bandcamp/Mixcloud and more links, plus <code>/music radio</code>. YouTube works only where it is not blocked. Use the buttons on the Now Playing card to pause, skip, loop or shuffle. If something fails, run <code>/music debug</code>.</p>
<h2 id=tickets>Tickets and giveaways</h2><p><code>/ticket</code> posts a button that opens private support channels. <code>/giveaway prize minutes</code> starts a giveaway with a button and picks a winner automatically.</p>
<h2 id=prefix>Prefix commands &amp; shortcuts</h2><p>Every slash command also works with the prefix (<code>${esc(prefix)}</code> by default; change it in the dashboard). Many have shortcuts, for example <code>${esc(prefix)}cf 100 h</code> (coinflip), <code>${esc(prefix)}bj 500</code> (blackjack), <code>${esc(prefix)}sl all</code> (slots), <code>${esc(prefix)}h</code> (hunt), <code>${esc(prefix)}z</code> (zoo), <code>${esc(prefix)}b</code> (battle), <code>${esc(prefix)}bal</code>, <code>${esc(prefix)}d</code> (daily), <code>${esc(prefix)}play song name</code>, <code>${esc(prefix)}skip</code>, <code>${esc(prefix)}np</code>. Use <code>all</code> instead of a number to bet everything, and put multi-word text in quotes when more options follow it. <code>${esc(prefix)}help command</code> shows a command's usage and shortcuts.</p></div>`;
const URL = 'https://nika.is-a.bot';

module.exports = {
  URL,
  esc,
  SPY,
  logo,
  faviconSvg,
  icon,
  iconize,
  h1,
  head,
  privacy,
  terms,
  how,
  faq,
  docsPage,
};
