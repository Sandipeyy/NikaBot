// hunt / zoo / battle / crates / lottery and the gambling games
// the functions return { content, embeds, err } so slash and prefix commands can share them
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require(
  'discord.js',
);
const store = require('./db');
const { db } = store;

const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const money = n => Number(n).toLocaleString('en-US');
const MAX_BET = 250000;
const TICKET = 50;

const RAR = [
  {
    id: 'common',
    name: 'Common',
    w: 600,
    value: 5,
    power: 1,
    dot: '⚪',
    color: 0x95a5a6,
    animals: ['🐛', '🐜', '🐞', '🐌', '🐀', '🐇', '🐓', '🐑', '🐖', '🦆'],
  },
  {
    id: 'uncommon',
    name: 'Uncommon',
    w: 250,
    value: 20,
    power: 3,
    dot: '🟢',
    color: 0x2ecc71,
    animals: ['🐶', '🐱', '🐴', '🐄', '🦊', '🐸', '🐢', '🐺'],
  },
  {
    id: 'rare',
    name: 'Rare',
    w: 100,
    value: 80,
    power: 8,
    dot: '🔵',
    color: 0x3498db,
    animals: ['🐯', '🦁', '🐻', '🐼', '🦘', '🦌', '🐘', '🦒'],
  },
  {
    id: 'epic',
    name: 'Epic',
    w: 40,
    value: 300,
    power: 20,
    dot: '🟣',
    color: 0x9b59b6,
    animals: ['🦄', '🦅', '🦈', '🐙', '🦉', '🐊'],
  },
  {
    id: 'mythic',
    name: 'Mythic',
    w: 9,
    value: 1500,
    power: 60,
    dot: '🟠',
    color: 0xe67e22,
    animals: ['🐉', '🦖', '🦕', '🐋'],
  },
  {
    id: 'legendary',
    name: 'Legendary',
    w: 1,
    value: 10000,
    power: 200,
    dot: '🔴',
    color: 0xe74c3c,
    animals: ['🐲', '🦚'],
  },
];

RAR.forEach((r, i) => {
  r.idx = i;
});

const OF = {};
for (const r of RAR) for (const a of r.animals) OF[a] = r;

// helpers
const cd = new Map();

setInterval(() => {
  const n = Date.now();
  for (const [k, t] of cd) if (t < n) cd.delete(k);
}, 300000).unref();

const wait = (cmd, g, u, sec) => {
  const k = cmd + g + u;
  const left = (cd.get(k) || 0) - Date.now();
  if (left > 0)
    return { content: `⏳ Slow down! Try again in **${Math.ceil(left / 1000)}s**.`, err: true };
  cd.set(k, Date.now() + sec * 1000);
  return null;
};
const luck = (g, u) => store.user(g, u).luck || 0;
const setLuck = (g, u, n) => {
  store.user(g, u);
  db.prepare('UPDATE users SET luck=? WHERE guild=? AND user=?').run(
    Math.max(-10, Math.min(50, n)),
    g,
    u,
  );
};
const give = (g, u, a, n = 1) =>
  db.prepare(
    'INSERT INTO zoo VALUES(?,?,?,?) ON CONFLICT(guild,user,animal) DO UPDATE SET qty=qty+?',
  ).run(g, u, a, n, n);
const zooOf = (g, u) =>
  db.prepare('SELECT animal, qty FROM zoo WHERE guild=? AND user=? AND qty>0').all(g, u);
const stat = (g, u, k) => {
  db.prepare('INSERT OR IGNORE INTO game_stats(guild,user) VALUES(?,?)').run(g, u);
  db.prepare(`UPDATE game_stats SET ${k}=${k}+1 WHERE guild=? AND user=?`).run(g, u);
};
const emb = (c = 0x5865f2) => new EmbedBuilder().setColor(c);
const err = content => ({ content, err: true });

