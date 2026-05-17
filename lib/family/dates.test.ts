import { describe, expect, it } from "vitest";
import { parseYmdAtLocalMidnight } from "./dates";

describe("parseYmdAtLocalMidnight", () => {
  it("interprets a PDT (Sep) date as UTC + 7h", () => {
    const result = parseYmdAtLocalMidnight(
      "2026-09-01",
      "America/Los_Angeles",
      "cutoffDate"
    );
    // 00:00:00 Sep 1 PDT = 07:00:00 Sep 1 UTC.
    expect(result.toISOString()).toBe("2026-09-01T07:00:00.000Z");
  });

  it("interprets a PST (Jan) date as UTC + 8h", () => {
    const result = parseYmdAtLocalMidnight(
      "2026-01-15",
      "America/Los_Angeles",
      "cutoffDate"
    );
    // 00:00:00 Jan 15 PST = 08:00:00 Jan 15 UTC.
    expect(result.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("interprets an EDT (Sep) date as UTC + 4h", () => {
    const result = parseYmdAtLocalMidnight(
      "2026-09-01",
      "America/New_York",
      "cutoffDate"
    );
    // 00:00:00 Sep 1 EDT = 04:00:00 Sep 1 UTC.
    expect(result.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });

  it("treats a UTC timezone as UTC midnight directly", () => {
    const result = parseYmdAtLocalMidnight("2026-09-01", "UTC", "cutoffDate");
    expect(result.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("falls back to UTC and warns when the timezone is unknown", () => {
    const result = parseYmdAtLocalMidnight(
      "2026-09-01",
      "Mordor/Mount_Doom",
      "cutoffDate"
    );
    expect(result.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rejects malformed YMD with the field name in the message", () => {
    expect(() =>
      parseYmdAtLocalMidnight(
        "tomorrow",
        "America/Los_Angeles",
        "cutoffDate"
      )
    ).toThrow("cutoffDate must be a YYYY-MM-DD date");
  });

  it("trims whitespace before parsing", () => {
    const result = parseYmdAtLocalMidnight(
      "  2026-09-01  ",
      "America/New_York",
      "cutoffDate"
    );
    expect(result.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });

  it("handles eastern-hemisphere zones (Tokyo) as UTC - 9h", () => {
    const result = parseYmdAtLocalMidnight(
      "2026-09-01",
      "Asia/Tokyo",
      "cutoffDate"
    );
    // 00:00:00 Sep 1 JST = 15:00:00 Aug 31 UTC.
    expect(result.toISOString()).toBe("2026-08-31T15:00:00.000Z");
  });
});
