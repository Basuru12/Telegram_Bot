import { formatInTimeZone } from "date-fns-tz";
import { config } from "./config.js";
import {
  getDueReminders,
  getVisaDigestSchedule,
  markReminderFailed,
  markReminderSent,
  markVisaDigestSent,
  wasVisaDigestSent,
} from "./db.js";
import { sendReminder } from "./telegram/bot.js";
import {
  listActiveVisaDocuments,
  sendVisaDigestNow,
  todayKeyInTz,
} from "./visa-digest.js";

const INTERVAL_MS = 60_000;
let running = false;

/** ISO weekday 1–7 (Mon–Sun) → JS weekday 0–6 (Sun–Sat). */
function localWeekdaySun0(now: Date): number {
  const isoDay = Number(formatInTimeZone(now, config.tz, "i"));
  return isoDay % 7;
}

async function maybeSendVisaDigest(): Promise<void> {
  const now = new Date();
  const localHm = formatInTimeZone(now, config.tz, "HH:mm");
  const todayKey = todayKeyInTz(now);
  const weekday = localWeekdaySun0(now);
  const schedule = getVisaDigestSchedule();

  if (!schedule.days.includes(weekday)) {
    return;
  }
  if (!schedule.times.includes(localHm)) {
    return;
  }

  const digestKey = `${todayKey}T${localHm}`;
  if (wasVisaDigestSent(digestKey)) {
    return;
  }

  const active = listActiveVisaDocuments(todayKey);
  if (active.length === 0) {
    markVisaDigestSent(digestKey);
    console.log(`Visa digest ${digestKey}: nothing active, skipped`);
    return;
  }

  try {
    await sendVisaDigestNow();
    markVisaDigestSent(digestKey);
    console.log(
      `Sent visa digest ${digestKey} (${active.length} active)`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed visa digest ${digestKey}:`, message);
  }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;

  try {
    if (!config.telegram.token) {
      return;
    }
    if (!config.allowedTelegramChatId) {
      console.warn(
        "Scheduler: ALLOWED_TELEGRAM_CHAT_ID not set; skipping delivery"
      );
      return;
    }

    const chatId = config.allowedTelegramChatId;

    const due = getDueReminders();
    for (const reminder of due) {
      try {
        await sendReminder(chatId, reminder.text);
        markReminderSent(reminder.id);
        console.log(`Sent reminder #${reminder.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        markReminderFailed(reminder.id, message);
        console.error(`Failed reminder #${reminder.id}:`, message);
      }
    }

    await maybeSendVisaDigest();
  } finally {
    running = false;
  }
}

export function startScheduler(): NodeJS.Timeout {
  void tick();
  return setInterval(() => {
    void tick();
  }, INTERVAL_MS);
}
