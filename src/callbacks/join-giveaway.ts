import { Composer } from "grammy";
import type { BotContext } from "../types/index.js";
import {
  getGiveaway,
  getGiveawayChannels,
  upsertUser,
} from "../services/giveaway.service.js";
import {
  getUserByTelegramId,
  getParticipantByGiveawayAndUser,
  registerParticipant,
  updateParticipantEligibility,
} from "../services/participant.service.js";
import { validateParticipant } from "../services/validation.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("callback:join-giveaway");

export const joinGiveawayCallback = new Composer<BotContext>();

async function checkGiveawayEligibility(
  ctx: BotContext,
  giveawayId: string,
  userId: number
): Promise<{ isEligible: boolean; reason?: string }> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    return { isEligible: false, reason: "Giveaway not found." };
  }

  if (giveaway.status !== "active") {
    return {
      isEligible: false,
      reason: `This giveaway is no longer active (status: ${giveaway.status}).`,
    };
  }

  const user = await getUserByTelegramId(BigInt(userId));
  const channels = await getGiveawayChannels(giveawayId);
  const channelIds = channels.map((c) => c.telegramId);

  return validateParticipant(
    ctx.api,
    giveaway,
    channelIds,
    userId,
    null,
    user?.firstSeen ?? null
  );
}

/**
 * Handle inline "Join Giveaway" button clicks.
 * Pattern: join_giveaway:<giveaway_id>
 */
joinGiveawayCallback.callbackQuery(/^join_giveaway:(.+)$/, async (ctx) => {
  const giveawayId = ctx.match![1]!;
  const userId = ctx.from?.id;
  if (!userId) return;

  log.info({ userId, giveawayId }, "Join giveaway callback");

  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    await ctx.answerCallbackQuery({
      text: "Giveaway not found.",
      show_alert: true,
    });
    return;
  }

  if (giveaway.status !== "active") {
    await ctx.answerCallbackQuery({
      text:
        giveaway.status === "ended"
          ? "This giveaway has ended. You can no longer join."
          : "This giveaway is no longer active.",
      show_alert: true,
    });
    return;
  }

  const internalUserId = await upsertUser({
    telegramId: BigInt(userId),
    username: ctx.from?.username ?? null,
    firstName: ctx.from?.first_name ?? "Unknown",
    lastName: ctx.from?.last_name ?? null,
    isBot: ctx.from?.is_bot ?? false,
  });

  const eligibility = await checkGiveawayEligibility(ctx, giveawayId, userId);
  const existingParticipant = await getParticipantByGiveawayAndUser(
    giveawayId,
    internalUserId
  );

  if (existingParticipant) {
    await updateParticipantEligibility(
      giveawayId,
      internalUserId,
      eligibility.isEligible,
      eligibility.reason
    );

    await ctx.answerCallbackQuery({
      text:
        existingParticipant.isEligible && eligibility.isEligible
          ? "You have already joined this giveaway. Good luck!"
          : eligibility.isEligible
          ? "You're now eligible and in the giveaway. Good luck!"
          : `You're registered but still not eligible: ${eligibility.reason}`,
      show_alert: true,
    });

    log.info(
      {
        userId,
        giveawayId,
        participantId: existingParticipant.id,
        eligible: eligibility.isEligible,
      },
      "User re-checked giveaway eligibility"
    );
    return;
  }

  const participantId = await registerParticipant(
    giveawayId,
    internalUserId,
    eligibility.isEligible,
    eligibility.reason
  );

  if (participantId === null) {
    await ctx.answerCallbackQuery({
      text: "You're already registered.",
      show_alert: true,
    });
    return;
  }

  if (!eligibility.isEligible) {
    await ctx.answerCallbackQuery({
      text: `Registered but ineligible: ${eligibility.reason}`,
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({
    text: "You're in. Good luck!",
    show_alert: true,
  });

  log.info({ userId, giveawayId, participantId }, "User joined via callback");
});

/**
 * Handle inline "Check Eligibility" button clicks.
 * Pattern: check_eligibility:<giveaway_id>
 */
joinGiveawayCallback.callbackQuery(
  /^check_eligibility:(.+)$/,
  async (ctx) => {
    const giveawayId = ctx.match![1]!;
    const userId = ctx.from?.id;
    if (!userId) return;

    await upsertUser({
      telegramId: BigInt(userId),
      username: ctx.from?.username ?? null,
      firstName: ctx.from?.first_name ?? "Unknown",
      lastName: ctx.from?.last_name ?? null,
      isBot: ctx.from?.is_bot ?? false,
    });

    const eligibility = await checkGiveawayEligibility(ctx, giveawayId, userId);

    await ctx.answerCallbackQuery({
      text: eligibility.isEligible
        ? "You are eligible for this giveaway."
        : `Not eligible: ${eligibility.reason ?? "Unknown reason"}`,
      show_alert: true,
    });
  }
);
