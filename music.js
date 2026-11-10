// music player: @discordjs/voice, yt-dlp and ffmpeg. /music debug tests each step
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { execFile, spawn } = require('child_process');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

const players = new Map();
let voice = null;
let prism = null;
let yt = null;
let ytErr = '';
let enabled = false;
let offReason = '';
let lastErr = '';
const BIN = path.join(__dirname, 'bin');
const ASSET =
  process.platform === 'win32'
    ? 'yt-dlp.exe'
    : process.platform === 'darwin'
      ? 'yt-dlp_macos'
      : process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
const HINT =
  '💡 Run `/music debug` to see which step fails. YouTube often blocks VPS/cloud IPs: try `source: SoundCloud` or `Audius`.';
const sh = (cmd, args, timeout = 8000) => new Promise(r =>
  execFile(
    cmd,
    args,
    { timeout },
    (e, o, er) => r(e ? null : String(o || er).split('\n')[0].trim()),
  ));
const UA = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};
const enc = encodeURIComponent;
const noise = e =>
  /premature close|aborted|ERR_STREAM|write after end|EPIPE/i.test(String(e?.message || e));
const J = (url, o = {}) =>
  fetch(
    url,
    { signal: AbortSignal.timeout(12000), ...o, headers: { ...UA, ...o.headers || {} } },
  ).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
