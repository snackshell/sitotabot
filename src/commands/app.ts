import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import { env } from "../env.js";

export const appCommand = new Composer<BotContext>();

appCommand.command("app", async (ctx) => {
  if (!env.MINI_APP_URL) {
    await ctx.reply(
      [
        "The Mini App is not configured yet.",
        "",
        "Set MINI_APP_URL to the public HTTPS URL where web/index.html is hosted.",
      ].join("\n")
    );
    return;
  }

  const keyboard = new InlineKeyboard().webApp("Open Mini App", env.MINI_APP_URL);

  await ctx.reply(
    [
      "<b>SitotaBot Mini App</b>",
      "",
      "Open the visual dashboard to browse giveaways, check eligibility, and manage flows with a richer interface.",
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: keyboard }
  );
});
