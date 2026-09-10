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

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? "./data/reminders.db",
  tz: process.env.TZ ?? "Asia/Kolkata",
  telegram: {
    token: optional("TELEGRAM_BOT_TOKEN"),
  },
  allowedTelegramChatId: optional("ALLOWED_TELEGRAM_CHAT_ID"),
};

export function assertTelegramConfigured(): { token: string } {
  return {
    token: required("TELEGRAM_BOT_TOKEN"),
  };
}
