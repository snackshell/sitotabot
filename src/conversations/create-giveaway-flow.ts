import type { Conversation } from "@grammyjs/conversations";
import type { BotContext, GiveawayType } from "../types/index.js";
import { createGiveaway, upsertChannel, upsertUser } from "../services/giveaway.service.js";
import { announceGiveaway } from "../services/notification.service.js";
import { getGiveaway } from "../services/giveaway.service.js";
import { scheduleGiveawayEnd } from "../services/scheduler.service.js";
import { activateGiveaway } from "../services/giveaway.service.js";
import { parseUserDate, formatDate } from "../utils/date.js";
import { escapeHtml, parseTelegramUsername } from "../utils/telegram.js";
import { createChildLogger } from "../utils/logger.js";
import { InlineKeyboard } from "grammy";

const log = createChildLogger("conversation:create-giveaway");

type CreateGiveawayConversation = Conversation<BotContext, BotContext>;

/**
 * Multi-step giveaway creation wizard using grammY conversations.
 */
export async function createGiveawayFlow(
  conversation: CreateGiveawayConversation,
  ctx: BotContext
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  await conversation.log("create giveaway flow started", {
    userId,
    chatId: ctx.chat?.id,
  });

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
  await conversation.log("waiting for prize description");
  const prizeResponse = await conversation.waitFor("message:text");
  const prize = prizeResponse.message.text;
  await conversation.log("received prize description", { prize });

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

  await conversation.log("waiting for giveaway type selection");
  const typeCallback = await conversation.waitForCallbackQuery(
    /^type:(.+)$/
  );
  const giveawayType = typeCallback.match![1] as GiveawayType;
  await conversation.log("received giveaway type selection", {
    giveawayType,
  });
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

  let channelTelegramId: bigint | null = null;
  let channelName = "";
  let channelUsername: string | null = null;
  const additionalChannelTelegramIds: bigint[] = [];

  while (!channelTelegramId) {
    await conversation.log("waiting for channel input");
    const channelResponse = await conversation.waitFor("message");
    let targetChatId: number | string | null = null;
    let fallbackName = "";

    if (channelResponse.message.forward_origin) {
      const origin = channelResponse.message.forward_origin;
      if (origin.type === "channel") {
        targetChatId = origin.chat.id;
        fallbackName = origin.chat.title ?? "Unknown Channel";
        channelUsername = "username" in origin.chat ? (origin.chat.username ?? null) : null;
        await conversation.log("received forwarded channel", {
          targetChatId,
          fallbackName,
          channelUsername,
        });
      } else {
        await ctx.reply("❌ Please forward a message from a channel, not a user or group. Or send the channel username (e.g., @mychannel):");
        continue;
      }
    } else if (channelResponse.message.text) {
      const text = channelResponse.message.text.trim();
      await conversation.log("received channel text", { text });
      if (text === "/cancel") {
        await ctx.reply("❌ Giveaway creation cancelled.");
        return;
      }
      targetChatId = text.startsWith("@") ? text : `@${text}`;
      fallbackName = text;
    } else {
      await ctx.reply("❌ Please send a channel username or forward a channel message. Or send /cancel:");
      continue;
    }

    try {
      const chat = await ctx.api.getChat(targetChatId!);
      await conversation.log("resolved channel chat", {
        chatId: chat.id,
        chatType: chat.type,
      });
      if (chat.type !== "channel" && chat.type !== "supergroup") {
        await ctx.reply("❌ That doesn't appear to be a channel. Please try again or send /cancel:");
        continue;
      }

      // Verify the bot is an admin/creator in the channel
      const botInfo = await ctx.api.getMe();
      const botMember = await ctx.api.getChatMember(chat.id, botInfo.id);
      await conversation.log("verified bot membership", {
        botId: botInfo.id,
        botStatus: botMember.status,
      });

      if (botMember.status !== "administrator" && botMember.status !== "creator") {
        await ctx.reply("❌ I am not an administrator in that channel. Please add me as an admin with post privileges and try again, or send /cancel:");
        continue;
      }

      if (chat.type === "channel" && botMember.status === "administrator" && !botMember.can_post_messages) {
        await ctx.reply("❌ I do not have permission to post messages in that channel. Please grant me the 'Post Messages' permission and try again, or send /cancel:");
        continue;
      }

      // Verify the user creating the giveaway is an admin/creator in the channel
      const userMember = await ctx.api.getChatMember(chat.id, userId);
      await conversation.log("verified creator membership", {
        userId,
        userStatus: userMember.status,
      });
      if (userMember.status !== "administrator" && userMember.status !== "creator") {
        await ctx.reply("❌ You are not an administrator in that channel. Only channel administrators can create giveaways for it. Please try again or send /cancel:");
        continue;
      }

      channelTelegramId = BigInt(chat.id);
      channelName = "title" in chat ? (chat.title ?? fallbackName) : fallbackName;
      channelUsername = "username" in chat ? (chat.username ?? null) : (typeof targetChatId === "string" && targetChatId.startsWith("@") ? targetChatId.substring(1) : null);
    } catch (error) {
      await ctx.reply(
        "❌ Could not access that channel. Make sure I have been added as an administrator to the channel and try again, or send /cancel:"
      );
    }
  }

  // Ensure channel exists in DB
  await conversation.log("upserting channel", {
    channelTelegramId: channelTelegramId.toString(),
    channelName,
    channelUsername,
  });
  await conversation.external(async () => {
    await upsertChannel({
      telegramId: channelTelegramId,
      name: channelName,
      username: channelUsername,
    });
  });
  await conversation.log("channel upsert complete");

  if (giveawayType === "multi_channel") {
    await ctx.reply(
      [
        `<b>Additional Required Channels</b>`,
        `Send extra channel usernames separated by commas or new lines.`,
        `I only need to be an admin in these extra channels; you do not need to be an admin there.`,
        ``,
        `Example: <code>@channel_one, @channel_two</code>`,
        `Send <code>none</code> if there are no extra channels.`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    let extraChannelsDone = false;
    while (!extraChannelsDone) {
      await conversation.log("waiting for additional channels input");
      const extraChannelsResponse = await conversation.waitFor("message:text");
      const text = extraChannelsResponse.message.text.trim();
      await conversation.log("received additional channels input", { text });

      if (text === "/cancel") {
        await extraChannelsResponse.reply("❌ Giveaway creation cancelled.");
        return;
      }

      if (text.toLowerCase() === "none") {
        extraChannelsDone = true;
        continue;
      }

      const channelInputs = text
        .split(/[\n,]+/)
        .map((input) => input.trim())
        .filter(Boolean)
        .map((input) => (input.startsWith("@") ? input : `@${input}`));

      if (channelInputs.length === 0) {
        await extraChannelsResponse.reply(
          "❌ Please send at least one channel username, or send none."
        );
        continue;
      }

      try {
        for (const channelInput of channelInputs) {
          const chat = await ctx.api.getChat(channelInput);
          if (chat.type !== "channel" && chat.type !== "supergroup") {
            throw new Error(`${channelInput} is not a channel or supergroup.`);
          }

          const botInfo = await ctx.api.getMe();
          const botMember = await ctx.api.getChatMember(chat.id, botInfo.id);
          if (botMember.status !== "administrator" && botMember.status !== "creator") {
            throw new Error(`I am not an admin in ${channelInput}.`);
          }

          if (chat.type === "channel" && botMember.status === "administrator" && !botMember.can_post_messages) {
            throw new Error(`I cannot post in ${channelInput}.`);
          }

          const telegramId = BigInt(chat.id);
          if (telegramId === channelTelegramId || additionalChannelTelegramIds.includes(telegramId)) {
            continue;
          }

          additionalChannelTelegramIds.push(telegramId);
          await conversation.external(async () => {
            await upsertChannel({
              telegramId,
              name: "title" in chat ? (chat.title ?? channelInput) : channelInput,
              username: "username" in chat ? (chat.username ?? null) : channelInput.replace(/^@/, ""),
            });
          });
        }

        extraChannelsDone = true;
        await extraChannelsResponse.reply(
          `✅ Added ${additionalChannelTelegramIds.length} extra required channel(s).`
        );
      } catch (error) {
        await conversation.log("failed to validate additional channels", {
          error: error instanceof Error ? error.message : error,
        });
        await extraChannelsResponse.reply(
          "❌ Could not verify one of those channels. Make sure I am an admin there and try again, or send none."
        );
      }
    }
  }

  // ─── Step 4: End Date ───
  await ctx.reply(
    [
      `✅ Channel: <b>${escapeHtml(channelName)}</b>`,
      ``,
      `<b>Step 4/6: End Date & Time</b>`,
      `When should the giveaway end? Use Ethiopian time (EAT / UTC+3).`,
      ``,
      `Format: <code>YYYY-MM-DD HH:MM</code>`,
      `Example: <code>2026-06-15 18:00</code>`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  let endTime: Date | null = null;
  let dateResponse:
    | Awaited<ReturnType<CreateGiveawayConversation["waitFor"]>>
    | null = null;
  while (!endTime) {
    await conversation.log("waiting for end date input");
    dateResponse = await conversation.waitFor("message:text");
    const dateText = dateResponse.message.text.trim();
    await conversation.log("received end date input", { dateText });

    if (dateText === "/cancel") {
      await dateResponse.reply("❌ Giveaway creation cancelled.");
      return;
    }

    endTime = parseUserDate(dateText);
    await conversation.log("parsed end date", {
      dateText,
      parsed: endTime ? endTime.toISOString() : null,
    });
    if (!endTime) {
      await dateResponse.reply(
        "❌ Invalid date format. Please use: <code>YYYY-MM-DD HH:MM</code>",
        { parse_mode: "HTML" }
      );
    } else if (endTime.getTime() <= await conversation.now()) {
      await conversation.log("rejected end date because it is not in the future", {
        now: new Date(await conversation.now()).toISOString(),
        endTime: endTime.toISOString(),
      });
      await dateResponse.reply("❌ End date must be in the future.");
      endTime = null;
    } else {
      await conversation.log("Accepted giveaway end date", {
        userId,
        dateText,
        endTime: endTime.toISOString(),
      });
    }
  }
  await conversation.log("end date accepted", {
    endTime: endTime.toISOString(),
  });

  // ─── Step 5: Max Winners ───
  await conversation.log("sending step 5 prompt", {
    endTime: endTime.toISOString(),
  });
  await dateResponse!.reply(
    [
      `✅ End: <b>${formatDate(endTime)}</b>`,
      ``,
      `<b>Step 5/6: Number of Winners</b>`,
      `How many winners should be selected? (default: 1)`,
    ].join("\n"),
    { parse_mode: "HTML" }
  );

  let maxWinners: number | null = null;
  while (maxWinners === null) {
    await conversation.log("waiting for max winners input");
    const winnersResponse = await conversation.waitFor("message:text");
    const text = winnersResponse.message.text.trim();
    await conversation.log("received max winners input", { text });
    if (text === "/cancel") {
      await ctx.reply("❌ Giveaway creation cancelled.");
      return;
    }
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      maxWinners = parsed;
    } else {
      await ctx.reply(
        "❌ Please enter a valid number of winners (between 1 and 100) or send /cancel:"
      );
    }
  }

  // ─── Step 6: Creator Contact ───
  await ctx.reply(
    [
      `✅ Winners: <b>${maxWinners}</b>`,
      ``,
      `<b>Creator Contact</b>`,
      `Send the Telegram username winners should contact, e.g. <code>@adminusername</code>.`,
      ctx.from?.username
        ? `Send <code>me</code> to use @${escapeHtml(ctx.from.username)}.`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
    { parse_mode: "HTML" }
  );

  let creatorContactUsername: string | null = null;
  while (!creatorContactUsername) {
    await conversation.log("waiting for creator contact username");
    const contactResponse = await conversation.waitFor("message:text");
    const text = contactResponse.message.text.trim();
    await conversation.log("received creator contact username", { text });

    if (text === "/cancel") {
      await contactResponse.reply("❌ Giveaway creation cancelled.");
      return;
    }

    if (text.toLowerCase() === "me" && ctx.from?.username) {
      creatorContactUsername = ctx.from.username;
      break;
    }

    const username = parseTelegramUsername(text);
    if (username) {
      creatorContactUsername = username;
    } else {
      await contactResponse.reply(
        "❌ Please send a valid Telegram username like @adminusername, without spaces inside the name."
      );
    }
  }

  // ─── Step 7: Winner Visibility ───
  const visibilityKeyboard = new InlineKeyboard()
    .text("Public Winners", "winners_public")
    .row()
    .text("Private Winners", "winners_private");

  await ctx.reply(
    [
      `✅ Contact: <b>@${escapeHtml(creatorContactUsername)}</b>`,
      ``,
      `<b>Winner Visibility</b>`,
      `Public: winners are announced and anyone can view them in the bot.`,
      `Private: only you and the winners are notified.`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: visibilityKeyboard }
  );

  const visibilityCallback = await conversation.waitForCallbackQuery([
    "winners_public",
    "winners_private",
  ]);
  await visibilityCallback.answerCallbackQuery();
  const winnersPublic = visibilityCallback.match === "winners_public";
  await conversation.log("winner visibility selected", { winnersPublic });

  // ─── Step 8: Confirm ───
  const startTime = new Date();

  const confirmKeyboard = new InlineKeyboard()
    .text("✅ Create Only", "confirm_create_only")
    .row()
    .text("📣 Create & Announce", "confirm_create_announce")
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
      `👤 <b>Winner Contact:</b> @${escapeHtml(creatorContactUsername)}`,
      `👁 <b>Winner Visibility:</b> ${winnersPublic ? "Public" : "Private"}`,
      ``,
      `Create this giveaway?`,
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: confirmKeyboard }
  );
  await conversation.log("confirmation prompt sent", {
    maxWinners,
    giveawayType,
  });

  const confirmCallback = await conversation.waitForCallbackQuery([
    "confirm_create_only",
    "confirm_create_announce",
    "cancel_create",
  ]);
  await conversation.log("received confirmation callback", {
    match: confirmCallback.match,
  });

  if (confirmCallback.match === "cancel_create") {
    await confirmCallback.editMessageText("❌ Giveaway creation cancelled.");
    await confirmCallback.answerCallbackQuery();
    return;
  }

  await confirmCallback.answerCallbackQuery("⏳ Creating giveaway...");
  const shouldAnnounce = confirmCallback.match === "confirm_create_announce";

  // Create the giveaway
  try {
    await conversation.log("creating giveaway record", {
      prize,
      giveawayType,
      channelTelegramId: channelTelegramId.toString(),
        maxWinners,
        additionalChannels: additionalChannelTelegramIds.map((id) => id.toString()),
        creatorContactUsername,
        winnersPublic,
      });
    const giveawayId = await createGiveaway({
      prize,
      type: giveawayType,
      channelTelegramId,
      additionalChannelIds: additionalChannelTelegramIds,
      startTime,
      endTime,
      maxWinners,
      creatorContactUsername,
      winnersPublic,
      createdByTelegramId: BigInt(userId),
    });

    // Activate immediately
    await activateGiveaway(giveawayId);
    await conversation.log("giveaway activated", { giveawayId });

    // Get full giveaway data
    const giveaway = await getGiveaway(giveawayId);
    if (!giveaway) {
      await conversation.log("failed to load giveaway after creation", {
        giveawayId,
      });
      await confirmCallback.editMessageText("❌ Error retrieving giveaway.");
      return;
    }

    if (shouldAnnounce) {
      // Announce in channel
      const botInfo = await ctx.api.getMe();
      await conversation.log("announcing giveaway", {
        giveawayId,
        botUsername: botInfo.username,
      });
      await announceGiveaway(ctx.api, giveaway, botInfo.username);
    } else {
      await conversation.log("skipping giveaway announcement", { giveawayId });
    }

    // Schedule auto-end
    scheduleGiveawayEnd(giveaway, ctx.api);
    await conversation.log("scheduled giveaway end", {
      giveawayId,
      endTime: endTime.toISOString(),
    });

    await confirmCallback.editMessageText(
      [
        `🎉 <b>Giveaway Created!</b>`,
        ``,
        `🆔 <b>ID:</b> <code>${giveawayId}</code>`,
        `🎁 <b>Prize:</b> ${escapeHtml(prize)}`,
        shouldAnnounce
          ? `📢 Announced in: ${escapeHtml(channelName)}`
          : `📢 Announcement: Skipped`,
        `⏰ Ends: ${formatDate(endTime)}`,
        `🏆 Winners: ${maxWinners}`,
        `👁 Winner visibility: ${winnersPublic ? "Public" : "Private"}`,
        `👤 Winner contact: @${escapeHtml(creatorContactUsername)}`,
        ``,
        `The giveaway is now <b>LIVE</b>! 🟢`,
        `Use /status to monitor it.`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    log.info(
      {
        giveawayId,
        prize,
        channelName,
        endTime: endTime.toISOString(),
        announced: shouldAnnounce,
      },
      shouldAnnounce ? "Giveaway created and announced" : "Giveaway created"
    );
  } catch (error) {
    log.error({ error }, "Failed to create giveaway");
    await confirmCallback.editMessageText(
      "❌ Failed to create giveaway. Please try again."
    );
  }
}
