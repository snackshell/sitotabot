import { describe, expect, it } from "vitest";
import { parseTelegramUsername } from "../../src/utils/telegram.js";

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
