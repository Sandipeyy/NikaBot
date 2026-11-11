// Page bodies for the public website. Each function returns an HTML string.
const site = require('./site');
const meta = require('./meta');
const { when, STATUS_TEXT } = require('./layout');

const esc = site.esc;

const FEATURES = [
  ['Economy', 'coins', 'Daily rewards, jobs, a shop, payments and server leaderboards.'],
  ['Gambling', 'dice', 'Slots, roulette, blackjack, crash and coinflip, with virtual coins only.'],
  ['Leveling', 'trending', 'XP, levels, rank cards and public leaderboards.'],
  ['Moderation', 'shield', 'Warns, kick, ban, timeout, purge, lock and auto-moderation.'],
  ['Music', 'music', 'SoundCloud, Audius, radio and direct links with a full queue.'],
  ['Temp voice', 'volume', 'Join-to-create channels that members control themselves.'],
  ['Giveaways', 'gift', 'One-click giveaways with automatic winners.'],
  ['Tickets', 'ticket', 'Private support channels opened with a button.'],
  [
    'Welcome and goodbye',
    'smile',
    'Image cards with the member avatar, custom messages and autorole.',
  ],
  ['Live data', 'globe', 'Weather, dictionary, wiki, translate and GitHub lookups.'],
  ['Reactions', 'heart', 'Hug, pat, slap and dance with anime GIFs.'],
  ['AI chat', 'bot', 'Chat with an AI assistant inside Discord.'],
];

const GROUPS = [
  [
    'Economy and games',
    'Earn a daily reward, work for coins, hunt animals for your zoo and risk it all on the slots.',
    ['daily', 'work', 'hunt', 'slots', 'blackjack', 'shop'],
  ],
  [
    'Levels and rank cards',
    'Members earn XP for chatting. Rank cards and public leaderboards show who is on top.',
    ['rank', 'levels', 'leaderboard'],
  ],
  [
    'Moderation',
    'Warn, timeout, kick or ban with case numbers and a mod-log, plus auto-moderation for invites, links and words.',
    ['warn', 'ban', 'timeout', 'purge', 'slowmode'],
  ],
  [
    'Music',
    'Play songs and radio in a voice channel with a queue, loop, shuffle and a Now Playing card.',
    ['music', 'vc'],
  ],
  [
    'Server tools',
    'Welcome cards, autorole, tickets, polls and giveaways, all set up from Discord or the dashboard.',
    ['welcome', 'ticket', 'giveaway', 'poll'],
  ],
];

const dur = ms => {
  const s = Math.round(ms / 1000);
  if (s < 60) return s <= 1 ? 'under a minute' : `${s} seconds`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'}${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'}${h % 24 ? ` ${h % 24} h` : ''}`;
};

const uptimeText = ms => {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor(s / 60) % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

const dayName = date =>
  new Date(date + 'T00:00:00Z').toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', timeZone: 'UTC' },
  );

function dayInfo(day) {
  if (day.status === 'none') return 'No data recorded';
  if (day.status === 'maintenance') return 'Planned maintenance';
  const parts = [`${day.uptime}% uptime`];
  if (day.down > 0) parts.push(`${dur(day.down)} down`);
  if (day.incidents)
    parts.push(`${day.incidents} ${day.incidents === 1 ? 'incident' : 'incidents'}`);
  return parts.join(', ');
}

// the 30 day strip. It is rendered on the server, the script in layout.js adds the tooltips.
function strip(days) {
  const bars = days.map(d => {
    const info = dayInfo(d);
    return `<button type="button" class="d ${d.status}" data-day="${dayName(d.date)}" data-info="${esc(info)}" aria-label="${dayName(d.date)}: ${esc(info)}"></button>`;
  }).join('');

  return `<div class="uptime"><div class="strip" role="group" aria-label="Uptime for each of the last 30 days">${bars}</div><div class="axis"><span>30 days ago</span><span>Today</span></div></div>`;
}

// ---------- home ----------
function landing(client, name, snap, recent) {
  const up = snap.uptime;
  const servers = client.guilds.cache.size;
  const users = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const upcoming = snap.maintenance.active.concat(snap.maintenance.upcoming).slice(0, 3);

  const groups = GROUPS.map(([title, text, cmds]) => `
    <div class="frow">
      <h3>${title}</h3>
      <div>
        <p>${text}</p>
        <div class="chips">${cmds.map(c => `<a class="chip" href="/commands?q=${c}">/${c}</a>`).join('')}</div>
      </div>
    </div>`).join('');

  const updates =
    recent.length
      ? `<ul class="feed">${recent
        .map(
          e => `<li><span class="when">${e.kind === 'bot' ? 'Bot' : 'Website'}, ${when(e.at)}</span><h3>${esc(e.title)}</h3>${e.items[0] ? `<p>${esc(e.items[0])}</p>` : ''}</li>`,
        )
        .join('')}</ul><p><a href="/changelog" style="text-decoration:underline">See the full changelog</a></p>`
      : '<p class="empty">No updates posted yet.</p>';

  const maintenance =
    upcoming.length
      ? upcoming.map(m => `<div class="note"><h3>${esc(m.title)}</h3>${m.info ? `<p>${esc(m.info)}</p>` : ''}<span class="when">${when(m.starts, true)} to ${when(m.ends, true)}</span></div>`).join(
        '',
      )
      : '<p class="empty">Nothing is scheduled. If the bot needs downtime it will be announced here and on the status page first.</p>';

  return `
