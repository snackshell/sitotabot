import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  giveaways,
  giveawayChannels,
  channels,
  users,
} from "../db/schema.js";
import type {
  GiveawayCreateInput,
  GiveawayWithRelations,
  GiveawayStatus,
} from "../types/index.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("service:giveaway");

/**
 * Ensure a user record exists in the database, creating or updating as needed.
 * Returns the internal user ID.
 */
export async function upsertUser(userData: {
  telegramId: bigint;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  isBot?: boolean;
}): Promise<number> {
  const existing = await db.query.users.findFirst({
    where: eq(users.telegramId, userData.telegramId),
  });

  if (existing) {
    await db
      .update(users)
      .set({
        username: userData.username ?? existing.username,
        firstName: userData.firstName,
        lastName: userData.lastName ?? existing.lastName,
      })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const [newUser] = await db
    .insert(users)
    .values({
      telegramId: userData.telegramId,
      username: userData.username ?? null,
      firstName: userData.firstName,
      lastName: userData.lastName ?? null,
      isBot: userData.isBot ?? false,
    })
    .returning({ id: users.id });

  return newUser!.id;
}

/**
 * Ensure a channel record exists in the database.
 * Returns the internal channel ID.
 */
export async function upsertChannel(channelData: {
  telegramId: bigint;
  name: string;
  username?: string | null;
  memberCount?: number | null;
}): Promise<number> {
  const existing = await db.query.channels.findFirst({
    where: eq(channels.telegramId, channelData.telegramId),
  });

  if (existing) {
    await db
      .update(channels)
      .set({
        name: channelData.name,
        username: channelData.username ?? existing.username,
        memberCount: channelData.memberCount ?? existing.memberCount,
      })
      .where(eq(channels.id, existing.id));
    return existing.id;
  }

  const [newChannel] = await db
    .insert(channels)
    .values({
      telegramId: channelData.telegramId,
      name: channelData.name,
      username: channelData.username ?? null,
      memberCount: channelData.memberCount ?? null,
    })
    .returning({ id: channels.id });

  return newChannel!.id;
}

/**
 * Create a new giveaway.
 */
export async function createGiveaway(
  input: GiveawayCreateInput
): Promise<string> {
  log.info({ prize: input.prize, type: input.type }, "Creating giveaway");

  // Ensure creator user exists
  const creatorId = await upsertUser({
    telegramId: input.createdByTelegramId,
    firstName: "Admin",
  });

  const existingPrimaryChannel = await db.query.channels.findFirst({
    where: eq(channels.telegramId, input.channelTelegramId),
  });

  const channelId =
    existingPrimaryChannel?.id ??
    (await upsertChannel({
      telegramId: input.channelTelegramId,
      name: `Channel ${input.channelTelegramId}`,
    }));

  // Create giveaway
  const [giveaway] = await db
    .insert(giveaways)
    .values({
      channelId,
      createdBy: creatorId,
      prize: input.prize,
      description: input.description ?? null,
      type: input.type,
      startTime: input.startTime,
      endTime: input.endTime,
      maxWinners: input.maxWinners,
      minAccountAge: input.minAccountAge ?? null,
      joinDateAfter: input.joinDateAfter ?? null,
      joinDateBefore: input.joinDateBefore ?? null,
      weightByActivity: input.weightByActivity ?? false,
      status: input.startTime <= new Date() ? "active" : "draft",
    })
    .returning({ id: giveaways.id });

  const giveawayId = giveaway!.id;

  // Add primary channel to giveaway_channels
  await db.insert(giveawayChannels).values({
    giveawayId,
    channelId,
  });

  // Add additional channels if multi-channel
  if (input.additionalChannelIds?.length) {
    for (const additionalTgId of input.additionalChannelIds) {
      const existingAdditionalChannel = await db.query.channels.findFirst({
        where: eq(channels.telegramId, additionalTgId),
      });

      const addChannelId =
        existingAdditionalChannel?.id ??
        (await upsertChannel({
          telegramId: additionalTgId,
          name: `Channel ${additionalTgId}`,
        }));

      await db.insert(giveawayChannels).values({
        giveawayId,
        channelId: addChannelId,
      });
    }
  }

  log.info({ giveawayId }, "Giveaway created successfully");
  return giveawayId;
}

/**
 * Get a giveaway by ID with relations.
 */
export async function getGiveaway(
  id: string
): Promise<GiveawayWithRelations | null> {
  const result = await db.query.giveaways.findFirst({
    where: eq(giveaways.id, id),
    with: {
      channel: true,
      creator: true,
    },
  });

  if (!result) return null;

  return result as unknown as GiveawayWithRelations;
}

/**
 * List active giveaways, optionally filtered by channel.
 */
export async function listActiveGiveaways(
  channelId?: number
): Promise<GiveawayWithRelations[]> {
  if (channelId) {
    const results = await db.query.giveaways.findMany({
      where: and(
        eq(giveaways.status, "active"),
        eq(giveaways.channelId, channelId)
      ),
      with: { channel: true, creator: true },
      orderBy: desc(giveaways.createdAt),
    });
    return results as unknown as GiveawayWithRelations[];
  }

  const results = await db.query.giveaways.findMany({
    where: eq(giveaways.status, "active"),
    with: { channel: true, creator: true },
    orderBy: desc(giveaways.createdAt),
  });
  return results as unknown as GiveawayWithRelations[];
}

/**
 * List all giveaways for a specific creator.
 */
export async function listGiveawaysByCreator(
  creatorTelegramId: bigint
): Promise<GiveawayWithRelations[]> {
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, creatorTelegramId),
  });

  if (!user) return [];

  const results = await db.query.giveaways.findMany({
    where: eq(giveaways.createdBy, user.id),
    with: { channel: true, creator: true },
    orderBy: desc(giveaways.createdAt),
  });
  return results as unknown as GiveawayWithRelations[];
}

