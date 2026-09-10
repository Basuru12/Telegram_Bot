import * as chrono from "chrono-node";
import { fromZonedTime } from "date-fns-tz";
import { config } from "./config.js";
import {
  cancelReminder,
  createReminder,
  listUpcoming,
  type Reminder,
} from "./db.js";

export type ParseResult =
  | { kind: "reply"; text: string }
  | { kind: "noop" };

const HELP = `Telegram Reminder Assistant

Commands:
• remind me to <text> in 20m
• remind me to <text> at 3:30pm
• remind me to <text> tomorrow 9am
• list
• cancel <id>
• help`;

function formatDue(dueAtIso: string): string {
  return new Date(dueAtIso).toLocaleString("en-IN", {
    timeZone: config.tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatReminder(r: Reminder): string {
  return `#${r.id} — ${r.text} (${formatDue(r.due_at)})`;
}

function parseRelativeIn(raw: string): Date | null {
  const match = raw.match(
    /\bin\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b/i
  );
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  let multiplier = 60 * 1000;
  if (unit.startsWith("h")) multiplier = 60 * 60 * 1000;
  else if (unit.startsWith("d")) multiplier = 24 * 60 * 60 * 1000;

  return new Date(Date.now() + amount * multiplier);
}

function extractRemindPayload(message: string): {
  text: string;
  dueAt: Date;
} | null {
  const trimmed = message.trim();
  const remindMatch = trimmed.match(
    /^(?:remind(?:\s+me)?(?:\s+to)?)\s+(.+)$/i
  );
  if (!remindMatch) return null;

  let body = remindMatch[1].trim();

  // Prefer explicit "in Xm"
  const inMatch = body.match(
    /^(.*)\s+in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\s*$/i
  );
  if (inMatch) {
    const text = inMatch[1].replace(/\s+to\s*$/i, "").trim();
    const dueAt = parseRelativeIn(`in ${inMatch[2]}${inMatch[3]}`);
    if (text && dueAt) return { text, dueAt };
  }

  // "at ..." or chrono natural language on the whole body
  const atSplit = body.match(/^(.*?)\s+(?:at|on)\s+(.+)$/i);
  const timePart = atSplit ? atSplit[2] : body;
  const textPart = atSplit
    ? atSplit[1].replace(/\s+to\s*$/i, "").trim()
    : null;

  const ref = new Date();
  const parsed = chrono.parse(timePart, ref, { forwardDate: true });
  if (parsed.length === 0) {
    // Try parsing entire body with chrono (e.g. "buy milk tomorrow 9am")
    const full = chrono.parse(body, ref, { forwardDate: true });
    if (full.length === 0) return null;

    const result = full[0];
    const text = body
      .slice(0, result.index)
      .replace(/\s+to\s*$/i, "")
      .trim();
    if (!text) return null;

    const dueAt = resolveChronoDate(result);
    if (!dueAt || dueAt.getTime() <= Date.now()) {
      return null;
    }
    return { text, dueAt };
  }

  const result = parsed[0];
  let text =
    textPart ??
    body
      .slice(0, result.index)
      .replace(/\s+to\s*$/i, "")
      .trim();

  // If we used atSplit, text is already set; if chrono matched from start, text may be empty
  if (!text && atSplit) {
    text = atSplit[1].replace(/\s+to\s*$/i, "").trim();
  }
  if (!text) return null;

  const dueAt = resolveChronoDate(result);
  if (!dueAt || dueAt.getTime() <= Date.now()) {
    return null;
  }

  return { text, dueAt };
}

function resolveChronoDate(result: chrono.ParsedResult): Date | null {
  const date = result.start.date();
  if (result.start.isCertain("timezoneOffset")) {
    return date;
  }

  // Interpret wall-clock components in configured TZ
  const year = result.start.get("year") ?? date.getFullYear();
  const month = result.start.get("month") ?? date.getMonth() + 1;
  const day = result.start.get("day") ?? date.getDate();
  const hour = result.start.get("hour") ?? date.getHours();
  const minute = result.start.get("minute") ?? date.getMinutes();
  const second = result.start.get("second") ?? 0;

  const y = String(year);
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  return fromZonedTime(`${y}-${m}-${d}T${hh}:${mm}:${ss}`, config.tz);
}

export function handleIncomingMessage(message: string): ParseResult {
  const text = message.trim();
  if (!text) return { kind: "noop" };

  const lower = text.toLowerCase();

  if (
    lower === "help" ||
    lower === "?" ||
    lower === "hi" ||
    lower === "hello" ||
    lower === "/start" ||
    lower === "/help"
  ) {
    return { kind: "reply", text: HELP };
  }

  if (lower === "list" || lower === "reminders" || lower === "/list") {
    const upcoming = listUpcoming(15);
    if (upcoming.length === 0) {
      return { kind: "reply", text: "No upcoming reminders." };
    }
    return {
      kind: "reply",
      text: `Upcoming reminders:\n${upcoming.map(formatReminder).join("\n")}`,
    };
  }

  const cancelMatch = text.match(/^\/?cancel\s+#?(\d+)\s*$/i);
  if (cancelMatch) {
    const id = Number(cancelMatch[1]);
    const cancelled = cancelReminder(id);
    if (!cancelled) {
      return {
        kind: "reply",
        text: `Could not cancel #${id}. It may not exist or is not pending.`,
      };
    }
    return { kind: "reply", text: `Cancelled #${id}: ${cancelled.text}` };
  }

  const payload = extractRemindPayload(text);
  if (payload) {
    const reminder = createReminder({
      text: payload.text,
      dueAt: payload.dueAt,
      source: "telegram",
    });
    return {
      kind: "reply",
      text: `Got it. Reminder #${reminder.id}: "${reminder.text}" at ${formatDue(reminder.due_at)}`,
    };
  }

  return {
    kind: "reply",
    text: `Sorry, I didn't understand that.\n\n${HELP}`,
  };
}
