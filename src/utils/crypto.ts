import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Generate a SHA-256 hash of the given input string.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

/**
 * Generate an HMAC-SHA256 hash.
 * Used for Telegram Login Widget verification.
 */
export function hmacSha256(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data, "utf-8").digest("hex");
}

/**
 * Hash a sorted list of participant IDs for fairness proof.
 */
export function hashParticipantList(participantIds: number[]): string {
  const sorted = [...participantIds].sort((a, b) => a - b);
  return sha256(JSON.stringify(sorted));
}

/**
 * Generate a combined proof hash from seed and participant hash.
 */
export function generateProofHash(
  seed: string,
  participantHash: string
): string {
  return sha256(seed + participantHash);
}

/**
 * Use a hash to deterministically select a winner index from a pool.
 * Returns an index into the participants array.
 */
export function hashToIndex(hash: string, poolSize: number): number {
  // Use the first 16 hex chars (64 bits) for adequate distribution
  const value = BigInt("0x" + hash.substring(0, 16));
  return Number(value % BigInt(poolSize));
}

/**
 * Deterministically select N winners from a participant pool using hash chaining.
 * Each round rehashes to pick the next winner from the remaining pool.
 */
export function selectWinnersFromHash(
  participantIds: number[],
  seed: string,
  count: number
): { winners: number[]; hashes: string[] } {
  const pool = [...participantIds].sort((a, b) => a - b);
  const winners: number[] = [];
  const hashes: string[] = [];
  let currentHash = sha256(seed + JSON.stringify(pool));

  const actualCount = Math.min(count, pool.length);

  for (let i = 0; i < actualCount; i++) {
    const index = hashToIndex(currentHash, pool.length);
    winners.push(pool[index]);
    hashes.push(currentHash);

    // Remove winner from pool
    pool.splice(index, 1);

    // Chain hash for next selection
    if (pool.length > 0) {
      currentHash = sha256(currentHash + JSON.stringify(pool));
    }
  }

  return { winners, hashes };
}

/**
 * Generate a cryptographically random seed string.
 */
export function generateRandomSeed(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Verify Telegram Login Widget authentication data.
 */
export function verifyTelegramAuth(
  data: Record<string, string>,
  botToken: string
): boolean {
  const { hash, ...rest } = data;
  if (!hash) return false;

  const secret = createHash("sha256").update(botToken).digest();
  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");

  const computed = hmacSha256(secret, checkString);
  return computed === hash;
}