function roll(lk) {
  const ws = RAR.map((r, i) => r.w * (i ? Math.max(0.2, 1 + lk * 0.03 * i) : 1));
  let x = Math.random() * ws.reduce((a, b) => a + b);

  for (let i = 0; i < RAR.length; i++) {
    x -= ws[i];
    if (x < 0) return { r: RAR[i], a: pick(RAR[i].animals) };
  }

  return { r: RAR[0], a: RAR[0].animals[0] };
}

function parseBet(g, u, raw) {
  const bal = store.user(g, u.id).coins;
  let b = String(raw ?? '').toLowerCase() === 'all' ? Math.min(bal, MAX_BET) : parseInt(raw);
  if (!(b > 0)) return { e: err('Enter a bet, for example `100` or `all`.') };
  b = Math.min(b, MAX_BET);
  if (b > bal) return { e: err(`You only have **${money(bal)}** coins.`) };
  return { b };
}

// animals
function hunt(g, u) {
  const w = wait('hunt', g, u.id, 15);
  if (w) return w;
  const lk = luck(g, u.id);
  const got = Array.from(
    { length: 1 + (Math.random() < 0.35) + (Math.random() < 0.12) },
    () => roll(lk),
  );
  got.forEach(x => give(g, u.id, x.a));
  stat(g, u.id, 'hunts');
  if (lk) setLuck(g, u.id, lk - Math.sign(lk));
  const best = got.reduce((a, b) => b.r.idx > a.r.idx ? b : a);
  return {
    embeds: [
      emb(best.r.color).setDescription(
        `🌱 **${u.username}** hunted ${got.map(x => `${x.a} *(${x.r.name})*`).join(', ')}!`,
      ).setFooter({ text: lk > 0 ? `Luck: ${lk}` : 'Tip: /pray gives you luck for rarer animals' }),
    ],
  };
}

function zoo(g, u) {
  const rows = zooOf(g, u.id);
  if (!rows.length) return { content: `🌾 **${u.username}** has no animals yet. Use \`/hunt\`!` };
  const m = new Map(rows.map(r => [r.animal, r.qty]));
  let total = 0;
  let val = 0;
  const e = emb().setTitle(`🐾 ${u.username}'s zoo`);

  for (const r of [...RAR].reverse()) {
    const have = r.animals.filter(a => m.has(a));
    if (!have.length) continue;
    e.addFields({
      name: `${r.dot} ${r.name} · ${money(r.value)} each`,
      value: have.map(a => `${a} ×${m.get(a)}`).join('  '),
    });

    for (const a of have) {
      total += m.get(a);
      val += m.get(a) * r.value;
    }
  }

  return { embeds: [e.setFooter({ text: `${money(total)} animals · worth ${money(val)} coins` })] };
}

function sell(g, u, what) {
  if (!['all', ...RAR.map(r => r.id)].includes(what))
    return err('Choose `all`, `common`, `uncommon`, `rare`, `epic`, `mythic` or `legendary`.');
  const tiers = what === 'all' ? ['common', 'uncommon', 'rare'] : [what];
  let n = 0;
  let c = 0;

  for (const r of RAR.filter(x => tiers.includes(x.id)))
    for (const a of r.animals) {
      const row = db.prepare('SELECT qty FROM zoo WHERE guild=? AND user=? AND animal=?').get(
        g,
        u.id,
        a,
      );

      if (row?.qty > 0) {
        n += row.qty;
        c += row.qty * r.value;
        db.prepare('UPDATE zoo SET qty=0 WHERE guild=? AND user=? AND animal=?').run(g, u.id, a);
      }
    }

  if (!n) return err('You have nothing to sell in that category.');
  store.addCoins(g, u.id, c);
  return {
    content: `💰 **${u.username}** sold **${n}** animals for **${money(c)}** coins.${what === 'all' ? ' *(common to rare only)*' : ''}`,
  };
}

const team = (g, id) =>
  zooOf
    (g, id)
    .flatMap(r => Array(Math.min(r.qty, 3)).fill(r.animal))
    .map(a => ({ a, p: OF[a].power }))
    .sort((x, y) => y.p - x.p)
    .slice(0, 3);

