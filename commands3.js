const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits: P,
} = require('discord.js');
const store = require('./db');
const duration = require('./duration');
const { db } = store;
const pick = a => a[Math.floor(Math.random() * a.length)];
const btn = (id, label, style = ButtonStyle.Primary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const SHOP = {
  padlock: { name: '🔒 Padlock', price: 500, desc: 'Blocks the next /rob against you' },
  trophy: { name: '🏆 Trophy', price: 5000, desc: 'Flex on everyone' },
  crown: { name: '👑 Crown', price: 25000, desc: 'For true royalty' },
};
const lock = new Map();

// blackjack
const mkDeck = () => {
  const d = [];
  for (let n = 0; n < 4; n++)
    for (const r of ['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K']) d.push(r);
  return d.sort(() => Math.random() - .5);
};
const val = h => {
  let t = 0;
  let a = 0;

  for (const c of h) {
    if (c === 'A') {
      a++;
      t += 11;
    } else t += typeof c === 'string' ? 10 : c;
  }

  while (t > 21 && a-- > 0) t -= 10;
  return t;
};
const wins = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const cmds = [
  {
    // leveling
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('Show your rank card')
      .addUserOption(o => o.setName('user').setDescription('User')),
    run: async (i) => {
      await i.deferReply();
      const u = i.options.getUser('user') || i.user;
      const r =
        db.prepare('SELECT xp FROM levels WHERE guild=? AND user=?').get(i.guildId, u.id)
          || { xp: 0 };
      const L = store.lv(r.xp);
      const cur = 100 * L * L;
      const next = 100 * (L + 1) ** 2;
      const pos = db.prepare('SELECT COUNT(*)+1 n FROM levels WHERE guild=? AND xp>?').get(
        i.guildId,
        r.xp,
      ).n;

      try {
        const buf = await require('./card').renderRank({
          name: i.options.getMember('user')?.displayName || u.username,
          avatarUrl: u.displayAvatarURL({ extension: 'png', size: 256 }),
          level: L,
          rank: pos,
          xp: r.xp - cur,
          need: next - cur,
        });
        await i.editReply({ files: [new AttachmentBuilder(buf, { name: 'rank.png' })] });
      } catch (e) {
        const p = Math.round((r.xp - cur) / (next - cur) * 10);

        await i.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setAuthor({ name: u.username, iconURL: u.displayAvatarURL() })
              .setDescription(
                `**Level ${L}** · Rank #${pos}\n${'█'.repeat(p)}${'░'.repeat(10 - p)} ${r.xp - cur}/${next - cur} XP`,
              ),
          ],
        });
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('blackjack')
      .setDescription('Play blackjack')
      .addIntegerOption(o =>
        o.setName('bet').setDescription('Coins').setMinValue(1).setRequired(true)),
    run: async (i) => {
      const bet = i.options.getInteger('bet');
      if (store.user(i.guildId, i.user.id).coins < bet)
        return i.reply({ content: 'Not enough coins.', ephemeral: true });
      const d = mkDeck();
      const p = [d.pop(), d.pop()];
      const b = [d.pop(), d.pop()];
      const show = hide => `🃏 **Blackjack** (bet ${bet})\n**You** (${val(p)}): ${p.join(' ')}\n**Dealer** (${hide ? '?' : val(b)}): ${hide ? b[0] + ' ?' : b.join(' ')}`;
      const row = () => [
        new ActionRowBuilder().addComponents(
          btn('bj_hit', 'Hit'),
          btn('bj_stand', 'Stand', ButtonStyle.Secondary),
        ),
      ];
      const m = await i.reply({
        content: show(true),
        components: val(p) < 21 ? row() : [],
        fetchReply: true,
      });
      let last = null;

      while (val(p) < 21) {
        let c;

        try {
          c = await m.awaitMessageComponent({ filter: x => x.user.id === i.user.id, time: 30000 });
        } catch {
          store.addCoins(i.guildId, i.user.id, -bet);
          return i.editReply({
            content: `⏰ Timed out, you forfeit **${bet}** coins.`,
            components: [],
          });
        }

        last = c;

        if (c.customId === 'bj_hit') {
          p.push(d.pop());

          if (val(p) < 21) {
            await c.update({ content: show(true), components: row() });
            last = null;
            continue;
          }
        }

        break;
      }

      while (val(p) <= 21 && val(b) < 17) b.push(d.pop());
      const pv = val(p);
      const bv = val(b);
      const bj = pv === 21 && p.length === 2 && !(bv === 21 && b.length === 2);
      const delta =
        pv > 21
          ? -bet
          : bj ? Math.floor(bet * 1.5) : bv > 21 || pv > bv ? bet : pv === bv ? 0 : -bet;
      store.addCoins(i.guildId, i.user.id, delta);

      const out = {
        content: `${show(false)}\n\n${delta > 0 ? `✅ You won **${delta}**!` : delta < 0 ? `❌ You lost **${-delta}**.` : '🤝 Push, bet returned.'}`,
        components: [],
      };

      last ? last.update(out) : i.editReply(out);
    },
  },
  {
    // economy
    data: new SlashCommandBuilder().setName('shop').setDescription('Browse the item shop'),
    run: i =>
      i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('🛒 Shop')
            .setDescription(
              Object
                .values(SHOP)
                .map(x => `**${x.name}** — ${x.price} coins\n${x.desc}`)
                .join('\n\n'),
            ),
        ],
      }),
  },
  {
    data: new SlashCommandBuilder()
      .setName('buy')
      .setDescription('Buy an item')
      .addStringOption(o =>
        o
          .setName('item')
          .setDescription('Item')
          .setRequired(true)
          .addChoices(
            ...Object.entries(SHOP).map(([k, v]) => ({ name: `${v.name} (${v.price})`, value: k })),
          ))
      .addIntegerOption(o =>
        o.setName('amount').setDescription('Quantity').setMinValue(1).setMaxValue(50)),
    run: i => {
      const k = i.options.getString('item');
      const n = i.options.getInteger('amount') || 1;
      const cost = SHOP[k].price * n;
      if (store.user(i.guildId, i.user.id).coins < cost)
        return i.reply({ content: `You need **${cost}** coins.`, ephemeral: true });
      store.addCoins(i.guildId, i.user.id, -cost);
      store.addItem(i.guildId, i.user.id, k, n);
      i.reply(`✅ Bought **${n}× ${SHOP[k].name}** for ${cost} coins.`);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('inventory')
      .setDescription('See your items')
      .addUserOption(o => o.setName('user').setDescription('User')),
    run: i => {
      const u = i.options.getUser('user') || i.user;
      const rows = db.prepare('SELECT * FROM inv WHERE guild=? AND user=? AND qty>0').all(
        i.guildId,
        u.id,
      );

      i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎒 ${u.username}'s inventory`)
            .setDescription(
              rows.map(r => `${SHOP[r.item]?.name || r.item} × ${r.qty}`).join('\n') || 'Empty.',
            ),
        ],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('rob')
      .setDescription('Try to rob someone (5 min cooldown)')
      .addUserOption(o => o.setName('user').setDescription('Victim').setRequired(true)),
    run: i => {
      const t = i.options.getUser('user');
      const g = i.guildId;
      const key = `rob:${g}:${i.user.id}`;
      const left = store.cooldownLeft(key);
      if (left > 0)
        return i.reply({ content: `🚔 Lay low for ${Math.ceil(left / 1000)}s.`, ephemeral: true });
      if (t.bot || t.id === i.user.id)
        return i.reply({ content: 'Invalid target.', ephemeral: true });
      const me = store.user(g, i.user.id);
      const him = store.user(g, t.id);
      if (me.coins < 300)
        return i.reply({ content: 'You need at least 300 coins to try.', ephemeral: true });
      if (him.coins < 200)
        return i.reply({ content: `${t} is too broke to rob.`, ephemeral: true });
      store.setCooldown(key, 3e5);

      if (store.hasItem(g, t.id, 'padlock')) {
        store.useItem(g, t.id, 'padlock');
        store.addCoins(g, i.user.id, -200);
        return i.reply(`🔒 ${t} had a padlock! You got caught and paid **200** coins.`);
      }

      if (Math.random() < 0.45) {
        const n = Math.floor(him.coins * (0.1 + Math.random() * 0.2));
        store.addCoins(g, t.id, -n);
        store.addCoins(g, i.user.id, n);
        i.reply(`🦹 You stole **${n}** coins from ${t}!`);
      } else {
        store.addCoins(g, i.user.id, -150);
        i.reply('🚔 You got caught and paid **150** coins in fines.');
      }
    },
  },
  {
    // games / fun
    data: new SlashCommandBuilder()
      .setName('tictactoe')
      .setDescription('Play Tic-Tac-Toe')
      .addUserOption(o => o.setName('opponent').setDescription('Who to play').setRequired(true)),
    run: async (i) => {
      const opp = i.options.getUser('opponent');
      if (opp.bot || opp.id === i.user.id)
        return i.reply({ content: 'Pick a real opponent.', ephemeral: true });
      const bd = Array(9).fill(null);
      const pl = [i.user, opp];
      let t = 0;
      const rows = over =>
        [0, 1, 2].map(r =>
          new ActionRowBuilder().addComponents(
            [0, 1, 2].map(c => {
              const k = r * 3 + c;
              return btn(
                'ttt' + k,
                bd[k] || '\u200b',
                bd[k] === 'X'
                  ? ButtonStyle.Danger
                  : bd[k] === 'O' ? ButtonStyle.Success : ButtonStyle.Secondary,
              ).setDisabled(!!bd[k] || over);
            }),
          ));
      const m = await i.reply({
        content: `❌ ${pl[0]} vs ⭕ ${pl[1]}\n${pl[0]}'s turn`,
        components: rows(),
        fetchReply: true,
      });
      const col = m.createMessageComponentCollector({ time: 120000 });

      col.on('collect', async (b) => {
        if (b.user.id !== pl[t].id)
          return b.reply({ content: "It's not your turn.", ephemeral: true });
        bd[+b.customId.slice(3)] = t ? 'O' : 'X';
        const w = wins.some(l => l.every(x => bd[x] === bd[l[0]] && bd[x]));

        if (w || bd.every(Boolean)) {
          col.stop('done');
          return b.update({
            content: w ? `🏆 ${pl[t]} wins!` : '🤝 Draw!',
            components: rows(true),
          });
        }

        t ^= 1;

        b.update({ content: `❌ ${pl[0]} vs ⭕ ${pl[1]}\n${pl[t]}'s turn`, components: rows() });
      });

      col.on('end', (_, r) => {
        if (r === 'time')
          i.editReply({ content: '⏰ Game expired.', components: rows(true) }).catch(() => {});
      });
    },
  },
  {
    data: new SlashCommandBuilder().setName('meme').setDescription('Get a fresh meme'),
    run: async (i) => {
      await i.deferReply();

      try {
        const d = await (await fetch('https://meme-api.com/gimme')).json();
        if (d.nsfw) throw 0;
        await i.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(d.title.slice(0, 250))
              .setURL(d.postLink)
              .setImage(d.url)
              .setFooter({ text: `r/${d.subreddit}` })
              .setColor(0xff4500),
          ],
        });
      } catch {
        i.editReply('Could not fetch a meme, try again.');
      }
    },
  },
  {
    // utility / server
    data: new SlashCommandBuilder()
      .setName('remind')
      .setDescription('Set, list or cancel reminders (sent by DM)')
      .addSubcommand(s =>
        s
          .setName('set')
          .setDescription('Remind me later')
          .addStringOption(o =>
            o
              .setName('when')
              .setDescription('In how long: 10m, 2h, 1d or 1h30m (a plain number means minutes)')
              .setRequired(true))
          .addStringOption(o =>
            o.setName('text').setDescription('What to remind you about').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('Show your reminders'))
      .addSubcommand(s =>
        s
          .setName('cancel')
          .setDescription('Cancel a reminder')
          .addIntegerOption(o =>
            o.setName('id').setDescription('Number from /remind list').setRequired(true))),
    run: i => {
      const sub = i.options.getSubcommand();

      if (sub === 'list') {
        const rows = db.prepare('SELECT * FROM reminders WHERE user=? ORDER BY at LIMIT 25').all(
          i.user.id,
        );
        if (!rows.length) return i.reply({ content: 'You have no reminders.', ephemeral: true });
        const lines = rows.map(r => `**#${r.id}** <t:${Math.floor(r.at / 1000)}:R> · ${r.text.slice(0, 80)}`);

        return i.reply({ content: lines.join('\n'), ephemeral: true });
      }

      if (sub === 'cancel') {
        const id = i.options.getInteger('id');
        const res = db.prepare('DELETE FROM reminders WHERE id=? AND user=?').run(id, i.user.id);
        return i.reply({
          content: res.changes ? `Reminder #${id} cancelled.` : 'No reminder with that number.',
          ephemeral: true,
        });
      }

      const ms = duration.parse(i.options.getString('when'));

      if (!ms || ms < 30000 || ms > 30 * 864e5) {
        return i.reply({
          content: 'Use a time between 30 seconds and 30 days, like `10m`, `2h` or `1d`.',
          ephemeral: true,
        });
      }

      const count = db.prepare('SELECT COUNT(*) n FROM reminders WHERE user=?').get(i.user.id).n;
      if (count >= 25)
        return i.reply({
          content: 'You already have 25 reminders. Cancel one first.',
          ephemeral: true,
        });

      const id = db.prepare('INSERT INTO reminders(user,text,at) VALUES(?,?,?)').run(
        i.user.id,
        i.options.getString('text').slice(0, 500),
        Date.now() + ms,
      ).lastInsertRowid;
      i.reply({
        content: `⏰ Reminder #${id} set for <t:${Math.floor((Date.now() + ms) / 1000)}:R>. I'll DM you, so keep your DMs open.`,
        ephemeral: true,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('autorole')
      .setDescription('Roles given to new members and to new bots')
      .setDefaultMemberPermissions(P.ManageRoles)
      .setDMPermission(false)
      .addRoleOption(o =>
        o.setName('role').setDescription('Role for new members (leave empty to disable)'))
      .addRoleOption(o =>
        o.setName('bot_role').setDescription('Role for new bots (leave empty to disable)')),
    run: i => {
      const me = i.guild.members.me.roles.highest.position;
      const role = i.options.getRole('role');
      const botRole = i.options.getRole('bot_role');

      for (const r of [role, botRole]) {
        if (r && (r.managed || r.position >= me)) {
          return i.reply({
            content: `I cannot assign ${r.name} (move my role higher).`,
            ephemeral: true,
          });
        }
      }

      store.setSetting(i.guildId, 'autorole', role?.id || null);
      store.setSetting(i.guildId, 'autorole_bot', botRole?.id || null);
      const lines = [
        role ? `✅ New members will get ${role}.` : '✅ Member autorole disabled.',
        botRole ? `✅ New bots will get ${botRole}.` : '✅ Bot autorole disabled.',
      ];

      i.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
    },
  },
  {
    // moderation
    data: new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Lock this channel')
      .setDefaultMemberPermissions(P.ManageChannels)
      .setDMPermission(false),
    run: async (i) => {
      await i.channel
        .permissionOverwrites
        .edit(i.guild.id, { SendMessages: false })
        .then(() => i.reply('🔒 Channel locked.'))
        .catch(() => i.reply({ content: 'Missing permissions.', ephemeral: true }));
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Unlock this channel')
      .setDefaultMemberPermissions(P.ManageChannels)
      .setDMPermission(false),
    run: async (i) => {
      await i.channel
        .permissionOverwrites
        .edit(i.guild.id, { SendMessages: null })
        .then(() => i.reply('🔓 Channel unlocked.'))
        .catch(() => i.reply({ content: 'Missing permissions.', ephemeral: true }));
    },
  },
];

// buttons for giveaways and tickets, the rest use collectors
async function handleButton(i) {
  if (i.customId === 'gw:enter') {
    const g = db.prepare('SELECT * FROM giveaways WHERE msg=?').get(i.message.id);
    if (!g || g.done) return i.reply({ content: 'This giveaway has ended.', ephemeral: true });
    db.prepare('INSERT OR IGNORE INTO entries VALUES(?,?)').run(g.msg, i.user.id);
    return i.reply({
      content: `🎉 You're in! (${db.prepare('SELECT COUNT(*) n FROM entries WHERE msg=?').get(g.msg).n} entries)`,
      ephemeral: true,
    });
  }
}

// reminders and giveaway endings
async function tick(client) {
  const now = Date.now();

  for (const r of db.prepare('SELECT * FROM reminders WHERE at<=?').all(now)) {
    db.prepare('DELETE FROM reminders WHERE id=?').run(r.id);
    client.users.send(r.user, `⏰ Reminder: ${r.text}`).catch(() => {});
  }

  for (const g of db.prepare('SELECT * FROM giveaways WHERE done=0 AND ends<=?').all(now))
    await require('./upgrades').endGiveaway(client, g);
}

module.exports = cmds;
module.exports.handleButton = handleButton;
module.exports.tick = tick;
