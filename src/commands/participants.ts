import { Composer } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  getGiveaway,
  listGiveawaysByCreator,
} from "../services/giveaway.service.js";
import { getParticipantCount } from "../services/participant.service.js";
import { InlineKeyboard } from "grammy";

export const participantsCommand = new Composer<BotContext>();

participantsCommand.command("participants", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = ctx.match?.toString().trim();

  if (args) {
    await showParticipantInfo(ctx, args);
    return;
  }

  // Show list of giveaways to select from
  const giveawayList = await listGiveawaysByCreator(BigInt(userId));

  if (giveawayList.length === 0) {
    await ctx.reply("📭 No giveaways found. Use /create_giveaway to create one.");
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const g of giveawayList.slice(0, 10)) {
    const statusEmoji =
      g.status === "active" ? "🟢" : g.status === "ended" ? "🏁" : "📝";
    keyboard
      .text(
        `${statusEmoji} ${g.prize.substring(0, 30)}`,
        `participants:${g.id}`
      )
      .row();
  }

  await ctx.reply(
    `👥 <b>View Participants</b>\n\nSelect a giveaway:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
});

async function showParticipantInfo(
  ctx: BotContext,
  giveawayId: string
): Promise<void> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    await ctx.reply("❌ Giveaway not found.");
    return;
  }

  const counts = await getParticipantCount(giveawayId);

  const message = [
    `👥 <b>Participants</b>`,
    ``,
    `🎁 <b>${giveaway.prize}</b>`,
    `📊 Status: ${giveaway.status.toUpperCase()}`,
    ``,
    `👤 <b>Total Participants:</b> ${counts.total}`,
    `✅ <b>Eligible:</b> ${counts.eligible}`,
    `❌ <b>Ineligible:</b> ${counts.total - counts.eligible}`,
    `🏆 <b>Max Winners:</b> ${giveaway.maxWinners}`,
    ``,
    counts.eligible > 0
      ? `📈 Win probability: ~${((giveaway.maxWinners / counts.eligible) * 100).toFixed(1)}%`
      : `⚠️ No eligible participants yet`,
  ].join("\n");

  const keyboard = new InlineKeyboard().text(
    "📥 Export CSV",
    `export:${giveawayId}:participants`
  );

  await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
}

// Handle participant callback
participantsCommand.callbackQuery(/^participants:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  await showParticipantInfo(ctx, giveawayId);
  await ctx.answerCallbackQuery();
});