/**
 * Update giveaway status.
 */
export async function updateGiveawayStatus(
  id: string,
  status: GiveawayStatus
): Promise<void> {
  await db
    .update(giveaways)
    .set({ status, updatedAt: new Date() })
    .where(eq(giveaways.id, id));

  log.info({ giveawayId: id, status }, "Giveaway status updated");
}

/**
 * Set the fairness proof data on a giveaway.
 */
export async function setGiveawayProof(
  id: string,
  seed: string,
  participantHash: string,
  proofHash: string
): Promise<void> {
  await db
    .update(giveaways)
    .set({
      seed,
      participantHash,
      proofHash,
      updatedAt: new Date(),
    })
    .where(eq(giveaways.id, id));
}

/**
 * Activate a giveaway (set status to active).
 */
export async function activateGiveaway(id: string): Promise<void> {
  await updateGiveawayStatus(id, "active");
}

/**
 * Get all channels associated with a giveaway.
 */
export async function getGiveawayChannels(
  giveawayId: string
): Promise<{ id: number; telegramId: bigint; name: string; username: string | null }[]> {
  const results = await db.query.giveawayChannels.findMany({
    where: eq(giveawayChannels.giveawayId, giveawayId),
    with: { channel: true },
  });

  return results.map((r: any) => ({
    id: r.channel.id,
    telegramId: r.channel.telegramId,
    name: r.channel.name,
    username: r.channel.username,
  }));
}

/**
 * Get giveaways that have passed their end time but are still active.
 * Used for crash recovery on startup.
 */
export async function getOverdueGiveaways(): Promise<GiveawayWithRelations[]> {
  const results = await db.query.giveaways.findMany({
    where: and(
      eq(giveaways.status, "active"),
      sql`${giveaways.endTime} <= NOW()`
    ),
    with: { channel: true, creator: true },
  });

  return results as unknown as GiveawayWithRelations[];
}

/**
 * Get active giveaways that haven't ended yet.
 * Used to restore scheduled endings on startup.
 */
export async function getPendingGiveaways(): Promise<GiveawayWithRelations[]> {
  const results = await db.query.giveaways.findMany({
    where: and(
      eq(giveaways.status, "active"),
      sql`${giveaways.endTime} > NOW()`
    ),
    with: { channel: true, creator: true },
  });

  return results as unknown as GiveawayWithRelations[];
}
