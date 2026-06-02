import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { participants, users, giveaways } from "../db/schema.js";
import type { ParticipantWithUser } from "../types/index.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("service:participant");

/**
 * Register a participant for a giveaway.
 * Returns the participant ID or null if already registered.
 */
export async function registerParticipant(
  giveawayId: string,
  userId: number,
  isEligible: boolean = true,
  eligibilityReason?: string
): Promise<number | null> {
  // Check if already registered
  const existing = await db.query.participants.findFirst({
    where: and(
      eq(participants.giveawayId, giveawayId),
      eq(participants.userId, userId)
    ),
  });

  if (existing) {
    log.debug(
      { giveawayId, userId },
      "User already registered for giveaway"
    );
    return null;
  }

  // Check giveaway is active
  const giveaway = await db.query.giveaways.findFirst({
    where: eq(giveaways.id, giveawayId),
  });

  if (!giveaway || giveaway.status !== "active") {
    log.warn(
      { giveawayId, status: giveaway?.status },
      "Cannot register — giveaway not active"
    );
    return null;
  }

  const [participant] = await db
    .insert(participants)
    .values({
      giveawayId,
      userId,
      isEligible,
      eligibilityReason: eligibilityReason ?? null,
    })
    .returning({ id: participants.id });

  log.info(
    { giveawayId, userId, participantId: participant!.id },
    "Participant registered"
  );

  return participant!.id;
}

/**
 * Get all participants for a giveaway, with user data.
 */
export async function getParticipants(
  giveawayId: string
): Promise<ParticipantWithUser[]> {
  const results = await db.query.participants.findMany({
    where: eq(participants.giveawayId, giveawayId),
    with: { user: true },
    orderBy: (p, { asc }) => [asc(p.joinedAt)],
  });

  return results as unknown as ParticipantWithUser[];
}

/**
 * Get only eligible participants for a giveaway.
 */
export async function getEligibleParticipants(
  giveawayId: string
): Promise<ParticipantWithUser[]> {
  const results = await db.query.participants.findMany({
    where: and(
      eq(participants.giveawayId, giveawayId),
      eq(participants.isEligible, true)
    ),
    with: { user: true },
    orderBy: (p, { asc }) => [asc(p.joinedAt)],
  });

  return results as unknown as ParticipantWithUser[];
}

/**
 * Get the total participant count for a giveaway.
 */
export async function getParticipantCount(
  giveawayId: string
): Promise<{ total: number; eligible: number }> {
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participants)
    .where(eq(participants.giveawayId, giveawayId));

  const [eligible] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participants)
    .where(
      and(
        eq(participants.giveawayId, giveawayId),
        eq(participants.isEligible, true)
      )
    );

  return {
    total: total?.count ?? 0,
    eligible: eligible?.count ?? 0,
  };
}

/**
 * Update a participant's eligibility status.
 */
export async function updateParticipantEligibility(
  giveawayId: string,
  userId: number,
  isEligible: boolean,
  reason?: string
): Promise<void> {
  await db
    .update(participants)
    .set({
      isEligible,
      eligibilityReason: reason ?? null,
    })
    .where(
      and(
        eq(participants.giveawayId, giveawayId),
        eq(participants.userId, userId)
      )
    );
}

/**
 * Get a user's internal ID from their Telegram ID.
 */
export async function getUserByTelegramId(
  telegramId: bigint
): Promise<{ id: number; telegramId: bigint; firstName: string; username: string | null } | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  if (!user) return null;

  return {
    id: user.id,
    telegramId: user.telegramId,
    firstName: user.firstName,
    username: user.username,
  };
}

/**
 * Check if a user is already registered for a giveaway.
 */
export async function isParticipantRegistered(
  giveawayId: string,
  userId: number
): Promise<boolean> {
  const existing = await db.query.participants.findFirst({
    where: and(
      eq(participants.giveawayId, giveawayId),
      eq(participants.userId, userId)
    ),
  });

  return !!existing;
}