<div class="wrap">
  <section class="hero">
    <div>
      <h1>The Discord bot that does a bit of everything</h1>
      <p class="lead">Leveling, moderation, music, economy and games in one bot, with a dashboard to set it up and a public status page so you can see how it is doing.</p>
      <div class="rowb"><a class="btn" href="/invite">Add to Discord</a><a class="btn g" href="/commands">Browse commands</a></div>
    </div>
    <aside class="card live" aria-labelledby="liveTitle">
      <div class="top"><span class="dot ${snap.overall}" data-live-dot></span><h2 id="liveTitle">${STATUS_TEXT[snap.overall] || STATUS_TEXT.starting}</h2></div>
      <p class="meta">Latency ${snap.ping >= 0 ? snap.ping + ' ms' : 'unknown'}, online for ${uptimeText(snap.botUptime)}</p>
      ${strip(up.days)}
      <div class="foot"><span><strong>${up.availability == null ? 'No data yet' : up.availability + '%'}</strong> uptime in 30 days</span><a href="/status" style="text-decoration:underline">Full status</a></div>
    </aside>
  </section>

  <p class="statement">${esc(name)} is in <b>${servers.toLocaleString()} ${servers === 1 ? 'server' : 'servers'}</b> with <b>${users.toLocaleString()} members</b> and has <b>${client.commandList?.length || 0} commands</b> ready to use.</p>

  <h2 class="t">What it does</h2>
  <p class="sub">Pick the parts you want. Every slash command also works with the text prefix.</p>
  <div class="rows">${groups}</div>

  <h2 class="t">Everything in one bot</h2>
  <p class="sub">Stop juggling five bots and replace them with one.</p>
  <div class="grid">${FEATURES.map(f => `<div class="card"><div class="ico">${f[1] ? site.icon(f[1], 22) : ''}</div><h3>${f[0]}</h3><p>${f[2]}</p></div>`).join('')}</div>

  ${site.how()}

  <div class="split" style="margin-top:56px">
    <div><h2 class="t" style="margin-top:0;font-size:28px">Latest updates</h2>${updates}</div>
    <div><h2 class="t" style="margin-top:0;font-size:28px">Planned maintenance</h2>${maintenance}</div>
  </div>

  ${site.faq()}

  <div class="cta">
    <h2>Ready to add it to your server?</h2>
    <p>It is free and takes less than a minute.</p>
    <div class="rowb"><a class="btn" href="/invite">Add to Discord</a><a class="btn g" href="/support">Join the support server</a></div>
  </div>
</div>`;
}

function features() {
  return `<div class="wrap"><div class="head"><h1 class="t">Features</h1><p class="sub">Everything your community needs, built into one bot.</p></div>
