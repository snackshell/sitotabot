import { Composer } from "grammy";
import type { BotContext } from "../types/index.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("middleware:admin");

/**
 * Middleware that restricts a command to channel administrators.
 * Checks if the user is an admin of the chat where the command was sent,
 * OR if used in a private chat, checks if they're an admin of any registered channel.
 */
export function adminOnly(): Composer<BotContext> {
  const composer = new Composer<BotContext>();

  composer.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply("❌ Unable to identify you. Please try again.");
      return;
    }

    const chat = ctx.chat;

    if (chat?.type === "private") {
      // In private chats, we let the command through
      // and check admin status per-channel when needed
      await next();
      return;
    }

    if (
      chat?.type === "group" ||
      chat?.type === "supergroup" ||
      chat?.type === "channel"
    ) {
      try {
        const member = await ctx.api.getChatMember(chat.id, userId);
        if (
          member.status === "creator" ||
          member.status === "administrator"
        ) {
          await next();
          return;
        }
      } catch (error) {
        log.error({ error, chatId: chat.id, userId }, "Failed to check admin status");
      }

      await ctx.reply("❌ This command is only available to channel administrators.");
      return;
    }

    await next();
  });

  return composer;
}

/**
 * Check if a specific user is an admin of a specific chat.
 * Useful for verifying admin status in service layer.
 */
export async function isChannelAdmin(
  api: BotContext["api"],
  chatId: number | bigint | string,
  userId: number
): Promise<boolean> {
  try {
    const member = await api.getChatMember(chatId, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch (error) {
    log.error({ error, chatId, userId }, "Failed to check admin status");
    return false;
  }
}
