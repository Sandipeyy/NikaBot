const { SlashCommandBuilder } = require('discord.js');
const store = require('./db');
const { db } = store;
const pick = a => a[Math.floor(Math.random() * a.length)];
const bet = o => o.setName('bet').setDescription('Coins to bet').setMinValue(1).setRequired(true);

// error text if the bet is no good
const checkBet = (i, n) =>
  store.user(i.guildId, i.user.id).coins < n ? "You don't have enough coins." : null;

module.exports = [
  {
    data: new SlashCommandBuilder().setName('balance').setDescription('See your coins'),
    run: i => i.reply(`💰 You have **${store.user(i.guildId, i.user.id).coins}** coins.`),
  },
  {
    data: new SlashCommandBuilder()
      .setName('rps')
      .setDescription('Rock paper scissors')
      .addStringOption(o =>
        o
          .setName('move')
          .setDescription('Your move')
          .setRequired(true)
          .addChoices(
            { name: 'Rock', value: 'rock' },
            { name: 'Paper', value: 'paper' },
            { name: 'Scissors', value: 'scissors' },
          )),
    run: i => {
      const me = i.options.getString('move');
      const bot = pick(['rock', 'paper', 'scissors']);
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      i.reply(
        `I chose **${bot}**. ${me === bot ? "It's a tie!" : beats[me] === bot ? 'You win! 🎉' : 'I win! 😎'}`,
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('8ball')
      .setDescription('Ask the magic 8-ball')
      .addStringOption(o =>
        o.setName('question').setDescription('Your question').setRequired(true)),
    run: i =>
      i.reply(
        `🎱 ${pick(['Yes.', 'No.', 'Maybe.', 'Definitely!', 'Ask again later.', 'Very doubtful.', 'Without a doubt.'])}`,
      ),
  },
  {
    data: new SlashCommandBuilder()
      .setName('chat')
      .setDescription('Chat with the AI')
      .addStringOption(o => o.setName('message').setDescription('Your message').setRequired(true)),
    run: async i => {
      // works with any OpenAI-style chat endpoint, set AI_API_KEY (and optionally AI_API_URL / AI_MODEL)
      const key = process.env.AI_API_KEY;
      if (!key) return i.reply({ content: 'Chat is not configured.', ephemeral: true });
      await i.deferReply();

      try {
        const res = await fetch(process.env.AI_API_URL || 'https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: process.env.AI_MODEL || 'mistral-small-latest',
            max_tokens: 400,
            messages: [
              { role: 'system', content: 'You are a friendly Discord bot. Keep replies under 1800 characters.' },
              { role: 'user', content: i.options.getString('message') },
            ],
          }),
        });
        const data = await res.json();
        await i.editReply((data.choices?.[0]?.message?.content || 'No response.').slice(0, 1900));
      } catch {
        await i.editReply('Something went wrong.');
      }
    },
  },
];
