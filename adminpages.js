// Extra pages for server admins in the dashboard: overview, case browser, activity, confessions.
const { PermissionFlagsBits: P } = require('discord.js');
const { db } = require('./db');
const { esc } = require('./site');
const { when } = require('./layout');
const adminlog = require('./adminlog');
const honeypot = require('./honeypot');
const verify = require('./verify');
const confession = require('./confession');

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

  return '';
}

module.exports = {
  overview,
  casesPage,
  casesCsv,
  activityPage,
  confessionsPage,
  extra,
  missingPermissions,
  checklist,
};
