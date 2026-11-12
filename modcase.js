// /case: look up moderation cases and keep private staff notes about members.
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits: P } = require('discord.js');
const { db } = require('./db');

db.exec(
  `
CREATE TABLE IF NOT EXISTS mod_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild TEXT,
  user TEXT,
  mod TEXT,
  text TEXT,
  at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notes ON mod_notes(guild, user);
`,
);

const ts = ms => `<t:${Math.floor(ms / 1000)}:R>`;

const notes = (guild, user) =>
  db.prepare('SELECT * FROM mod_notes WHERE guild = ? AND user = ? ORDER BY at DESC LIMIT 25').all(
    guild,
    user,
  );

function addNote(guild, user, mod, text) {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) throw new Error('Write something in the note.');
  db.prepare('INSERT INTO mod_notes(guild,user,mod,text,at) VALUES(?,?,?,?,?)').run(
    guild,
    user,
    mod,
    t,
    Date.now(),
  );
}

const deleteNote = (guild, id) =>
  db.prepare('DELETE FROM mod_notes WHERE guild = ? AND id = ?').run(guild, id).changes > 0;

// everything we know about one member, used by /case user and the dashboard member page
function history(guild, user) {
  return {
    cases: db.prepare(
      'SELECT * FROM cases WHERE guild = ? AND user = ? ORDER BY num DESC LIMIT 50',
    ).all(guild, user),
    warns: db.prepare('SELECT COUNT(*) n FROM warns WHERE guild = ? AND user = ?').get(
      guild,
      user,
    ).n,
    notes: notes(guild, user),
  };
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('case')
      .setDescription('Moderation cases and staff notes')
      .setDefaultMemberPermissions(P.ModerateMembers)
      .setDMPermission(false)
      .addSubcommand(s =>
        s
          .setName('view')
          .setDescription('Show one case')
          .addIntegerOption(o =>
            o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)))
      .addSubcommand(s =>
        s
          .setName('user')
          .setDescription("A member's cases, warnings and notes")
          .addUserOption(o => o.setName('member').setDescription('Member').setRequired(true)))
      .addSubcommand(s =>
        s
          .setName('note')
          .setDescription('Add a private staff note about a member')
          .addUserOption(o => o.setName('member').setDescription('Member').setRequired(true))
          .addStringOption(o =>
            o.setName('text').setDescription('The note').setRequired(true).setMaxLength(500)))
      .addSubcommand(s =>
        s
          .setName('deletenote')
          .setDescription('Delete a staff note')
          .addIntegerOption(o => o.setName('id').setDescription('Note number').setRequired(true))),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      const g = i.guildId;

      if (sub === 'view') {
        const num = i.options.getInteger('number');
        const c = db.prepare('SELECT * FROM cases WHERE guild = ? AND num = ?').get(g, num);
        if (!c) return i.reply({ content: `There is no case #${num}.`, ephemeral: true });
        return i.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle(`Case #${c.num} · ${c.type}`)
              .addFields(
                { name: 'Member', value: `<@${c.user}> (\`${c.user}\`)`, inline: true },
                { name: 'Moderator', value: `<@${c.mod}>`, inline: true },
                { name: 'When', value: ts(c.at), inline: true },
                { name: 'Reason', value: (c.reason || 'No reason given').slice(0, 1000) },
              ),
          ],
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
      }

      if (sub === 'note') {
        const user = i.options.getUser('member');
        addNote(g, user.id, i.user.id, i.options.getString('text'));
        return i.reply({
          content: `Note saved for ${user}. Only moderators can see it.`,
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
      }

      if (sub === 'deletenote') {
        const ok = deleteNote(g, i.options.getInteger('id'));
        return i.reply({
          content: ok ? 'Note deleted.' : 'There is no note with that number.',
          ephemeral: true,
        });
      }

      const user = i.options.getUser('member');
      const h = history(g, user.id);
      const cases =
        h.cases
          .slice(0, 10)
          .map(c => `**#${c.num}** ${c.type} ${ts(c.at)} · ${(c.reason || '').slice(0, 60)}`)
          .join('\n')
          || 'No cases.';
      const noteText =
        h.notes
          .slice(0, 5)
          .map(n => `**#${n.id}** <@${n.mod}> ${ts(n.at)}: ${n.text.slice(0, 120)}`)
          .join('\n')
          || 'No notes.';

      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
            .setDescription(
              `${h.cases.length} case${h.cases.length === 1 ? '' : 's'}, ${h.warns} warning${h.warns === 1 ? '' : 's'}, ${h.notes.length} note${h.notes.length === 1 ? '' : 's'}`,
            )
            .addFields(
              { name: 'Latest cases', value: cases },
              { name: 'Staff notes', value: noteText },
            ),
        ],
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
    },
  },
];

module.exports = { commands, history, notes, addNote, deleteNote };
