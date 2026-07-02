import { getParticipants } from "./participant.service.js";
import { getWinners } from "./winner.service.js";
import {
  generateParticipantsCSV,
  generateWinnersCSV,
} from "../utils/csv.js";
import { proofToJSON } from "./fairness.service.js";
import { getGiveaway } from "./giveaway.service.js";
import { createChildLogger } from "../utils/logger.js";
import type { FairnessProof } from "../types/index.js";

const log = createChildLogger("service:export");

/**
 * Export participants for a giveaway as CSV string.
 */
export async function exportParticipantsCSV(
  giveawayId: string
): Promise<string | null> {
  const participants = await getParticipants(giveawayId);

  if (participants.length === 0) {
    return null;
  }

  const csvData = participants.map((p) => ({
    telegramId: p.user.telegramId,
    username: p.user.username,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    joinedAt: p.joinedAt,
    isEligible: p.isEligible,
    eligibilityReason: p.eligibilityReason,
    messageCount: p.messageCount,
  }));

  return generateParticipantsCSV(csvData);
}

/**
 * Export winners for a giveaway as CSV string.
 */
export async function exportWinnersCSV(
  giveawayId: string
): Promise<string | null> {
  const winnersList = await getWinners(giveawayId);

  if (winnersList.length === 0) {
    return null;
  }

  const csvData = winnersList.map((w) => ({
    position: w.position,
    telegramId: w.user.telegramId,
    username: w.user.username,
    firstName: w.user.firstName,
    lastName: w.user.lastName,
    drawTime: w.drawTime,
    proofHash: w.proofHash,
    isReroll: w.isReroll,
  }));

  return generateWinnersCSV(csvData);
}

/**
 * Export fairness proof as JSON string.
 */
export async function exportFairnessProof(
  giveawayId: string,
  proof: FairnessProof
): Promise<string> {
  return proofToJSON(proof);
}
