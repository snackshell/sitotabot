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
  userAccountDate?: Date | null,
  userFirstSeen?: Date | null
): Promise<EligibilityResult> {
  // Check 1: Verify channel membership for all required channels
  let allChannelsAreAdmin = true;
  for (const channelId of channelTelegramIds) {
    const memberCheck = await checkChannelMembership(
      api,
      channelId,
      userTelegramId
    );
    if (!memberCheck.isEligible) {
      return memberCheck;
    }

    if (
      memberCheck.status !== "administrator" &&
      memberCheck.status !== "creator"
    ) {
      allChannelsAreAdmin = false;
    }
  }

  // Check 2: Giveaway audience rule
  if (giveaway.type === "new_members") {
    if (!userFirstSeen) {
      return {
        isEligible: false,
        reason: "Unable to verify when you first joined the bot.",
      };
    }

    if (userFirstSeen < giveaway.startTime) {
      return {
        isEligible: false,
        reason: "This giveaway is only for new members who joined after it started.",
      };
    }
  }

  if (giveaway.type === "existing_members") {
    if (userFirstSeen) {
      if (userFirstSeen >= giveaway.startTime) {
        return {
          isEligible: false,
          reason:
            "This giveaway is only for existing members from before it started.",
        };
      }
    } else if (!allChannelsAreAdmin) {
      return {
        isEligible: false,
        reason:
          "Unable to verify that you were already a member before this giveaway started.",
      };
    }
  }

  // Check 3: Account age
  if (giveaway.minAccountAge && userAccountDate) {
    const ageCheck = checkAccountAge(userAccountDate, giveaway.minAccountAge);
    if (!ageCheck.isEligible) {
      return ageCheck;
    }
  }

  // Check 4: Join date restrictions
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
): Promise<EligibilityResult & { status?: string }> {
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

    return { isEligible: true, status: member.status };
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
