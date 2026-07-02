import { Composer, InlineKeyboard, InputFile } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  getGiveaway,
  listGiveawaysByCreator,
} from "../services/giveaway.service.js";
import {
  exportParticipantsCSV,
  exportWinnersCSV,
} from "../services/export.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("command:export");

export const exportCommand = new Composer<BotContext>();

exportCommand.command("export", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = ctx.match?.toString().trim().split(/\s+/);
  const giveawayId = args?.[0];
  const type = args?.[1] as "participants" | "winners" | undefined;

  if (giveawayId && type) {
    await handleExport(ctx, giveawayId, type);
    return;
  }

  if (giveawayId) {
    await showExportMenu(ctx, giveawayId);
    return;
  }

  // Show giveaway list
  const giveawayList = await listGiveawaysByCreator(BigInt(userId));

  if (giveawayList.length === 0) {
    await ctx.reply("📭 No giveaways to export.");
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const g of giveawayList.slice(0, 10)) {
    keyboard
      .text(`📥 ${g.prize.substring(0, 35)}`, `export_menu:${g.id}`)
      .row();
  }

  await ctx.reply(
    `📥 <b>Export Data</b>\n\nSelect a giveaway:`,
    { parse_mode: "HTML", reply_markup: keyboard }
  );
});

async function showExportMenu(
  ctx: BotContext,
  giveawayId: string
): Promise<void> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    await ctx.reply("❌ Giveaway not found.");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("👥 Participants CSV", `export:${giveawayId}:participants`)
    .row()
    .text("🏆 Winners CSV", `export:${giveawayId}:winners`);

  await ctx.reply(
    [
      `📥 <b>Export: ${giveaway.prize}</b>`,
      ``,
      `Choose what to export:`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

async function handleExport(
  ctx: BotContext,
  giveawayId: string,
  type: "participants" | "winners"
): Promise<void> {
  try {
    let csv: string | null;
    let filename: string;

    if (type === "participants") {
      csv = await exportParticipantsCSV(giveawayId);
      filename = `participants_${giveawayId.substring(0, 8)}.csv`;
    } else {
      csv = await exportWinnersCSV(giveawayId);
      filename = `winners_${giveawayId.substring(0, 8)}.csv`;
    }

    if (!csv) {
      await ctx.reply(`📭 No ${type} found for this giveaway.`);
      return;
    }

    const buffer = Buffer.from(csv, "utf-8");
    await ctx.replyWithDocument(new InputFile(buffer, filename), {
      caption: `📥 ${type === "participants" ? "Participants" : "Winners"} export for giveaway ${giveawayId.substring(0, 8)}`,
    });

    log.info({ giveawayId, type }, "Export sent");
  } catch (error) {
    log.error({ error, giveawayId, type }, "Export failed");
    await ctx.reply("❌ Failed to generate export. Please try again.");
  }
}

// Handle export menu callback
exportCommand.callbackQuery(/^export_menu:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  await showExportMenu(ctx, giveawayId);
  await ctx.answerCallbackQuery();
});

// Handle export callback
exportCommand.callbackQuery(
  /^export:(.+):(participants|winners)$/,
  async (ctx) => {
    const giveawayId = ctx.match![1]!;
    const type = ctx.match![2] as "participants" | "winners";
    await ctx.answerCallbackQuery("⏳ Generating export...");
    await handleExport(ctx, giveawayId, type);
  }
);
