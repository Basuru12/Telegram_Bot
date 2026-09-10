import { Bot } from "grammy";
import { config } from "../config.js";
import { handleIncomingMessage } from "../parser.js";

let bot: Bot | null = null;

function getBot(): Bot {
  if (!bot) {
    throw new Error("Telegram bot is not started. Call startBot() first.");
  }
  return bot;
}

function isAllowedChat(chatId: number): boolean {
  const allowed = config.allowedTelegramChatId;
  if (!allowed) return false;
  return String(chatId) === allowed;
}

export async function sendTextMessage(
  chatId: string | number,
  text: string
): Promise<void> {
  await getBot().api.sendMessage(chatId, text);
}

export async function sendReminder(
  chatId: string | number,
  reminderText: string
): Promise<void> {
  await sendTextMessage(chatId, `⏰ Reminder: ${reminderText}`);
}

export function startBot(): Bot | null {
  const token = config.telegram.token;
  if (!token) {
    console.warn(
      "TELEGRAM_BOT_TOKEN not set — web UI works; Telegram send/receive disabled until configured."
    );
    return null;
  }

  bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const chatId = ctx.chat.id;
    if (!isAllowedChat(chatId)) {
      console.log(
        `Telegram chat id ${chatId} messaged /start (not allowlisted). Set ALLOWED_TELEGRAM_CHAT_ID=${chatId} to allow.`
      );
      await ctx.reply(
        "This bot is private. Ask the owner to allowlist your chat id."
      );
      return;
    }
    const result = handleIncomingMessage("/start");
    if (result.kind === "reply") {
      await ctx.reply(result.text);
    }
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    if (!isAllowedChat(chatId)) {
      console.warn(`Ignoring message from non-allowlisted chat: ${chatId}`);
      return;
    }

    // /start is handled by bot.command above; skip duplicate handling
    if (ctx.message.text.trim().toLowerCase() === "/start") {
      return;
    }

    try {
      const result = handleIncomingMessage(ctx.message.text);
      if (result.kind === "reply") {
        await ctx.reply(result.text);
      }
    } catch (err) {
      console.error("Failed handling inbound Telegram message:", err);
      try {
        await ctx.reply(
          "Something went wrong saving that reminder. Please try again."
        );
      } catch (sendErr) {
        console.error("Failed sending error reply:", sendErr);
      }
    }
  });

  bot.catch((err) => {
    console.error("Telegram bot error:", err.error);
  });

  void bot.start({
    onStart: (info) => {
      console.log(`Telegram bot @${info.username} started (long polling)`);
      if (!config.allowedTelegramChatId) {
        console.warn(
          "ALLOWED_TELEGRAM_CHAT_ID not set — inbound messages ignored; send /start to see your chat id in logs."
        );
      }
    },
  });

  return bot;
}
