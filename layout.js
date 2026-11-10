// Page shell: top navigation, notice bar, footer and the small script every page needs.
const site = require('./site');
const styles = require('./styles');
const monitor = require('./monitor');

const esc = site.esc;

const STATUS_TEXT = {
  operational: 'All systems operational',
  degraded: 'Some systems are slow',
  outage: 'Service disruption',
  maintenance: 'Maintenance in progress',
  starting: 'Checking status',
};

const NAV = [
  ['/features', 'Features'],
  ['/commands', 'Commands'],
  ['/docs', 'Docs'],
  ['/status', 'Status', true],
  ['/analytics', 'Analytics'],
  ['/changelog', 'Changelog'],
];

// UTC fallback text; the script below rewrites <time data-t> into the visitor's own time zone
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(ms, withTime) {
  const d = new Date(ms);
  let out = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (withTime) out += `, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
  return `<time datetime="${new Date(ms).toISOString()}" data-t="${withTime ? 'dt' : 'd'}">${out}</time>`;
}

const SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

const PAGE_SCRIPT = `
(function () {
  var root = document.documentElement;
  var nav = document.getElementById('top');
  document.getElementById('burger').onclick = function (e) { e.stopPropagation(); nav.classList.toggle('open'); };
  document.addEventListener('click', function (e) { if (!nav.contains(e.target)) nav.classList.remove('open'); });
  document.getElementById('theme').onclick = function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    var next = cur === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  };
  function localTimes() {
    document.querySelectorAll('time[data-t]').forEach(function (t) {
      var d = new Date(t.getAttribute('datetime'));
      var o = { day: 'numeric', month: 'short', year: 'numeric' };
      if (t.dataset.t === 'dt') { o.hour = '2-digit'; o.minute = '2-digit'; }
      t.textContent = d.toLocaleString(undefined, o);
    });
  }
  // tooltips for the uptime strip
  function strips() {
    document.querySelectorAll('.strip').forEach(function (strip) {
      var tip;
      function hide() { if (tip) { tip.remove(); tip = null; } }
      function show(b) {
        hide();
        tip = document.createElement('div');
        tip.className = 'tip';
        tip.innerHTML = '<b></b><span></span>';
        tip.firstChild.textContent = b.dataset.day;
        tip.lastChild.textContent = b.dataset.info;
        strip.appendChild(tip);
        var s = strip.getBoundingClientRect(), r = b.getBoundingClientRect(), half = tip.offsetWidth / 2;
        tip.style.left = Math.max(half, Math.min(s.width - half, r.left - s.left + r.width / 2)) + 'px';
      }
      strip.querySelectorAll('.d').forEach(function (b) {
        b.addEventListener('mouseenter', function () { show(b); });
        b.addEventListener('focus', function () { show(b); });
        b.addEventListener('click', function (e) { e.stopPropagation(); show(b); });
        b.addEventListener('mouseleave', hide);
        b.addEventListener('blur', hide);
      });
    });
  }
  document.addEventListener('click', function () { document.querySelectorAll('.tip').forEach(function (t) { t.remove(); }); });
  window.pageInit = function () { localTimes(); strips(); };
  pageInit();
})();`;

// req: express request, opts: { title, body, extra, noindex, wide }
function shell(req, name, { title, body, extra = '', noindex = false, session = null }) {
  const base = (process.env.BASE_URL || site.URL).replace(/\/$/, '');
  const bar = monitor.banner();
  const state = monitor.current().overall;
  const here = req.path;
  const invite = '/invite';
  const support = process.env.SUPPORT_URL || '#';

  const links = NAV.map(([href, label, dot]) => {
    const on = here === href || here.startsWith(href + '/') ? ' on' : '';
    return `<a class="l${on}" href="${href}">${dot ? `<span class="dot ${state}" data-live-dot></span>` : ''}${label}</a>`;
  }).join('');

  const notice = bar
    ? `<div class="notice-bar ${bar.tone}" role="status"><a href="/status"><i></i><span>${esc(bar.text)}</span>${bar.at ? when(bar.at, true) : ''}</a></div>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
${site.head({ title, path: req.path, name, base, noindex })}
<style>${styles}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${notice}
<nav class="top" id="top">
  <div class="in">
    <a class="logo" href="/">${site.logo(30)}<span>${esc(name)}</span></a>
    <div class="links">
      ${links}
      ${session ? `<a class="l" href="/servers">Dashboard</a>` : ''}
      <a class="l only-mobile" href="${session ? '/logout' : '/login'}">${session ? 'Log out' : 'Login'}</a>
      <a class="btn only-mobile" href="${invite}">Add to Discord</a>
    </div>
    <div class="right">
      <button class="icon-btn theme" id="theme" aria-label="Switch between light and dark theme"><span class="moon">${MOON}</span><span class="sunicon">${SUN}</span></button>
      ${session ? `<a class="btn g s" href="/logout">Log out</a>` : `<a class="btn g s" href="/login">Login</a>`}
      <a class="btn s" href="${invite}">Add to Discord</a>
      <button class="icon-btn burger" id="burger" aria-label="Menu">${MENU}</button>
    </div>
  </div>
</nav>
<main class="page" id="main">
${body}
</main>
<footer>
  <div class="wrap">
    <div class="fgrid">
      <div>
        <a class="logo" href="/">${site.logo(28)}<span>${esc(name)}</span></a>
        <p>A Discord bot for leveling, moderation, music, economy and games. Not affiliated with Discord Inc.</p>
        <a class="fstatus" href="/status"><span class="dot ${state}" data-live-dot></span><span>${STATUS_TEXT[state] || STATUS_TEXT.starting}</span></a>
      </div>
      <div><b>Product</b><a href="/features">Features</a><a href="/commands">Commands</a><a href="/premium">Premium</a><a href="${invite}">Add to Discord</a></div>
      <div><b>Resources</b><a href="/docs">Docs</a><a href="/status">Status</a><a href="/analytics">Analytics</a><a href="/changelog">Changelog</a><a href="${esc(support)}">Support</a></div>
      <div><b>Legal</b><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div>
    </div>
    <div class="copy"><span>&copy; ${new Date().getFullYear()} ${esc(name)}</span><span>${esc(base.replace(/^https?:\/\//, ''))}</span></div>
  </div>
</footer>
<script>${PAGE_SCRIPT}</script>
${extra}
</body>
</html>`;
  return site.iconize(html);
}

module.exports = { shell, when, STATUS_TEXT };