function duel(t1, t2) {
  const h1 = t1.map(x => 20 + x.p * 6);
  const h2 = t2.map(x => 20 + x.p * 6);
  const log = [];
  let i = 0;
  let j = 0;

  while (i < t1.length && j < t2.length) {
    while (h1[i] > 0 && h2[j] > 0) {
      h2[j] -= t1[i].p * rnd(8, 12) / 10 + rnd(2, 6);
      if (h2[j] <= 0) break;
      h1[i] -= t2[j].p * rnd(8, 12) / 10 + rnd(2, 6);
    }

    if (h1[i] <= 0) {
      log.push(`${t2[j].a} defeated ${t1[i].a}`);
      i++;
    } else {
      log.push(`${t1[i].a} defeated ${t2[j].a}`);
      j++;
    }
  }

  return { win: j >= t2.length, log };
}

function battle(g, u, opp) {
  const w = wait('battle', g, u.id, 25);
  if (w) return w;
  const mine = team(g, u.id);
  if (!mine.length) return err('🐾 You need animals to battle. Use `/hunt` first!');
  let foe;
  let label;

  if (opp) {
    if (opp.bot || opp.id === u.id) return err('Pick a real opponent.');
    foe = team(g, opp.id);
    if (!foe.length) return err(`${opp.username} has no animals yet.`);
    label = opp.username;
  } else {
    const top = Math.max(...mine.map(x => x.p));
    const pool = RAR.filter(r => r.power <= top * 1.5 + 1);

    foe = mine.map(() => {
      const r = pick(pool.length ? pool : [RAR[0]]);
      return { a: pick(r.animals), p: r.power };
    });

    label = 'Wild animals';
  }

  const res = duel(mine, foe);
  const pw = t => t.reduce((a, b) => a + b.p, 0);
  const reward = res.win ? opp ? 50 : Math.min(400, 30 + pw(foe) * 2) : 0;
  if (reward) store.addCoins(g, u.id, reward);
  stat(g, u.id, res.win ? 'wins' : 'losses');

  return {
    embeds: [
      emb
        (res.win ? 0x23a55a : 0xed4245)
        .setTitle(res.win ? '⚔️ Victory!' : '⚔️ Defeat')
        .addFields(
          {
            name: `${u.username}'s team`,
            value: `${mine.map(x => x.a).join(' ')} · power ${pw(mine)}`,
            inline: true,
          },
          { name: label, value: `${foe.map(x => x.a).join(' ')} · power ${pw(foe)}`, inline: true },
          { name: 'Fight', value: res.log.join('\n').slice(0, 900) },
        )
        .setFooter({ text: reward ? `+${reward} coins` : 'Hunt stronger animals and try again!' }),
    ],
  };
}

function crate(g, u) {
  const w = wait('crate', g, u.id, 10);
  if (w) return w;
  if (store.user(g, u.id).coins < 200) return err('📦 A crate costs **200** coins.');
  store.addCoins(g, u.id, -200);
  const x = Math.random();
  let text;

  if (x < 0.45) {
    const c = rnd(100, 400);
    store.addCoins(g, u.id, c);
    text = `**${c}** coins`;
  } else if (x < 0.8) {
    const out = [];

    for (let i = rnd(1, 3); i > 0; i--) {
      const a = roll(luck(g, u.id) + 10);
      const b = roll(luck(g, u.id) + 10);
      const best = b.r.idx > a.r.idx ? b : a;
      give(g, u.id, best.a);
      out.push(`${best.a} *(${best.r.name})*`);
    }

    text = out.join(', ');
  } else if (x < 0.95) {
    store.addItem(g, u.id, 'padlock', 1);
    text = 'a 🔒 **Padlock**';
  } else {
    const c = rnd(1000, 3000);
    store.addCoins(g, u.id, c);
    text = `💎 **${c}** coins`;
  }

  return { content: `📦 **${u.username}** opened a crate and found ${text}!` };
}