const TXT = url =>
  fetch(url, { signal: AbortSignal.timeout(12000), headers: UA }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
const fmt = s =>
  s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : 'Live';
const short = e => String(e?.message || e).replace(/\s+/g, ' ').slice(0, 220);
const ffmpegBin = () => {
  try {
    return require('ffmpeg-static') || 'ffmpeg';
  } catch {
    return 'ffmpeg';
  }
};

// yt-dlp: only for bandcamp, mixcloud, vimeo etc. youtube needs cookies on cloud hosts
async function download(dest, asset) {
  fs.mkdirSync(BIN, { recursive: true });
  const r = await fetch(
    `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`,
    { redirect: 'follow', signal: AbortSignal.timeout(120000) },
  );
  if (!r.ok) throw new Error(`download failed (HTTP ${r.status})`);
  fs.writeFileSync(dest + '.tmp', Buffer.from(await r.arrayBuffer()));
  fs.chmodSync(dest + '.tmp', 0o755);
  fs.renameSync(dest + '.tmp', dest);
}

async function ensureYtdlp() {
  if (process.env.YTDLP_PATH) {
    yt = { cmd: process.env.YTDLP_PATH, pre: [] };
    return;
  }

  const stale = f => Date.now() - fs.statSync(f).mtimeMs > 3 * 864e5;
  const pm = /Python (\d+)\.(\d+)/.exec(await sh('python3', ['--version']) || '');
  const zip = path.join(BIN, 'yt-dlp');
  const bin = path.join(BIN, ASSET);

  if (pm && (+pm[1] > 3 || +pm[2] >= 10)) {
    // the python build starts faster than the standalone binary
    try {
      if (!fs.existsSync(zip)) await download(zip, 'yt-dlp');
      else if (stale(zip)) download(zip, 'yt-dlp').catch(() => {});

      if (await sh('python3', [zip, '--version'], 90000)) {
        yt = { cmd: 'python3', pre: [zip] };
        return;
      }
    } catch {}
  }

  if (fs.existsSync(bin)) {
    yt = { cmd: bin, pre: [] };
    if (stale(bin)) download(bin, ASSET).catch(() => {});
    return;
  }

  if (await sh('yt-dlp', ['--version'])) {
    yt = { cmd: 'yt-dlp', pre: [] };
    return;
  }

  await download(bin, ASSET);
  yt = { cmd: bin, pre: [] };
}

function ytdlp(target, source) {
  const isYt = /ytsearch|youtu\.?be|youtube\.com/i.test(target);
  const run = withJs => new Promise((res, rej) => {
    if (!yt)
      return rej(
        new Error(
          'yt-dlp is not available' + (ytErr ? ` (${ytErr})` : ' yet, it may still be downloading'),
        ),
      );
    const args = [
      '-j',
      '--no-playlist',
      '--no-warnings',
      '-f',
      'bestaudio/best',
      '--socket-timeout',
      '15',
    ];
    if (process.env.YTDLP_COOKIES) args.push('--cookies', process.env.YTDLP_COOKIES);
    if (process.env.MUSIC_PROXY) args.push('--proxy', process.env.MUSIC_PROXY);
    if (withJs)
      args.push(
        '--js-runtimes',
        `node:${process.execPath}`,
      ); // youtube needs a js runtime, we have node

    execFile(
      yt.cmd,
      [...yt.pre, ...args, target],
      { timeout: 90000, maxBuffer: 20e6 },
      (e, out, err) => {
        if (e)
          return rej(
            new Error(
              String
                (err || e.message)
                .split('\n')
                .filter(Boolean)
                .pop()
                ?.replace(/^ERROR:\s*/, '')
                .slice(0, 250)
                || 'yt-dlp failed',
            ),
          );

        try {
          const d = JSON.parse(out.split('\n')[0]);

          res({
            title: d.title,
            url: d.webpage_url || d.original_url,
            stream: d.url,
            headers: d.http_headers,
            duration: d.is_live ? 0 : d.duration,
            thumb: d.thumbnail,
            proto: d.protocol,
            source: source || String(d.extractor_key || 'web').toLowerCase(),
            at: Date.now(),
          });
        } catch {
          rej(new Error('Could not read yt-dlp output'));
        }
      },
    );
  });

  return run(isYt).catch(e =>
    isYt && /no such option|js-runtimes/i.test(e.message) ? run(false) : Promise.reject(e));
}

// rank results by how close they are to what was typed
const norm = s =>
  String
    (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const STOP = new Set(
  [
    'official',
    'audio',
    'video',
    'lyrics',
    'lyric',
    'music',
    'hd',
    'hq',
    'feat',
    'ft',
    'prod',
    'by',
    'the',
    'a',
    'of',
    'song',
  ],
);
const toks = s => norm(s).split(' ').filter(w => w && !STOP.has(w));
const BAD = /\b(remix|cover|slowed|reverb|nightcore|sped up|8d|bass boosted|karaoke|instrumental|mashup|edit|live|tutorial|reaction|type beat)\b/;

function score(q, c) {
  const qt = toks(q);
  const nq = norm(q);
  if (!qt.length) return 0;
  const hay = norm(`${c.title} ${c.artist || ''}`);
  const words = new Set(hay.split(' '));
  const nt = norm(c.title);
  const na = norm(c.artist);
  let s = qt.filter(w => words.has(w) || w.length > 3 && hay.includes(w)).length / qt.length * 0.8;

  if (nt === nq
    || `${na} ${nt}` === nq
    || `${nt} ${na}` === nq
    || `${na} ${nt}`.replace(/ /g, '') === nq.replace(/ /g, '')) s += 0.2;
  else if (na === nq) s += 0.16;
  else if (nt.startsWith(nq)) s += 0.12;

  if (BAD.test(hay) && !BAD.test(nq)) s -= 0.25;
  if (c.plays) s += Math.min(0.03, Math.log10(c.plays + 1) / 250);
  return Math.max(0, Math.min(1, s));
}

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

// soundcloud (tracks and artists)
let sc = { id: null, t: 0 };

async function scClientId() {
  if (sc.id && sc.t > Date.now()) return sc.id;
  const html = await TXT('https://soundcloud.com');
  const urls = [...html.matchAll(/<script[^>]+src="(https:\/\/[^"]+\.js)"/g)]
    .map(m => m[1])
    .reverse()
    .slice(0, 8);

  for (const u of urls) {
    const m = (await TXT(u).catch(() => '')).match(/client_id[:=]\s*"?([a-zA-Z0-9]{32})"?/);

    if (m) {
      sc = { id: m[1], t: Date.now() + 6 * 36e5 };
      return m[1];
    }
  }

  throw new Error('could not get a SoundCloud client id');
}

async function scApi(p) {
  const get = id =>
    J(`https://api-v2.soundcloud.com${p}${p.includes('?') ? '&' : '?'}client_id=${id}`);

  try {
    return await get(await scClientId());
  } catch (e) {
    if (/401|403/.test(e.message)) {
      sc.t = 0;
      return get(await scClientId());
    }

    throw e;
  }
}

async function scTrack(tr) {
  const id = await scClientId();
  const tc = tr.media?.transcodings?.find(x => x.format?.protocol === 'progressive');
  if (!tc) throw new Error('this track only has HLS streams');
  const j = await J(
    `${tc.url}?client_id=${id}${tr.track_authorization ? '&track_authorization=' + tr.track_authorization : ''}`,
  );
  return {
    title: `${tr.title} – ${tr.user?.username}`,
    url: tr.permalink_url,
    stream: j.url,
    duration: Math.round((tr.full_duration || tr.duration || 0) / 1000),
    thumb: (tr.artwork_url || tr.user?.avatar_url || '').replace('-large', '-t500x500') || null,
    source: 'soundcloud',
    at: Date.now(),
    refresh: () => scTrack(tr),
  };
}

const scOk = tr =>
  tr
    && tr.streamable !== false
    && tr.policy !== 'BLOCK'
    && tr.media?.transcodings?.some(c => c.format?.protocol === 'progressive');
const scCand = tr => ({
  title: tr.title,
  artist: tr.user?.username || '',
  url: tr.permalink_url,
  duration: Math.round((tr.full_duration || tr.duration || 0) / 1000),
  thumb: tr.artwork_url || tr.user?.avatar_url || null,
  source: 'soundcloud',
  plays: tr.playback_count || 0,
  resolve: () => scTrack(tr),
});

async function scCands(q) {
  const [tr, us] = await Promise.all(
    [
      scApi(`/search/tracks?q=${enc(q)}&limit=20`),
      scApi(`/search/users?q=${enc(q)}&limit=3`).catch(() => ({ collection: [] })),
    ],
  );
  let list = (tr.collection || []).filter(scOk);
  const nq = norm(q);
  const user =
    (us.collection || []).find(x => [x.username, x.permalink].some(n => norm(n) === nq))
      || (nq.length >= 3 ? (us.collection || []).find(x => norm(x.username).startsWith(nq)) : null);

  if (user) {
    const ut = await scApi(`/users/${user.id}/tracks?limit=15`).catch(() => null);
    list = [...(ut?.collection || []).filter(scOk), ...list];
  } // artist match: add their songs

  const seen = new Set();
  return list.filter(x => !seen.has(x.id) && seen.add(x.id)).map(scCand);
}

async function scUrl(url) {
  const d = await scApi(`/resolve?url=${enc(url)}`);
  if (d.kind === 'track') return scTrack(d);
  if (d.kind === 'playlist' && d.tracks?.[0])
    return scTrack(d.tracks[0].media ? d.tracks[0] : await scApi(`/tracks/${d.tracks[0].id}`));
  throw new Error('unsupported SoundCloud link');
}

// audius
let host = { h: null, t: 0 };

async function audiusCands(q) {
  if (!host.h || host.t < Date.now()) {
    const d = (await J('https://api.audius.co')).data;
    host = { h: d[Math.floor(Math.random() * d.length)], t: Date.now() + 600000 };
  }

  const list = ((await J(
    `${host.h}/v1/tracks/search?query=${enc(q)}&limit=10&app_name=DiscordBot`,
  )).data
    || []).filter(d => d.is_streamable !== false && d.access?.stream !== false && !d.is_delete);

  return list.map(d => ({
    title: d.title,
    artist: d.user?.name || '',
    url: `https://audius.co${d.permalink}`,
    duration: d.duration,
    thumb: d.artwork?.['480x480'] || null,
    source: 'audius',
    plays: d.play_count || 0,
    resolve: async () => {
      for (const base of ['https://api.audius.co', host.h]) {
        const stream = `${base}/v1/tracks/${d.id}/stream?app_name=DiscordBot`;
        const okk = await fetch(
          stream,
          {
            headers: { range: 'bytes=0-1' },
            signal: AbortSignal.timeout(8000),
            redirect: 'follow',
          },
        ).then(r => {
          r.body?.cancel().catch(() => {});
          return r.ok;
        }).catch(() => false);

        if (okk)
          return {
            title: `${d.title} – ${d.user?.name}`,
            url: `https://audius.co${d.permalink}`,
            stream,
            duration: d.duration,
            thumb: d.artwork?.['480x480'] || null,
            source: 'audius',
            at: Date.now(),
            permanent: true,
          };
      }

      host.t = 0;
      throw new Error('this Audius track could not be streamed');
    },
  }));
}

// internet archive and jamendo (needs JAMENDO_CLIENT_ID)
async function archiveCands(q) {
  const s = await J(
    `https://archive.org/advancedsearch.php?q=${enc(`(${q}) AND mediatype:audio`)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=downloads&rows=8&page=1&output=json&sort%5B%5D=downloads+desc`,
  );

  return (s.response?.docs || []).map(d => ({
    title: d.title,
    artist: [].concat(d.creator || '')[0] || '',
    url: `https://archive.org/details/${d.identifier}`,
    duration: 0,
    thumb: `https://archive.org/services/img/${d.identifier}`,
    source: 'archive',
    plays: d.downloads || 0,
    resolve: async () => {
      const m = await J(`https://archive.org/metadata/${d.identifier}`);
      const f = m?.files?.find(x => /mp3/i.test(x.format || '') && !/sample|_64kb/i.test(x.name));
      if (!f) throw new Error('no MP3 file in this item');
      return {
        title: `${f.title || d.title}${d.creator ? ' – ' + [].concat(d.creator)[0] : ''}`,
        url: `https://archive.org/details/${d.identifier}`,
        stream: `https://archive.org/download/${d.identifier}/${enc(f.name).replace(/%2F/g, '/')}`,
        duration: Math.round(parseFloat(f.length) || 0),
        thumb: `https://archive.org/services/img/${d.identifier}`,
        source: 'archive',
        at: Date.now(),
        permanent: true,
      };
    },
  }));
}

async function jamendoCands(q) {
  if (!process.env.JAMENDO_CLIENT_ID) throw new Error('not configured (set JAMENDO_CLIENT_ID)');
  const d =
    (await J(
      `https://api.jamendo.com/v3.0/tracks/?client_id=${process.env.JAMENDO_CLIENT_ID}&format=json&limit=8&audioformat=mp32&search=${enc(q)}`,
    )).results
      || [];
  return d.filter(x => x.audio).map(x => ({
    title: x.name,
    artist: x.artist_name,
    url: x.shareurl,
    duration: x.duration,
    thumb: x.image,
    source: 'jamendo',
    plays: 0,
    resolve: async () => ({
      title: `${x.name} – ${x.artist_name}`,
      url: x.shareurl,
      stream: x.audio,
      duration: x.duration,
      thumb: x.image,
      source: 'jamendo',
      at: Date.now(),
      permanent: true,
    }),
  }));
}

const CANDS = {
  soundcloud: scCands,
  audius: audiusCands,
  archive: archiveCands,
  jamendo: jamendoCands,
  youtube: async (q) => {
    const t = await ytdlp(`ytsearch1:${q}`, 'youtube');
    return [
      {
        title: t.title,
        artist: '',
        url: t.url,
        duration: t.duration,
        thumb: t.thumb,
        source: 'youtube',
        resolve: async () => t,
      },
    ];
  },
};

// search every source at once and sort by match
async function findCandidates(q, source = 'auto', exclude = []) {
  const names = (source === 'auto'
    ? ['soundcloud', 'audius', 'jamendo', 'archive']
    : [source]).filter(s => CANDS[s] && !exclude.includes(s));
  const errs = [];
  const all = [];
  (await Promise.allSettled(
    names.map(s => withTimeout(CANDS[s](q), s === 'youtube' ? 60000 : 15000)),
  )).forEach((r, n) =>
    r.status === 'fulfilled' ? all.push(...r.value) : errs.push(`${names[n]}: ${short(r.reason)}`));

  all.forEach(c => {
    c.score = score(q, c);
  });

  const pri = { soundcloud: 3, audius: 2, jamendo: 2, archive: 1 };
  all.sort((a, b) =>
    b.score - a.score
      || (pri[b.source] || 0) - (pri[a.source] || 0)
      || (b.plays || 0) - (a.plays || 0));
  return { cands: all, errs };
}

// take the best match (fallbacks, spotify links)
async function find(query, source = 'auto', exclude = []) {
  if (/^https?:\/\//i.test(query)) return fromUrl(query);
  const { cands, errs } = await findCandidates(query, source, exclude);

  for (const c of cands.filter(c => c.score >= 0.5).slice(0, 3)) {
    try {
      return await c.resolve();
    } catch (e) {
      errs.push(`${c.source}: ${short(e)}`);
    }
  }

  throw new Error(errs.join('\n') || `No close match found for “${query}”.`);
}

// links: direct files, spotify, soundcloud, anything else through yt-dlp
const AUDIO = /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|weba)(\?.*)?$/i;
const dec = s =>
  String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");

async function direct(url) {
  const r = await fetch(
    url,
    { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000), headers: UA },
  ).catch(() => null);
  if (!AUDIO.test(url) && !String(r?.headers.get('content-type') || '').startsWith('audio/'))
    return null;
  return {
    title: decodeURIComponent(url.split('/').pop().split('?')[0]) || url,
    url,
    stream: url,
    duration: 0,
    thumb: null,
    source: 'direct',
    at: Date.now(),
    permanent: true,
  };
}

async function fromUrl(url) {
  if (/soundcloud\.com\//i.test(url) && !/on\.soundcloud/i.test(url)) {
    try {
      return await scUrl(url);
    } catch {}
  }

  if (/open\.spotify\.com\/track\//i.test(url)) {
    const h = await TXT(url);
    const title = /property="og:title" content="([^"]+)"/.exec(h)?.[1];
    const artist = /property="og:description" content="([^"]+)"/.exec(h)?.[1]?.split(' · ')[0];
    if (!title) throw new Error('could not read that Spotify link');
    const t = await find(`${dec(title)} ${dec(artist)}`.trim(), 'auto');
    t.note = 'from Spotify link';
    return t;
  }

  if (/open\.spotify\.com\//i.test(url))
    throw new Error(
      'Only Spotify track links are supported, not playlists or albums. Paste a track link or the song name.',
    );
  return await direct(url) || ytdlp(url);
}

