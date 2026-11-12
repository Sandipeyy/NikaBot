// Extra pages for server admins in the dashboard: overview, case browser, activity, confessions.
const { PermissionFlagsBits: P } = require('discord.js');
const { db } = require('./db');
const { esc } = require('./site');
const { when } = require('./layout');
const adminlog = require('./adminlog');
const honeypot = require('./honeypot');
const verify = require('./verify');
const confession = require('./confession');
const tickets = require('./tickets');
const suggest = require('./suggest');
const insights = require('./insights');
const modcase = require('./modcase');
const reactionroles = require('./reactionroles');
const raidmode = require('./raidmode');

const PAGE = 25;
const DAY = 86400000;

const n = (sql, ...args) => db.prepare(sql).get(...args).n;

// ---------- bot permission check
const NEEDED = [
  ['ViewChannel', P.ViewChannel],
  ['SendMessages', P.SendMessages],
  ['EmbedLinks', P.EmbedLinks],
  ['ManageMessages', P.ManageMessages],
  ['ManageRoles', P.ManageRoles],
  ['ManageChannels', P.ManageChannels],
  ['KickMembers', P.KickMembers],
  ['BanMembers', P.BanMembers],
  ['ModerateMembers', P.ModerateMembers],
];

function missingPermissions(guild) {
  const me = guild.members.me;
  return NEEDED.filter(([, flag]) => !me.permissions.has(flag)).map(([name]) =>
    name.replace(/([A-Z])/g, ' $1').trim());
}

// ---------- setup checklist
function checklist(g, s) {
  const base = `/guild/${g.id}`;
  const verifyProblem = s.verify_role ? verify.problem(g) : 'not set up';
  return [
    ['Welcome message', !!s.welcome_channel, `${base}/welcome`],
    ['Mod-log channel', !!s.modlog_channel, `${base}/logs`],
    ['Server logs', !!s.logs_channel, `${base}/logs`],
    ['Auto-moderation', !!(s.am_invites || s.am_links || s.am_badwords), `${base}/automod`],
    ['Honeypot trap', !!s.honeypot_channel, `${base}/honeypot`],
    ['Verification', !!s.verify_role && !!s.verify_channel && !verifyProblem, `${base}/verify`],
    ['Confessions', !!s.confession_channel, `${base}/confession`],
  ];
}

// ---------- overview
function overview(g, s, invite) {
  const now = Date.now();
  const stat = (
    v,
    l,
  ) => `<div class=stat><b>${Number(v).toLocaleString()}</b><small>${l}</small></div>`;
  const week = now - 7 * DAY;

  const missing = missingPermissions(g);
  const health =
    missing.length
      ? `<div class=warn><b>I am missing permissions: ${missing.join(', ')}.</b><br>Some features will not work. <a href="${esc(invite)}" style="text-decoration:underline">Re-invite me with the right permissions</a> or enable them on my role.</div>`
      : '<div class=ok>I have every permission the dashboard features need.</div>';

  const items = checklist(g, s);
  const done = items.filter(i => i[1]).length;
  const list = items.map((
    [label, ok, href],
  ) => `<a href="${href}" class=chk><span class="dot ${ok ? 'g' : ''}"></span>${label}<small>${ok ? 'On' : 'Set up'}</small></a>`).join(
    '',
  );

  const cases = db.prepare('SELECT * FROM cases WHERE guild = ? ORDER BY num DESC LIMIT 5').all(
    g.id,
  );
  const caseRows =
    cases.length
      ? cases.map(c => `<tr><td>#${c.num}</td><td><span class=pill>${esc(c.type)}</span></td><td>${userLabel(g, c.user)}</td><td>${when(c.at, true)}</td></tr>`).join(
        '',
      )
      : '<tr><td colspan=4 class=empty>No moderation cases yet.</td></tr>';

  const acts = adminlog.list(g.id, 5);
  const actRows =
    acts.length
      ? acts.map(a => `<li><b>${esc(a.name)}</b> ${esc(a.text)}<small>${when(a.at, true)}</small></li>`).join(
        '',
      )
      : '<li class=empty>No dashboard changes yet.</li>';

  return `
<h2 style="margin:0 0 16px">${esc(g.name)}</h2>
${health}
<div class=stats style="margin-top:0">
  ${stat(g.memberCount, 'Members')}
  ${stat(n('SELECT COUNT(*) n FROM cases WHERE guild = ? AND at > ?', g.id, week), 'Mod actions (7 days)')}
  ${stat(n('SELECT COUNT(*) n FROM warns WHERE guild = ?', g.id), 'Warnings')}
  ${stat(honeypot.total(g.id), 'Honeypot catches')}
  ${stat(verify.verifiedCount(g.id), 'Verified members')}
  ${stat(n("SELECT COUNT(*) n FROM confessions WHERE guild = ? AND status = 'pending'", g.id), 'Confessions to review')}
</div>
<div class=split>
  <section class=card><h3>Setup checklist <small style="color:var(--mut)">${done}/${items.length}</small></h3><div class=bar><i style="width:${Math.round((done / items.length) * 100)}%"></i></div><div class=chklist>${list}</div></section>
  <section class=card><h3>Recent dashboard changes</h3><ul class=feed>${actRows}</ul><p><a href="/guild/${g.id}/activity" style="text-decoration:underline">View all</a></p></section>
</div>
<section class=card><h3>Latest moderation cases</h3><div class=tablewrap><table class=tbl><tr><th>Case</th><th>Type</th><th>Member</th><th>When</th></tr>${caseRows}</table></div><p><a href="/guild/${g.id}/cases" style="text-decoration:underline">Browse all cases</a></p></section>`;
}

