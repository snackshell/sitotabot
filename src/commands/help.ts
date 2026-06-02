import { Composer } from "grammy";
import type { BotContext } from "../types/index.js";

export const helpCommand = new Composer<BotContext>();

helpCommand.command("help", async (ctx) => {
  const helpText = [
    `📖 <b>SitotaBot — Command Reference</b>`,
    ``,
    `<b>🔧 Admin Commands</b>`,
    ``,
    `/create_giveaway — Create a new giveaway`,
    `  Start an interactive wizard to set up a giveaway with prize, rules, channels, and timing.`,
    ``,
    `/end_giveaway — End a giveaway`,
    `  Immediately end an active giveaway and draw winners.`,
    `  Usage: <code>/end_giveaway [giveaway_id]</code>`,
    ``,
    `/reroll — Re-select winner(s)`,
    `  Pick new winners from the remaining participant pool.`,
    `  Usage: <code>/reroll [giveaway_id] [count]</code>`,
    ``,
    `/participants — View participants`,
    `  Show the count and eligibility breakdown for a giveaway.`,
    `  Usage: <code>/participants [giveaway_id]</code>`,
    ``,
    `/export — Download CSV`,
    `  Export participants or winners as a CSV file.`,
    `  Usage: <code>/export [giveaway_id] [participants|winners]</code>`,
    ``,
    `/status — Giveaway status`,
    `  View detailed status of a giveaway.`,
    `  Usage: <code>/status [giveaway_id]</code>`,
    ``,
    `<b>ℹ️ General</b>`,
    ``,
    `/start — Start the bot / Join a giveaway`,
    `/help — Show this help message`,
    ``,
    `<b>🔐 Fairness</b>`,
    `All winner selections use SHA-256 hash chaining for verifiable randomness. After each draw, a proof hash is published that anyone can independently verify.`,
    ``,
    `<b>💡 How to join a giveaway:</b>`,
    `Click the "Join Giveaway" button on the channel announcement, then verify your channel membership here.`,
    ``,
    `<i>Need help? Contact the channel admin.</i>`,
  ].join("\n");

  await ctx.reply(helpText, { parse_mode: "HTML" });
});