// dropdown when there is no clear match
const picks = new Map();

async function picker(i, q, cands, errs, why) {
  const top = cands.slice(0, 5);
  const token = Math.random().toString(36).slice(2, 10);
  picks.set(token, { cands: top, user: i.user.id, exp: Date.now() + 300000 });
  setTimeout(() => picks.delete(token), 300000).unref?.();
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`mu:pick:${token}`)
    .setPlaceholder('Choose a song…')
    .addOptions(
      top.map((c, n) => ({
        label: c.title.slice(0, 95),
        description: `${c.artist || 'Unknown artist'} · ${fmt(c.duration)} · ${c.source}`.slice(
          0,
          95,
        ),
        value: String(n),
      })),
    );

  return i.editReply({
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🔎 Results for “${q.slice(0, 80)}”`)
        .setDescription(
          (why || '')
            + top.map((
              c,
              n,
            ) => `**${n + 1}.** ${c.title} — ${c.artist || '?'} \`${fmt(c.duration)}\` · ${c.source}`).join(
              '\n',
            ),
        )
        .setFooter({ text: 'Pick one below. Only you can choose.' }),
    ],
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

async function enqueue(i, vc, t, edit) {
  await edit(
    `✅ Found **${t.title}** on ${t.source}${t.note ? ` (${t.note})` : ''}. Joining voice…`,
  );
  const gp = await getPlayer(i, vc);
  if (gp.queue.length >= 200) throw new Error('The queue is full (200 songs).');
  gp.queue.push(t);

  if (!gp.current) {
    await edit(`🔊 Starting **${t.title}**…`);
    next(gp);
  } else await edit(`➕ Added **${t.title}** to the queue (position ${gp.queue.length + 1}).`);
}

