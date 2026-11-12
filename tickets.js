// Support tickets: private channels opened with a button, with a staff role, claiming,
// a close reason and a text transcript sent to a log channel.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits: P,
} = require('discord.js');
const store = require('./db');
const { db } = store;

db.exec(
  `
CREATE TABLE IF NOT EXISTS tickets (
  guild TEXT,
  num INTEGER,
  channel TEXT,
  opener TEXT,
  claimed TEXT,
  status TEXT,
  topic TEXT,
  reason TEXT,
  opened INTEGER,
  closed INTEGER,
  PRIMARY KEY (guild, num)
);
CREATE INDEX IF NOT EXISTS idx_ticket_channel ON tickets(channel);
`,
);

const TOPICS = ['Support', 'Report a member', 'Question', 'Other'];

const byChannel = id => db.prepare('SELECT * FROM tickets WHERE channel = ?').get(id);
const openCount = (guild, user) =>
  db.prepare(
    "SELECT COUNT(*) n FROM tickets WHERE guild = ? AND opener = ? AND status = 'open'",
  ).get(guild, user).n;

function isStaff(member, s) {
  if (!member) return false;
  if (member.permissions.has(P.ManageChannels) || member.permissions.has(P.ManageGuild))
    return true;
  return !!s.ticket_staff_role && member.roles.cache.has(s.ticket_staff_role);
}

function panel(guild) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tk:open')
      .setLabel('Open a ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📩'),
  );
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Support')
    .setDescription(
      'Need help? Press the button to open a private ticket. Only you and the staff can see it.',
    )
    .setFooter({ text: guild.name });
  return { embeds: [embed], components: [row] };
}

function ticketButtons(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tk:claim')
      .setLabel(claimed ? 'Claimed' : 'Claim')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!!claimed),
    new ButtonBuilder().setCustomId('tk:close').setLabel('Close').setStyle(ButtonStyle.Danger),
  );
}

async function openTicket(i, topic) {
  const s = store.settings(i.guildId);

  if (openCount(i.guildId, i.user.id) >= 1) {
    const mine = db.prepare(
      "SELECT channel FROM tickets WHERE guild = ? AND opener = ? AND status = 'open'",
    ).get(i.guildId, i.user.id);
    return i.reply({ content: `You already have a ticket: <#${mine.channel}>`, ephemeral: true });
  }

  await i.deferReply({ ephemeral: true });

  const num = db.prepare('SELECT COALESCE(MAX(num), 0) + 1 n FROM tickets WHERE guild = ?').get(
    i.guildId,
  ).n;
  const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles];
  const overwrites = [
    { id: i.guild.id, deny: [P.ViewChannel] },
    { id: i.user.id, allow },
    { id: i.client.user.id, allow: [...allow, P.ManageChannels, P.EmbedLinks] },
  ];

  if (s.ticket_staff_role && i.guild.roles.cache.has(s.ticket_staff_role)) {
    overwrites.push({ id: s.ticket_staff_role, allow });
  }

  const parent = s.ticket_category && i.guild.channels.cache.get(s.ticket_category);
  const channel = await i.guild.channels.create({
    name: `ticket-${String(num).padStart(4, '0')}`,
    type: ChannelType.GuildText,
    topic: `ticket:${i.user.id}`,
    parent: parent ? parent.id : i.channel?.parentId || undefined,
    permissionOverwrites: overwrites,
    reason: `Ticket #${num} opened by ${i.user.tag}`,
  }).catch(() => null);
  if (!channel)
    return i.editReply(
      'I could not create the ticket channel. I need the Manage Channels permission.',
    );

  db.prepare(
    "INSERT INTO tickets(guild,num,channel,opener,status,topic,opened) VALUES(?,?,?,?,'open',?,?)",
  ).run(i.guildId, num, channel.id, i.user.id, topic, Date.now());

  const staffPing = s.ticket_staff_role ? `<@&${s.ticket_staff_role}>` : '';

  await channel.send({
    content: `${i.user} ${staffPing}`.trim(),
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Ticket #${num}: ${topic}`)
        .setDescription(
          'Tell us what you need and a staff member will reply here.\nPress **Close** when you are done.',
        ),
    ],
    components: [ticketButtons(null)],
    allowedMentions: {
      users: [i.user.id],
      roles: s.ticket_staff_role ? [s.ticket_staff_role] : [],
    },
  });

  return i.editReply(`Your ticket is ready: ${channel}`);
}

