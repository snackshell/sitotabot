import { describe, expect, it } from "vitest";
import {
  formatGiveawayAnnouncement,
  parseTelegramUsername,
} from "../../src/utils/telegram.js";
import type { GiveawayWithRelations } from "../../src/types/index.js";

describe("parseTelegramUsername", () => {
  it("accepts common Telegram username forms", () => {
    expect(parseTelegramUsername("@anexon_iv")).toBe("anexon_iv");
    expect(parseTelegramUsername("@ anexon_iv")).toBe("anexon_iv");
    expect(parseTelegramUsername("anexon_iv")).toBe("anexon_iv");
    expect(parseTelegramUsername("https://t.me/anexon_iv")).toBe("anexon_iv");
    expect(parseTelegramUsername("t.me/@ anexon_iv")).toBe("anexon_iv");
  });

  it("rejects invalid usernames", () => {
    expect(parseTelegramUsername("@bad name")).toBeNull();
    expect(parseTelegramUsername("@abcd")).toBeNull();
    expect(parseTelegramUsername("@too-long-username-name-name-name-name")).toBeNull();
  });
});

describe("formatGiveawayAnnouncement", () => {
  it("lists every required channel in multi-channel announcements", () => {
    const giveaway: GiveawayWithRelations = {
      id: "giveaway-123",
      channelId: 1,
      createdBy: 1,
      prize: "PS5 Console",
      description: null,
      type: "multi_channel",
      startTime: new Date("2099-01-01T00:00:00.000Z"),
      endTime: new Date("2099-01-02T00:00:00.000Z"),
      maxWinners: 1,
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
      createdAt: new Date("2099-01-01T00:00:00.000Z"),
      updatedAt: new Date("2099-01-01T00:00:00.000Z"),
    };

    const text = formatGiveawayAnnouncement(giveaway, "sitotabot", [
      { name: "Main Channel", username: "mainchannel" },
      { name: "Partner Channel", username: "@partnerchannel" },
    ]);

    expect(text).toContain("<b>Required Channels:</b>");
    expect(text).toContain("1. Main Channel (@mainchannel)");
    expect(text).toContain("2. Partner Channel (@partnerchannel)");
  });
});
