const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits: P,
} = require('discord.js');
const store = require('./db');
const meta = require('./meta');
const pick = a => a[Math.floor(Math.random() * a.length)];
const dec = s =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&eacute;/g, 'é')
    .replace(/&ldquo;|&rdquo;/g, '"');
const workCd = new Map();
const mod = (name, desc, perm) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(desc)
    .setDefaultMemberPermissions(perm)
    .setDMPermission(false)
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true));

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('dice')
      .setDescription('Roll a dice')
      .addIntegerOption(o =>
        o.setName('sides').setDescription('Sides (default 6)').setMinValue(2).setMaxValue(1000)),
    run: i =>
      i.reply(
        `🎲 You rolled **${1 + Math.floor(Math.random() * (i.options.getInteger('sides') || 6))}**`,
      ),
  },
  {
    data: new SlashCommandBuilder().setName('work').setDescription('Work for coins (1h cooldown)'),
    run: i => {
      const k = i.guildId + i.user.id;
      const left = (workCd.get(k) || 0) - Date.now();
      if (left > 0)
        return i.reply({
          content: `⏳ Rest for ${Math.ceil(left / 60000)} more min.`,
          ephemeral: true,
        });
      const n = 50 + Math.floor(Math.random() * 151);
      workCd.set(k, Date.now() + 36e5);
      store.addCoins(i.guildId, i.user.id, n);
      i.reply(
        `💼 You worked as a ${pick(['chef', 'dev', 'pilot', 'streamer', 'miner'])} and earned **${n}** coins.`,
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Send coins to someone')
      .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption(o =>
        o.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true)),
    run: i => {
      const t = i.options.getUser('user');
      const n = i.options.getInteger('amount');
      if (t.bot || t.id === i.user.id)
        return i.reply({ content: 'Invalid recipient.', ephemeral: true });
      if (store.user(i.guildId, i.user.id).coins < n)
        return i.reply({ content: 'Not enough coins.', ephemeral: true });
      store.addCoins(i.guildId, i.user.id, -n);
      store.addCoins(i.guildId, t.id, n);
      i.reply(`💸 Sent **${n}** coins to ${t}.`);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('roulette')
      .setDescription('Bet on red, black or green (x14)')
      .addIntegerOption(o =>
        o.setName('bet').setDescription('Coins').setMinValue(1).setRequired(true))
      .addStringOption(o =>
        o
          .setName('color')
          .setDescription('Color')
          .setRequired(true)
          .addChoices(
            { name: 'Red', value: 'red' },
            { name: 'Black', value: 'black' },
            { name: 'Green', value: 'green' },
          )),
    run: i => {
      const n = i.options.getInteger('bet');
      const c = i.options.getString('color');
      if (store.user(i.guildId, i.user.id).coins < n)
        return i.reply({ content: 'Not enough coins.', ephemeral: true });
      const r = Math.floor(Math.random() * 37);
      const res = r === 0 ? 'green' : r % 2 ? 'red' : 'black';
      const delta = res === c ? n * (c === 'green' ? 13 : 1) : -n;
      store.addCoins(i.guildId, i.user.id, delta);
      i.reply(
        `🎡 Landed on **${r} ${res}**. You ${delta > 0 ? `won ${delta}` : `lost ${n}`} coins.`,
      );
    },
  },
  {
    data: new SlashCommandBuilder().setName('trivia').setDescription(
      'Answer a trivia question (+100 coins)',
    ),
    run: async (i) => {
      await i.deferReply();
      const q = (await (await fetch(
        'https://opentdb.com/api.php?amount=1&type=multiple',
      )).json()).results?.[0];
      if (!q) return i.editReply('Could not fetch a question, try again.');
      const right = dec(q.correct_answer);
      const answers = [q.correct_answer, ...q.incorrect_answers].map(dec).sort(() =>
        Math.random() - .5);
      const row = new ActionRowBuilder().addComponents(
        answers.map((a, n) =>
          new ButtonBuilder()
            .setCustomId('t' + n)
            .setLabel(a.slice(0, 80))
            .setStyle(ButtonStyle.Primary)),
      );
      const m = await i.editReply({ content: `🧠 **${dec(q.question)}**`, components: [row] });

      try {
        const b = await m.awaitMessageComponent({
          filter: x => x.user.id === i.user.id,
          time: 20000,
        });
        const ok = answers[+b.customId.slice(1)] === right;
        if (ok) store.addCoins(i.guildId, i.user.id, 100);
        b.update({
          content: ok ? '✅ Correct! +100 coins' : `❌ Wrong. Answer: **${right}**`,
          components: [],
        });
      } catch {
        i.editReply({ content: `⏰ Time's up! Answer: **${right}**`, components: [] });
      }
    },
  },
];

function helpEmbed(client) {
  const e = new EmbedBuilder()
    .setTitle('📖 Commands')
    .setColor(0x5865f2)
    .setDescription(
      'Every command also works with the prefix, and many have shortcuts: `m!cf 100 h`, `m!bj 500`, `m!hunt`, `m!play song name`. Use `m!help <command>` to see a command\'s shortcuts.',
    )
    .setFooter({ text: 'Details: /help <command> or m!help <command>' });
  for (const [cat, names] of Object.entries(meta))
    e.addFields({ name: cat, value: names.map(n => `\`/${n}\``).join(' ') });
  return e;
}

module.exports.helpEmbed = helpEmbed;
