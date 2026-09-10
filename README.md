# Telegram Reminder Assistant

Personal reminder assistant that talks over **Telegram** (Bot API via grammY long polling) and a simple **web UI**. Reminders are stored in SQLite and delivered to your Telegram chat when due.

## Features

- Create / list / cancel reminders by messaging the bot
- Same actions via a local web UI at `http://localhost:3000`
- Background scheduler (every 60s) sends due reminders
- Single-user allowlist via `ALLOWED_TELEGRAM_CHAT_ID`

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:3000 — the web UI works even before Telegram is configured.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | Default `3000` |
| `DATABASE_PATH` | no | Default `./data/reminders.db` |
| `TZ` | no | Default `Asia/Kolkata` |
| `TELEGRAM_BOT_TOKEN` | for Telegram | Token from [@BotFather](https://t.me/BotFather) |
| `ALLOWED_TELEGRAM_CHAT_ID` | for delivery | Your numeric Telegram chat id |

## Telegram setup

1. Open Telegram and talk to [@BotFather](https://t.me/BotFather).
2. Create a bot with `/newbot` and copy the token into `TELEGRAM_BOT_TOKEN`.
3. Start the app (`npm run dev`), then message your bot with `/start`.
4. Check the server logs for a line like `Telegram chat id 123456789 messaged /start` (or use [@userinfobot](https://t.me/userinfobot)).
5. Set `ALLOWED_TELEGRAM_CHAT_ID` to that number and restart.

No public webhook or tunnel is required — the bot uses long polling.

## Telegram commands

| Message | Effect |
|---------|--------|
| `remind me to buy milk in 20m` | Create relative reminder |
| `remind me to call mom at 3:30pm` | Create absolute reminder (in `TZ`) |
| `remind me to submit report tomorrow 9am` | Natural date/time |
| `list` | Upcoming reminders |
| `cancel 3` | Cancel by id |
| `help` / `/start` | Usage |

## API

- `GET /api/reminders` — all (recent)
- `GET /api/reminders?status=pending` — upcoming
- `POST /api/reminders` — `{ "text": "...", "dueAt": "2026-09-09T15:30" }` (wall clock in `TZ`)
- `POST /api/reminders/:id/cancel`
- `GET /api/health`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with reload |
| `npm start` | Run once |
| `npm run typecheck` | TypeScript check |

## Smoke checklist

1. Create a reminder from the web UI → appears in Upcoming.
2. Cancel it from the UI.
3. With token + chat id configured, Telegram `remind me to test in 2m` → bot confirms with an id.
4. Wait for due time → receive Telegram ping; status becomes `sent`.
5. `list` / `cancel <id>` over Telegram.
