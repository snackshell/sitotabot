import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  getGiveaway,
  listGiveawaysByCreator,
} from "../services/giveaway.service.js";
import { getParticipantCount } from "../services/participant.service.js";
import { getWinners } from "../services/winner.service.js";
import { formatGiveawayStatus } from "../utils/telegram.js";
import { createChildLogger } from "../utils/logger.js";

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

  const message = formatGiveawayStatus(giveaway, counts.total, winnersList.length);

  const keyboard = new InlineKeyboard();
  if (giveaway.status === "active") {
    keyboard.text("🏁 End Now", `end:${giveaway.id}`).row();
  }
  if (giveaway.status === "ended" && winnersList.length > 0) {
    keyboard.text("🔄 Reroll", `reroll:${giveaway.id}`).row();
  }
  keyboard.text("📥 Export", `export_menu:${giveaway.id}`);

  await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
}

// Handle status callback buttons
statusCommand.callbackQuery(/^status:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  await showGiveawayStatus(ctx, giveawayId);
  await ctx.answerCallbackQuery();
});
