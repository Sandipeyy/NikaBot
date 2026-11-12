# NikaBot

A Discord bot with leveling, moderation, music, economy, games, tickets, giveaways and welcome cards, plus a website with a dashboard, a public status page, command analytics and a changelog.

Website: https://nika.is-a.bot

Made by Sandip Gurung.

## What it does

- **Economy and games:** daily rewards, work, shop, slots, blackjack, crash, coinflip, an animal zoo and a lottery (virtual coins only).
- **Leveling:** XP for chatting, rank cards, level-up banners and leaderboards.
- **Moderation:** warn, timeout, kick, ban, purge, lock, slowmode, cases with a mod-log and auto-moderation for invites, links and words.
- **Music:** SoundCloud, Audius, Internet Archive, Jamendo, direct links and Spotify track links, with a queue and Now Playing buttons.
- **Community tools:** tickets with transcripts, reaction roles, suggestions with voting, a starboard, birthdays, AFK notices and a bank with interest.
- **Safety tools:** a honeypot trap channel, a verification button or question, server logs, a mod-log and anonymous confessions with optional review.
- **Server tools:** welcome/goodbye image cards, autorole, tickets, polls, giveaways and temporary voice channels.
- **Extras:** weather, dictionary, wiki, translate, GitHub lookups, anime GIF reactions and an optional AI chat.

Every slash command except `/confess` and `/confession` also works as a text command with the prefix (`m!` by default).

## Website

| Page | What it is |
| --- | --- |
| `/` | Overview with a live 30-day uptime strip |
| `/status` | Live health of the Discord connection, Discord API, database, website and music player, plus shard list, latency, 30-day uptime bars, incident history and planned maintenance |
| `/analytics` | Most-used commands, daily trend, rising and falling commands, usage by category (7, 30 or 90 days) |
| `/changelog` | Bot and website updates |
| `/commands`, `/features`, `/docs`, `/premium` | Information pages |
| `/privacy`, `/terms` | Legal pages |
| `/servers`, `/guild/:id` | Dashboard after logging in with Discord: overview with setup checklist and permission check, settings for every module, moderation case browser (filters and CSV export), dashboard activity log, member lookup with staff notes, insights (joins, leaves, busiest channels), reaction role manager, settings backup and restore, and confession moderation |
| `/leaderboard/:id` | Public server leaderboard |
| `/admin` | Owner only: schedule maintenance, post incidents, add changelog entries |

The site has a light and a dark theme, works on phones, tablets and desktops, and has custom 404 and 500 pages, per-page titles, Open Graph tags, a sitemap and a web manifest.

### How status tracking works

- Every minute the bot checks the Discord gateway, the Discord API and the database, and adds the result to the current day.
- If something is wrong for two checks in a row, an incident opens by itself and closes when things recover.
- On startup the bot compares the time with its last heartbeat. A gap longer than 2.5 minutes is recorded as downtime with an incident.
- Time inside a maintenance window is shown as maintenance and does not count against uptime.
- Command usage is counted per day, so analytics history starts the day you deploy.

### JSON endpoints

```
GET /api/status      live snapshot, uptime, incidents, maintenance
GET /api/analytics   ?days=30
GET /api/changelog
GET /api/stats       servers, users, commands
```

## Safety tools

| Command | What it does |
| --- | --- |
| `/modlog set #channel` | Sends bans, kicks, warns, timeouts, removed messages and honeypot catches to a channel |
| `/logs setup #channel` | Logs message edits and deletes, joins and leaves, nickname and role changes, role and channel changes, voice activity and bans. Choose what with `/logs toggle` |
| `/honeypot setup` | Makes a trap channel. Anyone without moderator permissions who posts there is banned, softbanned, kicked or timed out |
| `/verify setup role:@Member` | Posts a Verify button. Mode `question` asks a small maths question first |
| `/confess` | Anonymous confession. Moderators set it up with `/confession setup` and can add a review channel |
| `/confession reveal` | Shows the sender of a confession. Every reveal is written to the mod-log and the dashboard activity log |

