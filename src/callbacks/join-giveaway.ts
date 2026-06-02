import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../types/index.js";
import { upsertUser, getGiveaway, getGiveawayChannels } from "../services/giveaway.service.js";
import {
  registerParticipant,
  isParticipantRegistered,
  getUserByTelegramId,
} from "../services/participant.service.js";
import { validateParticipant } from "../services/validation.service.js";
import { escapeHtml } from "../utils/telegram.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("callback:join-giveaway");

export const joinGiveawayCallback = new Composer<BotContext>();

/**
 * Handle inline "Join Giveaway" button clicks.
 * Pattern: join_giveaway:<giveaway_id>
 */
joinGiveawayCallback.callbackQuery(
  /^join_giveaway:(.+)$/,
  async (ctx) => {
    const giveawayId = ctx.match![1]!;
    const userId = ctx.from?.id;
    if (!userId) return;

    log.info({ userId, giveawayId }, "Join giveaway callback");

    const giveaway = await getGiveaway(giveawayId);
    if (!giveaway) {
      await ctx.answerCallbackQuery({
        text: "❌ Giveaway not found.",
        show_alert: true,
      });
      return;
    }

    if (giveaway.status !== "active") {
      await ctx.answerCallbackQuery({
        text: "❌ This giveaway is no longer active.",
        show_alert: true,
      });
      return;
    }

    // Upsert user
    const internalUserId = await upsertUser({
      telegramId: BigInt(userId),
      username: ctx.from?.username ?? null,
      firstName: ctx.from?.first_name ?? "Unknown",
      lastName: ctx.from?.last_name ?? null,
    });

    // Check if already registered
    if (await isParticipantRegistered(giveawayId, internalUserId)) {
      await ctx.answerCallbackQuery({
        text: "✅ You're already in this giveaway! Good luck! 🍀",
        show_alert: true,
      });
      return;
    }

    // Validate
    const channels = await getGiveawayChannels(giveawayId);
    const channelIds = channels.map((c) => c.telegramId);

    const eligibility = await validateParticipant(
      ctx.api,
      giveaway,
      channelIds,
      userId
    );

    // Register
    const participantId = await registerParticipant(
      giveawayId,
      internalUserId,
      eligibility.isEligible,
      eligibility.reason
    );

    if (participantId === null) {
      await ctx.answerCallbackQuery({
        text: "✅ You're already registered!",
        show_alert: true,
      });
      return;
    }

    if (!eligibility.isEligible) {
      await ctx.answerCallbackQuery({
        text: `⚠️ Registered but ineligible: ${eligibility.reason}`,
        show_alert: true,
      });
      return;
    }

    await ctx.answerCallbackQuery({
      text: "🎉 You're in! Good luck!",
      show_alert: true,
    });

    log.info({ userId, giveawayId, participantId }, "User joined via callback");
  }
);
