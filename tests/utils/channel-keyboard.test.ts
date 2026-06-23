import { describe, expect, it } from "vitest";
import {
  formatRequiredChannelLines,
  hasRequiredChannelLinks,
} from "../../src/utils/channel-keyboard.js";

describe("channel keyboard utilities", () => {
  it("formats all required channels for giveaway details", () => {
    const lines = formatRequiredChannelLines([
      { name: "Main Channel", username: "main" },
      { name: "Partner Channel", username: "@partner" },
    ]);

    expect(lines).toEqual([
      "1. Main Channel (@main)",
      "2. Partner Channel (@partner)",
    ]);
  });

  it("detects whether channel buttons can be shown", () => {
    expect(
      hasRequiredChannelLinks([
        { name: "Private Channel", username: null },
      ])
    ).toBe(false);

    expect(
      hasRequiredChannelLinks([
        { name: "Public Channel", username: "public_channel" },
      ])
    ).toBe(true);
  });
});