// plain text copy of the channel, oldest first
async function transcript(channel) {
  const all = [];
  let before;

  while (all.length < 1000) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
  }

  all.reverse();

  return all.map(m => {
    const files =
      m.attachments.size
        ? ` [files: ${[...m.attachments.values()].map(a => a.url).join(' ')}]`
        : '';
    return `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}${files}`;
  }).join('\n');
}

async function closeTicket(channel, closer, reason) {
  const t = byChannel(channel.id);
  if (!t || t.status !== 'open') return false;
  const s = store.settings(channel.guild.id);

  db.prepare("UPDATE tickets SET status = 'closed', reason = ?, closed = ? WHERE channel = ?").run(
    String(reason || '').slice(0, 300) || null,
    Date.now(),
    channel.id,
  );

  const text = await transcript(channel);
  const file = new AttachmentBuilder(
    Buffer.from(text || '(empty)', 'utf8'),
    { name: `ticket-${t.num}.txt` },
  );
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`Ticket #${t.num} closed`)
    .addFields(
      { name: 'Opened by', value: `<@${t.opener}>`, inline: true },
      { name: 'Closed by', value: `${closer}`, inline: true },
      { name: 'Topic', value: t.topic || 'None', inline: true },
      { name: 'Reason', value: reason || 'No reason given' },
    )
    .setTimestamp();

  const log = s.ticket_log && channel.guild.channels.cache.get(s.ticket_log);
  await log?.send({
    embeds: [embed],
    files: [file],
    allowedMentions: { parse: [] },
  }).catch(() => {});

  const opener = await channel.client.users.fetch(t.opener).catch(() => null);
  await opener?.send({
    embeds: [embed.setDescription('Here is a copy of your ticket.')],
    files: [file],
  }).catch(() => {});

  setTimeout(() => channel.delete(`Ticket #${t.num} closed`).catch(() => {}), 5000);
  return true;
}

async function handleComponent(i) {
  const s = store.settings(i.guildId);

  if (i.customId === 'tk:open') {
    const menu = new ModalBuilder().setCustomId('tk:topic').setTitle('Open a ticket');
    menu.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('topic')
          .setLabel('What is this about?')
          .setPlaceholder(TOPICS.join(', '))
          .setStyle(TextInputStyle.Short)
          .setMaxLength(60)
          .setRequired(false),
      ),
    );
    return i.showModal(menu);
  }

  if (i.customId === 'tk:topic' && i.isModalSubmit()) {
    const topic = i.fields.getTextInputValue('topic').trim() || 'Support';
    return openTicket(i, topic);
  }

  const t = byChannel(i.channelId);
  if (!t) return i.reply({ content: 'This is not a ticket channel.', ephemeral: true });

  if (i.customId === 'tk:claim') {
    if (!isStaff(i.member, s))
      return i.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
    db.prepare('UPDATE tickets SET claimed = ? WHERE channel = ?').run(i.user.id, i.channelId);
    await i.update({ components: [ticketButtons(i.user.id)] });
    return i.channel.send({
      content: `${i.user} will handle this ticket.`,
      allowedMentions: { parse: [] },
    });
  }

  if (i.customId === 'tk:close') {
    if (i.user.id !== t.opener && !isStaff(i.member, s)) {
      return i.reply({
        content: 'Only the person who opened the ticket or staff can close it.',
        ephemeral: true,
      });
    }

    const ask = new ModalBuilder().setCustomId('tk:closing').setTitle('Close ticket');
    ask.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason (optional)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(200)
          .setRequired(false),
      ),
    );
    return i.showModal(ask);
  }

  if (i.customId === 'tk:closing' && i.isModalSubmit()) {
    if (i.user.id !== t.opener && !isStaff(i.member, s))
      return i.reply({ content: 'Not allowed.', ephemeral: true });
    await i.reply('Closing in 5 seconds. A transcript is being saved.');
    return closeTicket(i.channel, i.user, i.fields.getTextInputValue('reason'));
  }
}