<div class="grid">${FEATURES.map(f => `<div class="card"><div class="ico">${f[1] ? site.icon(f[1], 22) : ''}</div><h3>${f[0]}</h3><p>${f[2]}</p></div>`).join('')}</div>
<div class="cta"><h2>Try it in your server</h2><p>Free, with a dashboard to set everything up.</p><a class="btn" href="/invite">Add to Discord</a></div></div>`;
}

function premium() {
  const support = esc(process.env.SUPPORT_URL || '#');

  return `<div class="wrap"><div class="head"><h1 class="t">Simple pricing</h1><p class="sub">Everything essential is free, forever.</p></div>
<div class="grid" style="max-width:760px">
  <div class="card"><h3>Free</h3><div class="price">$0</div><p>All commands, the dashboard, leaderboards, music and moderation.</p><br><a class="btn" href="/invite">Get started</a></div>
  <div class="card"><span class="pill info">Coming soon</span><h3>Premium</h3><div class="price">TBA</div><p>Priority support, custom bot branding and extra dashboard options.</p><br><a class="btn g" href="${support}">Join the waitlist</a></div>
</div></div>`;
}

// ---------- commands ----------
function commands(client, prefix) {
  const all = new Map((client.commandList || []).map(c => [c.data.name, c.data.description]));
  const chips = Object
    .keys(meta)
    .map(c => `<button type="button" class="chip" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join('');
  const sections = Object
    .entries(meta)
    .map((
      [cat, names],
    ) => `<section class="cmdgroup" data-cat="${esc(cat)}"><h2 class="cat">${esc(cat)}</h2>${names
        .map(n => `<div class="cmd" data-s="${esc(n)} ${esc(all.get(n))}"><code>/${esc(n)}</code><span>${esc(all.get(n))}</span></div>`)
        .join('')}</section>`)
    .join('');

  return `<div class="wrap"><div class="head"><h1 class="t">Commands</h1><p class="sub">Use <b>/</b> in Discord, or the <code>${esc(prefix)}</code> prefix, for example <code>${esc(prefix)}help</code>.</p></div>
<input id="q" type="search" placeholder="Search commands" autocomplete="off" aria-label="Search commands">
<div class="chips" id="cats" style="margin:10px 0 6px"><button type="button" class="chip on" data-cat="">All</button>${chips}</div>
<p class="sub" id="count" aria-live="polite" style="margin:10px 0 0"></p>
${sections}
<p class="empty" id="none" hidden>No commands match. Try a shorter word or another category.</p></div>`;
}

const COMMANDS_SCRIPT = `<script>
(function () {
  var q = document.getElementById('q'), cats = document.getElementById('cats'), cat = '';
  var params = new URLSearchParams(location.search);
  if (params.get('q')) q.value = params.get('q');
  function apply() {
    var text = q.value.trim().toLowerCase(), shown = 0;
    document.querySelectorAll('.cmdgroup').forEach(function (g) {
      var any = false;
      g.querySelectorAll('.cmd').forEach(function (c) {
        var ok = (!cat || g.dataset.cat === cat) && (!text || c.dataset.s.toLowerCase().indexOf(text) !== -1);
        c.style.display = ok ? '' : 'none';
        if (ok) { any = true; shown++; }
      });
      g.style.display = any ? '' : 'none';
    });
    document.getElementById('count').textContent = shown + (shown === 1 ? ' command' : ' commands');
    document.getElementById('none').hidden = shown !== 0;
  }
  q.addEventListener('input', apply);
  cats.addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    cat = b.dataset.cat;
    cats.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('on', x === b); });
    apply();
  });
  apply();
})();
</script>`;

// ---------- status ----------
const BADGE = {
  resolved: ['ok', 'Resolved'],
  monitoring: ['warn', 'Monitoring'],
  investigating: ['bad', 'Investigating'],
};

function sparkline(samples) {
  const pts = samples.map(s => s.gateway).filter(v => typeof v === 'number' && v >= 0);
  if (pts.length < 2)
    return '<p class="empty">Latency history fills in a few minutes after each restart.</p>';
  const W = 600;
  const H = 90;
  const pad = 8;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = Math.max(max - min, 20);
  const step = W / (pts.length - 1);
  const d = pts.map((
    v,
    i,
  ) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(H - pad - ((v - min) / span) * (H - pad * 2)).toFixed(1)}`).join(
    ' ',
  );

  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Latency over the last hour"><path class="area" d="${d} L${W} ${H} L0 ${H} Z"/><path class="line" d="${d}"/></svg>
<p class="sub" style="font-size:14px;margin:8px 0 0">Now ${pts[pts.length - 1]} ms, best ${min} ms, worst ${max} ms over the last hour.</p>`;
}

