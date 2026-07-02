import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  deleteGiveaway,
  getGiveaway,
  listGiveawaysByCreator,
  updateGiveawayEndTime,
} from "../services/giveaway.service.js";
import { getParticipantCount } from "../services/participant.service.js";
import { getWinners } from "../services/winner.service.js";
import {
  announceGiveaway,
  announceGiveawayStatus,
  announceWinners,
  notifyCreatorWinners,
  notifyWinners,
} from "../services/notification.service.js";
import { escapeHtml, formatGiveawayStatus } from "../utils/telegram.js";
import { createChildLogger } from "../utils/logger.js";
import { cancelSchedule, scheduleGiveawayEnd } from "../services/scheduler.service.js";
import { formatDate, parseUserDate } from "../utils/date.js";

const log = createChildLogger("command:status");

export const statusCommand = new Composer<BotContext>();

async function getCreatorGiveaway(ctx: BotContext, giveawayId: string) {
  const giveaway = await getGiveaway(giveawayId);
  const requesterId = ctx.from?.id ? BigInt(ctx.from.id) : null;

  if (!giveaway || requesterId === null || giveaway.creator?.telegramId !== requesterId) {
    return null;
  }

  return giveaway;
}

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

statusCommand.on("message:text", async (ctx, next) => {
  const giveawayId = ctx.session.pendingExtendGiveawayId;
  if (!giveawayId) {
    await next();
    return;
  }

  const text = ctx.message.text.trim();
  if (text === "/cancel") {
    delete ctx.session.pendingExtendGiveawayId;
    await ctx.reply("Giveaway extension cancelled.");
    return;
  }

  const giveaway = await getCreatorGiveaway(ctx, giveawayId);
  if (!giveaway) {
    delete ctx.session.pendingExtendGiveawayId;
    await ctx.reply("Giveaway not found or you no longer have access to it.");
    return;
  }

  if (giveaway.status !== "active") {
    delete ctx.session.pendingExtendGiveawayId;
    await ctx.reply("Only active giveaways can be extended.");
    return;
  }

  const newEndTime = parseUserDate(text);
  if (!newEndTime) {
    await ctx.reply(
      "Invalid date. Send the new end date as YYYY-MM-DD HH:MM in Ethiopian time, or /cancel."
    );
    return;
  }

  if (newEndTime.getTime() <= Date.now()) {
    await ctx.reply("The new end time must be in the future. Send another date or /cancel.");
    return;
  }

  if (newEndTime.getTime() <= giveaway.endTime.getTime()) {
    await ctx.reply(
      `The new end time must be later than the current end time: ${formatDate(giveaway.endTime)}`
    );
    return;
  }

  await updateGiveawayEndTime(giveawayId, newEndTime);
  const updatedGiveaway = await getGiveaway(giveawayId);
  if (updatedGiveaway) {
    scheduleGiveawayEnd(updatedGiveaway, ctx.api);
  }

  delete ctx.session.pendingExtendGiveawayId;
  await ctx.reply(
    [
      `<b>Giveaway extended.</b>`,
      ``,
      `<b>${escapeHtml(giveaway.prize)}</b>`,
      `New end: ${formatDate(newEndTime)}`,
    ].join("\n"),
    { parse_mode: "HTML" }
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
  if (giveaway.status === "active" && isCreator) {
    keyboard
      .text("Extend End Time", `extend_giveaway:${giveaway.id}`)
      .row()
      .text("Post Giveaway Again", `post_giveaway:${giveaway.id}`)
      .row();
  }
  if (isCreator) {
    keyboard.text("Post Status Update", `post_status:${giveaway.id}`).row();
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

statusCommand.callbackQuery(/^extend_giveaway:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getCreatorGiveaway(ctx, giveawayId);

  if (!giveaway) {
    await ctx.answerCallbackQuery({
      text: "You can only extend your own giveaways.",
      show_alert: true,
    });
    return;
  }

  if (giveaway.status !== "active") {
    await ctx.answerCallbackQuery({
      text: "Only active giveaways can be extended.",
      show_alert: true,
    });
    return;
  }

  ctx.session.pendingExtendGiveawayId = giveawayId;
  await ctx.reply(
    [
      `<b>Extend Giveaway End Time</b>`,
      ``,
      `<b>${escapeHtml(giveaway.prize)}</b>`,
      `Current end: ${formatDate(giveaway.endTime)}`,
      ``,
      `Send the new end date in Ethiopian time:`,
      `<code>YYYY-MM-DD HH:MM</code>`,
      ``,
      `Send /cancel to stop.`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );
  await ctx.answerCallbackQuery();
});

statusCommand.callbackQuery(/^post_giveaway:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getCreatorGiveaway(ctx, giveawayId);

  if (!giveaway) {
    await ctx.answerCallbackQuery({
      text: "You can only post your own giveaways.",
      show_alert: true,
    });
    return;
  }

  if (giveaway.status !== "active") {
    await ctx.answerCallbackQuery({
      text: "Only active giveaways can be announced again.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery("Posting giveaway announcement...");
  const botInfo = await ctx.api.getMe();
  const messageId = await announceGiveaway(ctx.api, giveaway, botInfo.username);
  await ctx.reply(
    messageId
      ? "Giveaway announcement posted to the channel."
      : "Could not post the giveaway announcement. Check bot channel permissions."
  );
});

statusCommand.callbackQuery(/^post_status:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getCreatorGiveaway(ctx, giveawayId);

  if (!giveaway) {
    await ctx.answerCallbackQuery({
      text: "You can only post status for your own giveaways.",
      show_alert: true,
    });
    return;
  }

  const counts = await getParticipantCount(giveawayId);
  const winnersList = await getWinners(giveawayId);

  await ctx.answerCallbackQuery("Posting status update...");
  const posted = await announceGiveawayStatus(
    ctx.api,
    giveaway,
    counts.total,
    winnersList.length
  );
  await ctx.reply(
    posted
      ? "Giveaway status posted to the channel."
      : "Could not post the status update. Check bot channel permissions."
  );
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