async function handleSelect(i) {
  const p = picks.get(i.customId.split(':')[2]);
  if (!p || p.exp < Date.now())
    return i.reply({ content: 'This menu expired. Search again.', ephemeral: true });
  if (i.user.id !== p.user)
    return i.reply({ content: 'Only the person who searched can choose.', ephemeral: true });
  const vc = i.member.voice.channel;
  if (!vc) return i.reply({ content: 'Join a voice channel first.', ephemeral: true });
  picks.delete(i.customId.split(':')[2]);
  const c = p.cands[+i.values[0]];
  await i.update({ content: `⏳ Loading **${c.title}**…`, embeds: [], components: [] });

  try {
    const t = await c.resolve();
    t.requester = i.user;
    await enqueue(i, vc, t, m => i.editReply(m));
  } catch (e) {
    lastErr = short(e);
    await i.editReply(`❌ ${short(e)}`);
  }
}

// audio input: node downloads (or yt-dlp streams) and pipes it into ffmpeg,
// static ffmpeg builds often can't do dns/tls on hosts like render
function ytPipeArgs(url) {
  const a = [
    '-f',
    'bestaudio/best',
    '-o',
    '-',
    '-q',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout',
    '15',
  ];
  const ff = ffmpegBin();
  if (ff.includes('/') || ff.includes('\\')) a.push('--ffmpeg-location', ff);
  if (process.env.YTDLP_COOKIES) a.push('--cookies', process.env.YTDLP_COOKIES);
  if (process.env.MUSIC_PROXY) a.push('--proxy', process.env.MUSIC_PROXY);
  if (/youtu/i.test(url)) a.push('--js-runtimes', `node:${process.execPath}`);
  return [...a, url];
}

