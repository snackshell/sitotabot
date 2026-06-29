import { describe, expect, it } from "vitest";
import { InlineKeyboard } from "grammy";
import {
  addRequiredChannelButtons,
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

  it("adds a join button for every public required channel", () => {
    const keyboard = new InlineKeyboard();

    addRequiredChannelButtons(keyboard, [
      { name: "Main Channel", username: "main" },
      { name: "Partner Channel", username: "@partner" },
      { name: "Private Channel", username: null },
    ]);

    expect(keyboard.inline_keyboard).toEqual([
      [{ text: "Join 1: Main Channel", url: "https://t.me/main" }],
      [{ text: "Join 2: Partner Channel", url: "https://t.me/partner" }],
    ]);
  });
});