function pray(g, u, target) {
  const w = wait('pray', g, u.id, 300);
  if (w) return w;
  if (store.user(g, u.id).coins < 10) return err('Praying costs **10** coins.');
  store.addCoins(g, u.id, -10);
  const t = target && !target.bot ? target : u;
  const n = rnd(1, 5);
  setLuck(g, t.id, luck(g, t.id) + n);
  return {
    content:
      t.id === u.id
        ? `🙏 **${u.username}** prays and gains **${n}** luck! (Luck: ${luck(g, u.id)})`
        : `🙏 **${u.username}** prayed for **${t.username}** and gave them **${n}** luck!`,
  };
}

function curse(g, u, target) {
  if (!target || target.bot || target.id === u.id) return err('Pick another member to curse.');
  const w = wait('curse', g, u.id, 600);
  if (w) return w;
  if (store.user(g, u.id).coins < 10) return err('Cursing costs **10** coins.');
  store.addCoins(g, u.id, -10);

  if (Math.random() < 0.3) {
    setLuck(g, u.id, luck(g, u.id) - 2);
    return { content: `😈 **${u.username}**'s curse backfired and they lost **2** luck!` };
  }

  const n = rnd(2, 5);
  setLuck(g, target.id, luck(g, target.id) - n);
  return { content: `😈 **${u.username}** cursed **${target.username}** (-${n} luck).` };
}

function profile(g, u) {
  const c = store.user(g, u.id);
  const s =
    db.prepare('SELECT * FROM game_stats WHERE guild=? AND user=?').get(g, u.id)
      || { wins: 0, losses: 0, hunts: 0 };
  const rows = zooOf(g, u.id);
  const n = rows.reduce((a, r) => a + r.qty, 0);
  const val = rows.reduce((a, r) => a + r.qty * OF[r.animal].value, 0);
  const xp = db.prepare('SELECT xp FROM levels WHERE guild=? AND user=?').get(g, u.id)?.xp || 0;
  return {
    embeds: [
      emb().setTitle(`${u.username}'s profile`).addFields(
        { name: '💰 Coins', value: money(c.coins), inline: true },
        { name: '🍀 Luck', value: String(c.luck || 0), inline: true },
        { name: '📈 Level', value: String(store.lv(xp)), inline: true },
        { name: '🐾 Animals', value: `${money(n)} (worth ${money(val)})`, inline: true },
        { name: '🌱 Hunts', value: money(s.hunts), inline: true },
        { name: '⚔️ Battles', value: `${s.wins}W / ${s.losses}L`, inline: true },
      ),
    ],
  };
}

const balance = (g, u) => ({
  content: `💰 **${u.username}** has **${money(store.user(g, u.id).coins)}** coins.`,
});

function daily(g, u) {
  const r = store.user(g, u.id);
  const now = Date.now();
  if (now - r.last_daily < 864e5)
    return err(`⏳ Come back <t:${Math.floor((r.last_daily + 864e5) / 1000)}:R>.`);
  const amt = store.settings(g).daily_amount || 250;
  store.addCoins(g, u.id, amt);
  db.prepare('UPDATE users SET last_daily=? WHERE guild=? AND user=?').run(now, g, u.id);
  return { content: `🎁 **${u.username}** claimed **${amt}** coins!` };
}

// gambling
function slots(g, u, bet) {
  const s = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
  const r = [pick(s), pick(s), pick(s)];
  const mult =
    r[0] === r[1] && r[1] === r[2] ? 5 : r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? 1.5 : 0;
  const d = Math.floor(bet * mult) - bet;
  store.addCoins(g, u.id, d);

  return {
    content: `🎰 ${r.join(' ')}\n**${u.username}** ${d >= 0 ? `won **${money(d + bet)}** coins${mult === 5 ? ' (JACKPOT!)' : ''}` : `lost **${money(bet)}** coins`}.`,
  };
}

function coinflip(g, u, bet, side) {
  const res = pick(['heads', 'tails']);
  const win = res === side;
  store.addCoins(g, u.id, win ? bet : -bet);
  return {
    content: `🪙 It's **${res}**! **${u.username}** ${win ? `won **${money(bet)}**` : `lost **${money(bet)}**`} coins.`,
  };
}

