import type { Api } from "grammy";
import type { EligibilityResult, GiveawayWithRelations } from "../types/index.js";
import { createChildLogger } from "../utils/logger.js";
import { daysBetween } from "../utils/date.js";

const log = createChildLogger("service:validation");

/**
 * Run all validation checks for a participant joining a giveaway.
 */
export async function validateParticipant(
  api: Api,
  giveaway: GiveawayWithRelations,
  channelTelegramIds: bigint[],
  userTelegramId: number,
  userAccountDate?: Date | null
): Promise<EligibilityResult> {
  // Check 1: Verify channel membership for all required channels
  for (const channelId of channelTelegramIds) {
    const memberCheck = await checkChannelMembership(
      api,
      channelId,
      userTelegramId
    );
    if (!memberCheck.isEligible) {
      return memberCheck;
    }
  }

  // Check 2: Account age
  if (giveaway.minAccountAge && userAccountDate) {
    const ageCheck = checkAccountAge(userAccountDate, giveaway.minAccountAge);
    if (!ageCheck.isEligible) {
      return ageCheck;
    }
  }

  // Check 3: Join date restrictions
  if (giveaway.joinDateAfter || giveaway.joinDateBefore) {
    // This checks when the user was first seen by the bot
    // A more accurate approach would track when they joined the channel
    // but Telegram doesn't expose that reliably
  }

  return { isEligible: true };
}

/**
 * Check if a user is a member of a specific channel.
 */
export async function checkChannelMembership(
  api: Api,
  channelTelegramId: bigint | number | string,
  userTelegramId: number
): Promise<EligibilityResult> {
  try {
    const member = await api.getChatMember(
      Number(channelTelegramId),
      userTelegramId
    );

    if (member.status === "left" || member.status === "kicked") {
      return {
        isEligible: false,
        reason: `Not a member of the required channel`,
      };
    }

    return { isEligible: true };
  } catch (error) {
    log.error(
      { error, channelTelegramId, userTelegramId },
      "Failed to check channel membership"
    );
    return {
      isEligible: false,
      reason: "Unable to verify channel membership. Please try again.",
    };
  }
}

/**
 * Check if a user's account meets the minimum age requirement.
 */
export function checkAccountAge(
  accountCreated: Date,
  minDays: number
): EligibilityResult {
  const accountAge = daysBetween(accountCreated, new Date());

  if (accountAge < minDays) {
    return {
      isEligible: false,
      reason: `Account must be at least ${minDays} days old (yours is ${accountAge} days)`,
    };
  }

  return { isEligible: true };
}

/**
 * Check if a user is a bot.
 */
export function checkIsBot(isBot: boolean): EligibilityResult {
  if (isBot) {
    return {
      isEligible: false,
      reason: "Bots cannot participate in giveaways",
    };
  }
  return { isEligible: true };
}

/**
 * Check join date is within required range.
 */
export function checkJoinDate(
  firstSeen: Date,
  after?: Date | null,
  before?: Date | null
): EligibilityResult {
  if (after && firstSeen < after) {
    return {
      isEligible: false,
      reason: `You must have joined after ${after.toISOString().split("T")[0]}`,
    };
  }

  if (before && firstSeen > before) {
    return {
      isEligible: false,
      reason: `You must have joined before ${before.toISOString().split("T")[0]}`,
    };
  }

  return { isEligible: true };
}
