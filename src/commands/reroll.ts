import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  getGiveaway,
  listGiveawaysByCreator,
} from "../services/giveaway.service.js";
import { rerollWinners } from "../services/winner.service.js";
import { announceWinners, notifyWinners } from "../services/notification.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("command:reroll");

export const rerollCommand = new Composer<BotContext>();

rerollCommand.command("reroll", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = ctx.match?.toString().trim().split(/\s+/);
  const giveawayId = args?.[0];
  const count = args?.[1] ? parseInt(args[1], 10) : 1;

  if (giveawayId) {
    await promptConfirmReroll(ctx, giveawayId, count);
    return;
  }

  // Show list of ended giveaways
  const giveawayList = await listGiveawaysByCreator(BigInt(userId));
  const ended = giveawayList.filter((g) => g.status === "ended");

  if (ended.length === 0) {
    await ctx.reply("📭 No ended giveaways available for reroll.");
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const g of ended.slice(0, 10)) {
    keyboard.text(`🔄 ${g.prize.substring(0, 35)}`, `reroll:${g.id}`).row();
  }

  await ctx.reply(
    `🔄 <b>Reroll Winners</b>\n\nSelect a giveaway to reroll:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
});

async function promptConfirmReroll(
  ctx: BotContext,
  giveawayId: string,
  count: number = 1
): Promise<void> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    await ctx.reply("❌ Giveaway not found.");
    return;
  }

  if (giveaway.status !== "ended") {
    await ctx.reply("❌ Can only reroll ended giveaways.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(
      `✅ Reroll ${count} winner(s)`,
      `confirm_reroll:${giveawayId}:${count}`
    )
    .text("❌ Cancel", `cancel_reroll:${giveawayId}`);

  await ctx.reply(
    [
      `🔄 <b>Reroll Winners?</b>`,
      ``,
      `🎁 <b>${giveaway.prize}</b>`,
      `🔢 Selecting: ${count} new winner(s)`,
      ``,
      `Previous winners will be excluded from the new draw.`,
      `A new fairness proof will be generated.`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

// Handle reroll button from status view
rerollCommand.callbackQuery(/^reroll:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  await promptConfirmReroll(ctx, giveawayId);
  await ctx.answerCallbackQuery();
});

// Handle confirmation
rerollCommand.callbackQuery(
  /^confirm_reroll:(.+):(\d+)$/,
  async (ctx) => {
    const giveawayId = ctx.match![1]!;
    const count = parseInt(ctx.match![2]!, 10);

    await ctx.answerCallbackQuery("⏳ Rerolling...");

    try {
      const result = await rerollWinners(giveawayId, count, "Admin reroll");

      if (!result) {
        await ctx.editMessageText(
          "❌ Could not reroll. No remaining participants in the pool."
        );
        return;
      }

      const giveaway = await getGiveaway(giveawayId);
      if (!giveaway) return;

      // Announce new winners
      await announceWinners(ctx.api, giveaway, result.newWinners);

      // DM new winners
      const dmResult = await notifyWinners(ctx.api, giveaway, result.newWinners);

      const winnerNames = result.newWinners
        .map(
          (w) =>
            `  #${w.position}: ${w.user.username ? `@${w.user.username}` : w.user.firstName}`
        )
        .join("\n");

      await ctx.editMessageText(
        [
          `🔄 <b>Reroll Complete!</b>`,
          ``,
          `🏆 <b>New Winners:</b>`,
          winnerNames,
          ``,
          `📬 DM: ${dmResult.notified} sent, ${dmResult.failed} failed`,
          `🔐 New Proof: <code>${result.proof.combinedHash.substring(0, 32)}...</code>`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );

      log.info(
        { giveawayId, newWinners: result.newWinners.length },
        "Reroll completed"
      );
    } catch (error) {
      log.error({ error, giveawayId }, "Error during reroll");
      await ctx.editMessageText("❌ An error occurred during the reroll.");
    }
  }
);

// Handle cancel
rerollCommand.callbackQuery(/^cancel_reroll:(.+)$/, async (ctx) => {
  await ctx.editMessageText("✅ Reroll cancelled.");
  await ctx.answerCallbackQuery();
});
