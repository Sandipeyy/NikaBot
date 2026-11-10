const {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits: P,
} = require('discord.js');
const store = require('./db');
const { db } = store;

// control panel buttons
const BTN = [
  ['name', '✏️', 'Name'],
  ['limit', '👥', 'Limit'],
  ['privacy', '🔒', 'Privacy'],
  ['wait', '⏳', 'Waiting room'],
  ['chat', '💬', 'Chat'],
  ['trust', '✅', 'Trust'],
  ['untrust', '❎', 'Untrust'],
  ['invite', '📨', 'Invite'],
  ['kick', '👢', 'Kick'],
  ['region', '🌍', 'Region'],
  ['block', '⛔', 'Block'],
  ['unblock', '🟢', 'Unblock'],
  ['claim', '👑', 'Claim'],
  ['transfer', '🔄', 'Transfer'],
  ['delete', '🗑️', 'Delete'],
];
const REGIONS = [
  ['Automatic', 'auto'],
  ['US East', 'us-east'],
  ['US West', 'us-west'],
  ['Europe', 'rotterdam'],
  ['Brazil', 'brazil'],
  ['India', 'india'],
  ['Japan', 'japan'],
  ['Singapore', 'singapore'],
  ['Sydney', 'sydney'],
  ['Hong Kong', 'hongkong'],
  ['South Africa', 'southafrica'],
];

function panel() {
  const rows = [0, 1, 2].map(r =>
    new ActionRowBuilder().addComponents(
      BTN.slice(r * 5, r * 5 + 5).map(([id, e]) =>
        new ButtonBuilder()
          .setCustomId('vc:b:' + id)
          .setEmoji(e)
          .setStyle(id === 'delete' ? ButtonStyle.Danger : ButtonStyle.Secondary)),
    ));
  const embed = new EmbedBuilder()
    .setColor(0xe0314b)
    .setTitle('🔊 Voice Interface')
    .setDescription(
      `Manage your temporary voice channel with the buttons below. More options are available with \`/vc\` commands.\n\n${BTN.map(([, e, l]) => `${e} **${l}**`).join('  ·  ')}\n\nPress the buttons below to use the interface.`,
    );

  return { embeds: [embed], components: rows };
}

// slash command
const command = {
  data: new SlashCommandBuilder()
    .setName('vc')
    .setDescription('Temporary voice channels (join-to-create)')
    .setDMPermission(false)
    .addSubcommand(s =>
      s.setName('setup').setDescription(
        'Create the permanent ➕ Creator + interface channels (admin)',
      ))
    .addSubcommand(s => s.setName('remove').setDescription('Remove the temp voice system (admin)'))
    .addSubcommand(s =>
      s.setName('interface').setDescription('Post the voice interface panel here (admin)'))
    .addSubcommand(s =>
      s
        .setName('name')
        .setDescription('Rename your channel')
        .addStringOption(o =>
          o.setName('name').setDescription('New name').setMaxLength(90).setRequired(true)))
    .addSubcommand(s =>
      s
        .setName('limit')
        .setDescription('Set user limit')
        .addIntegerOption(o =>
          o
            .setName('users')
            .setDescription('0 = unlimited')
            .setMinValue(0)
            .setMaxValue(99)
            .setRequired(true)))
    .addSubcommand(s => s.setName('lock').setDescription('Lock your channel'))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock your channel'))
    .addSubcommand(s =>
      s
        .setName('transfer')
        .setDescription('Give ownership to someone')
        .addUserOption(o => o.setName('user').setDescription('New owner').setRequired(true)))
    .addSubcommand(s => s.setName('claim').setDescription('Claim a channel whose owner left')),
  run: async (i) => {
    const deny = m => i.reply({ content: m, ephemeral: true });
    const s = i.options.getSubcommand();

    if (['setup', 'interface', 'remove'].includes(s)) {
      if (!i.member.permissions.has(P.ManageChannels)) return deny('You need Manage Channels.');

      try {
        if (s === 'interface') {
          await i.channel.send(panel());
          return deny('✅ Panel posted.');
        }

        await i.deferReply({ ephemeral: true });

        if (s === 'remove') {
          const st = store.settings(i.guildId);
          const ids = [st.tempvc_hub, st.tempvc_interface, st.tempvc_cat];
          for (const k of ['tempvc_hub', 'tempvc_interface', 'tempvc_cat'])
            store.setSetting(
              i.guildId,
              k,
              null,
            ); // cleared first so the repair doesn't recreate them
          for (const id of ids) await i.guild.channels.cache.get(id)?.delete().catch(() => {});
          return i.editReply('🗑️ Temp voice system removed.');
        }

        const miss = [
          'ManageChannels',
          'ManageRoles',
          'MoveMembers',
          'ViewChannel',
          'Connect',
        ].filter(p => !i.guild.members.me.permissions.has(p));
        if (miss.length)
          return i.editReply(
            `❌ I'm missing these permissions: **${miss.join(', ')}**. Re-invite me with the link from the website, or grant them in Server Settings → Roles.`,
          );
        const st = store.settings(i.guildId);
        const had = st.tempvc_hub && i.guild.channels.cache.has(st.tempvc_hub);
        const { hub, txt } = await ensureInfra(i.guild);
        return i.editReply(
          had
            ? `✅ Already set up (repaired if needed): ${hub} · ${txt}`
            : `✅ Done! Join ${hub} to get your own voice channel. Controls are in ${txt}.`,
        );
      } catch (e) {
        console.error('[vc setup]', e.message);
        return (
          i.deferred
            ? i.editReply('I need Manage Channels, Move Members and View Channel permissions.')
            : deny('I need Manage Channels permission.')
        );
      }
    }

    const ch = i.member.voice.channel;
    const row = ch && db.prepare('SELECT * FROM tempvc WHERE channel=?').get(ch.id);
    if (!row) return deny('Join your temporary voice channel first.');
    if (s === 'claim') return deny(await claim(i, ch, row));
    if (row.owner !== i.user.id) return deny('Only the channel owner can do that.');

    try {
      if (s === 'name') await ch.setName(i.options.getString('name'));
      else if (s === 'limit') await ch.setUserLimit(i.options.getInteger('users'));
      else if (s === 'lock') await ch.permissionOverwrites.edit(i.guild.id, { Connect: false });
      else if (s === 'unlock') await ch.permissionOverwrites.edit(i.guild.id, { Connect: null });
      else if (s === 'transfer') {
        const u = i.options.getUser('user');
        if (!ch.members.has(u.id) || u.bot) return deny('That user must be in your channel.');
        await transfer(i, ch, u.id);
      }

      i.reply({ content: '✅ Done.', ephemeral: true });
    } catch {
      deny('Something went wrong (check my permissions).');
    }
  },
};

