// /bank: coins in the bank can't be robbed and earn 1% interest a day (on up to 100,000 coins).
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('./db');
const { db } = store;

const RATE = 0.01;
const INTEREST_CAP = 100000;
const MAX_DAYS = 14; // interest stops building up after two weeks away

// pays out whole days of interest that have built up since the last visit
function accrue(guild, user) {
  const u = store.user(guild, user);

  if (!u.bank) {
    db.prepare('UPDATE users SET bank_at = ? WHERE guild = ? AND user = ?').run(
      Date.now(),
      guild,
      user,
    );
    return { ...u, bank_at: Date.now(), gained: 0 };
  }

  const days = Math.min(MAX_DAYS, Math.floor((Date.now() - (u.bank_at || Date.now())) / 864e5));
  if (days < 1) return { ...u, gained: 0 };

  let bank = u.bank;
  for (let d = 0; d < days; d++) bank += Math.floor(Math.min(bank, INTEREST_CAP) * RATE);
  db.prepare('UPDATE users SET bank = ?, bank_at = ? WHERE guild = ? AND user = ?').run(
    bank,
    Date.now(),
    guild,
    user,
  );
  return { ...u, bank, bank_at: Date.now(), gained: bank - u.bank };
}

function amountOf(text, max) {
  const t = String(text || '').trim().toLowerCase();
  if (t === 'all') return max;
  const n = Number(t.replace(/,/g, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('bank')
      .setDescription('Keep coins safe from robbers and earn interest')
      .setDMPermission(false)
      .addSubcommand(s => s.setName('balance').setDescription('Show your wallet and bank'))
      .addSubcommand(s =>
        s
          .setName('deposit')
          .setDescription('Move coins into the bank')
          .addStringOption(o =>
            o.setName('amount').setDescription('A number, or "all"').setRequired(true)))
      .addSubcommand(s =>
        s
          .setName('withdraw')
          .setDescription('Take coins out of the bank')
          .addStringOption(o =>
            o.setName('amount').setDescription('A number, or "all"').setRequired(true))),
    run: i => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;
      let u = accrue(g, i.user.id);
      let note = '';

      if (sub !== 'balance') {
        const max = sub === 'deposit' ? u.coins : u.bank;
        const n = amountOf(i.options.getString('amount'), max);
        if (!n)
          return i.reply({ content: 'Give a whole number of coins, or `all`.', ephemeral: true });
        if (n > max)
          return i.reply({
            content:
              sub === 'deposit'
                ? `You only have **${u.coins}** coins on you.`
                : `You only have **${u.bank}** coins in the bank.`,
            ephemeral: true,
          });

        const sign = sub === 'deposit' ? 1 : -1;
        db.prepare(
          'UPDATE users SET coins = coins - ?, bank = bank + ?, bank_at = ? WHERE guild = ? AND user = ?',
        ).run(n * sign, n * sign, Date.now(), g, i.user.id);
        u = store.user(g, i.user.id);
        note = `${sub === 'deposit' ? 'Deposited' : 'Withdrew'} **${n.toLocaleString()}** coins.`;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${i.user.username}'s bank`)
        .setDescription(note || null)
        .addFields(
          { name: 'Wallet', value: `${u.coins.toLocaleString()} 🪙`, inline: true },
          { name: 'Bank', value: `${u.bank.toLocaleString()} 🪙`, inline: true },
          { name: 'Total', value: `${(u.coins + u.bank).toLocaleString()} 🪙`, inline: true },
        )
        .setFooter({
          text: `Bank coins are safe from /rob and earn ${RATE * 100}% a day (up to ${INTEREST_CAP.toLocaleString()} coins).`,
        });
      if (u.gained)
        embed.addFields({ name: 'Interest paid', value: `+${u.gained.toLocaleString()} 🪙` });
      return i.reply({ embeds: [embed] });
    },
  },
];

module.exports = { commands, accrue };
