const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const meta = require('./meta');
const TYPES = {
  3: 'text',
  4: 'whole number',
  5: 'true/false',
  6: 'user',
  7: 'channel',
  8: 'role',
  9: 'user or role',
  10: 'number',
  11: 'file',
};
const PREFIX_CMDS = [
  'help',
  'ping',
  'joke',
  'fact',
  '8ball',
  'dice',
  'hunt',
  'zoo',
  'sell',
  'battle',
  'crate',
  'pray',
  'curse',
  'profile',
  'balance',
  'daily',
  'slots',
  'coinflip',
  'wheel',
  'lottery',
];
const arg = o => o.required ? `<${o.name}>` : `[${o.name}]`;
const lines = opts =>
  opts.map(o => `• \`${o.name}\` (${TYPES[o.type] || 'value'}, ${o.required ? 'required' : 'optional'}) — ${o.description}${o.choices ? `\n   ↳ choices: ${o.choices.map(c => c.name).join(', ')}` : ''}${o.min_value != null || o.max_value != null ? ` [${o.min_value ?? ''}–${o.max_value ?? ''}]` : ''}`).join(
    '\n',
  );

// usage embed for a command, built from its own options
function usageEmbed(client, query, prefix = 'm!') {
  let name = String(query).trim().toLowerCase().replace(/^\//, '');
  if (name.startsWith(prefix.toLowerCase())) name = name.slice(prefix.length);
  const cmd = client.commandList.find(c => c.data.name === name);

  if (!cmd) {
    const near = client.commandList
      .map(c => c.data.name)
      .filter(n => n.includes(name) || name.includes(n))
      .slice(0, 5);

    return new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('Unknown command')
      .setDescription(
        `I couldn't find \`${name}\`.${near.length ? `\nDid you mean: ${near.map(n => `\`/${n}\``).join(', ')}?` : ''}\nUse \`/help\` to see every command.`,
      );
  }

  const j = cmd.data.toJSON();
  const subs = (j.options || []).filter(o => o.type === 1 || o.type === 2);
  const usage =
    subs.length
      ? subs.map(s => `/${j.name} ${s.name} ${(s.options || []).map(arg).join(' ')}`.trim())
      : [`/${j.name} ${(j.options || []).map(arg).join(' ')}`.trim()];
  const cat = Object.entries(meta).find(([, n]) => n.includes(j.name))?.[0];
  const e = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📘 /${j.name}`)
    .setDescription(j.description)
    .addFields({ name: 'Usage', value: '```\n' + usage.join('\n').slice(0, 900) + '\n```' });

  if (subs.length)
    e.addFields({
      name: 'Subcommands',
      value: subs
        .map(s => `• \`${s.name}\` — ${s.description}${(s.options || []).length ? '\n' + lines(s.options).split('\n').map(l => '   ' + l).join('\n') : ''}`)
        .join('\n')
        .slice(0, 1000),
    });
  else if (j.options?.length)
    e.addFields({ name: 'Options', value: lines(j.options).slice(0, 1000) });

  if (j.default_member_permissions)
    e.addFields({
      name: 'Required permission',
      value:
        new PermissionsBitField(BigInt(j.default_member_permissions)).toArray().join(', ') || '—',
      inline: true,
    });
  if (cat) e.addFields({ name: 'Category', value: cat, inline: true });
  const al = Object
    .entries(require('./prefixrun').ALIASES)
    .filter(([, v]) => v.split(' ')[0] === j.name)
    .map(([k, v]) => `\`${prefix}${k}\`${v.includes(' ') ? ' (' + v.split(' ')[1] + ')' : ''}`);

  e.addFields({
    name: 'Prefix version',
    value: `\`${prefix}${j.name}\`${al.length ? '\nShortcuts: ' + al.join('  ') : ''}`.slice(
      0,
      1000,
    ),
  });

  return e.setFooter({ text: '<required>   [optional]' });
}

module.exports = { usageEmbed };
