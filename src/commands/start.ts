import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import { upsertUser } from "../services/giveaway.service.js";
import {
  getParticipantByGiveawayAndUser,
  registerParticipant,
  getUserByTelegramId,
  updateParticipantEligibility,
} from "../services/participant.service.js";
import { getGiveaway, getGiveawayChannels } from "../services/giveaway.service.js";
import { validateParticipant } from "../services/validation.service.js";
import { createChildLogger } from "../utils/logger.js";
import { escapeHtml } from "../utils/telegram.js";

const log = createChildLogger("command:start");

export const startCommand = new Composer<BotContext>();

startCommand.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Upsert user
  await upsertUser({
    telegramId: BigInt(userId),
    username: ctx.from?.username ?? null,
    firstName: ctx.from?.first_name ?? "Unknown",
    lastName: ctx.from?.last_name ?? null,
    isBot: ctx.from?.is_bot ?? false,
  });

  // Check for deep link payload
  const payload = ctx.match;

  if (typeof payload === "string" && payload.startsWith("join_")) {
    const giveawayId = payload.replace("join_", "");
    await handleJoinGiveaway(ctx, giveawayId);
    return;
  }

  // Default welcome message
  const welcomeMessage = [
    `🎉 <b>Welcome to SitotaBot!</b>`,
    ``,
    `I help Telegram channel owners run <b>fair and verifiable giveaways</b>.`,
    ``,
    `<b>What I can do:</b>`,
    `🎁 Create giveaways with custom rules`,
    `✅ Verify participants automatically`,
    `🔐 Select winners with provable fairness`,
    `📊 Export data as CSV`,
    ``,
    `<b>Admin Commands:</b>`,
    `/create_giveaway — Create a new giveaway`,
    `/status — View giveaway status`,
    `/participants — View participant count`,
    `/end_giveaway — End a giveaway early`,
    `/reroll — Re-select winners`,
    `/export — Download CSV data`,
    `/help — Full command reference`,
    ``,
    `<i>Add me as an admin to your channel to get started!</i>`,
  ].join("\n");

  await ctx.reply(welcomeMessage, { parse_mode: "HTML" });
});

/**
 * Handle a deep-link join for a specific giveaway.
 */
async function handleJoinGiveaway(
  ctx: BotContext,
  giveawayId: string
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  log.info({ userId, giveawayId }, "User attempting to join giveaway");

  // Get the giveaway
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    await ctx.reply("❌ Giveaway not found. It may have been removed.");
    return;
  }

  if (giveaway.status !== "active") {
    await ctx.reply(
      `❌ This giveaway is no longer active (status: ${giveaway.status}).`
    );
    return;
  }

  const user = await getUserByTelegramId(BigInt(userId));
  const existingParticipant = user
    ? await getParticipantByGiveawayAndUser(giveawayId, user.id)
    : null;

  // Get all required channels
  const requiredChannels = await getGiveawayChannels(giveawayId);
  const channelTgIds = requiredChannels.map((c) => c.telegramId);

  // Validate participant
  const eligibility = await validateParticipant(
    ctx.api,
    giveaway,
    channelTgIds,
    userId,
    null, // We don't have account creation date from Telegram API
    user?.firstSeen ?? null
  );

  // Upsert and get internal user ID
  const internalUserId = await upsertUser({
    telegramId: BigInt(userId),
    username: ctx.from?.username ?? null,
    firstName: ctx.from?.first_name ?? "Unknown",
    lastName: ctx.from?.last_name ?? null,
  });

  if (existingParticipant) {
    await updateParticipantEligibility(
      giveawayId,
      internalUserId,
      eligibility.isEligible,
      eligibility.reason
    );

    if (!eligibility.isEligible) {
      await ctx.reply(
        `⚠️ You're registered but still not eligible:\n${escapeHtml(eligibility.reason ?? "Unknown reason")}`,
        { parse_mode: "HTML" }
      );
      return;
    }

    await ctx.reply("✅ You're in! Good luck! 🍀");
    return;
  }

  // Register (even if ineligible — mark as such)
  const participantId = await registerParticipant(
    giveawayId,
    internalUserId,
    eligibility.isEligible,
    eligibility.reason
  );

  if (participantId === null) {
    await ctx.reply("✅ You're already registered for this giveaway! Good luck! 🍀");
    return;
  }

  if (!eligibility.isEligible) {
    await ctx.reply(
      `⚠️ You've been registered but marked as <b>ineligible</b>:\n${escapeHtml(eligibility.reason ?? "Unknown reason")}\n\nYou may still be eligible if conditions change before the draw.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const keyboard = new InlineKeyboard().url(
    "📢 View Channel",
    giveaway.channel?.username
      ? `https://t.me/${giveaway.channel.username}`
      : `tg://resolve?domain=channel`
  );

  await ctx.reply(
    [
      `✅ <b>You're in!</b> 🎉`,
      ``,
      `You've successfully joined the giveaway:`,
      `🎁 <b>${escapeHtml(giveaway.prize)}</b>`,
      ``,
      `⏰ Drawing on: ${giveaway.endTime.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      })} UTC`,
      ``,
      `Good luck! 🍀`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: keyboard }
  );

  log.info(
    { userId, giveawayId, participantId },
    "User successfully joined giveaway"
  );
}
