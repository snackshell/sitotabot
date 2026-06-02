import type { Bot } from "grammy";
import type { BotContext } from "../types/index.js";
import { createChildLogger } from "../utils/logger.js";
import { GrammyError, HttpError } from "grammy";

const log = createChildLogger("error-handler");

/**
 * Register a global error handler on the bot.
 * Catches all unhandled errors from middleware and commands.
 */
export function registerErrorHandler(bot: Bot<BotContext>): void {
  bot.catch(async (err) => {
    const ctx = err.ctx;
    const error = err.error;

    // Log the error with context
    log.error(
      {
        updateId: ctx.update.update_id,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
      },
      "Unhandled error in bot"
    );

    // Determine user-friendly message
    let userMessage = "❌ An unexpected error occurred. Please try again later.";

    if (error instanceof GrammyError) {
      log.error(
        {
          description: error.description,
          errorCode: error.error_code,
          method: error.method,
        },
        "Telegram API error"
      );

      switch (error.error_code) {
        case 403:
          userMessage =
            "❌ I don't have permission to perform this action. Please check my admin rights.";
          break;
        case 429:
          userMessage =
            "⏳ Too many requests. Please wait a moment and try again.";
          break;
        case 400:
          if (error.description.includes("chat not found")) {
            userMessage =
              "❌ Channel not found. Please make sure I'm added as an admin to the channel.";
          } else if (error.description.includes("user not found")) {
            userMessage = "❌ User not found. They may have blocked the bot.";
          }
          break;
      }
    } else if (error instanceof HttpError) {
      log.error(
        { statusCode: error.error },
        "HTTP error communicating with Telegram"
      );
      userMessage =
        "❌ Network error communicating with Telegram. Please try again.";
    }

    // Try to reply with a user-friendly message
    try {
      await ctx.reply(userMessage);
    } catch (replyError) {
      log.error(
        { replyError },
        "Failed to send error message to user"
      );
    }
  });
}
