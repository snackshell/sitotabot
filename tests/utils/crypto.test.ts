import { describe, it, expect } from "vitest";
import {
  sha256,
  hashParticipantList,
  generateProofHash,
  selectWinnersFromHash,
  hashToIndex,
  verifyTelegramAuth,
} from "../../src/utils/crypto.js";

describe("sha256", () => {
  it("should return a 64-char hex string", () => {
    const hash = sha256("hello");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should produce consistent hashes", () => {
    expect(sha256("test")).toBe(sha256("test"));
  });

  it("should produce different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  it("should match known SHA-256 value", () => {
    // SHA-256("hello") is well-known
    expect(sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });
});

describe("hashParticipantList", () => {
  it("should sort IDs before hashing", () => {
    const hash1 = hashParticipantList([3, 1, 2]);
    const hash2 = hashParticipantList([1, 2, 3]);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different lists", () => {
    const hash1 = hashParticipantList([1, 2, 3]);
    const hash2 = hashParticipantList([1, 2, 4]);
    expect(hash1).not.toBe(hash2);
  });

  it("should not mutate the input array", () => {
    const ids = [3, 1, 2];
    hashParticipantList(ids);
    expect(ids).toEqual([3, 1, 2]);
  });
});

describe("generateProofHash", () => {
  it("should combine seed and participant hash", () => {
    const seed = "2026-01-01T00:00:00.000Z";
    const participantHash = sha256("[1,2,3]");
    const proof = generateProofHash(seed, participantHash);

    expect(proof).toHaveLength(64);
    expect(proof).toBe(sha256(seed + participantHash));
  });
});

describe("hashToIndex", () => {
  it("should return a valid index within pool size", () => {
    const hash = sha256("test");
    const index = hashToIndex(hash, 10);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(10);
  });

  it("should be deterministic", () => {
    const hash = sha256("test");
    expect(hashToIndex(hash, 100)).toBe(hashToIndex(hash, 100));
  });

  it("should handle pool size of 1", () => {
    const hash = sha256("test");
    expect(hashToIndex(hash, 1)).toBe(0);
  });
});

describe("selectWinnersFromHash", () => {
  it("should select the correct number of winners", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { winners } = selectWinnersFromHash(ids, "seed123", 3);
    expect(winners).toHaveLength(3);
  });

  it("should not select duplicates", () => {
    const ids = [1, 2, 3, 4, 5];
    const { winners } = selectWinnersFromHash(ids, "seed123", 3);
    const unique = new Set(winners);
    expect(unique.size).toBe(3);
  });

  it("should be deterministic with same seed", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result1 = selectWinnersFromHash(ids, "same_seed", 3);
    const result2 = selectWinnersFromHash(ids, "same_seed", 3);
    expect(result1.winners).toEqual(result2.winners);
  });

  it("should produce different results with different seeds", () => {
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    const result1 = selectWinnersFromHash(ids, "seed_a", 5);
    const result2 = selectWinnersFromHash(ids, "seed_b", 5);
    // With 100 participants, different seeds should almost certainly produce different winners
    expect(result1.winners).not.toEqual(result2.winners);
  });

  it("should handle requesting more winners than participants", () => {
    const ids = [1, 2, 3];
    const { winners } = selectWinnersFromHash(ids, "seed", 10);
    expect(winners).toHaveLength(3);
    const unique = new Set(winners);
    expect(unique.size).toBe(3);
  });

  it("should only select from the provided IDs", () => {
    const ids = [10, 20, 30, 40, 50];
    const { winners } = selectWinnersFromHash(ids, "test_seed", 3);
    for (const w of winners) {
      expect(ids).toContain(w);
    }
  });

  it("should return hashes for each selection round", () => {
    const ids = [1, 2, 3, 4, 5];
    const { winners, hashes } = selectWinnersFromHash(ids, "seed", 3);
    expect(hashes).toHaveLength(3);
    for (const h of hashes) {
      expect(h).toHaveLength(64);
    }
  });
});
