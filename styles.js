// Stylesheet for the whole website. Dark indigo by default, light theme follows the device or the toggle.
module.exports = `
:root {
  --bg: #14112b; --card: #1d1939; --raised: #272150; --line: #362f66;
  --txt: #f3effd; --mut: #a9a1cd; --faint: #7b73a6;
  --sun: #ffc43d; --on-sun: #2a1c00; --link: #ffd36e; --acc: #ffc43d; --accink: #ffc43d;
  --ok: #3ddc97; --warnc: #ff9a3d; --bad: #ff5c7a; --maint: #7cb7ff; --none: #2e2859;
  --shadow: 0 18px 50px rgba(5, 3, 20, .45);
  --display: 'Bricolage Grotesque', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --body: 'Figtree', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
  --nav: 64px; --gut: clamp(16px, 4vw, 40px);
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme=dark]) {
    --bg: #f6f4fd; --card: #fff; --raised: #efebfb; --line: #ddd7f3;
    --txt: #1d1840; --mut: #5d5688; --faint: #857ead; --link: #5a3fd0; --acc: #5a3fd0; --accink: #5a3fd0;
    --ok: #14966a; --warnc: #c96a00; --bad: #d6335a; --maint: #2a74d6; --none: #e3def6;
    --shadow: 0 14px 40px rgba(60, 40, 140, .12); color-scheme: light;
  }
}
:root[data-theme=light] {
  --bg: #f6f4fd; --card: #fff; --raised: #efebfb; --line: #ddd7f3;
  --txt: #1d1840; --mut: #5d5688; --faint: #857ead; --link: #5a3fd0; --acc: #5a3fd0; --accink: #5a3fd0;
  --ok: #14966a; --warnc: #c96a00; --bad: #d6335a; --maint: #2a74d6; --none: #e3def6;
  --shadow: 0 14px 40px rgba(60, 40, 140, .12); color-scheme: light;
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; scroll-padding-top: 80px; }
body {
  margin: 0; font-family: var(--body); line-height: 1.6; background: var(--bg); color: var(--txt);
  overflow-x: hidden; min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column;
  padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right);
}
main.page { flex: 1 0 auto; }
img, svg { max-width: 100%; }
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; border-radius: 6px; }
h1, h2, h3 { font-family: var(--display); line-height: 1.12; letter-spacing: -.02em; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; background: var(--raised); padding: 1px 6px; border-radius: 6px; }

.skip { position: absolute; left: 12px; top: -60px; z-index: 99; background: var(--sun); color: var(--on-sun); padding: 10px 16px; border-radius: 10px; font-weight: 700; }
.skip:focus { top: 12px; }
.wrap { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 var(--gut); }

/* banner on top of the page */
.notice-bar { background: var(--raised); border-bottom: 1px solid var(--line); font-size: 15px; }
.notice-bar a { display: flex; gap: 10px; align-items: center; justify-content: center; text-align: center; flex-wrap: wrap; padding: 9px var(--gut); }
.notice-bar a:hover span { text-decoration: underline; }
.notice-bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--maint); flex: none; }
.notice-bar.outage { border-bottom-color: var(--bad); } .notice-bar.outage i { background: var(--bad); }
.notice-bar.degraded { border-bottom-color: var(--warnc); } .notice-bar.degraded i { background: var(--warnc); }

/* navigation */
nav.top { position: sticky; top: 0; z-index: 50; padding-top: env(safe-area-inset-top); border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 88%, transparent); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
nav.top .in { max-width: 1280px; margin: 0 auto; height: var(--nav); padding: 0 var(--gut); display: flex; align-items: center; gap: 18px; }
.logo { display: inline-flex; align-items: center; gap: 10px; font-family: var(--display); font-weight: 800; font-size: 21px; letter-spacing: -.03em; }
.logo svg { width: 30px; height: 30px; }
.links { display: flex; gap: 2px; margin-left: 10px; align-items: center; }
.links a.l { padding: 8px 12px; border-radius: 10px; color: var(--mut); font-weight: 600; font-size: 15px; display: inline-flex; gap: 8px; align-items: center; }
.links a.l:hover, .links a.l.on { color: var(--txt); background: var(--raised); }
.right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.icon-btn { width: 42px; height: 42px; display: inline-grid; place-items: center; border-radius: 12px; background: transparent; border: 1px solid var(--line); }
.icon-btn:hover { background: var(--raised); }
.icon-btn svg { width: 20px; height: 20px; }
.burger { display: none; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--faint); flex: none; }
.dot.operational, .dot.g { background: var(--ok); }
.dot.degraded { background: var(--warnc); }
.dot.outage, .dot.r { background: var(--bad); }
.dot.maintenance { background: var(--maint); }
.theme .moon { display: block; } .theme .sunicon { display: none; }
:root[data-theme=light] .theme .moon { display: none; } :root[data-theme=light] .theme .sunicon { display: block; }
@media (prefers-color-scheme: light) { :root:not([data-theme=dark]) .theme .moon { display: none; } :root:not([data-theme=dark]) .theme .sunicon { display: block; } }

/* buttons and forms */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 20px; border-radius: 12px;
  background: var(--sun); color: var(--on-sun); border: 1px solid var(--sun); font-weight: 700; cursor: pointer; transition: transform .1s, background .15s; }
.btn:hover { background: #ffd160; } .btn:active { transform: translateY(1px); }
.btn.g { background: var(--card); color: var(--txt); border-color: var(--line); } .btn.g:hover { background: var(--raised); }
.btn.s { min-height: 38px; padding: 6px 14px; font-size: 14px; border-radius: 10px; }
.btn.danger { background: transparent; color: var(--bad); border-color: var(--bad); }
.btn.danger:hover { background: var(--bad); color: #fff; }
input, select, textarea { width: 100%; min-height: 46px; padding: 10px 14px; margin: 6px 0; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); }
textarea { min-height: 96px; resize: vertical; }
label { font-weight: 600; font-size: 15px; }
.pill { display: inline-flex; align-items: center; padding: 3px 12px; border-radius: 99px; background: var(--card); border: 1px solid var(--line); font-size: 13px; color: var(--mut); font-weight: 600; }
.pill.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
.pill.bad { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 50%, transparent); }
.pill.warn { color: var(--warnc); border-color: color-mix(in srgb, var(--warnc) 50%, transparent); }
.pill.info { color: var(--maint); border-color: color-mix(in srgb, var(--maint) 50%, transparent); }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { display: inline-flex; align-items: center; min-height: 34px; padding: 4px 14px; border-radius: 99px; border: 1px solid var(--line); color: var(--mut); font-size: 14px; font-weight: 600; background: transparent; }
.chip:hover { background: var(--raised); color: var(--txt); }
.chip.on { background: var(--txt); color: var(--bg); border-color: var(--txt); }
.rowb { display: flex; gap: 12px; flex-wrap: wrap; }

/* headings and generic blocks */
h1.t, h2.t { font-size: clamp(28px, 4.6vw, 44px); margin: 0 0 10px; }
h2.t { font-size: clamp(26px, 3.6vw, 36px); text-align: left; margin: 56px 0 10px; }
.sub { color: var(--mut); margin: 0 0 26px; font-size: 17px; max-width: 62ch; }
.head { padding: clamp(36px, 7vw, 72px) 0 8px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: clamp(16px, 3vw, 24px); margin: 12px 0; }
.card h3 { margin: 4px 0 6px; font-size: 19px; } .card p { color: var(--mut); margin: 0; }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); }
.grid .card { margin: 0; }
.stats { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 24px 0; }
.stat { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; }
.stat b { display: block; font-family: var(--display); font-size: 30px; letter-spacing: -.02em; overflow-wrap: anywhere; }
.stat small { color: var(--mut); }
.bar { height: 8px; background: var(--raised); border-radius: 9px; overflow: hidden; margin: 10px 0; }
.bar i { display: block; height: 100%; background: var(--accink); border-radius: 9px; }
.split { display: grid; gap: 28px; grid-template-columns: 1fr; } @media (min-width: 900px) { .split { grid-template-columns: 1fr 1fr; align-items: start; } }
.ico { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: color-mix(in srgb, var(--sun) 16%, transparent); color: var(--accink); margin-bottom: 8px; }
.ic { width: 1.15em; height: 1.15em; vertical-align: -.2em; flex: none; }
.empty { color: var(--mut); }
.tbl { width: 100%; border-collapse: collapse; }
.tbl td, .tbl th { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; font-size: 15px; }
.tbl th { color: var(--mut); font-weight: 600; }
.price { font-family: var(--display); font-size: 38px; font-weight: 800; }
details { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 18px; margin: 10px 0; }
summary { cursor: pointer; font-weight: 700; } details p { color: var(--mut); margin: 10px 0 0; }

/* home */
.hero { display: grid; gap: clamp(28px, 5vw, 56px); grid-template-columns: 1fr; align-items: center; padding: clamp(40px, 8vw, 90px) 0 clamp(30px, 5vw, 60px); }
@media (min-width: 960px) { .hero { grid-template-columns: 1.15fr .85fr; } }
.hero h1 { font-size: clamp(36px, 6.2vw, 64px); font-weight: 800; letter-spacing: -.035em; margin: 0 0 18px; }
.hero .lead { font-size: clamp(17px, 2vw, 20px); color: var(--mut); max-width: 54ch; margin: 0 0 26px; }
.live { box-shadow: var(--shadow); margin: 0; }
.live h2 { font-size: 21px; margin: 0; }
.live .top { display: flex; align-items: center; gap: 10px; }
.live .meta { color: var(--mut); font-size: 15px; margin: 4px 0 18px; }
.live .foot { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.live .foot strong { font-family: var(--display); font-size: 26px; }
.statement { font-family: var(--display); font-weight: 600; font-size: clamp(22px, 3.6vw, 34px); line-height: 1.3; letter-spacing: -.02em; max-width: 36ch; margin: 36px 0; }
.statement b { color: var(--accink); font-weight: 800; }
.rows { border-top: 1px solid var(--line); }
.frow { display: grid; gap: 10px 32px; grid-template-columns: 1fr; padding: 24px 0; border-bottom: 1px solid var(--line); }
@media (min-width: 800px) { .frow { grid-template-columns: 240px 1fr; } }
.frow h3 { font-size: 22px; margin: 0; } .frow p { color: var(--mut); margin: 0 0 12px; max-width: 62ch; }
.frow ul { color: var(--mut); padding-left: 20px; margin: 0; } .frow li { margin: 4px 0; }
.cta { margin: 56px 0 0; padding: clamp(24px, 5vw, 40px); border-radius: 22px; background: var(--card); border: 1px solid var(--line); }
.cta h2 { margin: 0 0 10px; font-size: clamp(24px, 3.4vw, 32px); } .cta p { color: var(--mut); margin: 0 0 20px; }
.steps { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); }
.step .n { width: 38px; height: 38px; border-radius: 50%; background: var(--sun); color: var(--on-sun); display: grid; place-items: center; font-weight: 800; margin-bottom: 10px; }
.feed { list-style: none; padding: 0; margin: 0; }
.feed li { padding: 16px 0; border-bottom: 1px solid var(--line); } .feed li:first-child { padding-top: 0; } .feed li:last-child { border: 0; }
.feed .when { color: var(--faint); font-size: 14px; } .feed h3 { margin: 2px 0; font-size: 18px; } .feed p { color: var(--mut); margin: 0; }
.note { border: 1px solid var(--line); border-left: 4px solid var(--maint); border-radius: 12px; padding: 14px 16px; background: var(--card); margin: 10px 0; }
.note.degraded { border-left-color: var(--warnc); } .note.outage { border-left-color: var(--bad); }
.note h3 { margin: 0 0 4px; font-size: 17px; } .note p { margin: 0; color: var(--mut); font-size: 15px; } .note .when { color: var(--faint); font-size: 14px; display: block; margin-top: 4px; }

/* status page */
.overall { display: flex; gap: 16px; align-items: center; padding: clamp(18px, 3vw, 26px); border-radius: 18px; background: var(--card); border: 1px solid var(--line); border-left: 6px solid var(--faint); margin: 20px 0; }
.overall.operational { border-left-color: var(--ok); } .overall.degraded { border-left-color: var(--warnc); }
.overall.outage { border-left-color: var(--bad); } .overall.maintenance { border-left-color: var(--maint); }
.overall h2 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); } .overall p { margin: 0; color: var(--mut); font-size: 15px; }
.overall .dot { width: 16px; height: 16px; }
.comps { list-style: none; padding: 0; margin: 0; }
.comps li { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.comps li:first-child { padding-top: 0; } .comps li:last-child { border: 0; padding-bottom: 0; }
.comps .name { font-weight: 700; flex: 1 1 150px; } .comps .detail { color: var(--mut); font-size: 15px; } .comps .ms { color: var(--faint); font-size: 14px; min-width: 56px; text-align: right; }
.uptime .strip { display: flex; gap: 3px; height: 44px; position: relative; }
.strip .d { flex: 1 1 0; min-width: 0; border: 0; padding: 0; border-radius: 4px; background: var(--none); }
.strip .d.operational { background: var(--ok); } .strip .d.degraded { background: var(--warnc); }
.strip .d.outage { background: var(--bad); } .strip .d.maintenance { background: var(--maint); }
.strip .d:hover, .strip .d:focus-visible { filter: brightness(1.25); }
.axis { display: flex; justify-content: space-between; margin-top: 8px; font-size: 13px; color: var(--faint); }
.tip { position: absolute; z-index: 20; bottom: calc(100% + 10px); transform: translateX(-50%); background: var(--raised); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; min-width: 150px; font-size: 13px; box-shadow: var(--shadow); pointer-events: none; }
.tip b { display: block; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 14px; font-size: 13px; color: var(--mut); }
.legend span { display: inline-flex; gap: 7px; align-items: center; } .legend i { width: 12px; height: 12px; border-radius: 3px; }
.big { font-family: var(--display); font-weight: 800; font-size: clamp(32px, 6vw, 48px); letter-spacing: -.03em; }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px 24px; margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--line); }
.metrics dt { color: var(--mut); font-size: 14px; } .metrics dd { margin: 0; font-family: var(--display); font-size: 24px; font-weight: 700; }
.spark { width: 100%; height: 90px; } .spark .line { fill: none; stroke: var(--accink); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.spark .area { fill: color-mix(in srgb, var(--accink) 16%, transparent); }
.incident { padding: 18px 0; border-bottom: 1px solid var(--line); } .incident:last-child { border: 0; }
.incident h3 { margin: 0; font-size: 18px; } .incident .hd { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
.incident .meta { color: var(--faint); font-size: 14px; margin: 0 0 10px; }
.timeline { list-style: none; margin: 0 0 0 6px; padding: 0 0 0 18px; border-left: 2px solid var(--line); display: grid; gap: 12px; }
.timeline li { position: relative; font-size: 15px; } .timeline li::before { content: ""; position: absolute; left: -24px; top: 8px; width: 10px; height: 10px; border-radius: 50%; background: var(--line); }
.timeline li.done::before { background: var(--ok); } .timeline .when { display: block; color: var(--faint); font-size: 13px; } .timeline b { text-transform: capitalize; }
.daylabel { font-family: var(--display); font-weight: 700; color: var(--mut); margin: 10px 0 0; }
.refresh { color: var(--faint); font-size: 13px; margin-top: 14px; }

/* analytics */
.chart { width: 100%; height: 220px; } .chart .col { fill: var(--accink); } .chart .col:hover, .chart .col:focus { opacity: .75; outline: none; }
.chart .gl { stroke: var(--line); } .chart text { fill: var(--faint); font-size: 11px; font-family: var(--body); }
.rank { list-style: none; padding: 0; margin: 0; }
.rank li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 10px 0; align-items: baseline; }
.rank .nm { font-weight: 700; } .rank .ct { color: var(--mut); font-size: 15px; } .rank .bar { grid-column: 1 / -1; margin: 0; height: 6px; }
.delta { font-size: 13px; font-weight: 700; margin-left: 8px; } .delta.up { color: var(--ok); } .delta.down { color: var(--bad); } .delta.new { color: var(--maint); }

/* commands and changelog */
.cat { margin: 28px 0 8px; font-size: 21px; }
.cmd { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.cmd code { color: var(--accink); background: none; padding: 0; font-weight: 700; white-space: nowrap; font-size: 15px; }
.cmd span { color: var(--mut); }
.log { list-style: none; padding: 0; margin: 0; }
.log > li { display: grid; gap: 8px 32px; padding: 26px 0; border-top: 1px solid var(--line); grid-template-columns: 1fr; }
@media (min-width: 800px) { .log > li { grid-template-columns: 200px 1fr; } }
.log .when { color: var(--faint); font-size: 14px; } .log h2 { font-size: 22px; margin: 0 0 10px; } .log ul { color: var(--mut); padding-left: 20px; margin: 0; } .log li li { margin: 5px 0; }

/* servers, dashboard, leaderboard */
.srvs { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.srv { text-align: center; padding: 20px 12px; }
.srv .ic { width: 72px; height: 72px; border-radius: 50%; margin: 0 auto 10px; background: var(--line); display: grid; place-items: center; font-weight: 800; font-size: 24px; overflow: hidden; vertical-align: baseline; }
.srv .ic img { width: 100%; height: 100%; }
.dash { display: grid; gap: 22px; grid-template-columns: 230px minmax(0, 1fr); padding-top: 22px; }
.side { position: sticky; top: 80px; align-self: start; }
.side a { display: block; padding: 10px 12px; border-radius: 10px; color: var(--mut); margin-bottom: 3px; }
.side a:hover { background: var(--card); } .side a.on { background: var(--card); color: var(--txt); font-weight: 700; }
.fr { padding: 14px 0; border-bottom: 1px solid var(--line); } .fr.tg { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .fr small { display: block; color: var(--mut); }
.sw { position: relative; display: inline-block; width: 46px; height: 26px; flex: none; } .sw input { opacity: 0; width: 0; height: 0; margin: 0; min-height: 0; }
.sw span { position: absolute; inset: 0; background: var(--line); border-radius: 26px; transition: .2s; cursor: pointer; }
.sw span::before { content: ""; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
.sw input:checked + span { background: var(--ok); } .sw input:checked + span::before { transform: translateX(20px); }
.ok { background: color-mix(in srgb, var(--ok) 18%, var(--card)); border: 1px solid var(--ok); padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; }
.warn { background: color-mix(in srgb, var(--warnc) 18%, var(--card)); border: 1px solid var(--warnc); padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; }
.lb { display: flex; align-items: center; gap: 14px; padding: 12px 16px; } .lb .rk { width: 34px; font-weight: 800; color: var(--mut); }
.lb img { width: 42px; height: 42px; border-radius: 50%; } .lb .in { flex: 1; min-width: 0; }
.cg { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; }
.ck { background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; display: flex; gap: 6px; align-items: center; cursor: pointer; font-size: 14px; }
.ck input { width: auto; min-height: 0; margin: 0; }
.wcard { border-radius: 18px; padding: 22px; background: linear-gradient(135deg, #1e1f22, #5865f2); display: flex; gap: 18px; align-items: center; color: #fff; }

/* legal and docs */
.legal h2 { font-size: 22px; margin: 30px 0 8px; } .legal p, .legal li { color: var(--mut); } .legal a { color: var(--link); text-decoration: underline; text-underline-offset: 3px; }
.legal h2[id] { scroll-margin-top: 84px; }
.legal table { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; margin: 12px 0; }
.legal th, .legal td { padding: 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 14px; color: var(--mut); vertical-align: top; }
.legal th { color: var(--txt); }
.tabs { display: flex; gap: 8px; margin: 6px 0 18px; flex-wrap: wrap; }
.tabs a { padding: 9px 18px; border-radius: 99px; border: 1px solid var(--line); color: var(--mut); font-weight: 600; } .tabs a.on { background: var(--txt); color: var(--bg); border-color: var(--txt); }
.toc { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px 20px; margin: 18px 0; } .toc b { display: block; margin-bottom: 6px; }
.toc a { display: block; color: var(--mut); padding: 3px 0; } .toc a:hover { color: var(--txt); }
.tldr { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); margin: 26px 0; } .tldr .card { margin: 0; } .tldr b { display: block; margin: 2px 0 4px; } .tldr p { font-size: 14px; }
.lgrid { display: grid; gap: 40px; grid-template-columns: 230px minmax(0, 1fr); margin-top: 30px; }
.lside { position: sticky; top: 84px; align-self: start; border-left: 1px solid var(--line); max-height: calc(100vh - 110px); overflow: auto; }
.lside b { display: block; padding: 0 14px 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.lside a { display: block; padding: 6px 14px; color: var(--mut); border-left: 2px solid transparent; margin-left: -1px; font-size: 14px; line-height: 1.35; }
.lside a:hover { color: var(--txt); } .lside a.on { color: var(--txt); border-left-color: var(--sun); font-weight: 600; }
.lbody h2:first-child { margin-top: 0; } .lbody ul { padding-left: 20px; } .lbody li { margin: 6px 0; }

/* error pages */
.errpage { padding: clamp(50px, 10vw, 110px) 0; } .errcode { font-family: var(--display); font-weight: 800; font-size: clamp(88px, 22vw, 160px); line-height: .9; letter-spacing: -.06em; color: var(--accink); }

/* admin */
.adm label { display: block; margin-top: 10px; }
.adm .row2 { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.admlist { list-style: none; padding: 0; margin: 0; } .admlist li { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.admlist small { display: block; color: var(--faint); } .admlist form { display: inline; margin: 0; }
.admlist .acts { display: flex; gap: 6px; flex-wrap: wrap; }

/* footer */
footer { border-top: 1px solid var(--line); padding: 36px 0 calc(24px + env(safe-area-inset-bottom)); color: var(--mut); font-size: 15px; margin-top: 60px; background: var(--card); }
.fgrid { display: grid; gap: 28px 24px; grid-template-columns: repeat(2, 1fr); }
@media (min-width: 860px) { .fgrid { grid-template-columns: 1.6fr 1fr 1fr 1fr; } }
.fgrid > div:first-child { grid-column: 1 / -1; } @media (min-width: 860px) { .fgrid > div:first-child { grid-column: auto; } }
.fgrid b { display: block; color: var(--txt); margin-bottom: 8px; } .fgrid a { display: block; padding: 5px 0; } .fgrid a:hover { color: var(--txt); text-decoration: underline; }
.fgrid p { margin: 10px 0 14px; max-width: 280px; }
.fstatus { display: inline-flex !important; align-items: center; gap: 9px; padding: 8px 14px !important; border: 1px solid var(--line); border-radius: 99px; color: var(--txt); font-weight: 600; font-size: 14px; }
.copy { margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 13px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }

/* phones and tablets */
@media (max-width: 960px) {
  .burger { display: inline-grid; }
  .right .btn { display: none; }
  .links { display: none; position: absolute; top: 100%; left: 0; right: 0; margin: 0; flex-direction: column; align-items: stretch; gap: 2px; padding: 10px var(--gut) 18px; background: var(--bg); border-bottom: 1px solid var(--line); max-height: calc(100dvh - var(--nav)); overflow-y: auto; }
  nav.top.open .links { display: flex; }
  .links a.l { padding: 14px 12px; min-height: 48px; font-size: 17px; }
  .links .btn { width: 100%; margin-top: 8px; }
}
@media (min-width: 961px) { .links .only-mobile { display: none; } }
@media (max-width: 860px) {
  .dash { grid-template-columns: 1fr; }
  .side { position: static; display: flex; overflow-x: auto; gap: 6px; } .side a { white-space: nowrap; }
  .lgrid { grid-template-columns: 1fr; gap: 10px; }
  .lside { position: static; border: 0; max-height: none; background: var(--card); border-radius: 14px; padding: 12px 4px; }
}
@media (max-width: 560px) {
  .btn { width: 100%; } .btn.s { width: auto; }
  .strip { height: 38px; gap: 2px; }
  .cmd { flex-direction: column; gap: 2px; }
  .overall { align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
`;
