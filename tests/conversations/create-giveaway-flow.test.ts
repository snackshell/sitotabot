import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertChannel: vi.fn(),
  createGiveaway: vi.fn(),
  getGiveaway: vi.fn(),
  activateGiveaway: vi.fn(),
  announceGiveaway: vi.fn(),
  scheduleGiveawayEnd: vi.fn(),
}));

vi.mock("../../src/services/giveaway.service.js", () => ({
  upsertChannel: mocks.upsertChannel,
  createGiveaway: mocks.createGiveaway,
  getGiveaway: mocks.getGiveaway,
  activateGiveaway: mocks.activateGiveaway,
}));

vi.mock("../../src/services/notification.service.js", () => ({
  announceGiveaway: mocks.announceGiveaway,
}));

vi.mock("../../src/services/scheduler.service.js", () => ({
  scheduleGiveawayEnd: mocks.scheduleGiveawayEnd,
}));

import { createGiveawayFlow } from "../../src/conversations/create-giveaway-flow.js";

function makeMessageResponse(text: string, replyLog: string[]) {
  return {
    message: { text },
    reply: vi.fn(async (message: string) => {
      replyLog.push(message);
    }),
  };
}

function makeCallbackResponse(match: string[] | string) {
  return {
    match,
    answerCallbackQuery: vi.fn(async () => undefined),
    editMessageText: vi.fn(async () => undefined),
  };
}