const WHEEL = [[0, 28], [0.5, 26], [1, 20], [1.5, 12], [2, 8], [3, 5], [10, 1]];

function wheel(g, u, bet) {
  let x = Math.random() * 100;
  let m = 0;

  for (const [mm, w] of WHEEL) {
    x -= w;

    if (x < 0) {
      m = mm;
      break;
    }
  }

  const d = Math.floor(bet * m) - bet;
  store.addCoins(g, u.id, d);
  return {
    content: `🎡 The wheel lands on **${m}x**! **${u.username}** ${d > 0 ? `won **${money(d)}**` : d === 0 ? 'broke even' : `lost **${money(-d)}**`} coins.`,
  };
}

function lotteryBuy(g, u, n, channelId) {
  const cost = n * TICKET;
  if (store.user(g, u.id).coins < cost) return err(`${n} ticket(s) cost **${money(cost)}** coins.`);
  store.addCoins(g, u.id, -cost);
  db.prepare('INSERT OR IGNORE INTO lottery(guild,ends,channel) VALUES(?,?,?)').run(
    g,
    Date.now() + 864e5,
    channelId,
  );
  db.prepare('UPDATE lottery SET channel=? WHERE guild=?').run(channelId, g);
  db.prepare(
    'INSERT INTO lottery_tickets VALUES(?,?,?) ON CONFLICT(guild,user) DO UPDATE SET n=n+?',
  ).run(g, u.id, n, n);
  return lotteryInfo(g, u, `🎟️ Bought **${n}** ticket(s) for **${money(cost)}** coins.`);
}

function lotteryInfo(g, u, prefix = '') {
  const l = db.prepare('SELECT * FROM lottery WHERE guild=?').get(g);
  const tot = db.prepare('SELECT COALESCE(SUM(n),0) n FROM lottery_tickets WHERE guild=?').get(g).n;
  const mine =
    db.prepare('SELECT n FROM lottery_tickets WHERE guild=? AND user=?').get(g, u.id)?.n || 0;

  return {
    content: `${prefix ? prefix + '\n' : ''}🎟️ **Lottery** · ticket ${TICKET} coins\nPot: **${money(tot * TICKET)}** coins · ${money(tot)} tickets · yours: **${mine}**\n${l ? `Draw <t:${Math.floor(l.ends / 1000)}:R>` : 'No round yet. Buy a ticket to start one (draws 24h later).'}`,
  };
}

async function tick(client) {
  for (const l of db.prepare('SELECT * FROM lottery WHERE ends<=?').all(Date.now())) {
    const rows = db.prepare('SELECT user,n FROM lottery_tickets WHERE guild=?').all(l.guild);
    db.prepare('DELETE FROM lottery WHERE guild=?').run(l.guild);
    db.prepare('DELETE FROM lottery_tickets WHERE guild=?').run(l.guild);
    const tot = rows.reduce((a, r) => a + r.n, 0);
    if (!tot) continue;
    let x = Math.random() * tot;
    let win = rows[0].user;

    for (const r of rows) {
      x -= r.n;

      if (x < 0) {
        win = r.user;
        break;
      }
    }

    store.addCoins(l.guild, win, tot * TICKET);
    const ch = await client.channels.fetch(l.channel).catch(() => null);
    ch?.send(
      `🎟️ **Lottery!** <@${win}> won **${money(tot * TICKET)}** coins with ${rows.find(r => r.user === win).n} of ${tot} tickets!`,
    ).catch(() => {});
  }
}

