import { formatInTimeZone } from "date-fns-tz";
import { config } from "./config.js";
import {
  getDueReminders,
  listUnfinishedVisaDocuments,
  markReminderFailed,
  markReminderSent,
  markVisaDigestSent,
  wasVisaDigestSent,
  type VisaDocument,
} from "./db.js";
import { sendReminder, sendTextMessage } from "./telegram/bot.js";

const INTERVAL_MS = 60_000;
let running = false;

function formatVisaDueLabel(dueDate: string): string {
  return new Date(`${dueDate}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatVisaDueLine(doc: VisaDocument, todayKey: string): string {
  if (!doc.due_date) {
    return `• ${doc.title}`;
  }

  const dueLabel = formatVisaDueLabel(doc.due_date);

  if (doc.due_date < todayKey) {
    return `• ${doc.title} — overdue (was ${dueLabel})`;
  }
  if (doc.due_date === todayKey) {
    return `• ${doc.title} — due today`;
  }
  return `• ${doc.title} — due ${dueLabel}`;
}

function buildVisaDigestMessage(
  docs: VisaDocument[],
  todayKey: string
): string {
  const lines = docs.map((d) => formatVisaDueLine(d, todayKey));
  return `Visa prep — ${docs.length} open\n${lines.join("\n")}`;
}

async function maybeSendVisaDigest(chatId: string): Promise<void> {
  const now = new Date();
  const localHm = formatInTimeZone(now, config.tz, "HH:mm");
  const todayKey = formatInTimeZone(now, config.tz, "yyyy-MM-dd");

  if (!config.visaDigestTimes.includes(localHm)) {
    return;
  }

  const digestKey = `${todayKey}T${localHm}`;
  if (wasVisaDigestSent(digestKey)) {
    return;
  }

  const unfinished = listUnfinishedVisaDocuments();
  if (unfinished.length === 0) {
    markVisaDigestSent(digestKey);
    console.log(`Visa digest ${digestKey}: nothing open, skipped`);
    return;
  }

  try {
    await sendTextMessage(
      chatId,
      buildVisaDigestMessage(unfinished, todayKey)
    );
    markVisaDigestSent(digestKey);
    console.log(
      `Sent visa digest ${digestKey} (${unfinished.length} open)`
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

    await maybeSendVisaDigest(chatId);
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
