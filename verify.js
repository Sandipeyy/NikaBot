// Verification gate: new members press a button (or answer a quick question) to get a role.
// Lock your other channels to that role to keep raiders and bots out.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits: P,
} = require('discord.js');
const store = require('./db');
const { db } = store;

db.exec(
  `
CREATE TABLE IF NOT EXISTS verify_log (
  guild TEXT,
  user TEXT,
  at INTEGER,
  PRIMARY KEY (guild, user)
);
`,
);

const MODES = { button: 'Button (one click)', question: 'Question (small maths question)' };

// questions waiting for an answer, and wrong answers per member
const pending = new Map();
const tries = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  for (const [k, v] of tries) if (v.reset < now) tries.delete(k);
}, 60000).unref();

function panel(guild) {
  const s = store.settings(guild.id);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Welcome to ${guild.name}`)
    .setDescription(
      s.verify_mode === 'question'
        ? 'Press the button and answer one quick question to prove you are human. You will get access to the rest of the server.'
        : 'Press the button below to verify and get access to the rest of the server.',
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ver:go')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
  );
  return { embeds: [embed], components: [row] };
}

// returns a problem description, or null if the setup can work
function problem(guild) {
  const s = store.settings(guild.id);
  const me = guild.members.me;
  if (!s.verify_role) return 'No verified role is selected.';
  const role = guild.roles.cache.get(s.verify_role);
  if (!role) return 'The verified role no longer exists.';
  if (!me.permissions.has(P.ManageRoles)) return 'I need the Manage Roles permission.';
  if (role.position >= me.roles.highest.position)
    return `My highest role must be above ${role.name}. Drag my role higher in Server Settings > Roles.`;
  return null;
}

async function postPanel(guild) {
  const s = store.settings(guild.id);
  const channel = guild.channels.cache.get(s.verify_channel);
  if (!channel) throw new Error('Choose a verification channel first.');
  return channel.send(panel(guild));
}

async function giveRole(member) {
  const s = store.settings(member.guild.id);
  const problemText = problem(member.guild);
  if (problemText) throw new Error(problemText);

  await member.roles.add(s.verify_role, 'Verified');

  if (s.verify_remove_role && member.roles.cache.has(s.verify_remove_role)) {
    await member.roles.remove(s.verify_remove_role, 'Verified').catch(() => {});
  }

  db.prepare('INSERT OR REPLACE INTO verify_log(guild,user,at) VALUES(?,?,?)').run(
    member.guild.id,
    member.id,
    Date.now(),
  );

  const logs = require('./logs');
  logs.sendLog(
    member.guild,
    'members',
    new EmbedBuilder()
      .setColor(0x23a55a)
      .setTitle('Member verified')
      .setDescription(`${member} (${member.user.tag})`),
  );
}

async function handleComponent(i) {
  const s = store.settings(i.guildId);

  if (i.customId === 'ver:go') {
    if (!s.verify_role)
      return i.reply({ content: 'Verification is not set up in this server.', ephemeral: true });

    if (i.member.roles.cache.has(s.verify_role)) {
      return i.reply({ content: 'You are already verified.', ephemeral: true });
    }

    if (s.verify_mode === 'question') {
      const a = 2 + Math.floor(Math.random() * 11);
      const b = 2 + Math.floor(Math.random() * 11);
      pending.set(
        `${i.guildId}:${i.user.id}`,
        { answer: String(a + b), expires: Date.now() + 5 * 60000 },
      );

      const modal = new ModalBuilder().setCustomId('ver:answer').setTitle('Quick check');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('answer')
            .setLabel(`What is ${a} + ${b}?`)
            .setStyle(TextInputStyle.Short)
            .setMaxLength(3)
            .setRequired(true),
        ),
      );
      return i.showModal(modal);
    }

    await i.deferReply({ ephemeral: true });

    try {
      await giveRole(i.member);
      return i.editReply('You are verified. Welcome!');
    } catch (e) {
      console.error('[verify]', e.message);
      return i.editReply('I could not give you the role. Please tell a moderator.');
    }
  }

  if (i.customId === 'ver:answer' && i.isModalSubmit()) {
    const key = `${i.guildId}:${i.user.id}`;
    const q = pending.get(key);
    if (!q)
      return i.reply({ content: 'That question expired. Press Verify again.', ephemeral: true });

    const t = tries.get(key) || { n: 0, reset: Date.now() + 10 * 60000 };
    if (t.n >= 3)
      return i.reply({
        content: 'Too many wrong answers. Try again in a few minutes.',
        ephemeral: true,
      });

    if (i.fields.getTextInputValue('answer').trim() !== q.answer) {
      t.n++;
      tries.set(key, t);
      pending.delete(key);
      return i.reply({
        content: 'That was not right. Press Verify to get a new question.',
        ephemeral: true,
      });
    }

    pending.delete(key);
    tries.delete(key);
    await i.deferReply({ ephemeral: true });

    try {
      await giveRole(i.member);
      return i.editReply('Correct. You are verified, welcome!');
    } catch (e) {
      console.error('[verify]', e.message);
      return i.editReply('I could not give you the role. Please tell a moderator.');
    }
  }
}

const verifiedCount = guildId =>
  db.prepare('SELECT COUNT(*) n FROM verify_log WHERE guild = ?').get(guildId).n;

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Make new members verify before they can see your server')
      .setDefaultMemberPermissions(P.ManageGuild)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('setup')
          .setDescription('Set the role to give and post the verification button')
          .addRoleOption(o =>
            o.setName('role').setDescription('Role given after verifying').setRequired(true))
          .addChannelOption(o =>
            o
              .setName('channel')
              .setDescription('Where to post the button (default: this channel)')
              .addChannelTypes(ChannelType.GuildText))
          .addStringOption(o =>
            o
              .setName('mode')
              .setDescription('How members prove themselves (default: button)')
              .addChoices(...Object.entries(MODES).map(([value, name]) => ({ name, value }))))
          .addRoleOption(o =>
            o.setName('remove_role').setDescription(
              'Role to take away when they verify, e.g. Unverified',
            )))
      .addSubcommand(s => s.setName('panel').setDescription('Post the verification button again'))
      .addSubcommand(s => s.setName('status').setDescription('Show the verification settings'))
      .addSubcommand(s => s.setName('off').setDescription('Turn verification off')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;

      if (sub === 'off') {
        store.setSetting(g, 'verify_role', null);
        store.setSetting(g, 'verify_channel', null);
        return i.reply({
          content: 'Verification turned off. Old buttons will say it is not set up.',
          ephemeral: true,
        });
      }

      if (sub === 'status') {
        const s = store.settings(g);
        const issue = s.verify_role ? problem(i.guild) : null;
        return i.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(issue ? 0xe67e22 : 0x5865f2)
              .setTitle('Verification')
              .addFields(
                {
                  name: 'Role',
                  value: s.verify_role ? `<@&${s.verify_role}>` : 'Not set',
                  inline: true,
                },
                {
                  name: 'Channel',
                  value: s.verify_channel ? `<#${s.verify_channel}>` : 'Not set',
                  inline: true,
                },
                { name: 'Mode', value: MODES[s.verify_mode || 'button'], inline: true },
                { name: 'Verified so far', value: String(verifiedCount(g)), inline: true },
                { name: 'Problems', value: issue || 'None' },
              ),
          ],
          ephemeral: true,
        });
      }

      if (sub === 'panel') {
        try {
          await postPanel(i.guild);
          return i.reply({ content: 'Posted the verification button.', ephemeral: true });
        } catch (e) {
          return i.reply({ content: e.message, ephemeral: true });
        }
      }

      // setup
      const role = i.options.getRole('role');
      const channel = i.options.getChannel('channel') || i.channel;
      store.setSetting(g, 'verify_role', role.id);
      store.setSetting(g, 'verify_channel', channel.id);
      store.setSetting(g, 'verify_mode', i.options.getString('mode') || 'button');
      const removeRole = i.options.getRole('remove_role');
      store.setSetting(g, 'verify_remove_role', removeRole ? removeRole.id : null);

      const issue = problem(i.guild);
      if (issue)
        return i.reply({ content: `Saved, but it will not work yet: ${issue}`, ephemeral: true });

      try {
        await postPanel(i.guild);
      } catch {
        return i.reply({
          content: `Saved, but I can't post in ${channel}. Give me Send Messages and Embed Links there.`,
          ephemeral: true,
        });
      }

      return i.reply({
        content: `Verification is on. Members who press the button in ${channel} get ${role}.\nNow hide your other channels from @everyone and show them to ${role}, otherwise verification does nothing.`,
        ephemeral: true,
      });
    },
  },
];

module.exports = { commands, handleComponent, postPanel, problem, verifiedCount, MODES };
