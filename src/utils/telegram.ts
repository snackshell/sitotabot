import type { FairnessProof, GiveawayWithRelations } from "../types/index.js";
import type { RequiredChannel } from "./channel-keyboard.js";
import { formatRequiredChannelLines } from "./channel-keyboard.js";
import { formatDate, formatTimeRemaining } from "./date.js";

const STATUS_EMOJI: Record<string, string> = {
  draft: "📝",
  active: "🎉",
  ended: "🏁",
  cancelled: "❌",
};

const TYPE_LABELS: Record<string, string> = {
  new_members: "New Members Only",
  existing_members: "Existing Members Only",
  multi_channel: "Multi-Channel",
  all_members: "All Members",
};

/**
 * Format a giveaway announcement message for posting in a channel.
 */
export function formatGiveawayAnnouncement(
  giveaway: GiveawayWithRelations,
  botUsername: string,
  requiredChannels: RequiredChannel[] = []
): string {
  const deepLink = `https://t.me/${botUsername}?start=join_${giveaway.id}`;
  const requiredChannelLines = formatRequiredChannelLines(requiredChannels);

  return [
    `🎉 <b>GIVEAWAY TIME!</b> 🎉`,
    ``,
    `🎁 <b>Prize:</b> ${escapeHtml(giveaway.prize)}`,
    giveaway.description
      ? `📝 ${escapeHtml(giveaway.description)}`
      : null,
    ``,
    `📋 <b>Rules:</b>`,
    `  • Type: ${TYPE_LABELS[giveaway.type] ?? giveaway.type}`,
    `  • Max Winners: ${giveaway.maxWinners}`,
    giveaway.minAccountAge
      ? `  • Min Account Age: ${giveaway.minAccountAge} days`
      : null,
    requiredChannelLines.length > 0 ? `` : null,
    requiredChannelLines.length > 0 ? `<b>Required Channels:</b>` : null,
    requiredChannelLines.length > 0 ? requiredChannelLines.join("\n") : null,
    ``,
    `⏰ <b>Ends:</b> ${formatDate(giveaway.endTime)}`,
    `⏳ <b>Time Left:</b> ${formatTimeRemaining(giveaway.endTime)}`,
    ``,
    `👉 <a href="${deepLink}">Click here to join!</a>`,
    ``,
    `<i>Powered by SitotaBot — Fair & Verifiable Giveaways</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format a giveaway status message for admin view.
 */
export function formatGiveawayStatus(
  giveaway: GiveawayWithRelations,
  participantCount: number,
  winnersCount: number
): string {
  const status = giveaway.status;
  const emoji = STATUS_EMOJI[status] ?? "❓";

  return [
    `${emoji} <b>Giveaway Status</b>`,
    ``,
    `<b>ID:</b> <code>${giveaway.id}</code>`,
    `<b>Prize:</b> ${escapeHtml(giveaway.prize)}`,
    `<b>Type:</b> ${TYPE_LABELS[giveaway.type] ?? giveaway.type}`,
    `<b>Status:</b> ${status.toUpperCase()}`,
    `<b>Channel:</b> ${escapeHtml(giveaway.channel?.name ?? "Unknown")}`,
    ``,
    `📅 <b>Start:</b> ${formatDate(giveaway.startTime)}`,
    `📅 <b>End:</b> ${formatDate(giveaway.endTime)}`,
    status === "active"
      ? `⏳ <b>Time Left:</b> ${formatTimeRemaining(giveaway.endTime)}`
      : null,
    ``,
    `👥 <b>Participants:</b> ${participantCount}`,
    `🏆 <b>Winners:</b> ${winnersCount} / ${giveaway.maxWinners}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format a winner announcement for posting in a channel.
 */
export function formatWinnerAnnouncement(
  giveaway: GiveawayWithRelations,
  winnerUsers: { firstName: string; username: string | null; position: number }[]
): string {
  const winnerLines = winnerUsers.map((w) => {
    const mention = w.username ? `@${w.username}` : w.firstName;
    return `  🥇 #${w.position}: <b>${escapeHtml(mention)}</b>`;
  });

  return [
    `🏆 <b>GIVEAWAY WINNERS!</b> 🏆`,
    ``,
    `🎁 <b>Prize:</b> ${escapeHtml(giveaway.prize)}`,
    ``,
    `<b>Congratulations to:</b>`,
    ...winnerLines,
    ``,
    `✅ This draw was <b>verifiably fair</b>.`,
    ``,
    `<i>Winners have been notified via DM.</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format a fairness proof for display.
 */
export function formatFairnessProof(proof: FairnessProof): string {
  return [
    `🔐 <b>Fairness Proof</b>`,
    ``,
    `<b>Giveaway ID:</b> <code>${proof.giveawayId}</code>`,
    `<b>Algorithm:</b> ${proof.algorithm.toUpperCase()}`,
    `<b>Total Participants:</b> ${proof.participantIds.length}`,
    ``,
    `<b>Seed:</b>`,
    `<code>${proof.seed}</code>`,
    ``,
    `<b>Participant Hash (SHA-256):</b>`,
    `<code>${proof.participantHash}</code>`,
    ``,
    `<b>Combined Proof Hash:</b>`,
    `<code>${proof.combinedHash}</code>`,
    ``,
    `<b>Winners:</b> ${proof.winnerIds.join(", ")}`,
    ``,
    `<i>To verify: SHA256(seed + participantHash) should equal the proof hash.</i>`,
    `<i>Participant hash = SHA256(JSON.stringify(sorted participant IDs))</i>`,
  ].join("\n");
}

/**
 * Format the winner DM notification.
 */
export function formatWinnerDM(
  giveaway: GiveawayWithRelations,
  position: number
): string {
  const contact = giveaway.creatorContactUsername
    ? `@${giveaway.creatorContactUsername.replace(/^@/, "")}`
    : "the giveaway admin";

  return [
    `🎉 <b>Congratulations! You WON!</b> 🎉`,
    ``,
    `You are winner #${position} in the giveaway:`,
    `🎁 <b>${escapeHtml(giveaway.prize)}</b>`,
    `📢 Channel: ${escapeHtml(giveaway.channel?.name ?? "Unknown")}`,
    ``,
    `Contact ${escapeHtml(contact)} to claim your prize.`,
    `Thank you for participating! 🙏`,
  ].join("\n");
}

/**
 * Normalize a Telegram username input.
 * Accepts @username, @ username, username, and t.me/username forms.
 */
export function parseTelegramUsername(input: string): string | null {
  const trimmed = input.trim();
  const linkMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/@?\s*([A-Za-z0-9_]{5,32})\/?$/i
  );

  if (linkMatch?.[1]) {
    return linkMatch[1];
  }

  const cleaned = trimmed.replace(/^@+\s*/, "");
  return /^[A-Za-z0-9_]{5,32}$/.test(cleaned) ? cleaned : null;
}

/**
 * Escape HTML special characters for Telegram HTML parse mode.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