function incidentHtml(i) {
  const [tone, label] = BADGE[i.status] || BADGE.investigating;
  const kind = i.severity === 'outage' ? 'Outage' : 'Degraded performance';
  const meta =
    i.resolved ? `${kind}, lasted ${dur(i.duration)}` : `${kind}, ongoing for ${dur(i.duration)}`;

  return `<article class="incident"><div class="hd"><h3>${esc(i.title)}</h3><span class="pill ${tone}">${label}</span></div>
<p class="meta">${meta}</p>
<ul class="timeline">${i.updates.map(u => `<li class="${u.status === 'resolved' ? 'done' : ''}"><b>${esc(u.status)}</b>: ${esc(u.message)}<span class="when">${when(u.at, true)}</span></li>`).join('')}</ul></article>`;
}

function statusPage(snap, name) {
  const up = snap.uptime;
  const total = snap.incidents.active.concat(snap.incidents.past);

  const alerts =
    snap.incidents.active.map(i => `<div class="note ${i.severity}"><h3>${esc(i.title)}</h3><p>${esc(i.updates[0]?.message || '')}</p><span class="when">Started ${when(i.started, true)}</span></div>`).join(
      '',
    )
      + snap.maintenance.active.map(m => `<div class="note"><h3>Maintenance in progress: ${esc(m.title)}</h3>${m.info ? `<p>${esc(m.info)}</p>` : ''}<span class="when">Expected to finish ${when(m.ends, true)}</span></div>`).join(
        '',
      );

  const comps = snap.components.map(c => {
    const ms = c.id === 'gateway' && snap.ping >= 0 ? snap.ping : c.ms;
    const text =
      c.status === 'operational'
        ? c.detail
        : `${c.status === 'outage' ? 'Down' : 'Degraded'}: ${c.detail}`;
    return `<li><span class="dot ${c.status}"></span><span class="name">${esc(c.name)}</span><span class="detail">${esc(text)}</span><span class="ms">${typeof ms === 'number' ? ms + ' ms' : ''}</span></li>`;
  }).join('');

  const shards =
    snap.shards.length
      ? `<table class="tbl"><tr><th>Shard</th><th>Status</th><th>Ping</th></tr>${snap.shards
        .map(s => `<tr><td><span class="dot ${s.ready ? 'g' : 'r'}"></span> #${s.id}</td><td>${s.ready ? 'Ready' : 'Not ready'}</td><td>${Math.round(s.ping)} ms</td></tr>`)
        .join('')}</table>`
      : '';

  const maint = snap.maintenance
    .active
    .concat(snap.maintenance.upcoming)
    .map(m => `<div class="note"><h3>${esc(m.title)} <span class="pill info">${snap.maintenance.active.includes(m) ? 'In progress' : 'Scheduled'}</span></h3>${m.info ? `<p>${esc(m.info)}</p>` : ''}<span class="when">${when(m.starts, true)} to ${when(m.ends, true)}</span></div>`)
    .concat(
      snap.maintenance.recent.map(m => `<div class="note" style="opacity:.75"><h3>${esc(m.title)} <span class="pill">Completed</span></h3><span class="when">${when(m.starts, true)} to ${when(m.ends, true)}</span></div>`),
    )
    .join('');

  let lastDay = '';
  const incidents =
    total.length
      ? total.map(i => {
        const day = new Date(i.started).toISOString().slice(0, 10);
        const label = day !== lastDay ? `<p class="daylabel">${when(i.started)}</p>` : '';
        lastDay = day;
        return label + incidentHtml(i);
      }).join('')
      : '<p class="empty">No incidents in the last 30 days.</p>';

  return `<div class="wrap" id="live">
<div class="head"><h1 class="t">${esc(name)} status</h1><p class="sub">Live health, 30 days of uptime, past incidents and planned maintenance. Times are shown in your own time zone.</p></div>

