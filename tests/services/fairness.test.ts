import { describe, it, expect } from "vitest";
import { verifyFairnessProof } from "../../src/services/fairness.service.js";
import {
  sha256,
  hashParticipantList,
  generateProofHash,
  selectWinnersFromHash,
} from "../../src/utils/crypto.js";
import type { FairnessProof } from "../../src/types/index.js";

describe("Fairness Proof Verification", () => {
  function createValidProof(
    participantCount: number,
    winnerCount: number
  ): FairnessProof {
    const participantIds = Array.from(
      { length: participantCount },
      (_, i) => i + 1
    );
    const sortedIds = [...participantIds].sort((a, b) => a - b);
    const participantHash = hashParticipantList(sortedIds);
    const seed = "2026-01-01T00:00:00.000Z:random123";
    const combinedHash = generateProofHash(seed, participantHash);
    const { winners, hashes } = selectWinnersFromHash(
      sortedIds,
      seed,
      winnerCount
    );

    return {
      giveawayId: "test-giveaway-id",
      participantIds: sortedIds,
      participantHash,
      seed,
      combinedHash,
      winnerIds: winners,
      winnerTelegramIds: winners.map((w) => BigInt(w * 1000)),
      algorithm: "sha256",
      drawHashes: hashes,
    };
  }

  it("should verify a valid proof", () => {
    const proof = createValidProof(50, 3);
    expect(verifyFairnessProof(proof)).toBe(true);
  });

  it("should verify a single-winner proof", () => {
    const proof = createValidProof(100, 1);
    expect(verifyFairnessProof(proof)).toBe(true);
  });

  it("should verify a proof where all participants win", () => {
    const proof = createValidProof(5, 5);
    expect(verifyFairnessProof(proof)).toBe(true);
  });

  it("should reject a proof with tampered participant list", () => {
    const proof = createValidProof(50, 3);
    // Add a fake participant
    proof.participantIds.push(999);
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("should reject a proof with tampered seed", () => {
    const proof = createValidProof(50, 3);
    proof.seed = "tampered_seed";
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("should reject a proof with tampered winners", () => {
    const proof = createValidProof(50, 3);
    // Replace a winner
    proof.winnerIds[0] = 999;
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("should reject a proof with tampered participant hash", () => {
    const proof = createValidProof(50, 3);
    proof.participantHash = sha256("fake_hash");
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("should reject a proof with tampered combined hash", () => {
    const proof = createValidProof(50, 3);
    proof.combinedHash = sha256("fake_combined");
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("should produce consistent results across multiple verifications", () => {
    const proof = createValidProof(200, 10);
    for (let i = 0; i < 5; i++) {
      expect(verifyFairnessProof(proof)).toBe(true);
    }
  });
});

describe("Fairness Distribution", () => {
  it("should distribute winners fairly across a large pool", () => {
    // Run multiple draws with different seeds to verify distribution
    const participantCount = 100;
    const winnerCount = 1;
    const trials = 1000;
    const winCounts = new Map<number, number>();

    for (let i = 0; i < trials; i++) {
      const ids = Array.from({ length: participantCount }, (_, j) => j + 1);
      const seed = `trial_${i}_${Date.now()}`;
      const { winners } = selectWinnersFromHash(ids, seed, winnerCount);

      for (const w of winners) {
        winCounts.set(w, (winCounts.get(w) ?? 0) + 1);
      }
    }

    // With 1000 trials and 100 participants, expected wins per participant ≈ 10
    // We check that no participant is excessively over/under-represented
    const expectedPerParticipant = trials / participantCount;
    const tolerance = expectedPerParticipant * 3; // Allow 3x deviation

    for (const [id, count] of winCounts) {
      expect(count).toBeLessThan(tolerance);
    }

    // At least 50% of participants should have won at least once
    expect(winCounts.size).toBeGreaterThan(participantCount * 0.5);
  });
});