async function crash(i) {
  const g = i.guildId;
  const id = i.user.id;
  const bet = i.options.getInteger('bet');
  if (store.user(g, id).coins < bet)
    return i.reply({
      content: `You only have **${money(store.user(g, id).coins)}** coins.`,
      ephemeral: true,
    });
  store.addCoins(g, id, -bet);
  const point = Math.min(100, Math.max(1, 0.96 / (1 - Math.random())));
  let mult = 1;
  let done = false;
  let t;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crash').setLabel('Cash out').setStyle(ButtonStyle.Success),
  );
  const view = (
    m,
    x = '',
  ) => `🚀 **Crash** · bet ${money(bet)}\nMultiplier: **${m.toFixed(2)}x** (payout ${money(Math.floor(bet * m))})${x}`;
  const msg = await i.reply({ content: view(1), components: [row], fetchReply: true });

  return new Promise(resolve => {
    const col = msg.createMessageComponentCollector({
      filter: x => x.user.id === id,
      max: 1,
      time: 120000,
    });

    col.on('collect', async (b) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      const pay = Math.floor(bet * mult);
      store.addCoins(g, id, pay);

      await b.update({
        content: view(mult, `\n✅ Cashed out! **+${money(pay - bet)}** coins`),
        components: [],
      }).catch(() => {});

      resolve();
    });

    const step = async () => {
      if (done) return;
      mult *= 1.12;

      if (mult >= point) {
        done = true;
        col.stop();

        await i.editReply({
          content: `🚀 **Crash** · bet ${money(bet)}\n💥 Crashed at **${point.toFixed(2)}x**. You lost **${money(bet)}** coins.`,
          components: [],
        }).catch(() => {});

        return resolve();
      }

      await i.editReply({ content: view(mult), components: [row] }).catch(() => {});
      t = setTimeout(step, 1400);
    };

    t = setTimeout(step, 1400);
  });
}

// prefix commands
const ALIAS = {
  hunt: 'hunt',
  h: 'hunt',
  zoo: 'zoo',
  z: 'zoo',
  sell: 'sell',
  battle: 'battle',
  b: 'battle',
  crate: 'crate',
  pray: 'pray',
  curse: 'curse',
  profile: 'profile',
  p: 'profile',
  bal: 'balance',
  balance: 'balance',
  cash: 'balance',
  coins: 'balance',
  daily: 'daily',
  slots: 'slots',
  s: 'slots',
  cf: 'coinflip',
  coinflip: 'coinflip',
  wheel: 'wheel',
  lottery: 'lottery',
};
const canon = name => ALIAS[name] || null;

function runPrefix(c, args, m) {
  const g = m.guild.id;
  const u = m.author;
  const t = m.mentions.users.first();
  const bet = () => parseBet(g, u, args[0]);

  switch (c) {
    case 'hunt':
      return hunt(g, u);
    case 'zoo':
      return zoo(g, t || u);
    case 'sell':
      return sell(g, u, (args[0] || 'all').toLowerCase());
    case 'battle':
      return battle(g, u, t);
    case 'crate':
      return crate(g, u);
    case 'pray':
      return pray(g, u, t);
    case 'curse':
      return curse(g, u, t);
    case 'profile':
      return profile(g, t || u);
    case 'balance':
      return balance(g, t || u);
    case 'daily':
      return daily(g, u);
    case 'slots': {
      const b = bet();
      return b.e || slots(g, u, b.b);
    }
    case 'wheel': {
      const b = bet();
      return b.e || wheel(g, u, b.b);
    }
    case 'coinflip': {
      const b = bet();
      return (
        b.e
          || coinflip(
            g,
            u,
            b.b,
            /^t/i.test(args[1] || '')
              ? 'tails'
              : /^h/i.test(args[1] || '') ? 'heads' : pick(['heads', 'tails']),
          )
      );
    }
    case 'lottery': {
      const n = parseInt(args[0]);
      return n > 0 ? lotteryBuy(g, u, Math.min(n, 100), m.channel.id) : lotteryInfo(g, u);
    }
  }

  return null;
}

// slash commands
const send = (i, p) => i.reply({ content: p.content, embeds: p.embeds, ephemeral: !!p.err });
const betOpt = o =>
  o.setName('bet').setDescription('Coins to bet').setMinValue(1).setRequired(true);
