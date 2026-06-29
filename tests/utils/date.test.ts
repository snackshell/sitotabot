import { describe, expect, it } from "vitest";
import { formatDate, parseUserDate } from "../../src/utils/date.js";

describe("parseUserDate", () => {
  it("parses the giveaway date prompt format as Ethiopian time", () => {
    const date = parseUserDate("2026-06-15 18:00");

    expect(date?.toISOString()).toBe("2026-06-15T15:00:00.000Z");
  });

  it("trims user input before parsing", () => {
    const date = parseUserDate("  2026-06-15 18:00  ");

    expect(date?.toISOString()).toBe("2026-06-15T15:00:00.000Z");
  });

  it("rejects impossible calendar dates", () => {
    expect(parseUserDate("2026-02-31 18:00")).toBeNull();
  });

  it("rejects out-of-range times", () => {
    expect(parseUserDate("2026-06-15 24:00")).toBeNull();
    expect(parseUserDate("2026-06-15 18:60")).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats dates in Ethiopian time", () => {
    expect(formatDate(new Date("2026-06-15T15:00:00.000Z"))).toContain(
      "06:00 PM"
    );
  });
});
