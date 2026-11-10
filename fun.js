const pick = a => a[Math.floor(Math.random() * a.length)];
const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'Why did the bot cross the road? To get to the other server.',
  "There are 10 kinds of people: those who get binary and those who don't.",
  'I told my computer I needed a break. It said "no problem, I\'ll go to sleep."',
];
const FACTS = [
  'Honey never spoils.',
  'Octopuses have three hearts.',
  'Bananas are berries; strawberries are not.',
  'A day on Venus is longer than its year.',
  'Wombat poop is cube-shaped.',
];
const BALL = [
  'Yes.',
  'No.',
  'Maybe.',
  'Definitely!',
  'Ask again later.',
  'Very doubtful.',
  'Without a doubt.',
  'Signs point to yes.',
  "Don't count on it.",
];

// text replies, e.g. m!joke
function prefixReply(name, args) {
  switch (name) {
    case 'joke':
      return { content: `😂 ${pick(JOKES)}` };
    case 'fact':
      return { content: `💡 ${pick(FACTS)}` };
    case '8ball':
      return {
        content: args.length ? `🎱 ${pick(BALL)}` : 'Ask me a question, e.g. `8ball will it rain?`',
      };
    case 'dice':
      return { content: `🎲 You rolled **${1 + Math.floor(Math.random() * 6)}**` };
    case 'flip':
      return { content: `🪙 ${pick(['Heads', 'Tails'])}!` };
  }

  return null;
}

module.exports = { prefixReply };