<div class="overall ${snap.overall}" role="status" aria-live="polite">
  <span class="dot ${snap.overall}"></span>
  <div><h2>${STATUS_TEXT[snap.overall] || STATUS_TEXT.starting}</h2><p>${snap.checkedAt ? `Last checked <time datetime="${new Date(snap.checkedAt).toISOString()}" data-t="dt"></time>` : 'Waiting for the first check'}</p></div>
</div>
${alerts}

<div class="split" style="margin-top:20px">
  <section class="card"><h2 style="font-size:21px;margin:0 0 16px">Systems</h2><ul class="comps">${comps}</ul>${shards ? `<div style="margin-top:18px">${shards}</div>` : ''}</section>
  <section class="card"><h2 style="font-size:21px;margin:0 0 12px">Discord latency</h2>${sparkline(snap.latency)}</section>
</div>

<section class="card" style="margin-top:20px">
  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:18px">
    <h2 style="font-size:21px;margin:0">Uptime, last 30 days</h2>
    <div><span class="big">${up.availability == null ? 'No data yet' : up.availability + '%'}</span> <span style="color:var(--mut)">availability</span></div>
  </div>
  ${strip(up.days)}
  <div class="legend"><span><i style="background:var(--ok)"></i>Operational</span><span><i style="background:var(--warnc)"></i>Brief downtime</span><span><i style="background:var(--bad)"></i>Major downtime</span><span><i style="background:var(--maint)"></i>Maintenance</span><span><i style="background:var(--none)"></i>No data</span></div>
  <dl class="metrics">
    <div><dt>Incidents</dt><dd>${up.incidentCount}</dd></div>
    <div><dt>Total downtime</dt><dd>${up.downtime ? dur(up.downtime) : 'None'}</dd></div>
    <div><dt>Average latency</dt><dd>${up.avgPing == null ? '–' : up.avgPing + ' ms'}</dd></div>
    <div><dt>Online since restart</dt><dd>${uptimeText(snap.botUptime)}</dd></div>
    <div><dt>Servers</dt><dd>${snap.servers.toLocaleString()}</dd></div>
    <div><dt>Memory</dt><dd>${snap.memory} MB</dd></div>
  </dl>
</section>

<section class="card" style="margin-top:20px"><h2 style="font-size:21px;margin:0 0 12px">Planned maintenance</h2>${maint || '<p class="empty">No maintenance is scheduled. Planned downtime is posted here before it happens.</p>'}</section>

<section class="card" style="margin-top:20px"><h2 style="font-size:21px;margin:0 0 4px">Incident history</h2><p class="sub" style="font-size:15px;margin-bottom:6px">Outages and recoveries from the last 30 days.</p>${incidents}</section>
<p class="refresh">This page updates by itself every 30 seconds.</p>
</div>`;
}

// swaps the live part of the page without a full reload
const STATUS_SCRIPT = `<script>
setInterval(function () {
  fetch(location.href, { headers: { 'X-Requested-With': 'fetch' } })
    .then(function (r) { return r.text(); })
    .then(function (t) {
      var doc = new DOMParser().parseFromString(t, 'text/html');
      var fresh = doc.getElementById('live');
      if (fresh) { document.getElementById('live').innerHTML = fresh.innerHTML; pageInit(); }
    }).catch(function () {});
}, 30000);
</script>`;

// ---------- analytics ----------
function rankList(rows, withChange) {
  const top = rows[0]?.count || 1;

  return `<ol class="rank">${rows
    .map(c => {
      let badge = '';
      if (withChange) {
        if (c.change === null) badge = '<span class="delta new">new</span>';
        else if (c.change > 0) badge = `<span class="delta up">+${c.change}%</span>`;
        else if (c.change < 0) badge = `<span class="delta down">${c.change}%</span>`;
      }
      return `<li><span class="nm">${esc(c.name)}${badge}</span><span class="ct">${c.count.toLocaleString()} (${c.share}%)</span><span class="bar"><i style="width:${Math.max(2, Math.round((c.count / top) * 100))}%"></i></span></li>`;
    })
    .join('')}</ol>`;
}

function analyticsPage(r) {
  const range = [
    7,
    30,
    90,
  ].map(d => `<a class="chip ${r.days === d ? 'on' : ''}" href="/analytics?days=${d}">Last ${d} days</a>`).join(
    '',
  );
  const change =
    r.change === null
      ? 'New'
      : r.change === 0 ? 'No change' : `${r.change > 0 ? '+' : ''}${r.change}%`;
  const busiest = r.busiest && r.busiest.total ? dayName(r.busiest.date) : '–';

  const moves =
    r.rising.length || r.falling.length
      ? `<ul class="rank">${r.rising.map(c => `<li><span class="nm">${esc(c.name)}</span><span class="ct"><span class="delta up">+${c.delta.toLocaleString()} uses</span></span></li>`).join('')}${r.falling.map(c => `<li><span class="nm">${esc(c.name)}</span><span class="ct"><span class="delta down">${c.delta.toLocaleString()} uses</span></span></li>`).join('')}</ul>`
      : '<p class="empty">Trends show up once there are two full periods to compare.</p>';

  return `<div class="wrap"><div class="head"><h1 class="t">Command analytics</h1><p class="sub">Which commands people use the most and how usage is moving. History starts on the day tracking was switched on.</p></div>
