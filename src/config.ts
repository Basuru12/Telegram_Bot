import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseVisaDigestTimes(): string[] {
  const raw = process.env.VISA_DIGEST_TIMES?.trim() || "09:00";
  const times = [
    ...new Set(
      raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];

  for (const t of times) {
    if (!TIME_RE.test(t)) {
      throw new Error(
        `Invalid VISA_DIGEST_TIMES entry "${t}" (expected HH:mm, comma-separated)`
      );
    }
  }

  return times.length > 0 ? times : ["09:00"];
}

const smtpUser = optional("SMTP_USER");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? "./data/reminders.db",
  tz: process.env.TZ ?? "Asia/Kolkata",
  visaDigestTimes: parseVisaDigestTimes(),
  telegram: {
    token: optional("TELEGRAM_BOT_TOKEN"),
  },
  allowedTelegramChatId: optional("ALLOWED_TELEGRAM_CHAT_ID"),
  visaDigestEmail: optional("VISA_DIGEST_EMAIL"),
  smtp: {
    host: optional("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT ?? 587),
    user: smtpUser,
    pass: optional("SMTP_PASS"),
    from: optional("SMTP_FROM") ?? smtpUser,
  },
};

export function isEmailConfigured(): boolean {
  return Boolean(
    config.visaDigestEmail &&
      config.smtp.host &&
      config.smtp.user &&
      config.smtp.pass
  );
}

export function assertTelegramConfigured(): { token: string } {
  return {
    token: required("TELEGRAM_BOT_TOKEN"),
  };
}