async function claim(i, ch, row) {
  if (ch.members.has(row.owner)) return 'The owner is still here.';
  db.prepare('UPDATE tempvc SET owner=? WHERE channel=?').run(i.user.id, ch.id);
  await ch.permissionOverwrites.edit(
    i.user.id,
    { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true },
  ).catch(() => {});
  return `👑 You are now the owner of **${ch.name}**.`;
}

async function transfer(i, ch, id) {
  db.prepare('UPDATE tempvc SET owner=? WHERE channel=?').run(id, ch.id);
  await ch.permissionOverwrites.edit(
    id,
    { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true },
  );
  await ch.permissionOverwrites.delete(i.user.id).catch(() => {});
}

async function destroy(guild, row) {
  db.prepare('DELETE FROM tempvc WHERE channel=?').run(row.channel);
  if (row.wait) guild.channels.cache.get(row.wait)?.delete().catch(() => {});
  guild.channels.cache.get(row.channel)?.delete().catch(() => {});
}

// buttons / modals / menus (customId starts with vc:)
async function handleComponent(i) {
  const [, kind, act] = i.customId.split(':');
  const say = c => i.reply({ content: c, ephemeral: true });
  const ch = i.member.voice.channel;
  const row = ch && db.prepare('SELECT * FROM tempvc WHERE channel=?').get(ch.id);
  if (!row) return say('Join your temporary voice channel first.');
  if (kind === 'b' && act === 'claim') return say(await claim(i, ch, row));
  if (row.owner !== i.user.id) return say('Only the channel owner can do that.');
  const modal = (id, title, label) =>
    i.showModal(
      new ModalBuilder()
        .setCustomId('vc:m:' + id)
        .setTitle(title)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('v')
              .setLabel(label)
              .setStyle(TextInputStyle.Short)
              .setMaxLength(90)
              .setRequired(true),
          ),
        ),
    );
  const menu = (id, text, options) =>
    i.reply({
      content: text,
      ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('vc:s:' + id)
            .setPlaceholder('Choose…')
            .addOptions(options),
        ),
      ],
    });
  const picker = text =>
    i.reply({
      content: text,
      ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId('vc:u:' + act)
            .setPlaceholder('Select a member')
            .setMaxValues(1),
        ),
      ],
    });

  try {
    if (kind === 'b') {
      switch (act) {
        case 'name':
          return modal('name', 'Rename channel', 'New name');
        case 'limit':
          return modal('limit', 'User limit', 'Number from 0 to 99 (0 = unlimited)');
        case 'privacy':
          return menu(
            'privacy',
            '🔒 Choose privacy:',
            [
              {
                label: 'Lock',
                value: 'lock',
                emoji: '🔒',
                description: 'Only trusted members can join',
              },
              { label: 'Unlock', value: 'unlock', emoji: '🔓' },
              {
                label: 'Invisible',
                value: 'hide',
                emoji: '👻',
                description: 'Hide the channel from others',
              },
              { label: 'Visible', value: 'show', emoji: '👁️' },
            ],
          );
        case 'region':
          return menu(
            'region',
            '🌍 Choose a voice region:',
            REGIONS.map(([label, value]) => ({ label, value })),
          );
        case 'chat': {
          const off = ch.permissionOverwrites.cache.get(i.guild.id)?.deny.has(P.SendMessages);
          await ch.permissionOverwrites.edit(i.guild.id, { SendMessages: off ? null : false });
          return say(off ? '💬 Chat enabled.' : '🔇 Chat disabled.');
        }
        case 'wait': {
          if (row.wait) {
            i.guild.channels.cache.get(row.wait)?.delete().catch(() => {});
            db.prepare('UPDATE tempvc SET wait=NULL WHERE channel=?').run(ch.id);
            return say('⏳ Waiting room removed.');
          }

          const w = await i.guild.channels.create({
            name: `⏳ ${ch.name}`.slice(0, 100),
            type: ChannelType.GuildVoice,
            parent: ch.parentId,
          });
          db.prepare('UPDATE tempvc SET wait=? WHERE channel=?').run(w.id, ch.id);
          return say(`⏳ Waiting room created: ${w}. Drag people from it into your channel.`);
        }
        case 'delete':
          await destroy(i.guild, row);
          return say('🗑️ Channel deleted.');
        default:
          return picker(
            {
              trust: '✅ Who do you want to trust?',
              untrust: '❎ Remove trust from:',
              invite: '📨 Who do you want to invite?',
              kick: '👢 Who do you want to kick?',
              block: '⛔ Who do you want to block?',
              unblock: '🟢 Who do you want to unblock?',
              transfer: '🔄 Who is the new owner?',
            }[act],
          );
      }
    }

    if (kind === 'm') {
      const v = i.fields.getTextInputValue('v').trim();

      if (act === 'name') {
        await i.deferReply({ ephemeral: true });
        await ch.setName(v);
        return i.editReply('✅ Renamed.');
      }

      const n = parseInt(v);
      if (!(n >= 0 && n <= 99)) return say('Enter a number from 0 to 99.');
      await ch.setUserLimit(n);
      return say(`✅ Limit set to ${n || 'unlimited'}.`);
    }

    if (kind === 's') {
      const v = i.values[0];

      if (act === 'region') {
        await ch.setRTCRegion(v === 'auto' ? null : v);
        return i.update({ content: '✅ Region updated.', components: [] });
      }

      const ow = {
        lock: { Connect: false },
        unlock: { Connect: null },
        hide: { ViewChannel: false },
        show: { ViewChannel: null },
      }[v];
      await ch.permissionOverwrites.edit(i.guild.id, ow);
      return i.update({
        content: `✅ Channel is now **${v === 'hide' ? 'invisible' : v === 'show' ? 'visible' : v + 'ed'}**.`,
        components: [],
      });
    }

    if (kind === 'u') {
      const t = i.values[0];
      const me = i.user.id;
      if (t === me && act !== 'invite')
        return i.update({ content: "You can't do that to yourself.", components: [] });
      let msg = '✅ Done.';

      if (act === 'trust')
        await ch.permissionOverwrites.edit(t, { ViewChannel: true, Connect: true });
      else if (act === 'untrust' || act === 'unblock') await ch.permissionOverwrites.delete(t);
      else if (act === 'block') {
        await ch.permissionOverwrites.edit(t, { ViewChannel: false, Connect: false });
        ch.members.get(t)?.voice.disconnect().catch(() => {});
      } else if (act === 'kick') {
        if (!ch.members.has(t)) msg = 'That user is not in your channel.';
        else await ch.members.get(t).voice.disconnect();
      } else if (act === 'invite') {
        await ch.permissionOverwrites.edit(t, { ViewChannel: true, Connect: true });
        const inv = await ch.createInvite({ maxAge: 3600, maxUses: 1 });
        msg = await (await i.client.users.fetch(t))
          .send(`📨 **${i.user.username}** invited you to **${ch.name}**: ${inv.url}`)
          .then(() => '📨 Invite sent by DM.')
          .catch(() => `Could not DM them. Share this link: ${inv.url}`);
      } else if (act === 'transfer') {
        if (!ch.members.has(t) || ch.members.get(t).user.bot)
          msg = 'That user must be in your channel.';
        else {
          await transfer(i, ch, t);
          msg = '🔄 Ownership transferred.';
        }
      }

      return i.update({ content: msg, components: [] });
    }
  } catch (e) {
    console.error('[vc]', e.message);
    if (!i.replied && !i.deferred)
      say('Something went wrong (check my permissions).').catch(() => {});
  }
}

