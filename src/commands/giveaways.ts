import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  getGiveaway,
  getGiveawayChannels,
  listActiveGiveaways,
  listPublicEndedGiveaways,
} from "../services/giveaway.service.js";
import { getParticipantCount } from "../services/participant.service.js";
import { getWinners } from "../services/winner.service.js";
import { escapeHtml } from "../utils/telegram.js";
import { formatDate } from "../utils/date.js";
import {
  addRequiredChannelButtons,
  formatRequiredChannelLines,
} from "../utils/channel-keyboard.js";

export const giveawaysCommand = new Composer<BotContext>();

async function getGiveawaysListMarkup() {
  const active = await listActiveGiveaways();
  const publicEnded = await listPublicEndedGiveaways();

  if (active.length === 0 && publicEnded.length === 0) {
    return {
      text: "📭 <b>No active giveaways or public results at the moment.</b>\n\nCheck back later or ask channel owners to start one!",
      keyboard: null,
    };
  }

  const text = [
    `🎁 <b>Giveaways</b>`,
    `Here are active giveaways and public results:`,
    ``,
    `Click any item to view details.`,
  ].join("\n");

  const keyboard = new InlineKeyboard();

  for (const g of active.slice(0, 10)) {
    const channelName = g.channel?.name ?? "Channel";
    keyboard.text(`🎁 ${g.prize} (${channelName})`, `view_active:${g.id}`).row();
  }

  for (const g of publicEnded.slice(0, 10)) {
    const channelName = g.channel?.name ?? "Channel";
    keyboard.text(`🏆 Results: ${g.prize} (${channelName})`, `view_results:${g.id}`).row();
  }

  return { text, keyboard };
}

giveawaysCommand.command("giveaways", async (ctx) => {
  const { text, keyboard } = await getGiveawaysListMarkup();
  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard ?? undefined,
  });
});

giveawaysCommand.callbackQuery(/^view_active:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway || giveaway.status !== "active") {
    await ctx.answerCallbackQuery({
      text: giveaway?.status === "ended"
        ? "This giveaway has ended. You can no longer join."
        : "Giveaway not found or no longer active.",
      show_alert: true,
    });
    return;
  }

  const counts = await getParticipantCount(giveawayId);
  const channelName = giveaway.channel?.name ?? "Channel";
  const requiredChannels = await getGiveawayChannels(giveawayId);
  const requiredChannelLines = formatRequiredChannelLines(requiredChannels);

  const detailsText = [
    `🎁 <b>Giveaway: ${escapeHtml(giveaway.prize)}</b>`,
    ``,
    `📢 <b>Channel:</b> ${escapeHtml(channelName)}`,
    requiredChannelLines.length > 1 ? `<b>Required Channels:</b>` : null,
    requiredChannelLines.length > 1 ? requiredChannelLines.join("\n") : null,
    `⏰ <b>Ends:</b> ${formatDate(giveaway.endTime)}`,
    `🏆 <b>Winners:</b> ${giveaway.maxWinners}`,
    `👥 <b>Participants:</b> ${counts.total}`,
    ``,
    `<i>Join all required channels, then click Join Giveaway or Check Eligibility.</i>`,
  ]
    .filter(Boolean)
    .join("\n");

  const keyboard = new InlineKeyboard();
  addRequiredChannelButtons(keyboard, requiredChannels);

  keyboard
    .text("Join Giveaway", `join_giveaway:${giveaway.id}`)
    .row()
    .text("Check Eligibility", `check_eligibility:${giveaway.id}`)
    .row();

  keyboard.text("Back to List", "list_active_giveaways");

  await ctx.editMessageText(detailsText, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
});

giveawaysCommand.callbackQuery(/^view_results:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const giveaway = await getGiveaway(giveawayId);

  if (!giveaway || giveaway.status !== "ended" || !giveaway.winnersPublic) {
    await ctx.answerCallbackQuery({
      text: "Results are not public for this giveaway.",
      show_alert: true,
    });
    return;
  }

  const winners = await getWinners(giveawayId);
  const winnerLines = winners.length
    ? winners.map((winner) => {
        const label = winner.user.username
          ? `@${winner.user.username}`
          : winner.user.firstName;
        return `#${winner.position}: ${escapeHtml(label)}`;
      })
    : ["No winners were selected."];

  const text = [
    `🏆 <b>Giveaway Results</b>`,
    ``,
    `🎁 <b>${escapeHtml(giveaway.prize)}</b>`,
    `📢 <b>Channel:</b> ${escapeHtml(giveaway.channel?.name ?? "Channel")}`,
    ``,
    ...winnerLines,
  ].join("\n");

  const keyboard = new InlineKeyboard().text("Back to List", "list_active_giveaways");
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
  await ctx.answerCallbackQuery();
});

giveawaysCommand.callbackQuery("list_active_giveaways", async (ctx) => {
  const { text, keyboard } = await getGiveawaysListMarkup();
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: keyboard ?? undefined,
  });
  await ctx.answerCallbackQuery();
});
