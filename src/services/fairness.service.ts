import type { FairnessProof } from "../types/index.js";
import {
  sha256,
  hashParticipantList,
  generateProofHash,
  selectWinnersFromHash,
  generateRandomSeed,
} from "../utils/crypto.js";
import { env } from "../env.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("service:fairness");

/**
 * Generate a complete fairness proof for a giveaway draw.
 *
 * Algorithm:
 * 1. Sort participant user IDs numerically
 * 2. participantHash = SHA256(JSON.stringify(sortedIds))
 * 3. seed = giveaway end timestamp ISO string (or Random.org value)
 * 4. combinedHash = SHA256(seed + participantHash)
 * 5. Use hash chaining to deterministically select N winners
 * 6. Return complete proof for verification
 */
export async function generateFairnessProof(
  giveawayId: string,
  participantUserIds: number[],
  participantTelegramIds: Map<number, bigint>,
  winnerCount: number,
  endTimestamp?: Date
): Promise<FairnessProof> {
  log.info(
    {
      giveawayId,
      participantCount: participantUserIds.length,
      winnerCount,
    },
    "Generating fairness proof"
  );

  // Step 1: Sort participant IDs
  const sortedIds = [...participantUserIds].sort((a, b) => a - b);

  // Step 2: Hash participant list
  const participantHash = hashParticipantList(sortedIds);

  // Step 3: Generate seed
  let seed: string;
  let algorithm: "sha256" | "random_org" = "sha256";

  if (env.RANDOM_ORG_API_KEY) {
    try {
      seed = await getRandomOrgSeed();
      algorithm = "random_org";
    } catch (error) {
      log.warn(
        { error },
        "Random.org failed, falling back to local cryptographic seed"
      );
      const timePart = endTimestamp
        ? endTimestamp.toISOString()
        : new Date().toISOString();
      const randomPart = generateRandomSeed();
      seed = `${timePart}:${randomPart}`;
    }
  } else {
    // Use end timestamp as seed for deterministic reproducibility,
    // combined with a random component for uniqueness
    const timePart = endTimestamp
      ? endTimestamp.toISOString()
      : new Date().toISOString();
    const randomPart = generateRandomSeed();
    seed = `${timePart}:${randomPart}`;
  }

  // Step 4: Combined hash
  const combinedHash = generateProofHash(seed, participantHash);

  // Step 5: Select winners using hash chaining
  const { winners, hashes } = selectWinnersFromHash(
    sortedIds,
    seed,
    winnerCount
  );

  // Map winner user IDs to Telegram IDs
  const winnerTelegramIds = winners.map((userId) => {
    const tgId = participantTelegramIds.get(userId);
    if (!tgId)
      throw new Error(`Missing Telegram ID for user ${userId}`);
    return tgId;
  });

  const proof: FairnessProof = {
    giveawayId,
    participantIds: sortedIds,
    participantHash,
    seed,
    combinedHash,
    winnerIds: winners,
    winnerTelegramIds,
    algorithm,
    drawHashes: hashes,
  };

  log.info(
    {
      giveawayId,
      winnerCount: winners.length,
      algorithm,
      proofHash: combinedHash,
    },
    "Fairness proof generated"
  );

  return proof;
}

/**
 * Verify a fairness proof by re-running the algorithm.
 * Returns true if the proof is valid.
 */
export function verifyFairnessProof(proof: FairnessProof): boolean {
  try {
    // Re-hash participant list
    const participantHash = hashParticipantList(proof.participantIds);
    if (participantHash !== proof.participantHash) {
      log.warn("Participant hash mismatch");
      return false;
    }

    // Re-compute combined hash
    const combinedHash = generateProofHash(proof.seed, participantHash);
    if (combinedHash !== proof.combinedHash) {
      log.warn("Combined hash mismatch");
      return false;
    }

    // Re-run winner selection
    const { winners } = selectWinnersFromHash(
      proof.participantIds,
      proof.seed,
      proof.winnerIds.length
    );

    // Compare winners
    if (winners.length !== proof.winnerIds.length) {
      log.warn("Winner count mismatch");
      return false;
    }

    for (let i = 0; i < winners.length; i++) {
      if (winners[i] !== proof.winnerIds[i]) {
        log.warn(
          { expected: proof.winnerIds[i], got: winners[i], position: i },
          "Winner mismatch"
        );
        return false;
      }
    }

    return true;
  } catch (error) {
    log.error({ error }, "Proof verification failed");
    return false;
  }
}

/**
 * Fetch a random seed from Random.org API.
 */
async function getRandomOrgSeed(): Promise<string> {
  const apiKey = env.RANDOM_ORG_API_KEY;
  if (!apiKey) throw new Error("Random.org API key not configured");

  const response = await fetch("https://api.random.org/json-rpc/4/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "generateStrings",
      params: {
        apiKey,
        n: 1,
        length: 64,
        characters:
          "abcdefghijklmnopqrstuvwxyz0123456789",
        replacement: true,
      },
      id: Date.now(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Random.org API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    result?: { random?: { data?: string[] } };
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`Random.org error: ${data.error.message}`);
  }

  const randomString = data.result?.random?.data?.[0];
  if (!randomString) {
    throw new Error("No random data returned from Random.org");
  }

  log.info("Generated seed from Random.org");
  return randomString;
}

/**
 * Generate a JSON representation of the fairness proof for export.
 */
export function proofToJSON(proof: FairnessProof): string {
  return JSON.stringify(
    {
      giveaway_id: proof.giveawayId,
      algorithm: proof.algorithm,
      participant_count: proof.participantIds.length,
      participant_ids: proof.participantIds,
      participant_hash: proof.participantHash,
      seed: proof.seed,
      combined_proof_hash: proof.combinedHash,
      winner_user_ids: proof.winnerIds,
      winner_telegram_ids: proof.winnerTelegramIds.map((id) => id.toString()),
      draw_hashes: proof.drawHashes,
      verification_instructions: [
        "1. Sort participant_ids numerically",
        "2. Compute SHA256(JSON.stringify(sorted_ids)) → should match participant_hash",
        "3. Compute SHA256(seed + participant_hash) → should match combined_proof_hash",
        "4. Use hash chain selection to verify winners",
      ],
    },
    null,
    2
  );
}
