import { Composer } from "grammy";
import type { BotContext } from "../types/index.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("command:create-giveaway");

export const createGiveawayCommand = new Composer<BotContext>();

/**
 * /create_giveaway — Starts the interactive giveaway creation flow.
 * This command initiates the conversation defined in create-giveaway-flow.ts.
 */
createGiveawayCommand.command("create_giveaway", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  if (ctx.chat?.type !== "private") {
    await ctx.reply(
      "💬 Please use this command in a private chat with me.\nClick here: @" +
        (ctx.me?.username ?? "your_bot")
    );
    return;
  }

  log.info({ userId }, "Starting giveaway creation flow");

  // Enter the conversation
  await ctx.conversation.enter("createGiveawayFlow");
});
