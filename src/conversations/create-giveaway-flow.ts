import type { Conversation } from "@grammyjs/conversations";
import type { BotContext, GiveawayType } from "../types/index.js";
import { createGiveaway, upsertChannel, upsertUser } from "../services/giveaway.service.js";
import { announceGiveaway } from "../services/notification.service.js";
import { getGiveaway } from "../services/giveaway.service.js";
import { scheduleGiveawayEnd } from "../services/scheduler.service.js";
import { activateGiveaway } from "../services/giveaway.service.js";
import { parseUserDate, isFuture, formatDate } from "../utils/date.js";
import { escapeHtml } from "../utils/telegram.js";
import { createChildLogger } from "../utils/logger.js";
import { InlineKeyboard } from "grammy";

const log = createChildLogger("conversation:create-giveaway");

type CreateGiveawayConversation = Conversation<BotContext>;

/**
 * Multi-step giveaway creation wizard using grammY conversations.
 */
export async function createGiveawayFlow(
  conversation: CreateGiveawayConversation,
  ctx: BotContext
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.reply(
    [
      `🎉 <b>Create a New Giveaway</b>`,
      ``,
      `Let's set up your giveaway step by step.`,
      `You can type /cancel at any time to abort.`,
      ``,
      `<b>Step 1/6: Prize Description</b>`,
      `What is the prize? (e.g., "🎮 PS5 Console" or "💰 $100 USDT")`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  // ─── Step 1: Prize ───
  const prizeResponse = await conversation.waitFor("message:text");
  const prize = prizeResponse.message.text;

  if (prize === "/cancel") {
    await ctx.reply("❌ Giveaway creation cancelled.");
    return;
  }

  // ─── Step 2: Giveaway Type ───
  const typeKeyboard = new InlineKeyboard()
    .text("👥 All Members", "type:all_members")
    .row()
    .text("🆕 New Members Only", "type:new_members")
    .row()
    .text("📌 Existing Members", "type:existing_members")
    .row()
    .text("🔗 Multi-Channel", "type:multi_channel");

  await ctx.reply(
    [
      `✅ Prize: <b>${escapeHtml(prize)}</b>`,
      ``,
      `<b>Step 2/6: Giveaway Type</b>`,
      `Who can participate?`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: typeKeyboard }
  );

  const typeCallback = await conversation.waitForCallbackQuery(
    /^type:(.+)$/
  );
  const giveawayType = typeCallback.match![1] as GiveawayType;
  await typeCallback.answerCallbackQuery();

  // ─── Step 3: Channel ───
  await typeCallback.editMessageText(
    [
      `✅ Type: <b>${giveawayType.replace(/_/g, " ")}</b>`,
      ``,
      `<b>Step 3/6: Channel</b>`,
      `Forward a message from your channel, or send the channel username (e.g., @mychannel).`,
      ``,
      `⚠️ Make sure I'm added as an admin to the channel!`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  const channelResponse = await conversation.waitFor("message");
  let channelTelegramId: bigint;
  let channelName: string;
  let channelUsername: string | null = null;

  if (channelResponse.message.forward_origin) {
    // Forwarded message — try to extract channel info
    const origin = channelResponse.message.forward_origin;
    if (origin.type === "channel") {
      channelTelegramId = BigInt(origin.chat.id);
      channelName = origin.chat.title ?? "Unknown Channel";
      channelUsername =
        "username" in origin.chat ? (origin.chat.username ?? null) : null;
    } else {
      await ctx.reply("❌ Please forward a message from a channel, not a user or group.");
      return;
    }
  } else if (channelResponse.message.text) {
    const text = channelResponse.message.text.trim();
    if (text === "/cancel") {
      await ctx.reply("❌ Giveaway creation cancelled.");
      return;
    }

    // Try to resolve channel username
    const username = text.startsWith("@") ? text.substring(1) : text;
    try {
      const chat = await ctx.api.getChat(`@${username}`);
      if (chat.type !== "channel" && chat.type !== "supergroup") {
        await ctx.reply("❌ That doesn't appear to be a channel. Please try again.");
        return;
      }
      channelTelegramId = BigInt(chat.id);
      channelName = "title" in chat ? (chat.title ?? username) : username;
      channelUsername = "username" in chat ? (chat.username ?? null) : null;
    } catch {
      await ctx.reply(
        "❌ Could not find that channel. Make sure I'm an admin there and try again."
      );
      return;
    }
  } else {
    await ctx.reply("❌ Please send a channel username or forward a channel message.");
    return;
  }

  // Ensure channel exists in DB
  await upsertChannel({
    telegramId: channelTelegramId,
    name: channelName,
    username: channelUsername,
  });

  // ─── Step 4: End Date ───
  await ctx.reply(
    [
      `✅ Channel: <b>${escapeHtml(channelName)}</b>`,
      ``,
      `<b>Step 4/6: End Date & Time</b>`,
      `When should the giveaway end?`,
      ``,
      `Format: <code>YYYY-MM-DD HH:MM</code> (UTC)`,
      `Example: <code>2026-06-15 18:00</code>`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  let endTime: Date | null = null;
  while (!endTime) {
    const dateResponse = await conversation.waitFor("message:text");
    const dateText = dateResponse.message.text;

    if (dateText === "/cancel") {
      await ctx.reply("❌ Giveaway creation cancelled.");
      return;
    }

    endTime = parseUserDate(dateText);
    if (!endTime) {
      await ctx.reply(
        "❌ Invalid date format. Please use: <code>YYYY-MM-DD HH:MM</code>",
        { parse_mode: "HTML" }
      );
    } else if (!isFuture(endTime)) {
      await ctx.reply("❌ End date must be in the future.");
      endTime = null;
    }
  }

  // ─── Step 5: Max Winners ───
  await ctx.reply(
    [
      `✅ End: <b>${formatDate(endTime)}</b>`,
      ``,
      `<b>Step 5/6: Number of Winners</b>`,
      `How many winners should be selected? (default: 1)`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  const winnersResponse = await conversation.waitFor("message:text");
  let maxWinners = 1;

  if (winnersResponse.message.text !== "/cancel") {
    const parsed = parseInt(winnersResponse.message.text, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      maxWinners = parsed;
    }
  } else {
    await ctx.reply("❌ Giveaway creation cancelled.");
    return;
  }

  // ─── Step 6: Confirm ───
  const startTime = new Date();

  const confirmKeyboard = new InlineKeyboard()
    .text("✅ Create & Announce", "confirm_create")
    .row()
    .text("❌ Cancel", "cancel_create");

  await ctx.reply(
    [
      `📋 <b>Giveaway Summary</b>`,
      ``,
      `🎁 <b>Prize:</b> ${escapeHtml(prize)}`,
      `📂 <b>Type:</b> ${giveawayType.replace(/_/g, " ")}`,
      `📢 <b>Channel:</b> ${escapeHtml(channelName)}`,
      `📅 <b>Start:</b> Now`,
      `📅 <b>End:</b> ${formatDate(endTime)}`,
      `🏆 <b>Winners:</b> ${maxWinners}`,
      ``,
      `Create this giveaway and announce it in the channel?`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: confirmKeyboard }
  );

  const confirmCallback = await conversation.waitForCallbackQuery([
    "confirm_create",
    "cancel_create",
  ]);

  if (confirmCallback.match === "cancel_create") {
    await confirmCallback.editMessageText("❌ Giveaway creation cancelled.");
    await confirmCallback.answerCallbackQuery();
    return;
  }

  await confirmCallback.answerCallbackQuery("⏳ Creating giveaway...");

  // Create the giveaway
  try {
    const giveawayId = await createGiveaway({
      prize,
      type: giveawayType,
      channelTelegramId,
      startTime,
      endTime,
      maxWinners,
      createdByTelegramId: BigInt(userId),
    });

    // Activate immediately
    await activateGiveaway(giveawayId);

    // Get full giveaway data
    const giveaway = await getGiveaway(giveawayId);
    if (!giveaway) {
      await confirmCallback.editMessageText("❌ Error retrieving giveaway.");
      return;
    }

    // Announce in channel
    const botInfo = await ctx.api.getMe();
    await announceGiveaway(ctx.api, giveaway, botInfo.username);

    // Schedule auto-end
    scheduleGiveawayEnd(giveaway, ctx.api);

    await confirmCallback.editMessageText(
      [
        `🎉 <b>Giveaway Created!</b>`,
        ``,
        `🆔 <b>ID:</b> <code>${giveawayId}</code>`,
        `🎁 <b>Prize:</b> ${escapeHtml(prize)}`,
        `📢 Announced in: ${escapeHtml(channelName)}`,
        `⏰ Ends: ${formatDate(endTime)}`,
        `🏆 Winners: ${maxWinners}`,
        ``,
        `The giveaway is now <b>LIVE</b>! 🟢`,
        `Use /status to monitor it.`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    log.info(
      { giveawayId, prize, channelName, endTime: endTime.toISOString() },
      "Giveaway created and announced"
    );
  } catch (error) {
    log.error({ error }, "Failed to create giveaway");
    await confirmCallback.editMessageText(
      "❌ Failed to create giveaway. Please try again."
    );
  }
}
