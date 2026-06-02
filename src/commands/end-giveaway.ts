import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  getGiveaway,
  updateGiveawayStatus,
  listGiveawaysByCreator,
} from "../services/giveaway.service.js";
import { drawWinners, getWinners } from "../services/winner.service.js";
import { announceWinners, notifyWinners } from "../services/notification.service.js";
import { cancelSchedule } from "../services/scheduler.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("command:end-giveaway");

export const endGiveawayCommand = new Composer<BotContext>();

endGiveawayCommand.command("end_giveaway", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = ctx.match?.toString().trim();

  if (args) {
    // End specific giveaway
    await promptConfirmEnd(ctx, args);
    return;
  }

  // Show list of active giveaways
  const giveawayList = await listGiveawaysByCreator(BigInt(userId));
  const active = giveawayList.filter((g) => g.status === "active");

  if (active.length === 0) {
    await ctx.reply("📭 No active giveaways to end.");
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const g of active.slice(0, 10)) {
    keyboard.text(`🏁 ${g.prize.substring(0, 35)}`, `end:${g.id}`).row();
  }

  await ctx.reply(
    `🏁 <b>End a Giveaway</b>\n\nSelect the giveaway you want to end:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
});

async function promptConfirmEnd(
  ctx: BotContext,
  giveawayId: string
): Promise<void> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    await ctx.reply("❌ Giveaway not found.");
    return;
  }

  if (giveaway.status !== "active") {
    await ctx.reply(`❌ This giveaway is not active (status: ${giveaway.status}).`);
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("✅ Yes, End & Draw Winners", `confirm_end:${giveawayId}`)
    .text("❌ Cancel", `cancel_end:${giveawayId}`);

  await ctx.reply(
    [
      `⚠️ <b>End Giveaway?</b>`,
      ``,
      `🎁 <b>${giveaway.prize}</b>`,
      ``,
      `This will immediately:`,
      `• Lock the participant pool`,
      `• Draw winner(s)`,
      `• Announce results in the channel`,
      `• Notify winners via DM`,
      ``,
      `<b>This action cannot be undone.</b>`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

// Handle end button from status view
endGiveawayCommand.callbackQuery(/^end:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  await promptConfirmEnd(ctx, giveawayId);
  await ctx.answerCallbackQuery();
});

// Handle confirmation
endGiveawayCommand.callbackQuery(/^confirm_end:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  await ctx.answerCallbackQuery("⏳ Ending giveaway...");

  try {
    // Cancel any scheduled auto-end
    cancelSchedule(giveawayId);

    // Draw winners
    const result = await drawWinners(giveawayId);

    if (!result) {
      await ctx.editMessageText(
        "🏁 Giveaway ended, but no eligible participants were found."
      );
      return;
    }

    const giveaway = await getGiveaway(giveawayId);
    if (!giveaway) return;

    // Announce winners in channel
    await announceWinners(ctx.api, giveaway, result.winnerUsers);

    // DM winners
    const dmResult = await notifyWinners(ctx.api, giveaway, result.winnerUsers);

    const winnerNames = result.winnerUsers
      .map(
        (w) =>
          `  #${w.position}: ${w.user.username ? `@${w.user.username}` : w.user.firstName}`
      )
      .join("\n");

    await ctx.editMessageText(
      [
        `🏁 <b>Giveaway Ended!</b>`,
        ``,
        `🎁 <b>${giveaway.prize}</b>`,
        ``,
        `🏆 <b>Winners:</b>`,
        winnerNames,
        ``,
        `📬 DM Notifications: ${dmResult.notified} sent, ${dmResult.failed} failed`,
        `🔐 Proof Hash: <code>${giveaway.proofHash ?? "N/A"}</code>`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    log.info({ giveawayId, winners: result.winnerUsers.length }, "Giveaway ended via command");
  } catch (error) {
    log.error({ error, giveawayId }, "Error ending giveaway");
    await ctx.editMessageText("❌ An error occurred while ending the giveaway. Please try again.");
  }
});

// Handle cancel
endGiveawayCommand.callbackQuery(/^cancel_end:(.+)$/, async (ctx) => {
  await ctx.editMessageText("✅ Giveaway end cancelled. The giveaway is still active.");
  await ctx.answerCallbackQuery();
});