// join to create + cleanup
// makes (or fixes) the category, creator channel and interface channel
async function ensureInfra(guild) {
  const s = store.settings(guild.id);
  const get = id => id && guild.channels.cache.get(id);
  let cat = get(s.tempvc_cat);

  if (!cat) {
    cat = await guild.channels.create({ name: 'Temp Voice', type: ChannelType.GuildCategory });
    store.setSetting(guild.id, 'tempvc_cat', cat.id);
  }

  let hub = get(s.tempvc_hub);

  if (!hub) {
    hub = await guild.channels.create({
      name: '➕ Creator',
      type: ChannelType.GuildVoice,
      parent: cat.id,
    });
    store.setSetting(guild.id, 'tempvc_hub', hub.id);
  } else if (hub.parentId !== cat.id) await hub.setParent(cat.id).catch(() => {});

  let txt = get(s.tempvc_interface);

  if (!txt) {
    txt = await guild.channels.create({
      name: '✨・interface',
      type: ChannelType.GuildText,
      parent: cat.id,
      permissionOverwrites: [
        { id: guild.id, deny: [P.SendMessages] },
        { id: guild.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks] },
      ],
    });
    store.setSetting(guild.id, 'tempvc_interface', txt.id);
    await txt.send(panel());
  } else if (txt.parentId !== cat.id) await txt.setParent(cat.id).catch(() => {});

  return { cat, hub, txt };
}

