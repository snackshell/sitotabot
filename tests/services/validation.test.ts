import { describe, expect, it, vi } from "vitest";
import { validateParticipant } from "../../src/services/validation.service.js";
import type { GiveawayWithRelations } from "../../src/types/index.js";

function makeGiveaway(
  type: GiveawayWithRelations["type"]
): GiveawayWithRelations {
  return {
    id: "giveaway-123",
    channelId: 1,
    createdBy: 1,
    prize: "PS5",
    description: null,
    type,
    startTime: new Date("2026-06-02T10:00:00.000Z"),
    endTime: new Date("2026-06-15T18:00:00.000Z"),
    maxWinners: 1,
    minAccountAge: null,
    joinDateAfter: null,
    joinDateBefore: null,
    weightByActivity: false,
    status: "active",
    seed: null,
    participantHash: null,
    proofHash: null,
    createdAt: new Date("2026-06-02T10:00:00.000Z"),
    updatedAt: new Date("2026-06-02T10:00:00.000Z"),
  };
}

function makeApi(statuses: string[]) {
  return {
    getChatMember: vi.fn(async () => ({
      status: statuses.shift() ?? "member",
    })),
  } as any;
}

describe("validateParticipant", () => {
  it("allows all members who are in every required channel", async () => {
    const api = makeApi(["member", "member"]);

    const result = await validateParticipant(
      api,
      makeGiveaway("all_members"),
      [1000n, 2000n],
      123,
      null,
      new Date("2026-06-01T10:00:00.000Z")
    );

    expect(result.isEligible).toBe(true);
    expect(api.getChatMember).toHaveBeenCalledTimes(2);
  });

  it("rejects users missing any required channel", async () => {
    const api = makeApi(["member", "left"]);

    const result = await validateParticipant(
      api,
      makeGiveaway("all_members"),
      [1000n, 2000n],
      123,
      null,
      new Date("2026-06-01T10:00:00.000Z")
    );

    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("Not a member");
  });

  it("allows new members first seen after giveaway start", async () => {
    const result = await validateParticipant(
      makeApi(["member"]),
      makeGiveaway("new_members"),
      [1000n],
      123,
      null,
      new Date("2026-06-02T10:05:00.000Z")
    );

    expect(result.isEligible).toBe(true);
  });

  it("rejects new members first seen before giveaway start", async () => {
    const result = await validateParticipant(
      makeApi(["member"]),
      makeGiveaway("new_members"),
      [1000n],
      123,
      null,
      new Date("2026-06-02T09:55:00.000Z")
    );

    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("new members");
  });

  it("allows existing members first seen before giveaway start", async () => {
    const result = await validateParticipant(
      makeApi(["member"]),
      makeGiveaway("existing_members"),
      [1000n],
      123,
      null,
      new Date("2026-06-02T09:55:00.000Z")
    );

    expect(result.isEligible).toBe(true);
  });

  it("rejects existing members first seen after giveaway start", async () => {
    const result = await validateParticipant(
      makeApi(["member"]),
      makeGiveaway("existing_members"),
      [1000n],
      123,
      null,
      new Date("2026-06-02T10:05:00.000Z")
    );

    expect(result.isEligible).toBe(false);
    expect(result.reason).toContain("existing members");
  });
});
