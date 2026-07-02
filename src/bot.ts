import { Bot, session } from "grammy";
import { hydrate } from "@grammyjs/hydrate";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { BotContext } from "./types/index.js";
import { env } from "./env.js";

// Middleware
import { rateLimit } from "./middleware/rate-limit.js";
import { registerErrorHandler } from "./middleware/error-handler.js";

// Commands
import { startCommand } from "./commands/start.js";
import { helpCommand } from "./commands/help.js";
import { appCommand } from "./commands/app.js";
import { createGiveawayCommand } from "./commands/create-giveaway.js";
import { endGiveawayCommand } from "./commands/end-giveaway.js";
import { rerollCommand } from "./commands/reroll.js";
import { participantsCommand } from "./commands/participants.js";
import { exportCommand } from "./commands/export.js";
import { statusCommand } from "./commands/status.js";
import { giveawaysCommand } from "./commands/giveaways.js";

// Callbacks
import { joinGiveawayCallback } from "./callbacks/join-giveaway.js";

// Conversations
import { createGiveawayFlow } from "./conversations/create-giveaway-flow.js";

import { createChildLogger } from "./utils/logger.js";

const log = createChildLogger("bot");

/**
 * Create and configure the bot instance.
 */
export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // ─── Register error handler ───
  registerErrorHandler(bot);

  // ─── Plugins ───
  bot.use(hydrate());
  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());
  bot.command("cancel", async (ctx, next) => {
    if (ctx.conversation.active("createGiveawayFlow") === 0) {
      await next();
      return;
    }

    await ctx.conversation.exit("createGiveawayFlow");
    await ctx.reply("❌ Giveaway creation cancelled.");
  });
  bot.use(createConversation(createGiveawayFlow, "createGiveawayFlow"));

  // ─── Middleware ───
  bot.use(
    rateLimit({
      windowMs: 60_000,
      maxRequests: 30,
    })
  );

  // ─── Commands ───
  bot.use(startCommand);
  bot.use(helpCommand);
  bot.use(appCommand);
  bot.use(createGiveawayCommand);
  bot.use(endGiveawayCommand);
  bot.use(rerollCommand);
  bot.use(participantsCommand);
  bot.use(exportCommand);
  bot.use(statusCommand);
  bot.use(giveawaysCommand);

  // ─── Callbacks ───
  bot.use(joinGiveawayCallback);

  // ─── Set bot commands menu ───
  bot.api.setMyCommands([
    { command: "start", description: "Start the bot / Join a giveaway" },
    { command: "app", description: "Open the Mini App dashboard" },
    { command: "giveaways", description: "List all active public giveaways" },
    { command: "create_giveaway", description: "Create a new giveaway" },
    { command: "status", description: "View giveaway status" },
    { command: "participants", description: "View participant count" },
    { command: "end_giveaway", description: "End a giveaway early" },
    { command: "reroll", description: "Re-select winners" },
    { command: "export", description: "Download CSV data" },
    { command: "help", description: "Show command reference" },
  ]).catch((err) => {
    log.warn({ error: err }, "Failed to set bot commands menu");
  });

  log.info("Bot instance created and configured");

  return bot;
}
