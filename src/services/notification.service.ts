import type { Api } from "grammy";
import type { GiveawayWithRelations, WinnerWithUser } from "../types/index.js";
import {
  formatWinnerAnnouncement,
  formatWinnerDM,
  formatGiveawayAnnouncement,
} from "../utils/telegram.js";
import { markWinnerNotified } from "./winner.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("service:notification");

/**
 * Announce a giveaway in its channel.
 */
export async function announceGiveaway(
  api: Api,
  giveaway: GiveawayWithRelations,
  botUsername: string
): Promise<number | null> {
  try {
    const message = formatGiveawayAnnouncement(giveaway, botUsername);
    const channelTgId = giveaway.channel?.telegramId;

    if (!channelTgId) {
      log.error({ giveawayId: giveaway.id }, "No channel found for giveaway");
      return null;
    }

    const sent = await api.sendMessage(Number(channelTgId), message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Join Giveaway",
              callback_data: `join_giveaway:${giveaway.id}`,
            },
          ],
          [
            {
              text: "Check Eligibility",
              callback_data: `check_eligibility:${giveaway.id}`,
            },
          ],
          [
            {
              text: "Open Bot",
              url: `https://t.me/${botUsername}?start=join_${giveaway.id}`,
            },
          ],
        ],
      },
    });

    log.info(
      { giveawayId: giveaway.id, messageId: sent.message_id },
      "Giveaway announced in channel"
    );

    return sent.message_id;
  } catch (error) {
    log.error(
      { error, giveawayId: giveaway.id },
      "Failed to announce giveaway"
    );
    return null;
  }
}

/**
 * Announce winners in the giveaway's channel.
 */
export async function announceWinners(
  api: Api,
  giveaway: GiveawayWithRelations,
  winnerUsers: WinnerWithUser[]
): Promise<void> {
  try {
    const channelTgId = giveaway.channel?.telegramId;
    if (!channelTgId) {
      log.error({ giveawayId: giveaway.id }, "No channel for announcement");
      return;
    }

    const winnerData = winnerUsers.map((w) => ({
      firstName: w.user.firstName,
      username: w.user.username,
      position: w.position,
    }));

    const message = formatWinnerAnnouncement(giveaway, winnerData);

    await api.sendMessage(Number(channelTgId), message, {
      parse_mode: "HTML",
    });

    log.info(
      { giveawayId: giveaway.id, winners: winnerUsers.length },
      "Winners announced in channel"
    );
  } catch (error) {
    log.error(
      { error, giveawayId: giveaway.id },
      "Failed to announce winners"
    );
  }
}

/**
 * Send DM notifications to all winners.
 * Handles cases where users haven't started the bot gracefully.
 */
export async function notifyWinners(
  api: Api,
  giveaway: GiveawayWithRelations,
  winnerUsers: WinnerWithUser[]
): Promise<{ notified: number; failed: number }> {
  let notified = 0;
  let failed = 0;

  for (const winner of winnerUsers) {
    try {
      const message = formatWinnerDM(giveaway, winner.position);

      await api.sendMessage(Number(winner.user.telegramId), message, {
        parse_mode: "HTML",
      });

      await markWinnerNotified(winner.id);
      notified++;

      log.info(
        {
          giveawayId: giveaway.id,
          userId: winner.user.telegramId.toString(),
        },
        "Winner notified via DM"
      );
    } catch (error) {
      failed++;
      log.warn(
        {
          error,
          userId: winner.user.telegramId.toString(),
          giveawayId: giveaway.id,
        },
        "Failed to notify winner (user may not have started the bot)"
      );
    }
  }

  return { notified, failed };
}

function formatWinnerList(winnerUsers: WinnerWithUser[]): string {
  return winnerUsers
    .map((winner) => {
      const username = winner.user.username ? `@${winner.user.username}` : null;
      const label = username ?? winner.user.firstName;
      return `#${winner.position}: ${label} (${winner.user.telegramId})`;
    })
    .join("\n");
}

/**
 * Send the creator the full winner list.
 */
export async function notifyCreatorWinners(
  api: Api,
  giveaway: GiveawayWithRelations,
  winnerUsers: WinnerWithUser[]
): Promise<void> {
  if (!giveaway.creator?.telegramId) return;

  const message = [
    `🏆 <b>Winners selected</b>`,
    ``,
    `<b>Prize:</b> ${giveaway.prize}`,
    `<b>Channel:</b> ${giveaway.channel?.name ?? "Unknown"}`,
    `<b>Winner Count:</b> ${winnerUsers.length}`,
    `<b>Visibility:</b> ${giveaway.winnersPublic ? "Public" : "Private"}`,
    giveaway.creatorContactUsername
      ? `<b>Claim Contact:</b> @${giveaway.creatorContactUsername.replace(/^@/, "")}`
      : null,
    ``,
    formatWinnerList(winnerUsers),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await api.sendMessage(Number(giveaway.creator.telegramId), message, {
      parse_mode: "HTML",
    });
  } catch (error) {
    log.error(
      { error, giveawayId: giveaway.id },
      "Failed to notify creator about winners"
    );
  }
}

/**
 * Notify the admin about a giveaway event.
 */
export async function notifyAdmin(
  api: Api,
  adminTelegramId: bigint,
  event: "started" | "ended" | "error",
  giveaway: GiveawayWithRelations,
  details?: string
): Promise<void> {
  const emoji = {
    started: "🚀",
    ended: "🏁",
    error: "⚠️",
  };

  const message = [
    `${emoji[event]} <b>Giveaway ${event.toUpperCase()}</b>`,
    ``,
    `<b>Prize:</b> ${giveaway.prize}`,
    `<b>ID:</b> <code>${giveaway.id}</code>`,
    details ? `\n${details}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await api.sendMessage(Number(adminTelegramId), message, {
      parse_mode: "HTML",
    });
  } catch (error) {
    log.error(
      { error, adminId: adminTelegramId.toString() },
      "Failed to notify admin"
    );
  }
}
