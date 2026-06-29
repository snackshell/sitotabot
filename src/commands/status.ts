import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  deleteGiveaway,
  getGiveaway,
  listGiveawaysByCreator,
} from "../services/giveaway.service.js";
import { getParticipantCount } from "../services/participant.service.js";
import { getWinners } from "../services/winner.service.js";
import {
  announceWinners,
  notifyCreatorWinners,
  notifyWinners,
} from "../services/notification.service.js";
import { escapeHtml, formatGiveawayStatus } from "../utils/telegram.js";
import { createChildLogger } from "../utils/logger.js";
import { cancelSchedule } from "../services/scheduler.service.js";

const log = createChildLogger("command:status");

export const statusCommand = new Composer<BotContext>();

statusCommand.command("status", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = ctx.match?.toString().trim();

  if (args) {
    // Show specific giveaway status
    await showGiveawayStatus(ctx, args);
    return;
  }

  // Show list of user's giveaways
  const giveawayList = await listGiveawaysByCreator(BigInt(userId));

  if (giveawayList.length === 0) {
    await ctx.reply(
      "📭 You haven't created any giveaways yet.\nUse /create_giveaway to get started!"
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const g of giveawayList.slice(0, 10)) {
    const statusEmoji =
      g.status === "active"
        ? "🟢"
        : g.status === "ended"
        ? "🏁"
        : g.status === "draft"
        ? "📝"
        : "❌";
    const label = `${statusEmoji} ${g.prize.substring(0, 30)}`;
    keyboard.text(label, `status:${g.id}`).row();
  }

  await ctx.reply(
    `📊 <b>Your Giveaways</b>\n\nSelect a giveaway to view its status:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
});

async function showGiveawayStatus(
  ctx: BotContext,
  giveawayId: string
): Promise<void> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    await ctx.reply("❌ Giveaway not found.");
    return;
  }

  const counts = await getParticipantCount(giveawayId);
  const winnersList = await getWinners(giveawayId);

  const requesterId = ctx.from?.id ? BigInt(ctx.from.id) : null;
  const isCreator =
    requesterId !== null && giveaway.creator?.telegramId === requesterId;
  const canViewWinners =
    giveaway.status === "ended" &&
    winnersList.length > 0 &&
    (isCreator || giveaway.winnersPublic);

  const winnerLines = canViewWinners
    ? [
        ``,
        `<b>Winners:</b>`,
        ...winnersList.map((winner) => {
          const label = winner.user.username
            ? `@${winner.user.username}`
            : winner.user.firstName;
          return `#${winner.position}: ${escapeHtml(label)}`;
        }),
      ]
    : giveaway.status === "ended" && winnersList.length > 0
    ? [``, `<i>Winners are private for this giveaway.</i>`]
    : [];

  const message = [
    formatGiveawayStatus(giveaway, counts.total, winnersList.length),
    ...winnerLines,
  ].join("\n");

  const keyboard = new InlineKeyboard();
  if (giveaway.status === "active") {
    keyboard.text("🏁 End Now", `end:${giveaway.id}`).row();
  }
  if (giveaway.status === "ended" && winnersList.length > 0) {
    keyboard.text("🔄 Reroll", `reroll:${giveaway.id}`).row();
  }
  if (isCreator && giveaway.status === "ended" && winnersList.length > 0) {
    keyboard.text("Retry Notifications", `retry_notifications:${giveaway.id}`).row();
  }
  keyboard.text("📥 Export", `export_menu:${giveaway.id}`);

  if (isCreator && ["ended", "cancelled"].includes(giveaway.status)) {
    keyboard.row().text("Delete", `delete_giveaway:${giveaway.id}`);
  }

  await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
}

// Handle status callback buttons
statusCommand.callbackQuery(/^status:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  await showGiveawayStatus(ctx, giveawayId);
  await ctx.answerCallbackQuery();
});

statusCommand.callbackQuery(/^delete_giveaway:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getGiveaway(giveawayId);
  const requesterId = ctx.from?.id ? BigInt(ctx.from.id) : null;

  if (!giveaway || requesterId === null || giveaway.creator?.telegramId !== requesterId) {
    await ctx.answerCallbackQuery({
      text: "You can only delete your own giveaways.",
      show_alert: true,
    });
    return;
  }

  if (!["ended", "cancelled"].includes(giveaway.status)) {
    await ctx.answerCallbackQuery({
      text: "Only ended or cancelled giveaways can be deleted.",
      show_alert: true,
    });
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("Confirm Delete", `confirm_delete_giveaway:${giveawayId}`)
    .text("Cancel", `status:${giveawayId}`);

  await ctx.editMessageText(
    [
      `<b>Delete giveaway?</b>`,
      ``,
      `<b>${escapeHtml(giveaway.prize)}</b>`,
      ``,
      `This removes it from your giveaway list and deletes its participant and winner records.`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
});

statusCommand.callbackQuery(/^confirm_delete_giveaway:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getGiveaway(giveawayId);
  const requesterId = ctx.from?.id ? BigInt(ctx.from.id) : null;

  if (!giveaway || requesterId === null || giveaway.creator?.telegramId !== requesterId) {
    await ctx.answerCallbackQuery({
      text: "You can only delete your own giveaways.",
      show_alert: true,
    });
    return;
  }

  if (!["ended", "cancelled"].includes(giveaway.status)) {
    await ctx.answerCallbackQuery({
      text: "Only ended or cancelled giveaways can be deleted.",
      show_alert: true,
    });
    return;
  }

  cancelSchedule(giveawayId);
  await deleteGiveaway(giveawayId);
  await ctx.editMessageText("Deleted. This giveaway is no longer in your list.");
  await ctx.answerCallbackQuery();
});

statusCommand.callbackQuery(/^retry_notifications:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getGiveaway(giveawayId);
  const requesterId = ctx.from?.id ? BigInt(ctx.from.id) : null;

  if (!giveaway || requesterId === null || giveaway.creator?.telegramId !== requesterId) {
    await ctx.answerCallbackQuery({
      text: "You can only retry notifications for your own giveaways.",
      show_alert: true,
    });
    return;
  }

  if (giveaway.status !== "ended") {
    await ctx.answerCallbackQuery({
      text: "Only ended giveaways can retry winner notifications.",
      show_alert: true,
    });
    return;
  }

  const winnersList = await getWinners(giveawayId);
  if (winnersList.length === 0) {
    await ctx.answerCallbackQuery({
      text: "No winners found for this giveaway.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery("Retrying notifications...");

  if (giveaway.winnersPublic) {
    await announceWinners(ctx.api, giveaway, winnersList);
  }

  const dmResult = await notifyWinners(ctx.api, giveaway, winnersList);
  await notifyCreatorWinners(ctx.api, giveaway, winnersList);

  await ctx.editMessageText(
    [
      `<b>Winner notifications retried.</b>`,
      ``,
      `Winner DMs sent: ${dmResult.notified}`,
      `Winner DMs failed: ${dmResult.failed}`,
      giveaway.winnersPublic
        ? `Channel announcement: attempted`
        : `Channel announcement: skipped because winners are private`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});
