import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import { listActiveGiveaways, getGiveaway } from "../services/giveaway.service.js";
import { getParticipantCount } from "../services/participant.service.js";
import { escapeHtml } from "../utils/telegram.js";
import { formatDate } from "../utils/date.js";

export const giveawaysCommand = new Composer<BotContext>();

/**
 * Helper to generate active giveaways list message and markup.
 */
async function getGiveawaysListMarkup() {
  const active = await listActiveGiveaways();

  if (active.length === 0) {
    return {
      text: "📭 <b>No active giveaways at the moment.</b>\n\nCheck back later or ask channel owners to start one!",
      keyboard: null,
    };
  }

  const text = [
    `🎁 <b>Active Giveaways</b>`,
    `Here is a list of all active public giveaways you can participate in:`,
    ``,
    `Click on any giveaway to view details and join!`,
  ].join("\n");

  const keyboard = new InlineKeyboard();
  for (const g of active.slice(0, 10)) {
    const channelName = g.channel?.name ?? "Channel";
    keyboard.text(`🎁 ${g.prize} (${channelName})`, `view_active:${g.id}`).row();
  }

  return { text, keyboard };
}

/**
 * /giveaways command for users.
 */
giveawaysCommand.command("giveaways", async (ctx) => {
  const { text, keyboard } = await getGiveawaysListMarkup();
  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard ?? undefined,
  });
});

/**
 * Handle viewing a specific active giveaway from the list.
 */
giveawaysCommand.callbackQuery(/^view_active:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway || giveaway.status !== "active") {
    await ctx.answerCallbackQuery({
      text: "❌ Giveaway not found or is no longer active.",
      show_alert: true,
    });
    return;
  }

  const counts = await getParticipantCount(giveawayId);
  const channelName = giveaway.channel?.name ?? "Channel";

  const detailsText = [
    `🎁 <b>Giveaway: ${escapeHtml(giveaway.prize)}</b>`,
    ``,
    `📢 <b>Channel:</b> ${escapeHtml(channelName)}`,
    `⏰ <b>Ends:</b> ${formatDate(giveaway.endTime)}`,
    `🏆 <b>Winners:</b> ${giveaway.maxWinners}`,
    `👥 <b>Participants:</b> ${counts.total}`,
    ``,
    `<i>Join the channel first, then click the join button below!</i>`,
  ].join("\n");

  const keyboard = new InlineKeyboard()
    .text("🎉 Join Giveaway", `join_giveaway:${giveaway.id}`)
    .row();

  if (giveaway.channel?.username) {
    keyboard.url("📢 Open Channel", `https://t.me/${giveaway.channel.username}`).row();
  }

  keyboard.text("🔙 Back to List", "list_active_giveaways");

  await ctx.editMessageText(detailsText, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
});

/**
 * Handle returning to list.
 */
giveawaysCommand.callbackQuery("list_active_giveaways", async (ctx) => {
  const { text, keyboard } = await getGiveawaysListMarkup();
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: keyboard ?? undefined,
  });
  await ctx.answerCallbackQuery();
});