async function openInput(t) {
  if (!t.permanent && (/m3u8|dash/i.test(t.proto || '') || !t.stream)) {
    if (!yt) throw new Error('yt-dlp is not available');
    const p = spawn(
      yt.cmd,
      [...yt.pre, ...ytPipeArgs(t.url)],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let err = '';

    p.stderr.on('data', d => {
      err = (err + d).slice(-600);
    });

    p.on('error', e => {
      lastErr = 'yt-dlp: ' + short(e);
    });

    p.on('close', code => {
      if (code && !p.killed)
        lastErr = 'yt-dlp: ' + (err.trim().split('\n').pop() || `exit ${code}`);
    });

    return {
      stream: p.stdout,
      kill: () => {
        try {
          p.kill('SIGKILL');
        } catch {}
      },
    };
  }

  const ac = new AbortController();
  const r = await fetch(
    t.stream,
    { headers: t.headers || {}, redirect: 'follow', signal: ac.signal },
  );
  if (!r.ok || !r.body) throw new Error(`the stream server answered HTTP ${r.status}`);
  const stream = Readable.fromWeb(r.body);
  stream.on('error', () => {});

  return {
    stream,
    kill: () => {
      try {
        ac.abort();
      } catch {}
    },
  };
}

// decode a few seconds like the player does, no discord needed
const decode = async (t) => {
  const inp = await openInput(t);

  return new Promise((res, rej) => {
    const ff = spawn(
      ffmpegBin(),
      ['-v', 'error', '-t', '3', '-i', 'pipe:0', '-f', 'null', '-'],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let err = '';
    ff.stderr.on('data', d => err += d);
    ff.stdin.on('error', () => {});

    ff.on('error', e => {
      inp.kill();
      rej(e);
    });

    const timer = setTimeout(() => {
      ff.kill('SIGKILL');
      inp.kill();
      rej(new Error('timed out reading the stream'));
    }, 30000);

    inp.stream.on('error', e => {
      clearTimeout(timer);
      ff.kill('SIGKILL');
      rej(e);
    });

    inp.stream.pipe(ff.stdin);

    ff.on('close', code => {
      clearTimeout(timer);
      inp.kill();

      code === 0
        ? res()
        : rej(new Error(err.trim().split('\n')[0] || `ffmpeg exited with code ${code}`));
    });
  });
};

// ui
const bar = (pos, dur) => {
  if (!dur) return '🔴 **LIVE**';
  const n = 14;
  const p = Math.min(n - 1, Math.floor(pos / dur * n));
  return `${'▬'.repeat(p)}🔘${'▬'.repeat(n - 1 - p)}  \`${fmt(pos)} / ${fmt(dur)}\``;
};
const controls = gp => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mu:pause')
      .setEmoji(gp.player.state.status === 'paused' ? '▶️' : '⏸️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mu:skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mu:stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('mu:loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mu:shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
  ),
];
const npEmbed = (gp, t) =>
  new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎶 Now playing')
    .setDescription(
      `**[${t.title}](${t.url})**\n${bar(gp.offset + (gp.resource?.playbackDuration || 0) / 1000, t.duration)}`,
    )
    .setThumbnail(t.thumb || null)
    .addFields(
      { name: 'Source', value: String(t.source), inline: true },
      { name: 'Requested by', value: `${t.requester}`, inline: true },
      {
        name: 'Volume · Loop',
        value: `${gp.volume}% · ${['off', 'song', 'queue'][gp.loop]}`,
        inline: true,
      },
    );

// player
function init() {
  try {
    voice = require('@discordjs/voice');
    prism = require('prism-media');
  } catch (e) {
    offReason = e.message;
    console.warn('Music disabled:', e.message);
    return;
  }

  enabled = true;

  ensureYtdlp().then(() => console.log('[music] yt-dlp ready:', yt.cmd, ...yt.pre)).catch(e => {
    ytErr = short(e);
    console.warn(
      '[music] yt-dlp unavailable:',
      ytErr,
      '(SoundCloud, Audius, Internet Archive, radio and direct links still work without it)',
    );
  });

  try {
    console.log(voice.generateDependencyReport());
  } catch {}

  console.log('Music enabled');
}

const say = (gp, p) => gp.text?.send(p).catch(() => {});

function destroy(gp) {
  clearTimeout(gp.idle);

  try {
    gp.input?.kill();
  } catch {}

  players.delete(gp.guildId);

  try {
    gp.player.stop(true);
  } catch {}

  try {
    gp.conn.destroy();
  } catch {}
}

async function getPlayer(i, vc) {
  let gp = players.get(i.guildId);

  if (gp && gp.vcId !== vc.id) {
    if (gp.current || gp.queue.length)
      throw new Error('I am already playing in another voice channel.');
    destroy(gp);
    gp = null;
  }

  if (gp) {
    gp.text = i.channel;
    return gp;
  }

  const {
    joinVoiceChannel,
    createAudioPlayer,
    entersState,
    VoiceConnectionStatus: V,
    AudioPlayerStatus: S,
    NoSubscriberBehavior,
  } = voice;
  const conn = joinVoiceChannel({
    channelId: vc.id,
    guildId: vc.guild.id,
    adapterCreator: vc.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  try {
    await entersState(conn, V.Ready, 20000);
  } catch {
    conn.destroy();
    throw new Error(
      'Joined the channel but the voice connection never became ready. This usually means the host blocks the UDP traffic Discord voice needs (some free hosting tiers do), or I lack Connect/Speak. Run `/music debug` while in a voice channel.',
    );
  }

  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  conn.subscribe(player);
  gp = {
    guildId: i.guildId,
    vcId: vc.id,
    conn,
    player,
    queue: [],
    history: [],
    current: null,
    loop: 0,
    volume: 80,
    text: i.channel,
    resource: null,
    offset: 0,
    startedAt: 0,
    idle: null,
    skipped: false,
  };

  conn.on(V.Disconnected, async () => {
    try {
      await Promise.race(
        [entersState(conn, V.Signalling, 5000), entersState(conn, V.Connecting, 5000)],
      );
    } catch {
      destroy(gp);
    }
  });

  player.on(S.Idle, () => onEnd(gp));

  player.on('error', e => {
    lastErr = short(e);
    console.error('[music] player error:', e.message);
    say(gp, `❌ Playback error: ${short(e)}`);
  });

  players.set(i.guildId, gp);
  return gp;
}

async function start(gp, t, from) {
  const { createAudioResource, StreamType } = voice;
  gp.input?.kill();
  const inp = await openInput(t);
  gp.input = inp;
  const args = [
    '-analyzeduration',
    '0',
    '-loglevel',
    'error',
    '-i',
    '-',
    ...from ? ['-ss', String(from)] : [],
    '-f',
    's16le',
    '-ar',
    '48000',
    '-ac',
    '2',
  ];
  const ff = new prism.FFmpeg({ args });

  ff.on('error', e => {
    if (!noise(e)) {
      lastErr = 'ffmpeg: ' + short(e);
      console.error('[ffmpeg]', e.message);
    }
  });

  ff.process?.stdin?.on('error', () => {});

  ff.process?.stderr?.on('data', d => {
    const m = String(d).trim().split('\n').pop().slice(0, 200);

    if (m && !noise(m)) lastErr = 'ffmpeg: ' + m;
  });

  ff.process?.on('close', () => inp.kill());

  inp.stream.on('error', e => {
    if (!noise(e)) lastErr = 'input: ' + short(e);

    try {
      ff.destroy();
    } catch {}
  });

  inp.stream.pipe(ff);
  const res = createAudioResource(ff, { inputType: StreamType.Raw, inlineVolume: true });
  res.volume.setVolume(gp.volume / 100);
  gp.resource = res;
  gp.offset = from;
  gp.startedAt = Date.now();
  gp.player.play(res);
}

async function next(gp) {
  clearTimeout(gp.idle);
  const t = gp.queue.shift();

  if (!t) {
    say(gp, '✅ Queue finished.');
    gp.idle = setTimeout(() => destroy(gp), 60000);
    return;
  }

  gp.current = t;

  try {
    if (!t.permanent && Date.now() - (t.at || 0) > 20 * 60000)
      Object.assign(
        t,
        await (t.refresh ? t.refresh() : ytdlp(t.url, t.source)),
      ); // stream links expire
    await start(gp, t, 0);
    gp.np = await gp.text?.send({
      embeds: [npEmbed(gp, t)],
      components: controls(gp),
    }).catch(() => null);

    setTimeout(() => {
      if (gp.current === t
        && players.get(gp.guildId) === gp
        && !['playing', 'paused'].includes(gp.player.state.status))
        say(
          gp,
          `⚠️ Still no audio after 10 seconds (state: ${gp.player.state.status}${lastErr ? ', last error: ' + lastErr : ''}). The stream may be blocked or ffmpeg is failing. Run \`/music debug\`.`,
        );
    }, 10000);
  } catch (e) {
    lastErr = short(e);
    fallback(gp, t, short(e));
  }
}

// first try failed or ended right away, try another source once
async function fallback(gp, t, why) {
  gp.current = null;

  if (t.tried) {
    say(gp, `❌ Could not play **${t.title}**: ${why}\n${HINT}`);

    return next(gp);
  }

  say(gp, `⚠️ **${t.title}** failed (${why}). Trying another source…`);

  try {
    const alt = await find(t.title, 'auto', [t.source]);
    alt.requester = t.requester;
    alt.tried = true;
    gp.queue.unshift(alt);
  } catch (e) {
    say(gp, `❌ No other source worked:\n${short(e)}\n${HINT}`);
  }

  next(gp);
}

function onEnd(gp) {
  const t = gp.current;
  const quick = t && gp.startedAt && Date.now() - gp.startedAt < 4000 && !gp.skipped && !t.live;
  if (quick && !t.tried) return fallback(gp, t, 'the stream ended immediately');
  const skipped = gp.skipped;
  gp.skipped = false;
  gp.current = null;

  if (t) {
    if (gp.loop === 1 && !skipped) gp.queue.unshift(t);
    else {
      gp.history.push(t);
      if (gp.history.length > 20) gp.history.shift();
      if (gp.loop === 2) gp.queue.push(t);
    }
  }

  next(gp);
}

function checkEmpty(o) {
  const gp = players.get(o.guild.id);
  if (!gp || o.channelId !== gp.vcId || o.channel.members.filter(m => !m.user.bot).size > 0) return;

  setTimeout(() => {
    const ch = o.guild.channels.cache.get(gp.vcId);
    if (players.get(gp.guildId) === gp && ch && ch.members.filter(m => !m.user.bot).size === 0)
      destroy(gp);
  }, 30000);
}

// now playing buttons
async function handleButton(i) {
  if (i.isStringSelectMenu?.()) return handleSelect(i);
  const gp = players.get(i.guildId);
  const no = m => i.reply({ content: m, ephemeral: true });
  if (!gp) return no('Nothing is playing.');
  if (i.member.voice.channelId !== gp.vcId) return no('Join my voice channel to use the controls.');

  switch (i.customId.slice(3)) {
    case 'pause':
      gp.player.state.status === 'paused' ? gp.player.unpause() : gp.player.pause();
      return i.update({ components: controls(gp) });
    case 'skip':
      gp.skipped = true;
      gp.player.stop(true);
      return no('⏭️ Skipped.');
    case 'stop':
      destroy(gp);
      return i.update({ components: [] });
    case 'loop':
      gp.loop = (gp.loop + 1) % 3;
      return no(`🔁 Loop: **${['off', 'song', 'queue'][gp.loop]}**`);
    case 'shuffle':
      for (let n = gp.queue.length - 1; n > 0; n--) {
        const k = Math.floor(Math.random() * (n + 1));
        [gp.queue[n], gp.queue[k]] = [gp.queue[k], gp.queue[n]];
      }

      return no('🔀 Queue shuffled.');
  }
}

async function debug(i) {
  await i.deferReply({ ephemeral: true });
  const { joinVoiceChannel, entersState, VoiceConnectionStatus: V } = voice || {};
  const vc = i.member?.voice?.channel;
  const ff = ffmpegBin();
  const t = async (label, fn) => {
    const s = Date.now();

    try {
      const r = await fn();
      return `${label} ✅ ${r || 'ok'} (${((Date.now() - s) / 1000).toFixed(1)}s)`;
    } catch (e) {
      return `${label} ❌ ${short(e).replace(/^Command failed: /, '').slice(0, 170)}`;
    }
  };
  const pipeline = (src, q) => async () => {
    const { cands } = await findCandidates(q, src);
    if (!cands.length) throw new Error('no results');
    const tr = await cands[0].resolve();
    await decode(tr);
    return `“${cands[0].title.slice(0, 26)}” decoded`;
  };
  const R = {};
  const jobs = [
    ['audius', t('Audius       ', pipeline('audius', 'lofi'))],
    ['soundcloud', t('SoundCloud   ', pipeline('soundcloud', 'lofi'))],
    ['archive', t('Int. Archive ', pipeline('archive', 'jazz'))],
    [
      'youtube',
      t('YouTube      ', async () => {
        await CANDS.youtube('lofi');
        return 'search ok';
      }),
    ],
    [
      'voice',
      t('Voice (UDP)  ', async () => {
        if (!vc) return 'skipped (join a voice channel and run again)';
        if (players.has(i.guildId)) return 'already connected';
        const c = joinVoiceChannel({
          channelId: vc.id,
          guildId: vc.guild.id,
          adapterCreator: vc.guild.voiceAdapterCreator,
          selfDeaf: true,
        });

        try {
          await entersState(c, V.Ready, 15000);
          return 'connected';
        } finally {
          c.destroy();
        }
      }),
    ],
  ];

  if (process.env.JAMENDO_CLIENT_ID)
    jobs.push(['jamendo', t('Jamendo      ', pipeline('jamendo', 'chill'))]);
  const [res, ffv, ytv] = await Promise.all(
    [
      Promise.all(jobs.map(j => j[1])),
      sh(ff, ['-version']),
      yt ? sh(yt.cmd, [...yt.pre, '--version'], 60000) : null,
    ],
  );

  jobs.forEach((j, n) => {
    R[j[0]] = res[n];
  });

  const hostName =
    process.env.RENDER
      ? 'Render'
      : process.env.RAILWAY_ENVIRONMENT
        ? 'Railway'
        : process.env.REPL_ID
          ? 'Replit'
          : process.env.DYNO ? 'Heroku' : process.env.FLY_APP_NAME ? 'Fly.io' : 'unknown';
  const out = [
    `Node ${process.version} · host: ${hostName} · RAM ${Math.round(process.memoryUsage().rss / 1048576)} MB`,
    `Music: ${enabled ? 'enabled' : 'DISABLED (' + offReason + ')'}`,
    `ffmpeg: ${ffv ? '✅ ' + ffv.slice(0, 36) : '❌ not working'}`,
    `yt-dlp: ${ytv ? '✅ ' + ytv + (yt.pre.length ? ' (python build)' : ' (standalone, slow start)') : yt ? '⚠️ installed but slow to start' : '❌ ' + (ytErr || 'not downloaded yet')} (only needed for Bandcamp/Mixcloud/other links)`,
    '',
    ...res,
    '',
    `Cookies: ${process.env.YTDLP_COOKIES ? 'set' : 'no'} · Proxy: ${process.env.MUSIC_PROXY ? 'set' : 'no'}${lastErr ? '\nLast error: ' + lastErr : ''}`,
  ];
  const hints = [];
  const good = ['audius', 'soundcloud', 'archive'].filter(k => R[k].includes('✅'));
  if (R.voice.includes('❌'))
    hints.push(
      'Voice failed: your host probably blocks UDP, or I lack Connect/Speak. Voice needs a host with UDP (a VPS or home PC).',
    );
  if (R.youtube.includes('Sign in'))
    hints.push(
      'YouTube blocks cloud hosts (normal). Every other source works without it; to enable YouTube set YTDLP_COOKIES.',
    );

  if (good.length) hints.push(`Working sources: ${good.join(', ')}. Try \`/music play lofi\`.`);
  else hints.push('No source passed. Check the lines above for the reason.');

  if (hostName === 'Render')
    hints.push(
      'Render free web services sleep without web traffic; keep the site pinged (e.g. /status) so the bot stays online.',
    );

  return i.editReply(
    '```\n' + out.join('\n').slice(0, 1750) + '\n```' + hints.map(h => `\n• ${h}`).join(''),
  );
}

// command
const sub = (n, d) => s => s.setName(n).setDescription(d);
const srcOpt = o =>
  o
    .setName('source')
    .setDescription('Where to search (default: all sources)')
    .addChoices(
      { name: 'Auto', value: 'auto' },
      { name: 'SoundCloud', value: 'soundcloud' },
      { name: 'Audius', value: 'audius' },
      { name: 'Internet Archive', value: 'archive' },
      { name: 'Jamendo', value: 'jamendo' },
      { name: 'YouTube', value: 'youtube' },
    );
const command = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Music player: play, skip, queue, loop, volume…')
    .setDMPermission(false)
    .addSubcommand(s =>
      s
        .setName('play')
        .setDescription('Play a song (name or link). Unclear matches show a result picker')
        .addStringOption(o =>
          o.setName('query').setDescription('Song, artist or link').setRequired(true))
        .addStringOption(srcOpt))
    .addSubcommand(s =>
      s
        .setName('search')
        .setDescription('Search and choose from the top results')
        .addStringOption(o => o.setName('query').setDescription('Song or artist').setRequired(true))
        .addStringOption(srcOpt))
    .addSubcommand(s =>
      s
        .setName('radio')
        .setDescription('Play an internet radio station')
        .addStringOption(o =>
          o
            .setName('station')
            .setDescription('Station name, e.g. lofi, jazz, BBC')
            .setRequired(true)))
    .addSubcommand(sub('skip', 'Skip the current song'))
    .addSubcommand(sub('previous', 'Play the previous song'))
    .addSubcommand(sub('pause', 'Pause'))
    .addSubcommand(sub('resume', 'Resume'))
    .addSubcommand(sub('stop', 'Stop and leave'))
    .addSubcommand(sub('queue', 'Show the queue'))
    .addSubcommand(sub('nowplaying', 'Show the current song'))
    .addSubcommand(sub('shuffle', 'Shuffle the queue'))
    .addSubcommand(s =>
      s
        .setName('volume')
        .setDescription('Set volume')
        .addIntegerOption(o =>
          o
            .setName('level')
            .setDescription('1-100')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)))
    .addSubcommand(s =>
      s
        .setName('loop')
        .setDescription('Set loop mode')
        .addStringOption(o =>
          o
            .setName('mode')
            .setDescription('Mode')
            .setRequired(true)
            .addChoices(
              { name: 'Off', value: '0' },
              { name: 'Song', value: '1' },
              { name: 'Queue', value: '2' },
            )))
    .addSubcommand(s =>
      s
        .setName('seek')
        .setDescription('Jump to a time')
        .addIntegerOption(o =>
          o.setName('seconds').setDescription('Seconds').setMinValue(0).setRequired(true)))
    .addSubcommand(s =>
      s
        .setName('remove')
        .setDescription('Remove a song from the queue')
        .addIntegerOption(o =>
          o
            .setName('position')
            .setDescription('Queue position (2+)')
            .setMinValue(2)
            .setRequired(true)))
    .addSubcommand(sub('debug', 'Test every music step and find out why music is not working')),
  run: async (i) => {
    const deny = m => i.reply({ content: m, ephemeral: true });
    const s = i.options.getSubcommand();
    if (s === 'debug') return debug(i);
    if (!enabled)
      return deny(
        `🎵 Music is not available (${offReason || 'not installed'}). Run \`npm install\`, restart, then use \`/music debug\`.`,
      );
    const vc = i.member.voice.channel;
    if (!vc) return deny('Join a voice channel first.');

    if (s === 'play' || s === 'radio' || s === 'search') {
      await i.deferReply();

      try {
        let t;

        if (s === 'radio') {
          const r = (await J(
            `https://de1.api.radio-browser.info/json/stations/search?name=${enc(i.options.getString('station'))}&limit=1&order=clickcount&reverse=true&hidebroken=true`,
          ))[0];
          if (!r) throw new Error('No station found.');
          t = {
            title: r.name,
            url: r.homepage || r.url_resolved,
            stream: r.url_resolved,
            duration: 0,
            live: true,
            thumb: r.favicon || null,
            source: 'radio',
            at: Date.now(),
            permanent: true,
          };
        } else {
          const q = i.options.getString('query');
          const src = i.options.getString('source') || 'auto';
          await i.editReply('🔎 Searching…');

          if (/^https?:\/\//i.test(q)) t = await fromUrl(q);
          else {
            const { cands, errs } = await findCandidates(q, src);

            if (!cands.length) throw new Error(errs.join('\n') || `No results for “${q}”.`);

            if (s === 'search') return void await picker(i, q, cands, errs);

            for (const c of cands.filter(c => c.score >= 0.85).slice(0, 3)) {
              try {
                t = await c.resolve();
                t.note = `best match for “${q.slice(0, 40)}”`;
                break;
              } catch (e) {
                errs.push(`${c.source}: ${short(e)}`);
              }
            }

            if (!t)
              return void await picker(
                i,
                q,
                cands,
                errs,
                `I couldn't find an exact match for **${q.slice(0, 60)}**. Closest results:\n\n`,
              );
          }
        }

        t.requester = i.user;
        await enqueue(i, vc, t, m => i.editReply(m));
      } catch (e) {
        lastErr = short(e);

        await i.editReply(`❌ ${String(e.message).slice(0, 1500)}\n${HINT}`);
      }

      return;
    }

    const gp = players.get(i.guildId);
    if (!gp || !gp.current && !gp.queue.length) return deny('Nothing is playing.');
    if (gp.vcId !== vc.id) return deny('You need to be in my voice channel.');

    switch (s) {
      case 'skip':
        gp.skipped = true;
        gp.player.stop(true);
        return i.reply('⏭️ Skipped.');
      case 'previous': {
        const p = gp.history.pop();
        if (!p) return deny('There is no previous song.');
        if (gp.current) gp.queue.unshift(gp.current);
        gp.queue.unshift(p);
        gp.current = null;
        gp.player.stop(true);
        return i.reply('⏮️ Playing the previous song.');
      }
      case 'pause':
        gp.player.pause();
        return i.reply('⏸️ Paused.');
      case 'resume':
        gp.player.unpause();
        return i.reply('▶️ Resumed.');
      case 'stop':
        destroy(gp);
        return i.reply('⏹️ Stopped.');
      case 'shuffle':
        for (let n = gp.queue.length - 1; n > 0; n--) {
          const k = Math.floor(Math.random() * (n + 1));
          [gp.queue[n], gp.queue[k]] = [gp.queue[k], gp.queue[n]];
        }

        return i.reply('🔀 Shuffled.');
      case 'volume':
        gp.volume = i.options.getInteger('level');
        gp.resource?.volume?.setVolume(gp.volume / 100);
        return i.reply(`🔊 Volume: **${gp.volume}%**`);
      case 'loop':
        gp.loop = +i.options.getString('mode');
        return i.reply(`🔁 Loop: **${['off', 'song', 'queue'][gp.loop]}**`);
      case 'seek':
        if (!gp.current || gp.current.live) return deny("You can't seek here.");
        await start(gp, gp.current, i.options.getInteger('seconds'));
        return i.reply(`⏩ Jumped to ${fmt(i.options.getInteger('seconds'))}.`);
      case 'remove': {
        const n = i.options.getInteger('position') - 2;
        if (!gp.queue[n]) return deny('No song at that position.');
        const [r] = gp.queue.splice(n, 1);
        return i.reply(`🗑️ Removed **${r.title}**.`);
      }
      case 'nowplaying':
        return (
          gp.current
            ? i.reply({ embeds: [npEmbed(gp, gp.current)], components: controls(gp) })
            : deny('Nothing is playing.')
        );
      case 'queue':
        return i.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('📜 Queue')
              .setDescription(
                [
                  gp.current ? `**▶ ${gp.current.title}** \`${fmt(gp.current.duration)}\`` : '',
                  ...gp.queue.slice(0, 10).map((
                    x,
                    n,
                  ) => `**${n + 2}.** ${x.title} \`${fmt(x.duration)}\``),
                ].filter(Boolean).join('\n')
                  + (gp.queue.length > 10 ? `\n…and ${gp.queue.length - 10} more` : ''),
              )
              .setFooter({
                text: `${gp.queue.length + (gp.current ? 1 : 0)} songs · volume ${gp.volume}% · loop ${['off', 'song', 'queue'][gp.loop]}`,
              }),
          ],
        });
    }
  },
};

module.exports = { init, checkEmpty, command, handleButton, handleSelect, enabled: () => enabled };
