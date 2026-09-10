import { config } from "./config.js";
import {
  getDueReminders,
  markReminderFailed,
  markReminderSent,
} from "./db.js";
import { sendReminder } from "./telegram/bot.js";

const INTERVAL_MS = 60_000;
let running = false;

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

    const due = getDueReminders();
    for (const reminder of due) {
      try {
        await sendReminder(config.allowedTelegramChatId, reminder.text);
        markReminderSent(reminder.id);
        console.log(`Sent reminder #${reminder.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        markReminderFailed(reminder.id, message);
        console.error(`Failed reminder #${reminder.id}:`, message);
      }
    }
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