// ---------- dashboard helpers
const recent = (guild, limit = 20) =>
  db.prepare('SELECT * FROM tickets WHERE guild = ? ORDER BY num DESC LIMIT ?').all(guild, limit);
const stats = guild =>
  db.prepare('SELECT status, COUNT(*) n FROM tickets WHERE guild = ? GROUP BY status').all(guild);

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Support tickets')
      .setDMPermission(false)
      .addSubcommand(s =>
        s.setName('panel').setDescription('Post the ticket button in this channel'))
      .addSubcommand(s =>
        s
          .setName('setup')
          .setDescription('Choose the staff role, category and log channel')
          .addRoleOption(o =>
            o.setName('staff').setDescription('Role that can see and answer tickets'))
          .addChannelOption(o =>
            o
              .setName('category')
              .setDescription('Category for new tickets')
              .addChannelTypes(ChannelType.GuildCategory))
          .addChannelOption(o =>
            o
              .setName('log')
              .setDescription('Where closed-ticket transcripts go')
              .addChannelTypes(ChannelType.GuildText)))
      .addSubcommand(s =>
        s
          .setName('close')
          .setDescription('Close the ticket you are in')
          .addStringOption(o =>
            o.setName('reason').setDescription('Why it is being closed').setMaxLength(200)))
      .addSubcommand(s =>
        s
          .setName('add')
          .setDescription('Add a member to this ticket')
          .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
      .addSubcommand(s =>
        s
          .setName('remove')
          .setDescription('Remove a member from this ticket')
          .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const s = store.settings(i.guildId);
      const manage = i.memberPermissions.has(P.ManageGuild);

      if (sub === 'panel' || sub === 'setup') {
        if (!manage)
          return i.reply({ content: 'You need the Manage Server permission.', ephemeral: true });
      }

      if (sub === 'panel') {
        await i.channel.send(panel(i.guild));
        return i.reply({ content: 'Posted the ticket button.', ephemeral: true });
      }

      if (sub === 'setup') {
        const staff = i.options.getRole('staff');
        const category = i.options.getChannel('category');
        const log = i.options.getChannel('log');
        if (staff) store.setSetting(i.guildId, 'ticket_staff_role', staff.id);
        if (category) store.setSetting(i.guildId, 'ticket_category', category.id);
        if (log) store.setSetting(i.guildId, 'ticket_log', log.id);
        const now = store.settings(i.guildId);

        return i.reply({
          content: [
            `Staff role: ${now.ticket_staff_role ? `<@&${now.ticket_staff_role}>` : 'not set (only people with Manage Channels can see tickets)'}`,
            `Category: ${now.ticket_category ? `<#${now.ticket_category}>` : 'not set'}`,
            `Log channel: ${now.ticket_log ? `<#${now.ticket_log}>` : 'not set'}`,
          ].join('\n'),
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
      }

      const t = byChannel(i.channelId);
      if (!t || t.status !== 'open')
        return i.reply({ content: 'Use this inside a ticket channel.', ephemeral: true });

      if (sub === 'close') {
        if (i.user.id !== t.opener && !isStaff(i.member, s))
          return i.reply({ content: 'Only the opener or staff can close this.', ephemeral: true });
        await i.reply('Closing in 5 seconds. A transcript is being saved.');
        return closeTicket(i.channel, i.user, i.options.getString('reason'));
      }

      if (!isStaff(i.member, s))
        return i.reply({ content: 'Only staff can change who is in a ticket.', ephemeral: true });
      const user = i.options.getUser('user');

      if (sub === 'add') {
        await i.channel.permissionOverwrites.edit(
          user.id,
          { ViewChannel: true, SendMessages: true, ReadMessageHistory: true },
        );
        return i.reply({
          content: `${user} was added to this ticket.`,
          allowedMentions: { parse: [] },
        });
      }

      await i.channel.permissionOverwrites.delete(user.id);
      return i.reply({
        content: `${user} was removed from this ticket.`,
        allowedMentions: { parse: [] },
      });
    },
  },
];

module.exports = { commands, handleComponent, panel, recent, stats, TOPICS };