describe("createGiveawayFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.upsertChannel.mockResolvedValue(1);
    mocks.createGiveaway.mockResolvedValue("giveaway-123");
    mocks.activateGiveaway.mockResolvedValue(undefined);
    mocks.getGiveaway.mockResolvedValue({
      id: "giveaway-123",
      channelId: 1,
      createdBy: 1,
      prize: "PS5 Console",
      description: null,
      type: "all_members",
      startTime: new Date("2026-06-02T00:00:00.000Z"),
      endTime: new Date("2026-06-15T18:00:00.000Z"),
      maxWinners: 3,
      creatorContactUsername: "admin",
      winnersPublic: true,
      minAccountAge: null,
      joinDateAfter: null,
      joinDateBefore: null,
      weightByActivity: false,
      status: "active",
      seed: null,
      participantHash: null,
      proofHash: null,
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
      channel: {
        id: 1,
        telegramId: 1000n,
        name: "My Channel",
        username: "mychannel",
      },
      creator: {
        id: 1,
        telegramId: 123n,
        username: "admin",
        firstName: "Admin",
      },
    });
  });

  it("reaches step 5 and finishes the giveaway flow after the date input", async () => {
    const replies: string[] = [];
    const messageReplies: string[] = [];
    const edits: string[] = [];
    const api = {
      getMe: vi.fn(async () => ({ id: 99, username: "sitotabot" })),
      getChat: vi.fn(async () => ({
        id: -1001,
        type: "channel",
        title: "My Channel",
        username: "mychannel",
      })),
      getChatMember: vi.fn(async (chatId: number, userId: number) => ({
        status: userId === 123 ? "creator" : "administrator",
        can_post_messages: true,
      })),
    };

    const ctx: any = {
      from: { id: 123, username: "admin" },
      chat: { id: 123, type: "private" },
      me: { username: "sitotabot" },
      api,
      reply: vi.fn(async (text: string) => {
        replies.push(text);
        return { message_id: replies.length };
      }),
    };

    const conversation: any = {
      now: vi.fn(async () => Date.UTC(2026, 5, 2, 0, 0)),
      log: vi.fn(async () => undefined),
      external: vi.fn(async (op: any) => op({ api })),
      waitFor: vi
        .fn()
        .mockResolvedValueOnce(makeMessageResponse("PS5 Console", messageReplies))
        .mockResolvedValueOnce(makeMessageResponse("@mychannel", messageReplies))
        .mockResolvedValueOnce(
          makeMessageResponse("2026-06-15 18:00", messageReplies)
        )
        .mockResolvedValueOnce(makeMessageResponse("3", messageReplies))
        .mockResolvedValueOnce(makeMessageResponse("me", messageReplies)),
      waitForCallbackQuery: vi
        .fn()
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse(["type:all_members", "all_members"]), {
            match: ["type:all_members", "all_members"],
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        )
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse("winners_public"), {
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        )
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse("confirm_create_announce"), {
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        ),
    };

    await createGiveawayFlow(conversation, ctx);

    expect(api.getChat).toHaveBeenCalledWith("@mychannel");
    expect(api.getChatMember).toHaveBeenCalled();
    expect(mocks.upsertChannel).toHaveBeenCalledTimes(1);
    expect(mocks.createGiveaway).toHaveBeenCalledWith(
      expect.objectContaining({
        prize: "PS5 Console",
        type: "all_members",
        maxWinners: 3,
        channelTelegramId: -1001n,
        createdByTelegramId: 123n,
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        creatorContactUsername: "admin",
        winnersPublic: true,
      })
    );
    expect(mocks.announceGiveaway).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleGiveawayEnd).toHaveBeenCalledTimes(1);
    expect(
      messageReplies.some((text) => text.includes("Step 5/6: Number of Winners"))
    ).toBe(true);
    expect(edits.some((text) => text.includes("Giveaway Created!"))).toBe(true);
  });

  it("creates and schedules a giveaway without announcing when requested", async () => {
    const replies: string[] = [];
    const messageReplies: string[] = [];
    const edits: string[] = [];
    const api = {
      getMe: vi.fn(async () => ({ id: 99, username: "sitotabot" })),
      getChat: vi.fn(async () => ({
        id: -1001,
        type: "channel",
        title: "My Channel",
        username: "mychannel",
      })),
      getChatMember: vi.fn(async (chatId: number, userId: number) => ({
        status: userId === 123 ? "creator" : "administrator",
        can_post_messages: true,
      })),
    };

    const ctx: any = {
      from: { id: 123, username: "admin" },
      chat: { id: 123, type: "private" },
      me: { username: "sitotabot" },
      api,
      reply: vi.fn(async (text: string) => {
        replies.push(text);
        return { message_id: replies.length };
      }),
    };

    const conversation: any = {
      now: vi.fn(async () => Date.UTC(2026, 5, 2, 0, 0)),
      log: vi.fn(async () => undefined),
      external: vi.fn(async (op: any) => op({ api })),
      waitFor: vi
        .fn()
        .mockResolvedValueOnce(makeMessageResponse("PS5 Console", messageReplies))
        .mockResolvedValueOnce(makeMessageResponse("@mychannel", messageReplies))
        .mockResolvedValueOnce(
          makeMessageResponse("2026-06-15 18:00", messageReplies)
        )
        .mockResolvedValueOnce(makeMessageResponse("3", messageReplies))
        .mockResolvedValueOnce(makeMessageResponse("@admin", messageReplies)),
      waitForCallbackQuery: vi
        .fn()
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse(["type:all_members", "all_members"]), {
            match: ["type:all_members", "all_members"],
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        )
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse("winners_private"), {
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        )
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse("confirm_create_only"), {
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        ),
    };

    await createGiveawayFlow(conversation, ctx);

    expect(mocks.createGiveaway).toHaveBeenCalledTimes(1);
    expect(mocks.activateGiveaway).toHaveBeenCalledTimes(1);
    expect(mocks.announceGiveaway).not.toHaveBeenCalled();
    expect(mocks.scheduleGiveawayEnd).toHaveBeenCalledTimes(1);
    expect(edits.some((text) => text.includes("Announcement: Skipped"))).toBe(true);
  });

  it("allows extra required channels where the creator is not an admin", async () => {
    const replies: string[] = [];
    const messageReplies: string[] = [];
    const edits: string[] = [];
    const api = {
      getMe: vi.fn(async () => ({ id: 99, username: "sitotabot" })),
      getChat: vi.fn(async (chatId: string) => {
        if (chatId === "@partnerchannel") {
          return {
            id: -2002,
            type: "channel",
            title: "Partner Channel",
            username: "partnerchannel",
          };
        }

        return {
          id: -1001,
          type: "channel",
          title: "My Channel",
          username: "mychannel",
        };
      }),
      getChatMember: vi.fn(async (chatId: number, userId: number) => {
        if (chatId === -1001 && userId === 123) {
          return { status: "creator" };
        }

        if (userId === 99) {
          return { status: "administrator", can_post_messages: true };
        }

        return { status: "left" };
      }),
    };

    const ctx: any = {
      from: { id: 123, username: "admin" },
      chat: { id: 123, type: "private" },
      me: { username: "sitotabot" },
      api,
      reply: vi.fn(async (text: string) => {
        replies.push(text);
        return { message_id: replies.length };
      }),
    };

    const conversation: any = {
      now: vi.fn(async () => Date.UTC(2026, 5, 2, 0, 0)),
      log: vi.fn(async () => undefined),
      external: vi.fn(async (op: any) => op({ api })),
      waitFor: vi
        .fn()
        .mockResolvedValueOnce(makeMessageResponse("PS5 Console", messageReplies))
        .mockResolvedValueOnce(makeMessageResponse("@mychannel", messageReplies))
        .mockResolvedValueOnce(makeMessageResponse("@partnerchannel", messageReplies))
        .mockResolvedValueOnce(
          makeMessageResponse("2026-06-15 18:00", messageReplies)
        )
        .mockResolvedValueOnce(makeMessageResponse("3", messageReplies))
        .mockResolvedValueOnce(makeMessageResponse("me", messageReplies)),
      waitForCallbackQuery: vi
        .fn()
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse(["type:multi_channel", "multi_channel"]), {
            match: ["type:multi_channel", "multi_channel"],
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        )
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse("winners_public"), {
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        )
        .mockResolvedValueOnce(
          Object.assign(makeCallbackResponse("confirm_create_only"), {
            editMessageText: vi.fn(async (text: string) => {
              edits.push(text);
            }),
          })
        ),
    };

    await createGiveawayFlow(conversation, ctx);

    expect(api.getChatMember).not.toHaveBeenCalledWith(-2002, 123);
    expect(mocks.upsertChannel).toHaveBeenCalledTimes(2);
    expect(mocks.createGiveaway).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "multi_channel",
        channelTelegramId: -1001n,
        additionalChannelIds: [-2002n],
      })
    );
    expect(edits.some((text) => text.includes("Giveaway Created!"))).toBe(true);
  });
});
