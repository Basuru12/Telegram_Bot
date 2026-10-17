# Telegram Reminder Assistant

Personal reminder assistant that talks over **Telegram** (Bot API via grammY long polling) and a simple **web UI**. Reminders are stored in SQLite and delivered to your Telegram chat when due.

## Features

- Create / list / cancel reminders by messaging the bot
- Same actions via a local web UI at `http://localhost:3000`
- Temporary **visa checklist** at `http://localhost:3000/visa.html` (manual checkboxes)
- Telegram digests for **active** visa docs; weekdays + times set on `/visa.html`
- Optional email copy of the same digest via SMTP (`VISA_DIGEST_EMAIL`)
- Background scheduler (every 60s) sends due reminders and visa digests
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
| `VISA_DIGEST_TIMES` | no | Bootstrap `HH:mm` list until schedule is saved in the UI; default `09:00` |
| `VISA_DIGEST_EMAIL` | no | If set (with SMTP), digests are also emailed |
| `SMTP_HOST` | for email | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | no | Default `587` (`465` uses TLS) |
| `SMTP_USER` | for email | SMTP username |
| `SMTP_PASS` | for email | SMTP password / app password |
| `SMTP_FROM` | no | From address; defaults to `SMTP_USER` |

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

## Visa checklist

Open `/visa.html` to add documents, set start/due dates on the Gantt, and check them off. Use the **Reminders** section to pick weekdays and times for Telegram digests. Digests include unfinished docs that have started (start date ≤ today), including overdue ones marked with a red circle emoji. Until you save a schedule in the UI, times default from `VISA_DIGEST_TIMES` (all days). The app must be running at those times.

If `VISA_DIGEST_EMAIL` and SMTP settings are configured, the same digest text is also emailed (scheduled and **Send test reminder**). Email failures are logged and do not block Telegram delivery.

## API

- `GET /api/reminders` — all (recent)
- `GET /api/reminders?status=pending` — upcoming
- `POST /api/reminders` — `{ "text": "...", "dueAt": "2026-09-09T15:30" }` (wall clock in `TZ`)
- `POST /api/reminders/:id/cancel`
- `GET /api/visa` — visa documents (open first)
- `POST /api/visa` — `{ "title": "...", "startDate?", "dueDate?" }`
- `PATCH /api/visa/:id` — `{ "done?", "startDate?", "dueDate?" }`
- `DELETE /api/visa/:id`
- `GET /api/visa/schedule` — `{ days, times }`
- `PUT /api/visa/schedule` — `{ "days": [1,2,3,4,5], "times": ["09:00","18:00"] }`
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