<nav class="chips" style="margin-bottom:20px" aria-label="Time range">${range}</nav>
${r.total === 0 ? '<div class="card"><h3>No usage recorded for this range yet</h3><p>The charts fill in as people run commands.</p></div>' : ''}
<div class="stats">
  <div class="stat"><b>${r.total.toLocaleString()}</b><small>Commands run</small></div>
  <div class="stat"><b>${r.average.toLocaleString()}</b><small>Average per day</small></div>
  <div class="stat"><b>${change}</b><small>Versus previous ${r.days} days</small></div>
  <div class="stat"><b>${busiest}</b><small>Busiest day</small></div>
</div>
<section class="card"><h2 style="font-size:21px;margin:0 0 12px">Commands per day</h2><svg class="chart" id="chart" role="img" aria-label="Bar chart of commands run each day"></svg><p class="sub" id="tipline" aria-live="polite" style="font-size:15px;margin:6px 0 0">Hover or tap a bar to see that day.</p></section>
<div class="split" style="margin-top:12px">
  <section class="card"><h2 style="font-size:21px;margin:0 0 8px">Most used</h2>${r.top.length ? rankList(r.top, true) : '<p class="empty">Nothing to show yet.</p>'}</section>
  <section class="card"><h2 style="font-size:21px;margin:0 0 8px">Rising and falling</h2><p class="sub" style="font-size:14px;margin-bottom:6px">Compared with the previous ${r.days} days. Commands with fewer than 3 uses are left out.</p>${moves}
    <h3 style="margin:22px 0 4px;font-size:17px">By category</h3>${r.categories.length ? rankList(r.categories, false) : '<p class="empty">No category data yet.</p>'}</section>
