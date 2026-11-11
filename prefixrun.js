// text version of every slash command, plus short aliases (m!cf 100 h)
// args are read from the command's option list and it runs through a fake interaction
const ALIASES = {
  cf: 'coinflip',
  bj: 'blackjack',
  sl: 'slots',
  s: 'slots',
  rl: 'roulette',
  rou: 'roulette',
  ttt: 'tictactoe',
  wh: 'wheel',
  cs: 'crash',
  lot: 'lottery',
  bal: 'balance',
  cash: 'balance',
  coins: 'balance',
  money: 'balance',
  d: 'daily',
  w: 'work',
  lb: 'leaderboard',
  top: 'leaderboard',
  inv: 'inventory',
  bag: 'inventory',
  pf: 'profile',
  p: 'profile',
  h: 'hunt',
  z: 'zoo',
  b: 'battle',
  cr: 'crate',
  pr: 'pray',
  lvl: 'rank',
  level: 'rank',
  xp: 'rank',
  lvls: 'levels',
  av: 'avatar',
  pfp: 'avatar',
  ui: 'userinfo',
  whois: 'userinfo',
  si: 'serverinfo',
  server: 'serverinfo',
  ri: 'roleinfo',
  bi: 'botinfo',
  '8b': '8ball',
  wx: 'weather',
  def: 'define',
  wp: 'wiki',
  tr: 'translate',
  gh: 'github',
  rm: 'remind',
  rem: 'remind',
  gw: 'giveaway',
  mute: 'timeout',
  clear: 'purge',
  clr: 'purge',
  lk: 'lock',
  ul: 'unlock',
  sm: 'slowmode',
  warns: 'warnings',
  cw: 'clearwarns',
  ub: 'unban',
  play: 'music play',
  search: 'music search',
  pl: 'music play',
  skip: 'music skip',
  stop: 'music stop',
  pause: 'music pause',
  resume: 'music resume',
  queue: 'music queue',
  q: 'music queue',
  np: 'music nowplaying',
  vol: 'music volume',
  loop: 'music loop',
  shuffle: 'music shuffle',
  radio: 'music radio',
  seek: 'music seek',
  prev: 'music previous',
};
const tokenize = s => (String(s).match(/"[^"]*"|\S+/g) || []).map(x => x.replace(/^"(.*)"$/, '$1'));

function resolve(client, name) {
  const a = ALIASES[name] || name;
  const [cn, sub] = a.split(' ');
  const cmd = client.commandList?.find(c => c.data.name === cn);
  return cmd ? { cmd, sub: sub || null } : null;
}

const label = o =>
  o.choices?.length && o.choices.length <= 6 ? o.choices.map(c => c.value).join('|') : o.name;

async function coerce(o, tok, m) {
  const t = tok.toLowerCase();

  switch (o.type) {
    case 3: {
      if (!o.choices) return tok;
      const c =
        o.choices.find(c => String(c.value).toLowerCase() === t || c.name.toLowerCase() === t)
          || o.choices.find(c =>
            String(c.value).toLowerCase().startsWith(t) || c.name.toLowerCase().startsWith(t));
      return c?.value;
    }
    case 4:
    case 10: {
      let n;

      if (t === 'all' && ['bet', 'amount'].includes(o.name))
        n = Math.min(require('./db').user(m.guild.id, m.author.id).coins, 250000);
      else n = o.type === 4 ? parseInt(tok) : parseFloat(tok);

      if (!Number.isFinite(n)
        || o.min_value != null && n < o.min_value
        || o.max_value != null && n > o.max_value) return undefined;
      return n;
    }
    case 5:
      return (
        ['true', 'yes', 'y', 'on', '1', 'enable', 'enabled'].includes(t)
          ? true
          : ['false', 'no', 'n', 'off', '0', 'disable', 'disabled'].includes(t) ? false : undefined
      );
    case 6: {
      if (['me', 'self'].includes(t)) return m.author;
      const id = tok.match(/\d{15,20}/)?.[0];
      return id ? await m.client.users.fetch(id).catch(() => undefined) : undefined;
    }
    case 7: {
      const id = tok.match(/\d{15,20}/)?.[0];
      return id ? m.guild.channels.cache.get(id) : undefined;
    }
    case 8: {
      const id = tok.match(/\d{15,20}/)?.[0];
      return (
        id ? m.guild.roles.cache.get(id) : m.guild.roles.cache.find(r => r.name.toLowerCase() === t)
      );
    }
    case 9: {
      const id = tok.match(/\d{15,20}/)?.[0];
      return (
        id
          ? m.guild.roles.cache.get(id) || await m.client.users.fetch(id).catch(() => undefined)
          : undefined
      );
    }
  }
}

async function parse(j, args, m, forced, pfx) {
  const tokens = [...args];
  let opts = j.options || [];
  let sub = null;
  const subs = opts.filter(o => o.type === 1);

  if (subs.length) {
    const t = (forced || tokens.shift() || '').toLowerCase();
    sub = subs.find(s => s.name === t) || t && subs.find(s => s.name.startsWith(t));
    if (!sub)
      return {
        err: `Usage: \`${pfx}${j.name} <${subs.map(s => s.name).join('|')}> ...\` · see \`${pfx}help ${j.name}\``,
      };
    opts = sub.options || [];
  }

  const usage = () => `Usage: \`${pfx}${j.name}${sub ? ' ' + sub.name : ''}${opts.length ? ' ' : ''}${opts.map(o => o.required ? `<${label(o)}>` : `[${label(o)}]`).join(' ')}\``;
  const vals = {};

  for (let k = 0; k < opts.length; k++) {
    const o = opts[k];
    let tok;

    if (o.type === 3 && !o.choices && opts.slice(k + 1).every(x => !x.required)) {
      // free text: take the rest, but pull off a trailing source name
      const rest = [...tokens];

      tokens.length = 0;

      for (const lo of opts.slice(k + 1)) {
        const c =
          lo.choices
            && rest.length > 1
            && lo.choices.find(c =>
              [String(c.value), c.name].some(x =>
                x.toLowerCase() === rest[rest.length - 1].toLowerCase()));

        if (c) {
          vals[lo.name] = c.value;
          rest.pop();
        }
      }

      tok = rest.join(' ') || undefined;
    } else tok = tokens.shift();

    if (tok === undefined || tok === '') {
      if (o.required) return { err: usage() };
      continue;
    }

    const v = await coerce(o, tok, m);
    if (v === undefined || v === null) return { err: `\`${o.name}\` is not valid. ${usage()}` };
    vals[o.name] = v;
    if (o.type === 6)
      vals[o.name + ':member'] = await m.guild.members.fetch(v.id).catch(() => null);
  }

  return { sub, vals };
}

function adapter(m, j, sub, vals) {
  let rep = null;
  let deferred = false;
  let replied = false;
  const clean = p => {
    const o = typeof p === 'string' ? { content: p } : { ...p };
    delete o.ephemeral;
    delete o.fetchReply;
    o.allowedMentions ??= { repliedUser: false };
    return o;
  };
  const get = n => vals[n] ?? null;

  return {
    client: m.client,
    guild: m.guild,
    guildId: m.guild.id,
    channel: m.channel,
    channelId: m.channel.id,
    user: m.author,
    member: m.member,
    memberPermissions: m.member.permissions,
    commandName: j.name,
    get deferred() {
      return deferred;
    },
    get replied() {
      return replied;
    },
    isChatInputCommand: () => true,
    isButton: () => false,
    isAutocomplete: () => false,
    options: {
      getSubcommand: () => sub?.name ?? null,
      getSubcommandGroup: () => null,
      getString: get,
      getInteger: get,
      getNumber: get,
      getBoolean: get,
      getUser: get,
      getChannel: get,
      getRole: get,
      getMentionable: get,
      getMember: n => vals[n + ':member'] ?? null,
    },
    async reply(p) {
      replied = true;
      rep = await m.reply(clean(p));
      return rep;
    },
    async deferReply() {
      deferred = true;
      m.channel.sendTyping().catch(() => {});
    },
    async editReply(p) {
      replied = true;
      rep = rep ? await rep.edit(clean(p)) : await m.reply(clean(p));
      return rep;
    },
    async followUp(p) {
      return m.channel.send(clean(p));
    },
    async deleteReply() {
      await rep?.delete().catch(() => {});
    },
    async fetchReply() {
      return rep;
    },
  };
}

// these would show the answer (or the sender) in public if run with the prefix
const SLASH_ONLY = new Set(['confess', 'confession']);

async function execute(m, r, args, pfx, lim) {
  const { PermissionsBitField } = require('discord.js');
  const j = r.cmd.data.toJSON();
  const say = t => m.reply({ content: t, allowedMentions: { repliedUser: false } }).catch(() => {});

  if (SLASH_ONLY.has(j.name)) {
    if (j.name === 'confess') m.delete().catch(() => {});
    const note = await m.channel.send(
      `${m.author}, use the slash command /${j.name} for this one so it stays private.`,
    ).catch(() => null);
    if (note) setTimeout(() => note.delete().catch(() => {}), 8000);
    return;
  }

  if ((require('./db').settings(m.guild.id).disabled_cmds || '').split(',').includes(j.name)
    && !m.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
    return say('This command is disabled in this server.');
  if (j.default_member_permissions
    && !m.member.permissions.has(BigInt(j.default_member_permissions)))
    return say(
      `You need the **${new PermissionsBitField(BigInt(j.default_member_permissions)).toArray().join(', ')}** permission.`,
    );
  const p = await parse(j, args, m, r.sub, pfx);
  if (p.err) return say(p.err);
  const wait = lim.gate(m.author.id);
  if (wait) return say(wait);

  try {
    require('./usage').record(r.cmd.data.name);
    await r.cmd.run(adapter(m, j, p.sub, p.vals));
  } catch (e) {
    console.error(`[prefix:${j.name}]`, e.message);
    say('Something went wrong, please try again.');
  } finally {
    lim.release(m.author.id);
  }
}

// true if it's a known command, the command itself runs in the background
function handle(m, name, args, pfx, lim) {
  const r = resolve(m.client, name);
  if (!r) return false;
  execute(m, r, args.map(a => a.replace(/^"(.*)"$/, '$1')), pfx, lim).catch(e =>
    console.error('[prefix]', e.message));
  return true;
}

module.exports = { ALIASES, handle, tokenize, parse, resolve };