function userLabel(g, id) {
  const m = g.members.cache.get(id);
  return (
    m
      ? `${esc(m.user.tag)} <small style="color:var(--faint)">${id}</small>`
      : `<code>${esc(id)}</code>`
  );
}

// ---------- cases
const TYPES = ['warn', 'kick', 'ban', 'unban', 'timeout', 'untimeout'];

function caseQuery(guildId, q) {
  const where = ['guild = ?'];
  const args = [guildId];
  const user = String(q.q || '').replace(/\D/g, '');

  if (user.length >= 5) {
    where.push('user = ?');
    args.push(user);
  }

  if (TYPES.includes(q.type)) {
    where.push('type = ?');
    args.push(q.type);
  }

  return { sql: where.join(' AND '), args };
}

function casesPage(g, q) {
  const f = caseQuery(g.id, q);
  const total = n(`SELECT COUNT(*) n FROM cases WHERE ${f.sql}`, ...f.args);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(pages, Math.max(1, parseInt(q.page, 10) || 1));
  const rows = db.prepare(
    `SELECT * FROM cases WHERE ${f.sql} ORDER BY num DESC LIMIT ? OFFSET ?`,
  ).all(...f.args, PAGE, (page - 1) * PAGE);

  const params = p => {
    const u = new URLSearchParams();
    if (q.q) u.set('q', q.q);
    if (TYPES.includes(q.type)) u.set('type', q.type);
    if (p) u.set('page', p);
    return u.toString();
  };

  const table =
    rows.length
      ? rows.map(c => `<tr><td>#${c.num}</td><td><span class=pill>${esc(c.type)}</span></td><td>${userLabel(g, c.user)}</td><td>${userLabel(g, c.mod)}</td><td class=reason>${esc(c.reason || '')}</td><td>${when(c.at, true)}</td></tr>`).join(
        '',
      )
      : '<tr><td colspan=6 class=empty>No cases match.</td></tr>';

  const pager =
    pages > 1
      ? `<div class=chips style="margin-top:14px">${page > 1 ? `<a class=chip href="?${params(page - 1)}">Previous</a>` : ''}<span class=chip>Page ${page} of ${pages}</span>${page < pages ? `<a class=chip href="?${params(page + 1)}">Next</a>` : ''}</div>`
      : '';

  return `
<h2 style="margin:0 0 6px">Moderation cases</h2>
<p style="color:var(--mut);margin-top:0">Every ban, kick, warn and timeout, including honeypot catches. ${total.toLocaleString()} case${total === 1 ? '' : 's'} found.</p>
<form class=card method=get style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
  <div style="flex:2 1 220px"><label for=q>Member ID</label><input id=q name=q value="${esc(q.q || '')}" placeholder="Paste a user ID" inputmode=numeric></div>
  <div style="flex:1 1 150px"><label for=type>Type</label><select id=type name=type><option value="">All types</option>${TYPES.map(t => `<option ${q.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <button class=btn>Filter</button>
  <a class="btn g" href="/guild/${g.id}/cases.csv?${params()}">Export CSV</a>
</form>
<div class=card><div class=tablewrap><table class=tbl><tr><th>Case</th><th>Type</th><th>Member</th><th>Moderator</th><th>Reason</th><th>When</th></tr>${table}</table></div>${pager}</div>`;
}

// spreadsheet apps treat cells starting with = + - @ as formulas
const cell = v => {
  let t = String(v ?? '').replace(/\r?\n/g, ' ');

  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
};

function casesCsv(g, q) {
  const f = caseQuery(g.id, q);
  const rows = db.prepare(`SELECT * FROM cases WHERE ${f.sql} ORDER BY num DESC LIMIT 5000`).all(
    ...f.args,
  );
  const lines = ['case,type,user,moderator,reason,time'];

  for (const c of rows) {
    lines.push(
      [c.num, c.type, c.user, c.mod, c.reason, new Date(c.at).toISOString()].map(cell).join(','),
    );
  }

  return lines.join('\n');
}

// ---------- dashboard activity
function activityPage(g, q) {
  const total = adminlog.count(g.id);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(pages, Math.max(1, parseInt(q.page, 10) || 1));
  const rows = adminlog.list(g.id, PAGE, (page - 1) * PAGE);

  const items =
    rows.length
      ? rows.map(a => `<tr><td>${when(a.at, true)}</td><td>${esc(a.name)} <small style="color:var(--faint)">${esc(a.user)}</small></td><td><span class=pill>${esc(a.area)}</span></td><td>${esc(a.text)}</td></tr>`).join(
        '',
      )
      : '<tr><td colspan=4 class=empty>Nothing has been changed from the dashboard yet.</td></tr>';

  const pager =
    pages > 1
      ? `<div class=chips style="margin-top:14px">${page > 1 ? `<a class=chip href="?page=${page - 1}">Previous</a>` : ''}<span class=chip>Page ${page} of ${pages}</span>${page < pages ? `<a class=chip href="?page=${page + 1}">Next</a>` : ''}</div>`
      : '';

  return `
<h2 style="margin:0 0 6px">Dashboard activity</h2>
<p style="color:var(--mut);margin-top:0">Who changed settings from this dashboard. Changes made with slash commands are not listed here.</p>
<div class=card><div class=tablewrap><table class=tbl><tr><th>When</th><th>Who</th><th>Area</th><th>Change</th></tr>${items}</table></div>${pager}</div>`;
}

// ---------- confessions
function confessionsPage(g, flash) {
  const stats = Object.fromEntries(confession.counts(g.id).map(r => [r.status, r.n]));
  const rows = confession.list(g.id, 30);
  const blocked = confession.blocked(g.id);

  const table =
    rows.length
      ? rows.map(c => `<tr><td>#${c.num}</td><td><span class="pill ${c.status === 'posted' ? 'ok' : c.status === 'pending' ? 'warn' : ''}">${esc(c.status)}</span></td><td class=reason>${esc(c.text.slice(0, 160))}${c.text.length > 160 ? '…' : ''}</td><td>${when(c.at, true)}</td>
<td style="white-space:nowrap">
  <form method=post action="/guild/${g.id}/confessions/${c.num}/reveal" style="display:inline" onsubmit="return confirm('Reveal who sent confession #${c.num}? This is logged.')"><button class="btn g s">Reveal sender</button></form>
  ${c.status === 'posted' ? `<form method=post action="/guild/${g.id}/confessions/${c.num}/delete" style="display:inline"><button class="btn danger s">Delete</button></form>` : ''}
</td></tr>`).join('')
      : '<tr><td colspan=5 class=empty>No confessions yet.</td></tr>';

  return `
<h2 style="margin:0 0 6px">Confession moderation</h2>
<p style="color:var(--mut);margin-top:0">Review what members confessed. Revealing a sender is logged in the dashboard activity and the mod-log.</p>
${flash || ''}
<div class=stats style="margin-top:0">
  <div class=stat><b>${stats.posted || 0}</b><small>Posted</small></div>
  <div class=stat><b>${stats.pending || 0}</b><small>Waiting for review</small></div>
  <div class=stat><b>${stats.rejected || 0}</b><small>Rejected</small></div>
  <div class=stat><b>${blocked.length}</b><small>Blocked members</small></div>
</div>
<div class=card><div class=tablewrap><table class=tbl><tr><th>#</th><th>Status</th><th>Text</th><th>When</th><th></th></tr>${table}</table></div></div>
<div class=card><h3>Blocked members</h3>
  <form method=post action="/guild/${g.id}/confessions/block" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
    <div style="flex:1 1 220px"><label for=uid>Member ID</label><input id=uid name=user placeholder="User ID" inputmode=numeric required></div>
    <button class=btn name=do value=block>Block</button><button class="btn g" name=do value=unblock>Unblock</button>
  </form>
  ${blocked.length ? `<p style="color:var(--mut)">${blocked.map(id => `<code>${esc(id)}</code>`).join(' ')}</p>` : ''}
</div>`;
}

// ---------- extra blocks under the module settings forms
function extra(kind, g, s) {
  if (kind === 'honeypot') {
    const rows = honeypot.recent(g.id, 10);
    const table =
      rows.length
        ? rows.map(r => `<tr><td>${when(r.at, true)}</td><td>${esc(r.tag)} <small style="color:var(--faint)">${esc(r.user)}</small></td><td>${esc(r.action)}${r.ok ? '' : ' (failed)'}</td><td class=reason>${esc(r.content || '')}</td></tr>`).join(
          '',
        )
        : '<tr><td colspan=4 class=empty>No one has fallen for it yet.</td></tr>';
    return `<div class=card><h3>Recent catches <small style="color:var(--mut)">${honeypot.total(g.id)} total</small></h3><div class=tablewrap><table class=tbl><tr><th>When</th><th>Who</th><th>Action</th><th>Message</th></tr>${table}</table></div></div>`;
  }

  if (kind === 'verify') {
    const issue =
      s.verify_role ? verify.problem(g) : 'Choose the verified role and a channel, then save.';
    return `<div class=card><h3>Status</h3>${issue ? `<div class=warn>${esc(issue)}</div>` : '<div class=ok>Everything looks fine.</div>'}<p style="color:var(--mut);margin-bottom:0">${verify.verifiedCount(g.id)} members verified. Remember to hide your other channels from @everyone and show them to the verified role.</p></div>`;
  }

  if (kind === 'confession') {
    return `<div class=card><h3>Moderation</h3><p style="color:var(--mut)">Review, delete and block from the confession page.</p><a class="btn g" href="/guild/${g.id}/confessions">Open confession moderation</a></div>`;
  }

  return extraMore(kind, g, s);
}

// ---------- insights
function insightsPage(g, q) {
  const r = insights.report(g.id, parseInt(q.days, 10) || 14);
  const range = [
    7,
    14,
    30,
  ].map(d => `<a class="chip ${r.days === d ? 'on' : ''}" href="?days=${d}">Last ${d} days</a>`).join(
    '',
  );
  const chan =
    r.topChannels.length
      ? rankRows(
        r.topChannels.map(c => ({
          name:
            g.channels.cache.get(c.channel)
              ? '#' + g.channels.cache.get(c.channel).name
              : 'deleted channel',
          n: c.n,
        })),
      )
      : '<p class=empty>Counting starts now. Message numbers appear after people chat.</p>';
  const cmds =
    r.topCommands.length
      ? rankRows(r.topCommands.map(c => ({ name: '/' + c.command, n: c.n })))
      : '<p class=empty>No commands used yet.</p>';
  const net = r.net > 0 ? `+${r.net}` : String(r.net);

  return `
<h2 style="margin:0 0 6px">Insights</h2>
<p style="color:var(--mut);margin-top:0">How your server is moving. Numbers are collected from the day this feature was switched on.</p>
<nav class=chips style="margin-bottom:16px">${range}</nav>
<div class=stats style="margin-top:0">
  <div class=stat><b>${r.joins.toLocaleString()}</b><small>Joined</small></div>
  <div class=stat><b>${r.leaves.toLocaleString()}</b><small>Left</small></div>
  <div class=stat><b>${net}</b><small>Net growth</small></div>
  <div class=stat><b>${r.messages.toLocaleString()}</b><small>Messages</small></div>
</div>
<section class=card><h3>Joins and leaves per day</h3><svg class=chart id=chart role=img aria-label="Joins and leaves per day"></svg>
<p style="color:var(--mut);font-size:14px;margin:6px 0 0" id=tipline aria-live=polite><span style="color:var(--accink)">■</span> joined &nbsp; <span style="color:var(--bad)">■</span> left</p></section>
<div class=split>
  <section class=card><h3>Busiest channels</h3>${chan}</section>
  <section class=card><h3>Most used commands</h3>${cmds}</section>
</div>
<script>
(function () {
  var series = ${JSON.stringify(r.series)};
  var svg = document.getElementById('chart'), tip = document.getElementById('tipline');
  var H = 220, L = 30, R = 8, T = 10, B = 24, ns = 'http://www.w3.org/2000/svg';
  var max = Math.max.apply(null, series.map(function (d) { return Math.max(d.joins, d.leaves); })) || 1;
  var top = Math.max(4, Math.ceil(max / 4) * 4);
  function el(n, a) { var e = document.createElementNS(ns, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function label(d) { return new Date(d.date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function draw() {
    svg.textContent = '';
    var W = Math.max(280, svg.parentElement.clientWidth), pw = W - L - R, ph = H - T - B, step = pw / series.length, bw = Math.max(2, step * .36);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    for (var i = 0; i <= 4; i++) {
      var y = T + ph - ph * i / 4;
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: y, y2: y, 'class': 'gl' }));
      var t = el('text', { x: L - 6, y: y + 4, 'text-anchor': 'end' }); t.textContent = Math.round(top * i / 4); svg.appendChild(t);
    }
    series.forEach(function (d, n) {
      var x = L + n * step + step / 2, msg = label(d) + ': ' + d.joins + ' joined, ' + d.leaves + ' left';
      [[d.joins, x - bw, 'col'], [d.leaves, x, 'col2']].forEach(function (p) {
        var h = p[0] ? Math.max(2, p[0] / top * ph) : 0;
        var r = el('rect', { x: p[1], y: T + ph - h, width: bw, height: h, rx: 2, 'class': p[2], tabindex: 0, 'aria-label': msg });
        ['mouseenter', 'focus', 'click'].forEach(function (ev) { r.addEventListener(ev, function () { tip.textContent = msg; }); });
        svg.appendChild(r);
      });
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
}

function rankRows(rows) {
  const top = rows[0]?.n || 1;

  return `<ol class=rank>${rows
    .map(r => `<li><span class=nm>${esc(r.name)}</span><span class=ct>${Number(r.n).toLocaleString()}</span><span class=bar><i style="width:${Math.max(2, Math.round((r.n / top) * 100))}%"></i></span></li>`)
    .join('')}</ol>`;
}

// ---------- member lookup
function memberPage(g, q, flash) {
  const id = String(q.q || '').replace(/\D/g, '');
  const search = `<form class=card method=get style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
  <div style="flex:1 1 260px"><label for=q>Member ID or mention</label><input id=q name=q value="${esc(q.q || '')}" placeholder="Paste a user ID" inputmode=numeric required></div>
  <button class=btn>Look up</button></form>`;
  const head = `<h2 style="margin:0 0 6px">Member lookup</h2><p style="color:var(--mut);margin-top:0">Everything the bot knows about one member: cases, warnings, staff notes and safety history.</p>${flash || ''}${search}`;
  if (id.length < 5) return head;

  const h = modcase.history(g.id, id);
  const member = g.members.cache.get(id);
  const hp = db.prepare('SELECT COUNT(*) n FROM honeypot_log WHERE guild = ? AND user = ?').get(
    g.id,
    id,
  ).n;
  const verified = db.prepare('SELECT at FROM verify_log WHERE guild = ? AND user = ?').get(
    g.id,
    id,
  );
  const blocked = confession.blocked(g.id).includes(id);

  const title =
    member
      ? `${esc(member.user.tag)} <small style="color:var(--faint)">${id}</small>`
      : `<code>${esc(id)}</code> <small style="color:var(--faint)">not in the server (or not cached)</small>`;
  const facts = [
    member?.joinedTimestamp ? `Joined ${when(member.joinedTimestamp)}` : '',
    member ? `Account created ${when(member.user.createdTimestamp)}` : '',
    verified ? `Verified ${when(verified.at)}` : 'Not verified through the bot',
    hp ? `${hp} honeypot catch${hp === 1 ? '' : 'es'}` : '',
    blocked ? 'Blocked from confessions' : '',
  ].filter(Boolean).join(' · ');

  const base = `/guild/${g.id}/member`;
  const caseRows =
    h.cases.length
      ? h.cases.map(c => `<tr><td>#${c.num}</td><td><span class=pill>${esc(c.type)}</span></td>
<td class=reason><form method=post action="${base}/case/${c.num}/edit" style="display:flex;gap:6px"><input type=hidden name=q value="${id}"><input name=reason value="${esc(c.reason || '')}" maxlength=300 aria-label="Reason for case ${c.num}" style="margin:0;min-height:38px"><button class="btn g s">Save</button></form></td>
<td>${when(c.at, true)}</td>
<td><form method=post action="${base}/case/${c.num}/delete" onsubmit="return confirm('Delete case #${c.num}? This cannot be undone.')"><input type=hidden name=q value="${id}"><button class="btn danger s">Delete</button></form></td></tr>`).join(
        '',
      )
      : '<tr><td colspan=5 class=empty>No cases.</td></tr>';

  const noteRows =
    h.notes.length
      ? h.notes.map(n => `<li><div><b>${userLabel(g, n.mod)}</b> <small style="color:var(--faint)">${when(n.at, true)}</small><br>${esc(n.text)}</div>
<form method=post action="${base}/note/${n.id}/delete"><input type=hidden name=q value="${id}"><button class="btn danger s">Delete</button></form></li>`).join(
        '',
      )
      : '<li class=empty>No staff notes.</li>';

  return `${head}
<section class=card><h3>${title}</h3><p style="color:var(--mut);margin:0">${facts || 'No extra information.'}</p>
<div class=stats><div class=stat><b>${h.cases.length}</b><small>Cases</small></div><div class=stat><b>${h.warns}</b><small>Warnings</small></div><div class=stat><b>${h.notes.length}</b><small>Staff notes</small></div></div>
${h.warns ? `<form method=post action="${base}/clearwarns" onsubmit="return confirm('Clear all warnings for this member?')"><input type=hidden name=q value="${id}"><button class="btn g s">Clear warnings</button></form>` : ''}</section>
<section class=card><h3>Cases</h3><div class=tablewrap><table class=tbl><tr><th>Case</th><th>Type</th><th>Reason</th><th>When</th><th></th></tr>${caseRows}</table></div></section>
<section class=card><h3>Staff notes</h3><p style="color:var(--mut);margin-top:0">Only moderators with dashboard access can see these.</p>
<ul class=admlist>${noteRows}</ul>
<form method=post action="${base}/note" style="margin-top:12px"><input type=hidden name=q value="${id}"><label for=note>Add a note</label><textarea id=note name=text maxlength=500 required placeholder="What should other moderators know?"></textarea><button class=btn>Save note</button></form></section>`;
}

// ---------- reaction roles
function rolesPage(g, flash) {
  const panels = reactionroles.list(g.id);
  const rows =
    panels.length
      ? panels.map(p => `<li><div><b>#${p.id} ${esc(p.title)}</b> <span class=pill>${p.mode === 'unique' ? 'pick one' : 'pick any'}</span><small>${p.roles.map(r => esc(r.label)).join(', ')} · in ${g.channels.cache.get(p.channel) ? '#' + esc(g.channels.cache.get(p.channel).name) : 'a deleted channel'}</small></div>
<form method=post action="/guild/${g.id}/reactionroles/${p.id}/delete" onsubmit="return confirm('Delete this role picker and its message?')"><button class="btn danger s">Delete</button></form></li>`).join(
        '',
      )
      : '<li class=empty>No role pickers yet.</li>';

  return `<h2 style="margin:0 0 6px">Reaction roles</h2>
<p style="color:var(--mut);margin-top:0">Role pickers are created in Discord with <code>/reactionroles create</code> (up to 10 roles each). Manage them here.</p>${flash || ''}
<section class=card><ul class=admlist>${rows}</ul></section>`;
}

// ---------- backup
function backupPage(g, flash) {
  return `<h2 style="margin:0 0 6px">Backup and restore</h2>
<p style="color:var(--mut);margin-top:0">Save this server's dashboard settings to a file, or load them into another server. Channels and roles are only restored if they exist in the target server.</p>${flash || ''}
<section class=card><h3>Export</h3><p style="color:var(--mut)">Downloads every dashboard setting as a JSON file. Moderation cases, notes and confessions are not included.</p><a class=btn href="/guild/${g.id}/settings.json">Download settings</a></section>
<section class=card><h3>Import</h3><form method=post action="/guild/${g.id}/backup/import">
<label for=data>Paste the contents of a settings file</label><textarea id=data name=data rows=8 required spellcheck=false placeholder='{"prefix":"!", ...}'></textarea>
<p style="color:var(--mut);font-size:14px">This overwrites the settings in the file. Everything else stays as it is.</p><button class=btn>Import settings</button></form></section>`;
}

// ---------- extra blocks
function extraMore(kind, g, s) {
  if (kind === 'tickets') {
    const stats = Object.fromEntries(tickets.stats(g.id).map(r => [r.status, r.n]));
    const rows = tickets.recent(g.id, 10);
    const table =
      rows.length
        ? rows.map(t => `<tr><td>#${t.num}</td><td><span class="pill ${t.status === 'open' ? 'warn' : ''}">${esc(t.status)}</span></td><td>${userLabel(g, t.opener)}</td><td>${esc(t.topic || '')}</td><td>${when(t.opened, true)}</td></tr>`).join(
          '',
        )
        : '<tr><td colspan=5 class=empty>No tickets yet.</td></tr>';
    return `<div class=card><h3>Tickets <small style="color:var(--mut)">${stats.open || 0} open, ${stats.closed || 0} closed</small></h3><div class=tablewrap><table class=tbl><tr><th>#</th><th>Status</th><th>Opened by</th><th>Topic</th><th>When</th></tr>${table}</table></div></div>`;
  }

  if (kind === 'suggest') {
    const rows = suggest.recent(g.id, 10);
    const table =
      rows.length
        ? rows.map(x => `<tr><td>#${x.num}</td><td><span class=pill>${esc(x.status)}</span></td><td class=reason>${esc(x.text.slice(0, 140))}</td><td>${when(x.at, true)}</td></tr>`).join(
          '',
        )
        : '<tr><td colspan=4 class=empty>No suggestions yet.</td></tr>';
    return `<div class=card><h3>Recent suggestions</h3><div class=tablewrap><table class=tbl><tr><th>#</th><th>Status</th><th>Idea</th><th>When</th></tr>${table}</table></div></div>`;
  }

  if (kind === 'logs') {
    return `<div class=card><h3>Test it</h3><p style="color:var(--mut)">Sends a sample message to your mod-log and log channels so you can check that I can post there.</p><form method=post action="/guild/${g.id}/logs/test"><button class="btn g s">Send test logs</button></form></div>`;
  }

  if (kind === 'raidmode') {
    const on = raidmode.active(s);
    return `<div class=card><h3>Right now</h3>${on ? '<div class=warn>Raid mode is <b>on</b>. New accounts are being removed.</div>' : '<div class=ok>Raid mode is off.</div>'}<p style="color:var(--mut);margin-bottom:0">Switch it on in the form above and save, or run <code>/raidmode on</code> in Discord.</p></div>`;
  }

  return '';
}

module.exports = {
  insightsPage,
  memberPage,
  rolesPage,
  backupPage,
  extraMore,
  overview,
  casesPage,
  casesCsv,
  activityPage,
  confessionsPage,
  extra,
  missingPermissions,
  checklist,
};
