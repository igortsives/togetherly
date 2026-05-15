import { readFile } from "node:fs/promises";
import path from "node:path";
import { BusyStatus, CalendarType, EventCategory, ReviewStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { extractIcsEvents } from "./ics";

const fixturesDir = path.join(process.cwd(), "fixtures", "sources", "ics");

async function loadFixture(name: string) {
  return readFile(path.join(fixturesDir, name), "utf8");
}

const baseOptions = {
  calendarId: "calendar-1",
  calendarSourceId: "source-1",
  defaultTimezone: "America/Los_Angeles",
  window: {
    start: new Date("2026-08-01T00:00:00.000Z"),
    end: new Date("2028-08-01T00:00:00.000Z")
  }
};

describe("extractIcsEvents — school all-day calendar", () => {
  it("emits a candidate per all-day school event", async () => {
    const ics = await loadFixture("school-breaks.ics");

    const result = extractIcsEvents(ics, {
      ...baseOptions,
      calendarType: CalendarType.SCHOOL
    });

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(3);
  });

  it("preserves title, multi-day range, and treats school events as unknown for review", async () => {
    const ics = await loadFixture("school-breaks.ics");

    const result = extractIcsEvents(ics, {
      ...baseOptions,
      calendarType: CalendarType.SCHOOL
    });

    const winterBreak = result.candidates.find(
      (candidate) => candidate.rawTitle === "Winter Break"
    );

    expect(winterBreak).toBeDefined();
    expect(winterBreak?.allDay).toBe(true);
    expect(winterBreak?.startAt.toISOString()).toBe("2026-12-21T00:00:00.000Z");
    expect(winterBreak?.endAt.toISOString()).toBe("2027-01-05T00:00:00.000Z");
    expect(winterBreak?.category).toBe(EventCategory.UNKNOWN);
    expect(winterBreak?.suggestedBusyStatus).toBe(BusyStatus.UNKNOWN);
    expect(winterBreak?.reviewStatus).toBe(ReviewStatus.PENDING);
    expect(winterBreak?.confidence).toBeLessThan(0.9);
    expect(winterBreak?.evidenceLocator).toBe("winter-break-2026@test.school");
    expect(winterBreak?.timezone).toBe("America/Los_Angeles");
  });
});

describe("extractIcsEvents — activity calendar", () => {
  it("classifies activity events as activity_busy with high confidence", async () => {
    const ics = await loadFixture("team-practice.ics");

    const result = extractIcsEvents(ics, {
      ...baseOptions,
      calendarType: CalendarType.SPORT
    });

    const opener = result.candidates.find(
      (candidate) => candidate.rawTitle === "Season Opener vs Cardinals"
    );

    expect(opener).toBeDefined();
    expect(opener?.allDay).toBe(false);
    expect(opener?.category).toBe(EventCategory.ACTIVITY_BUSY);
    expect(opener?.suggestedBusyStatus).toBe(BusyStatus.BUSY);
    expect(opener?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(opener?.timezone).toBe("America/Los_Angeles");
    expect(opener?.startAt.toISOString()).toBe("2027-03-15T17:00:00.000Z");
    expect(opener?.endAt.toISOString()).toBe("2027-03-15T19:00:00.000Z");
  });

  it("expands a weekly recurring practice into individual occurrences", async () => {
    const ics = await loadFixture("team-practice.ics");

    const result = extractIcsEvents(ics, {
      ...baseOptions,
      calendarType: CalendarType.SPORT
    });

    const practices = result.candidates.filter(
      (candidate) => candidate.rawTitle === "Practice"
    );

    expect(practices).toHaveLength(5);

    const occurrenceStarts = practices.map((candidate) =>
      candidate.startAt.toISOString()
    );
    expect(occurrenceStarts).toEqual([
      "2027-03-02T00:00:00.000Z",
      "2027-03-09T00:00:00.000Z",
      "2027-03-15T23:00:00.000Z",
      "2027-03-22T23:00:00.000Z",
      "2027-03-29T23:00:00.000Z"
    ]);

    const locators = practices.map((candidate) => candidate.evidenceLocator);
    expect(new Set(locators).size).toBe(practices.length);
    for (const locator of locators) {
      expect(locator).toMatch(/^weekly-practice@test\.team#/);
    }
  });

  it("excludes occurrences outside the requested window", async () => {
    const ics = await loadFixture("team-practice.ics");

    const result = extractIcsEvents(ics, {
      ...baseOptions,
      calendarType: CalendarType.SPORT,
      window: {
        start: new Date("2027-03-10T00:00:00.000Z"),
        end: new Date("2027-03-20T00:00:00.000Z")
      }
    });

    const practices = result.candidates.filter(
      (candidate) => candidate.rawTitle === "Practice"
    );

    const opener = result.candidates.find(
      (candidate) => candidate.rawTitle === "Season Opener vs Cardinals"
    );

    expect(practices).toHaveLength(1);
    expect(practices[0]?.startAt.toISOString()).toBe("2027-03-15T23:00:00.000Z");
    expect(opener).toBeDefined();
  });

  it("survives daylight-saving by relying on the source TZID, not system locale", async () => {
    const ics = await loadFixture("team-practice.ics");

    const result = extractIcsEvents(ics, {
      ...baseOptions,
      calendarType: CalendarType.SPORT
    });

    const practices = result.candidates.filter(
      (candidate) => candidate.rawTitle === "Practice"
    );

    const offsetsByDate = practices.map((practice) => {
      const startUtcHour = practice.startAt.getUTCHours();
      const startDay = practice.startAt.getUTCDate();
      return { startDay, startUtcHour };
    });

    expect(offsetsByDate).toEqual([
      { startDay: 2, startUtcHour: 0 },
      { startDay: 9, startUtcHour: 0 },
      { startDay: 15, startUtcHour: 23 },
      { startDay: 22, startUtcHour: 23 },
      { startDay: 29, startUtcHour: 23 }
    ]);
  });
});
