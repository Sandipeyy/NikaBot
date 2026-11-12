// Self-assign roles with buttons. /reactionroles create posts a message with one button per role.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits: P,
} = require('discord.js');
const { db } = require('./db');

db.exec(
  `
CREATE TABLE IF NOT EXISTS rr_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild TEXT,
  channel TEXT,
  message TEXT,
  title TEXT,
  mode TEXT
);
CREATE TABLE IF NOT EXISTS rr_roles (
  panel INTEGER,
  role TEXT,
  label TEXT,
  PRIMARY KEY (panel, role)
);
`,
);

const MAX_ROLES = 10;

async function handleComponent(i) {
  const [, panelId, roleId] = i.customId.split(':');
  const panel = db.prepare('SELECT * FROM rr_panels WHERE id = ? AND guild = ?').get(
    panelId,
    i.guildId,
  );
  const allowed = db.prepare('SELECT 1 FROM rr_roles WHERE panel = ? AND role = ?').get(
    panelId,
    roleId,
  );
  if (!panel || !allowed)
    return i.reply({ content: 'This role panel is no longer active.', ephemeral: true });

  const role = i.guild.roles.cache.get(roleId);
  const me = i.guild.members.me;
  if (!role) return i.reply({ content: 'That role was deleted.', ephemeral: true });

  if (role.managed
    || role.position >= me.roles.highest.position
    || !me.permissions.has(P.ManageRoles)) {
    return i.reply({
      content: `I can't give out ${role.name}. A moderator needs to move my role above it.`,
      ephemeral: true,
    });
  }

  await i.deferReply({ ephemeral: true });
  const has = i.member.roles.cache.has(roleId);

  try {
    if (has) {
      await i.member.roles.remove(roleId, 'Reaction role');
      return i.editReply(`Removed **${role.name}**.`);
    }

    if (panel.mode === 'unique') {
      const others = db.prepare('SELECT role FROM rr_roles WHERE panel = ? AND role != ?').all(
        panelId,
        roleId,
      );
      const mine = others.map(o => o.role).filter(r => i.member.roles.cache.has(r));
      if (mine.length) await i.member.roles.remove(mine, 'Reaction role (pick one)');
    }

    await i.member.roles.add(roleId, 'Reaction role');
    return i.editReply(`You now have **${role.name}**.`);
  } catch {
    return i.editReply('I could not change your roles. Please tell a moderator.');
  }
}

const list = guild => {
  const panels = db.prepare('SELECT * FROM rr_panels WHERE guild = ? ORDER BY id DESC').all(guild);
  return panels.map(p => ({
    ...p,
    roles: db.prepare('SELECT role, label FROM rr_roles WHERE panel = ?').all(p.id),
  }));
};

async function remove(guild, id) {
  const p = db.prepare('SELECT * FROM rr_panels WHERE id = ? AND guild = ?').get(id, guild.id);
  if (!p) return false;
  await guild.channels.cache.get(p.channel)?.messages.delete(p.message).catch(() => {});
  db.prepare('DELETE FROM rr_roles WHERE panel = ?').run(id);
  db.prepare('DELETE FROM rr_panels WHERE id = ?').run(id);
  return true;
}

const roleOptions = b => {
  for (let n = 1; n <= MAX_ROLES; n++) {
    b.addRoleOption(o =>
      o
        .setName(`role${n}`)
        .setDescription(n === 1 ? 'A role members can pick' : 'Another role')
        .setRequired(n === 1));
  }

  return b;
};

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('reactionroles')
      .setDescription('Let members pick their own roles with buttons')
      .setDefaultMemberPermissions(P.ManageRoles)
      .setDMPermission(false)
      .addSubcommand(s =>
        roleOptions(
          s
            .setName('create')
            .setDescription('Post a role picker in this channel')
            .addStringOption(o =>
              o
                .setName('title')
                .setDescription('Heading of the message')
                .setRequired(true)
                .setMaxLength(100))
            .addStringOption(o =>
              o
                .setName('mode')
                .setDescription('Can members pick several roles, or only one?')
                .addChoices(
                  { name: 'Pick any number (default)', value: 'toggle' },
                  { name: 'Pick only one', value: 'unique' },
                )),
        ))
      .addSubcommand(s => s.setName('list').setDescription('Show the role pickers in this server'))
      .addSubcommand(s =>
        s
          .setName('delete')
          .setDescription('Delete a role picker')
          .addIntegerOption(o =>
            o.setName('id').setDescription('Number from /reactionroles list').setRequired(true))),
    run: async (i) => {
      const sub = i.options.getSubcommand();

      if (sub === 'list') {
        const panels = list(i.guildId);
        if (!panels.length)
          return i.reply({
            content: 'There are no role pickers yet. Use `/reactionroles create`.',
            ephemeral: true,
          });
        const lines = panels.map(p => `**#${p.id}** ${p.title} · ${p.roles.length} roles · <#${p.channel}>`);

        return i.reply({ content: lines.join('\n'), ephemeral: true });
      }

      if (sub === 'delete') {
        const ok = await remove(i.guild, i.options.getInteger('id'));
        return i.reply({
          content: ok ? 'Role picker deleted.' : 'There is no picker with that number.',
          ephemeral: true,
        });
      }

      const me = i.guild.members.me;
      const roles = [];

      for (let n = 1; n <= MAX_ROLES; n++) {
        const r = i.options.getRole(`role${n}`);
        if (r && !roles.some(x => x.id === r.id)) roles.push(r);
      }

      const bad = roles.find(r =>
        r.managed || r.id === i.guildId || r.position >= me.roles.highest.position);
      if (bad)
        return i.reply({
          content: `I can't hand out **${bad.name}**. Move my role above it, and don't use @everyone or bot roles.`,
          ephemeral: true,
        });
      const tooHigh = roles.find(r =>
        r.permissions.has(P.Administrator) && i.user.id !== i.guild.ownerId);
      if (tooHigh)
        return i.reply({
          content: `**${tooHigh.name}** has Administrator, so it can't be a self-assign role.`,
          ephemeral: true,
        });

      const mode = i.options.getString('mode') || 'toggle';
      const title = i.options.getString('title');
      const id = db.prepare('INSERT INTO rr_panels(guild,channel,title,mode) VALUES(?,?,?,?)').run(
        i.guildId,
        i.channelId,
        title,
        mode,
      ).lastInsertRowid;

      const rows = [];

      for (let n = 0; n < roles.length; n += 5) {
        rows.push(
          new ActionRowBuilder().addComponents(
            roles.slice(n, n + 5).map(r =>
              new ButtonBuilder()
                .setCustomId(`rr:${id}:${r.id}`)
                .setLabel(r.name.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)),
          ),
        );
      }

      for (const r of roles)
        db.prepare('INSERT INTO rr_roles(panel,role,label) VALUES(?,?,?)').run(id, r.id, r.name);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(title)
        .setDescription(
          `${mode === 'unique' ? 'Pick one role.' : 'Press a button to get or remove a role.'}\n\n${roles.map(r => `• ${r}`).join('\n')}`,
        );
      const msg = await i.channel.send({ embeds: [embed], components: rows });
      db.prepare('UPDATE rr_panels SET message = ? WHERE id = ?').run(msg.id, id);
      return i.reply({ content: `Role picker #${id} posted.`, ephemeral: true });
    },
  },
];

module.exports = { commands, handleComponent, list, remove };