</div></div>`;
}

const analyticsScript = series => `<script>
(function () {
  var series = ${JSON.stringify(series)};
  var svg = document.getElementById('chart'), tip = document.getElementById('tipline');
  var H = 220, L = 34, R = 8, T = 10, B = 24, ns = 'http://www.w3.org/2000/svg';
  var max = Math.max.apply(null, series.map(function (d) { return d.total; })) || 1;
  var top = Math.max(4, Math.ceil(max / 4) * 4);
  function el(n, a) { var e = document.createElementNS(ns, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function label(d) { return new Date(d.date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function draw() {
    svg.textContent = '';
    var W = Math.max(280, svg.parentElement.clientWidth), pw = W - L - R, ph = H - T - B, step = pw / series.length, bw = Math.max(2, step * .7);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    for (var i = 0; i <= 4; i++) {
      var y = T + ph - ph * i / 4;
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: y, y2: y, 'class': 'gl' }));
      var t = el('text', { x: L - 6, y: y + 4, 'text-anchor': 'end' }); t.textContent = Math.round(top * i / 4); svg.appendChild(t);
    }
    series.forEach(function (d, n) {
      var h = d.total ? Math.max(2, d.total / top * ph) : 0, x = L + n * step + (step - bw) / 2;
      var msg = label(d) + ': ' + d.total.toLocaleString() + (d.total === 1 ? ' command' : ' commands');
      var r = el('rect', { x: x, y: T + ph - h, width: bw, height: h, rx: 2, 'class': 'col', tabindex: 0, 'aria-label': msg });
      ['mouseenter', 'focus', 'click'].forEach(function (ev) { r.addEventListener(ev, function () { tip.textContent = msg; }); });
      svg.appendChild(r);
    });
    [0, Math.floor(series.length / 2), series.length - 1].forEach(function (n, k) {
      var t = el('text', { x: k === 0 ? L : k === 2 ? W - R : L + n * step + step / 2, y: H - 6, 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle' });
      t.textContent = label(series[n]); svg.appendChild(t);
    });
  }
  draw();
  var timer; addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(draw, 150); });
})();
</script>`;

// ---------- changelog ----------
function changelogPage(entries, kind) {
  const filter = ['bot', 'website'].includes(kind) ? kind : 'all';
  const shown = entries.filter(e => filter === 'all' || e.kind === filter);
  const tab = (
    value,
    label,
  ) => `<a class="chip ${filter === value ? 'on' : ''}" href="/changelog${value === 'all' ? '' : '?show=' + value}">${label}</a>`;

  const list =
    shown.length
      ? `<ol class="log">${shown
        .map(
          e => `<li><div><span class="pill">${e.kind === 'bot' ? 'Bot' : 'Website'}</span><div class="when">${when(e.at)}</div></div><div><h2>${esc(e.title)}</h2>${e.items.length ? `<ul>${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</div></li>`,
        )
        .join('')}</ol>`
      : '<p class="empty">No updates to show yet.</p>';

  return `<div class="wrap"><div class="head"><h1 class="t">Changelog</h1><p class="sub">What changed in the bot and on this website, newest first.</p></div>
<nav class="chips" style="margin-bottom:20px" aria-label="Filter updates">${tab('all', 'All')}${tab('website', 'Website')}${tab('bot', 'Bot')}</nav>${list}</div>`;
}

// ---------- errors ----------
function errorPage(code, heading, text) {
  return `<div class="wrap"><div class="errpage"><div class="errcode" aria-hidden="true">${code}</div><h1 class="t" style="margin-top:8px">${heading}</h1><p class="sub">${text}</p>
<div class="rowb"><a class="btn" href="/">Go home</a><a class="btn g" href="/commands">Browse commands</a><a class="btn g" href="/status">Check status</a></div></div></div>`;
}

const notFound = () =>
  errorPage(
    404,
    'We could not find that page',
    'The link may be old or mistyped. Try one of these instead.',
  );
const serverError = () =>
  errorPage(
    500,
    'Something went wrong on our side',
    'The page could not load. Try again in a moment, or check the status page for known problems.',
  );

// ---------- owner admin ----------
function adminPage(snap, entries, flash) {
  const maint = snap.maintenance.active.concat(snap.maintenance.upcoming);
  const incidents = snap.incidents.active.concat(snap.incidents.past.slice(0, 8));
  const post = (
    action,
    label,
    cls = 'btn g s',
    extra = '',
  ) => `<form method="post" action="/admin/${action}" style="display:inline">${extra}<button class="${cls}" type="submit">${label}</button></form>`;

  return `<div class="wrap adm"><div class="head"><h1 class="t">Status and content</h1><p class="sub">Outages and recoveries are recorded automatically. Use this page for planned maintenance, manual incident notes and changelog entries.</p></div>
${flash ? `<div class="ok">${esc(flash)}</div>` : ''}

<section class="card"><h2 style="font-size:21px;margin:0 0 6px">Schedule maintenance</h2>
<form method="post" action="/admin/maintenance" id="maintForm">
  <label for="mt">Title</label><input id="mt" name="title" maxlength="140" required placeholder="Database upgrade">
  <label for="mi">What people should expect</label><textarea id="mi" name="info" maxlength="600" placeholder="Commands may not respond for about 10 minutes."></textarea>
  <div class="row2"><div><label for="ms">Starts</label><input id="ms" type="datetime-local" required></div><div><label for="me">Ends</label><input id="me" type="datetime-local" required></div></div>
  <input type="hidden" name="starts" id="starts"><input type="hidden" name="ends" id="ends">
  <p style="color:var(--faint);font-size:14px">Times use your browser's time zone. Visitors see them in theirs.</p>
  <button class="btn" type="submit">Publish notice</button>
</form>
<h3 style="margin:26px 0 4px;font-size:17px">Scheduled</h3>
${maint.length ? `<ul class="admlist">${maint.map(m => `<li><div><b>${esc(m.title)}</b><small>${when(m.starts, true)} to ${when(m.ends, true)}</small></div>${post('maintenance/' + m.id + '/cancel', 'Cancel', 'btn danger s')}</li>`).join('')}</ul>` : '<p class="empty">Nothing scheduled.</p>'}
</section>

<section class="card"><h2 style="font-size:21px;margin:0 0 6px">Incidents</h2>
<form method="post" action="/admin/incidents">
  <div class="row2"><div><label for="it">Title</label><input id="it" name="title" maxlength="140" required placeholder="Music commands failing"></div>
  <div><label for="is">Severity</label><select id="is" name="severity"><option value="degraded">Degraded performance</option><option value="outage">Outage</option></select></div></div>
  <label for="im">First update</label><textarea id="im" name="message" maxlength="600" placeholder="We are investigating."></textarea>
  <button class="btn" type="submit">Open incident</button>
</form>
<h3 style="margin:26px 0 4px;font-size:17px">Open and recent</h3>
${incidents.length ? `<ul class="admlist">${incidents.map(i => `<li><div><b>${esc(i.title)}</b> <span class="pill ${BADGE[i.status]?.[0] || ''}">${esc(i.status)}</span><small>${when(i.started, true)}${i.auto ? ', detected automatically' : ''}</small></div>
<div class="acts">${i.status !== 'resolved' ? `<form method="post" action="/admin/incidents/${i.id}/update" style="display:flex;gap:6px;flex-wrap:wrap"><input name="message" placeholder="Update message" style="width:200px;margin:0;min-height:38px" maxlength="600"><button class="btn g s" name="status" value="monitoring">Post update</button><button class="btn s" name="status" value="resolved">Resolve</button></form>` : ''}${post('incidents/' + i.id + '/delete', 'Delete', 'btn danger s')}</div></li>`).join('')}</ul>` : '<p class="empty">No incidents in the last 30 days.</p>'}
</section>

<section class="card"><h2 style="font-size:21px;margin:0 0 6px">Changelog</h2>
<form method="post" action="/admin/changelog">
  <div class="row2"><div><label for="ct">Title</label><input id="ct" name="title" maxlength="140" required placeholder="Faster command search"></div>
  <div><label for="ck">Applies to</label><select id="ck" name="kind"><option value="website">Website</option><option value="bot">Bot</option></select></div></div>
  <label for="ci">Changes, one per line</label><textarea id="ci" name="items" placeholder="Added search to the commands page"></textarea>
  <button class="btn" type="submit">Add entry</button>
</form>
<h3 style="margin:26px 0 4px;font-size:17px">Entries added here</h3>
${entries.length ? `<ul class="admlist">${entries.map(e => `<li><div><b>${esc(e.title)}</b><small>${e.kind === 'bot' ? 'Bot' : 'Website'}, ${when(e.at)}</small></div>${post('changelog/' + e.id + '/delete', 'Delete', 'btn danger s')}</li>`).join('')}</ul>` : '<p class="empty">No entries added from here yet.</p>'}
</section></div>`;
}

const ADMIN_SCRIPT = `<script>
document.getElementById('maintForm').addEventListener('submit', function () {
  document.getElementById('starts').value = new Date(document.getElementById('ms').value).getTime();
  document.getElementById('ends').value = new Date(document.getElementById('me').value).getTime();
});
</script>`;

module.exports = {
  landing,
  features,
  premium,
  commands,
  COMMANDS_SCRIPT,
  statusPage,
  STATUS_SCRIPT,
  analyticsPage,
  analyticsScript,
  changelogPage,
  notFound,
  serverError,
  adminPage,
  ADMIN_SCRIPT,
};