| `/raidmode` | Removes new accounts during a raid. Can switch on by itself when many people join within seconds |
| `/case user`, `/case note` | A member's full history and private staff notes |
| `/ticket setup`, `/ticket panel` | Private support channels with a staff role, claiming and transcripts |
| `/reactionroles create` | Posts a role picker with up to 10 roles |
| `/suggest new`, `/starboard setup`, `/birthday setup`, `/afk`, `/bank` | Community and economy extras |

The bot uses 91 of Discord's 100 slash command slots, so new features should be added as subcommands.

Notes: logging deleted and edited messages needs the bot to keep a few recent messages in memory (50 per channel for 30 minutes). The bot needs the Ban Members, Kick Members, Moderate Members, Manage Roles and Manage Channels permissions for these features, and its role must sit above the verified role.

## Setup

You need Node.js 22. Everything is stored in a local SQLite file (`bot.db`).

1. Create an application at https://discord.com/developers/applications, add a bot, and turn on the Server Members and Message Content intents.
2. Add `BASE_URL/callback` as an OAuth2 redirect.
3. Copy `.env.example` to `.env` and fill it in.
4. Install and start:

```bash
npm install
npm start
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `BOT_TOKEN` | yes | Bot token |
| `CLIENT_ID` | yes | Application ID |
| `CLIENT_SECRET` | yes | OAuth2 secret for dashboard login |
| `BASE_URL` | yes | Public website address, e.g. `https://nika.is-a.bot` |
| `SESSION_SECRET` | yes | Long random string for login cookies |
| `PORT` | no | Website port, default 3000 |
| `PREFIX` | no | Text command prefix, default `m!` |
| `BOT_NAME` | no | Fallback name on the website, default NikaBot |
| `OWNER_IDS` | no | Comma-separated Discord user IDs allowed to open `/admin` |
| `SUPPORT_URL` | no | Support server link |
| `CONTACT_EMAIL`, `OPERATOR_NAME`, `LEGAL_JURISDICTION` | no | Shown on the privacy policy and terms |
| `AI_API_KEY` | no | Turns on `/chat` |
| `AI_API_URL`, `AI_MODEL` | no | Any OpenAI-style chat endpoint. Defaults to Mistral (`https://api.mistral.ai/v1/chat/completions`, `mistral-small-latest`) |
| `MUSIC_SOURCE` | no | `soundcloud` (default), `audius`, `archive`, `jamendo` or `youtube` |
| `JAMENDO_CLIENT_ID` | no | Enables the Jamendo source |
| `BACKUP_CHANNEL_ID` | no | Private channel for encrypted database backups (useful on hosts that wipe the disk) |
| `STREAM_URL` | no | Twitch or YouTube link for the streaming status |
| `GITHUB_TOKEN` | no | Raises the GitHub API limit for `/github` |

Never commit `.env`. It is listed in `.gitignore`.

## Files

```
index.js          starts the client, loads commands, handles interactions
boot.js           restores the database from backup, then starts the bot
db.js             SQLite setup and helpers
commands*.js      slash commands (economy, fun, utility, moderation)
games.js          animals, gambling and lottery
music.js          music player
tempvc.js         temporary voice channels
upgrades.js       help menu, info embeds, moderation cases, polls, giveaways
welcome.js        welcome and goodbye messages
logs.js           /modlog and /logs, event listeners
honeypot.js       trap channel
verify.js         verification button and question
confession.js     anonymous confessions
adminlog.js       dashboard activity log
adminpages.js     overview, cases, member lookup, insights, activity, backup and confession pages
tickets.js        support tickets
reactionroles.js  role pickers
modcase.js        /case and staff notes
suggest.js        suggestions
starboard.js      starboard
raidmode.js       raid mode
afk.js            AFK notices
birthday.js       birthdays
bank.js           bank and interest
automodplus.js    spam, mention and caps checks
insights.js       per-server statistics
jobs.js           cleanup and removal of unverified members
duration.js       10m / 2h / 1d parser
prefixrun.js      text-command versions of every slash command
monitor.js        health checks, uptime, incidents, maintenance
usage.js          daily command counts for analytics
changelog.js      changelog entries (changelog.json plus the admin page)
dashboard.js      website routes and the per-server dashboard
pages.js          page bodies    layout.js  page shell    styles.js  stylesheet
site.js           SEO tags, legal pages and docs text
```

To add a changelog entry, edit `changelog.json` or use `/admin`.
