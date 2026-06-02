import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { winners, users } from "../db/schema.js";
import type { WinnerWithUser, FairnessProof } from "../types/index.js";
import {
  getGiveaway,
  updateGiveawayStatus,
  setGiveawayProof,
} from "./giveaway.service.js";
import {
  getEligibleParticipants,
  getParticipantCount,
} from "./participant.service.js";
import { generateFairnessProof } from "./fairness.service.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("service:winner");

/**
 * Execute a full winner draw for a giveaway.
 * 1. Lock the giveaway (set status to ended)
 * 2. Get eligible participants
 * 3. Generate fairness proof and select winners
 * 4. Store winners and proof in database
 * 5. Return the proof and winner list
 */
export async function drawWinners(
  giveawayId: string
): Promise<{
  proof: FairnessProof;
  winnerUsers: WinnerWithUser[];
} | null> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    log.error({ giveawayId }, "Giveaway not found");
    return null;
  }

  if (giveaway.status === "ended") {
    log.warn({ giveawayId }, "Giveaway already ended");
    return null;
  }

  // Get eligible participants
  const eligible = await getEligibleParticipants(giveawayId);

  if (eligible.length === 0) {
    log.warn({ giveawayId }, "No eligible participants");
    await updateGiveawayStatus(giveawayId, "ended");
    return null;
  }

  // Build participant maps
  const participantUserIds = eligible.map((p) => p.userId);
  const telegramIdMap = new Map<number, bigint>();
  for (const p of eligible) {
    telegramIdMap.set(p.userId, p.user.telegramId);
  }

  // Determine winner count
  const winnerCount = Math.min(giveaway.maxWinners, eligible.length);

  // Generate fairness proof and select winners
  const proof = await generateFairnessProof(
    giveawayId,
    participantUserIds,
    telegramIdMap,
    winnerCount,
    giveaway.endTime
  );

  // Store proof on giveaway
  await setGiveawayProof(
    giveawayId,
    proof.seed,
    proof.participantHash,
    proof.combinedHash
  );

  // Store winners in database
  const winnerRecords = proof.winnerIds.map((userId, index) => ({
    giveawayId,
    userId,
    position: index + 1,
    proofHash: proof.drawHashes[index] ?? proof.combinedHash,
    isReroll: false,
  }));

  await db.insert(winners).values(winnerRecords);

  // Set giveaway as ended
  await updateGiveawayStatus(giveawayId, "ended");

  // Fetch winners with user data
  const winnerUsers = await getWinners(giveawayId);

  log.info(
    {
      giveawayId,
      winnersCount: winnerUsers.length,
      proofHash: proof.combinedHash,
    },
    "Winners drawn successfully"
  );

  return { proof, winnerUsers };
}

/**
 * Reroll winner(s) for a giveaway.
 * Selects new winners from the remaining pool (excludes previous winners).
 */
export async function rerollWinners(
  giveawayId: string,
  count: number = 1,
  reason?: string
): Promise<{
  proof: FairnessProof;
  newWinners: WinnerWithUser[];
} | null> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    log.error({ giveawayId }, "Giveaway not found");
    return null;
  }

  if (giveaway.status !== "ended") {
    log.warn({ giveawayId }, "Cannot reroll — giveaway not ended");
    return null;
  }

  // Get all eligible participants
  const eligible = await getEligibleParticipants(giveawayId);

  // Get existing winners to exclude
  const existingWinners = await getWinners(giveawayId);
  const excludeUserIds = new Set(existingWinners.map((w) => w.userId));

  // Filter out previous winners
  const remainingPool = eligible.filter((p) => !excludeUserIds.has(p.userId));

  if (remainingPool.length === 0) {
    log.warn({ giveawayId }, "No remaining participants for reroll");
    return null;
  }

  const rerollCount = Math.min(count, remainingPool.length);

  // Build maps for remaining pool
  const participantUserIds = remainingPool.map((p) => p.userId);
  const telegramIdMap = new Map<number, bigint>();
  for (const p of remainingPool) {
    telegramIdMap.set(p.userId, p.user.telegramId);
  }

  // Generate new proof
  const proof = await generateFairnessProof(
    giveawayId,
    participantUserIds,
    telegramIdMap,
    rerollCount
  );

  // Determine next position number
  const maxPosition = existingWinners.reduce(
    (max, w) => Math.max(max, w.position),
    0
  );

  // Store new winners
  const winnerRecords = proof.winnerIds.map((userId, index) => ({
    giveawayId,
    userId,
    position: maxPosition + index + 1,
    proofHash: proof.drawHashes[index] ?? proof.combinedHash,
    isReroll: true,
    rerollReason: reason ?? "Admin reroll",
  }));

  await db.insert(winners).values(winnerRecords);

  // Update proof on giveaway
  await setGiveawayProof(
    giveawayId,
    proof.seed,
    proof.participantHash,
    proof.combinedHash
  );

  // Fetch new winners
  const allWinners = await getWinners(giveawayId);
  const newWinners = allWinners.filter(
    (w) => w.position > maxPosition
  );

  log.info(
    {
      giveawayId,
      rerolledCount: newWinners.length,
      reason,
    },
    "Winners rerolled successfully"
  );

  return { proof, newWinners };
}

/**
 * Get all winners for a giveaway with user data.
 */
export async function getWinners(
  giveawayId: string
): Promise<WinnerWithUser[]> {
  const results = await db.query.winners.findMany({
    where: eq(winners.giveawayId, giveawayId),
    with: { user: true },
    orderBy: (w, { asc }) => [asc(w.position)],
  });

  return results as unknown as WinnerWithUser[];
}

/**
 * Mark a winner as notified.
 */
export async function markWinnerNotified(winnerId: number): Promise<void> {
  await db
    .update(winners)
    .set({ notified: true })
    .where(eq(winners.id, winnerId));
}
