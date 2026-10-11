import { formatInTimeZone } from "date-fns-tz";
import { config } from "./config.js";
import { listUnfinishedVisaDocuments, type VisaDocument } from "./db.js";
import { sendTextMessage } from "./telegram/bot.js";

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

export function todayKeyInTz(now = new Date()): string {
  return formatInTimeZone(now, config.tz, "yyyy-MM-dd");
}

export function listActiveVisaDocuments(todayKey = todayKeyInTz()): VisaDocument[] {
  return listUnfinishedVisaDocuments().filter(
    (d) =>
      d.start_date &&
      d.due_date &&
      d.start_date <= todayKey &&
      todayKey <= d.due_date
  );
}

export function buildVisaDigestMessage(
  docs: VisaDocument[],
  todayKey: string
): string {
  const lines = docs.map((d) => formatVisaDueLine(d, todayKey));
  return `Visa prep — ${docs.length} open\n${lines.join("\n")}`;
}

export async function sendVisaDigestNow(options?: {
  test?: boolean;
}): Promise<{ sent: true; count: number; text: string }> {
  if (!config.telegram.token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  const chatId = config.allowedTelegramChatId;
  if (!chatId) {
    throw new Error("ALLOWED_TELEGRAM_CHAT_ID is not configured");
  }

  const todayKey = todayKeyInTz();
  const active = listActiveVisaDocuments(todayKey);
  const body =
    active.length > 0
      ? buildVisaDigestMessage(active, todayKey)
      : "Visa digest OK — no documents active today.";
  const text = options?.test ? `[Test]\n${body}` : body;

  await sendTextMessage(chatId, text);
  return { sent: true, count: active.length, text };
}