// put the permanent channels back if someone deletes them
function onChannelDelete(ch) {
  if (!ch.guild) return;
  const s = store.settings(ch.guild.id);
  if ([s.tempvc_hub, s.tempvc_interface, s.tempvc_cat].includes(ch.id))
    setTimeout(
      () => ensureInfra(ch.guild).catch(e => console.error('[vc repair]', e.message)),
      2000,
    );
}

function notify(g, e) {
  const id = store.settings(g.id).tempvc_interface;
  const ch = id && g.channels.cache.get(id);

  ch
    ?.send(
      `⚠️ I couldn't create a voice channel: ${String(e.message).slice(0, 150)}\nI need **Manage Channels, Manage Roles and Move Members**.`,
    )
    .then(x => setTimeout(() => x.delete().catch(() => {}), 15000))
    .catch(() => {});
}

const creating = new Set();

async function createFor(n) {
  const g = n.guild;
  const m = n.member;
  if (creating.has(m.id)) return;
  creating.add(m.id);
  setTimeout(() => creating.delete(m.id), 4000);
  const ex = db.prepare('SELECT channel FROM tempvc WHERE guild=? AND owner=?').get(g.id, m.id);
  const exCh = ex && g.channels.cache.get(ex.channel);

  if (exCh) {
    await m.voice.setChannel(exCh).catch(() => {});
    return;
  } // already has one, move them there

  const s = store.settings(g.id);
  const base = {
    name: (s.tempvc_name || "🔊 {user}'s room").replaceAll('{user}', m.displayName).slice(0, 100),
    type: ChannelType.GuildVoice,
    parent: n.channel.parentId,
    userLimit: s.tempvc_limit || 0,
  };

  // if permission overwrites fail, still make it, ownership is tracked in the db
  const ch = await g.channels.create({
    ...base,
    permissionOverwrites: [
      { id: m.id, allow: [P.ViewChannel, P.Connect, P.ManageChannels, P.MoveMembers] },
    ],
  }).catch(() => g.channels.create(base));

  db.prepare('INSERT INTO tempvc(channel,guild,owner) VALUES(?,?,?)').run(ch.id, g.id, m.id);
  await m.voice.setChannel(ch).catch(() => destroy(g, { channel: ch.id }));
}

async function onVoiceState(o, n) {
  const g = n.guild;

  if (n.channelId
    && n.channelId !== o.channelId
    && n.channelId === store.settings(g.id).tempvc_hub
    && !n.member.user.bot)
    await createFor(n).catch(e => {
      console.error('[vc create]', e.message);
      notify(g, e);
    });

  if (o.channelId && o.channelId !== n.channelId && o.channel?.members.size === 0) {
    const row = db.prepare('SELECT * FROM tempvc WHERE channel=?').get(o.channelId);
    if (row) destroy(g, row);
  } // only temp channels get deleted
}

async function cleanup(client) {
  for (const r of db.prepare('SELECT * FROM tempvc').all()) {
    const ch = await client.channels.fetch(r.channel).catch(() => null);

    if (!ch) db.prepare('DELETE FROM tempvc WHERE channel=?').run(r.channel);
    else if (ch.members.size === 0) destroy(ch.guild, r);
  }
}

module.exports = {
  command,
  onVoiceState,
  onChannelDelete,
  ensureInfra,
  cleanup,
  handleComponent,
  panel,
};
