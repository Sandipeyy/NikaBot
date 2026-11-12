// Raid mode: while it is on, new accounts that join are removed straight away.
// It can be switched on by hand or by itself when many people join within seconds.
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const store = require('./db');

const ACTIONS = { kick: 'Kick', ban: 'Ban', timeout: 'Timeout for 24 hours' };
const AUTO_MINUTES = 15;

const joins = new Map(); // guild -> recent join times
const removed = new Map(); // guild -> accounts removed since the last summary

const active = s => !!s.raid_on || (s.raid_until || 0) > Date.now();

function modlog(guild, payload) {
  const s = store.settings(guild.id);
  const ch = s.modlog_channel && guild.channels.cache.get(s.modlog_channel);
  ch?.send({ ...payload, allowedMentions: { parse: [] } }).catch(() => {});
}

async function onJoin(member) {
  if (member.user.bot) return;
  const guild = member.guild;
  let s = store.settings(guild.id);

  // automatic trigger: lots of joins in a few seconds
  if (s.raid_auto && !active(s)) {
    const now = Date.now();
    const list = (joins.get(guild.id) || []).filter(t => now - t < 15000);
    list.push(now);
    joins.set(guild.id, list);

    if (list.length >= (s.raid_threshold || 8)) {
      store.setSetting(guild.id, 'raid_until', now + AUTO_MINUTES * 60000);
      joins.delete(guild.id);
      modlog(
        guild,
        {
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle('Raid mode switched on automatically')
              .setDescription(
                `${list.length} accounts joined within 15 seconds. New accounts will be removed for the next ${AUTO_MINUTES} minutes. Use \`/raidmode off\` to stop it earlier.`,
              ),
          ],
        },
      );
      s = store.settings(guild.id);
    }
  }

  if (!active(s)) return;
  const ageDays = (Date.now() - member.user.createdTimestamp) / 864e5;
  if (s.raid_min_age > 0 && ageDays >= s.raid_min_age) return;

  const action = s.raid_action || 'kick';
  const reason = 'Raid mode is on';

  try {
    await member.send(
      `**${guild.name}** is temporarily closed to new accounts. Please try again later.`,
    ).catch(() => {});

    if (action === 'ban') await member.ban({ reason });
    else if (action === 'timeout') await member.timeout(864e5, reason);
    else await member.kick(reason);
  } catch {
    return;
  }

  try {
    require('./upgrades').newCase(
      guild.id,
      action === 'timeout' ? 'timeout' : action,
      member.id,
      guild.client.user.id,
      reason,
    );
  } catch {}

  // one summary instead of a message per account
  const n = (removed.get(guild.id) || 0) + 1;

  removed.set(guild.id, n);

  if (n === 1) {
    setTimeout(() => {
      const total = removed.get(guild.id) || 0;
      removed.delete(guild.id);
      modlog(
        guild,
        {
          content: `🛡️ Raid mode removed **${total}** new account${total === 1 ? '' : 's'} (${action}).`,
        },
      );
    }, 8000).unref();
  }
}

function listen(client) {
  client.on('guildMemberAdd', m => onJoin(m).catch(e => console.error('[raidmode]', e.message)));
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('raidmode')
      .setDescription('Remove new accounts automatically during a raid')
      .setDefaultMemberPermissions(P.ManageGuild)
      .setDMPermission(false)
      .addSubcommand(s => s.setName('on').setDescription('Turn raid mode on'))
      .addSubcommand(s => s.setName('off').setDescription('Turn raid mode off'))
      .addSubcommand(s => s.setName('status').setDescription('Show the raid mode settings'))
      .addSubcommand(s =>
        s
          .setName('config')
          .setDescription('Change what raid mode does')
          .addStringOption(o =>
            o
              .setName('action')
              .setDescription('What happens to new accounts')
              .addChoices(...Object.entries(ACTIONS).map(([value, name]) => ({ name, value }))))
          .addIntegerOption(o =>
            o
              .setName('min_age')
              .setDescription('Only affect accounts younger than this many days (0 = everyone)')
              .setMinValue(0)
              .setMaxValue(365))
          .addBooleanOption(o =>
            o.setName('auto').setDescription('Switch on by itself when many people join at once'))
          .addIntegerOption(o =>
            o
              .setName('threshold')
              .setDescription('How many joins in 15 seconds trigger it (default 8)')
              .setMinValue(3)
              .setMaxValue(50))),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;

      if (sub === 'on' || sub === 'off') {
        store.setSetting(g, 'raid_on', sub === 'on' ? 1 : 0);
        if (sub === 'off') store.setSetting(g, 'raid_until', 0);
        const me = i.guild.members.me;
        const note =
          sub === 'on' && !me.permissions.has([P.KickMembers, P.BanMembers, P.ModerateMembers])
            ? '\nI need Kick Members, Ban Members and Moderate Members for this to work.'
            : '';

        return i.reply({ content: `Raid mode is now **${sub}**.${note}`, ephemeral: true });
      }

      if (sub === 'config') {
        const action = i.options.getString('action');
        const minAge = i.options.getInteger('min_age');
        const auto = i.options.getBoolean('auto');
        const threshold = i.options.getInteger('threshold');
        if (action) store.setSetting(g, 'raid_action', action);
        if (minAge !== null) store.setSetting(g, 'raid_min_age', minAge);
        if (auto !== null) store.setSetting(g, 'raid_auto', auto ? 1 : 0);
        if (threshold) store.setSetting(g, 'raid_threshold', threshold);
      }

      const s = store.settings(g);
      const until =
        s.raid_until > Date.now()
          ? ` (automatic, until <t:${Math.floor(s.raid_until / 1000)}:t>)`
          : '';
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(active(s) ? 0xed4245 : 0x5865f2)
            .setTitle('Raid mode')
            .addFields(
              { name: 'Right now', value: active(s) ? `On${until}` : 'Off', inline: true },
              { name: 'Action', value: ACTIONS[s.raid_action || 'kick'], inline: true },
              {
                name: 'Affects',
                value:
                  s.raid_min_age > 0
                    ? `Accounts younger than ${s.raid_min_age} days`
                    : 'Every new member',
                inline: true,
              },
              {
                name: 'Automatic',
                value: s.raid_auto ? `On, ${s.raid_threshold || 8} joins in 15 seconds` : 'Off',
                inline: true,
              },
            ),
        ],
        ephemeral: true,
      });
    },
  },
];

module.exports = { commands, listen, active, ACTIONS };