const commands = [
  {
    data: new SlashCommandBuilder().setName('hunt').setDescription(
      'Hunt for animals to fill your zoo',
    ),
    run: i => send(i, hunt(i.guildId, i.user)),
  },
  {
    data: new SlashCommandBuilder()
      .setName('zoo')
      .setDescription('See your animal collection')
      .addUserOption(o => o.setName('user').setDescription('Whose zoo')),
    run: i => send(i, zoo(i.guildId, i.options.getUser('user') || i.user)),
  },
  {
    data: new SlashCommandBuilder()
      .setName('sell')
      .setDescription('Sell animals for coins')
      .addStringOption(o =>
        o
          .setName('what')
          .setDescription('Which rarity')
          .setRequired(true)
          .addChoices(
            { name: 'All (common to rare)', value: 'all' },
            ...RAR.map(r => ({ name: r.name, value: r.id })),
          )),
    run: i => send(i, sell(i.guildId, i.user, i.options.getString('what'))),
  },
  {
    data: new SlashCommandBuilder()
      .setName('battle')
      .setDescription('Battle wild animals or another member with your top 3 animals')
      .addUserOption(o =>
        o.setName('opponent').setDescription('Leave empty to fight wild animals')),
    run: i => send(i, battle(i.guildId, i.user, i.options.getUser('opponent'))),
  },
  {
    data: new SlashCommandBuilder().setName('crate').setDescription(
      'Open a crate for 200 coins: coins, animals or items',
    ),
    run: i => send(i, crate(i.guildId, i.user)),
  },
  {
    data: new SlashCommandBuilder()
      .setName('pray')
      .setDescription('Pray for luck (10 coins) to find rarer animals')
      .addUserOption(o => o.setName('user').setDescription('Pray for someone else')),
    run: i => send(i, pray(i.guildId, i.user, i.options.getUser('user'))),
  },
  {
    data: new SlashCommandBuilder()
      .setName('curse')
      .setDescription('Curse someone so they have worse luck (10 coins)')
      .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)),
    run: i => send(i, curse(i.guildId, i.user, i.options.getUser('user'))),
  },
  {
    data: new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Your coins, luck, animals and battle record')
      .addUserOption(o => o.setName('user').setDescription('User')),
    run: i => send(i, profile(i.guildId, i.options.getUser('user') || i.user)),
  },
  {
    data: new SlashCommandBuilder()
      .setName('slots')
      .setDescription('Spin the slot machine')
      .addIntegerOption(betOpt),
    run: i => {
      const b = parseBet(i.guildId, i.user, i.options.getInteger('bet'));
      send(i, b.e || slots(i.guildId, i.user, b.b));
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('coinflip')
      .setDescription('Gamble on a coin flip')
      .addIntegerOption(betOpt)
      .addStringOption(o =>
        o
          .setName('side')
          .setDescription('Heads or tails')
          .setRequired(true)
          .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),
    run: i => {
      const b = parseBet(i.guildId, i.user, i.options.getInteger('bet'));
      send(i, b.e || coinflip(i.guildId, i.user, b.b, i.options.getString('side')));
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('wheel')
      .setDescription('Spin the wheel of fortune (up to 10x)')
      .addIntegerOption(betOpt),
    run: i => {
      const b = parseBet(i.guildId, i.user, i.options.getInteger('bet'));
      send(i, b.e || wheel(i.guildId, i.user, b.b));
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('crash')
      .setDescription('Cash out before the rocket crashes')
      .addIntegerOption(betOpt),
    run: crash,
  },
  {
    data: new SlashCommandBuilder()
      .setName('lottery')
      .setDescription('Server lottery: buy tickets, winner takes the pot')
      .addSubcommand(s =>
        s
          .setName('buy')
          .setDescription('Buy tickets (50 coins each)')
          .addIntegerOption(o =>
            o
              .setName('tickets')
              .setDescription('How many (1-100)')
              .setMinValue(1)
              .setMaxValue(100)
              .setRequired(true)))
      .addSubcommand(s => s.setName('info').setDescription('Show the current pot')),
    run: i =>
      send(
        i,
        i.options.getSubcommand() === 'buy'
          ? lotteryBuy(i.guildId, i.user, i.options.getInteger('tickets'), i.channelId)
          : lotteryInfo(i.guildId, i.user),
      ),
  },
];

module.exports = { commands, canon, runPrefix, tick };
