import { InlineKeyboard, type Api } from "grammy";
import type { GiveawayWithRelations, WinnerWithUser } from "../types/index.js";
import {
  escapeHtml,
  formatWinnerAnnouncement,
  formatWinnerDM,
  formatGiveawayAnnouncement,
} from "../utils/telegram.js";
import { addRequiredChannelButtons } from "../utils/channel-keyboard.js";
import { getGiveawayChannels } from "./giveaway.service.js";
import { markWinnerNotified } from "./winner.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("service:notification");

function serializeTelegramError(error: unknown): Record<string, unknown> {
  const candidate = error as {
    name?: unknown;
    message?: unknown;
    description?: unknown;
    error_code?: unknown;
    method?: unknown;
    payload?: unknown;
    response?: {
      description?: unknown;
      error_code?: unknown;
      parameters?: unknown;
    };
    stack?: unknown;
  };

  return {
    name: candidate?.name,
    message: candidate?.message,
    description: candidate?.description ?? candidate?.response?.description,
    errorCode: candidate?.error_code ?? candidate?.response?.error_code,
    parameters: candidate?.response?.parameters,
    method: candidate?.method,
    payload: candidate?.payload,
    stack: candidate?.stack,
  };
}

function isHtmlParseError(error: unknown): boolean {
  const details = serializeTelegramError(error);
  const text = `${details.message ?? ""} ${details.description ?? ""}`;
  return /parse entities|can't parse|entity/i.test(text);
}

function htmlToPlainText(message: string): string {
  return message
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(b|i|code|a)>/gi, "")
    .replace(/<a\s+href="[^"]*">/gi, "")
    .replace(/<(b|i|code)>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function sendHtmlMessageWithPlainTextFallback(
  api: Api,
  chatId: number,
  message: string,
  context: Record<string, unknown>
) {
  try {
    return await api.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    if (!isHtmlParseError(error)) {
      throw error;
    }

    log.warn(
      { ...context, error: serializeTelegramError(error) },
      "Telegram rejected HTML message, retrying as plain text"
    );

    return api.sendMessage(chatId, htmlToPlainText(message));
  }
}

/**
 * Announce a giveaway in its channel.
 */
export async function announceGiveaway(
  api: Api,
  giveaway: GiveawayWithRelations,
  botUsername: string
): Promise<number | null> {
  try {
    const requiredChannels = await getGiveawayChannels(giveaway.id);
    const message = formatGiveawayAnnouncement(
      giveaway,
      botUsername,
      requiredChannels
    );
    const channelTgId = giveaway.channel?.telegramId;

    if (!channelTgId) {
      log.error({ giveawayId: giveaway.id }, "No channel found for giveaway");
      return null;
    }

    const keyboard = new InlineKeyboard();
    addRequiredChannelButtons(keyboard, requiredChannels);
    if (requiredChannels.some((channel) => channel.username)) {
      keyboard.row();
    }
    keyboard
      .text("Join Giveaway", `join_giveaway:${giveaway.id}`)
      .row()
      .text("Check Eligibility", `check_eligibility:${giveaway.id}`)
      .row()
      .url("Open Bot", `https://t.me/${botUsername}?start=join_${giveaway.id}`);

    const sent = await api.sendMessage(Number(channelTgId), message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });

    log.info(
      { giveawayId: giveaway.id, messageId: sent.message_id },
      "Giveaway announced in channel"
    );

    return sent.message_id;
  } catch (error) {
    log.error(
      { error: serializeTelegramError(error), giveawayId: giveaway.id },
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

    await sendHtmlMessageWithPlainTextFallback(
      api,
      Number(channelTgId),
      message,
      { giveawayId: giveaway.id, chatId: channelTgId.toString() }
    );

    log.info(
      { giveawayId: giveaway.id, winners: winnerUsers.length },
      "Winners announced in channel"
    );
  } catch (error) {
    log.error(
      { error: serializeTelegramError(error), giveawayId: giveaway.id },
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

      await sendHtmlMessageWithPlainTextFallback(
        api,
        Number(winner.user.telegramId),
        message,
        {
          giveawayId: giveaway.id,
          userId: winner.user.telegramId.toString(),
        }
      );

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
          error: serializeTelegramError(error),
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
      return `#${winner.position}: ${escapeHtml(label)} (${winner.user.telegramId})`;
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
    `<b>Prize:</b> ${escapeHtml(giveaway.prize)}`,
    `<b>Channel:</b> ${escapeHtml(giveaway.channel?.name ?? "Unknown")}`,
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
    await sendHtmlMessageWithPlainTextFallback(
      api,
      Number(giveaway.creator.telegramId),
      message,
      {
        giveawayId: giveaway.id,
        creatorId: giveaway.creator.telegramId.toString(),
      }
    );
  } catch (error) {
    log.error(
      { error: serializeTelegramError(error), giveawayId: giveaway.id },
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
    `<b>Prize:</b> ${escapeHtml(giveaway.prize)}`,
    `<b>ID:</b> <code>${giveaway.id}</code>`,
    details ? `\n${escapeHtml(details)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await sendHtmlMessageWithPlainTextFallback(
      api,
      Number(adminTelegramId),
      message,
      { giveawayId: giveaway.id, adminId: adminTelegramId.toString() }
    );
  } catch (error) {
    log.error(
      { error: serializeTelegramError(error), adminId: adminTelegramId.toString() },
      "Failed to notify admin"
    );
  }
}
