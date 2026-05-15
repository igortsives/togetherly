import { BusyStatus, EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildCalendarEventInputFromCandidate,
  parseCalendarEventFromCandidate,
  serializeCandidate
} from "./candidates";

const baseCandidate = {
  id: "candidate-1",
  calendarId: "calendar-1",
  calendarSourceId: "source-1",
  rawTitle: "Winter Break",
  normalizedTitle: null,
  category: EventCategory.BREAK,
  suggestedBusyStatus: BusyStatus.FREE,
  startAt: new Date("2027-12-20T00:00:00.000Z"),
  endAt: new Date("2028-01-03T00:00:00.000Z"),
  allDay: true,
  timezone: "America/Los_Angeles",
  confidence: 0.92,
  evidenceText: "Winter recess (no classes)",
  evidenceLocator: "UID:winter-2027"
};

describe("buildCalendarEventInputFromCandidate", () => {
  it("copies candidate fields by default and links via eventCandidateId", () => {
    const input = buildCalendarEventInputFromCandidate(baseCandidate);

    expect(input.eventCandidateId).toBe("candidate-1");
    expect(input.calendarId).toBe("calendar-1");
    expect(input.title).toBe("Winter Break");
    expect(input.category).toBe(EventCategory.BREAK);
    expect(input.busyStatus).toBe(BusyStatus.FREE);
    expect(input.startAt).toEqual(baseCandidate.startAt);
    expect(input.endAt).toEqual(baseCandidate.endAt);
    expect(input.allDay).toBe(true);
    expect(input.timezone).toBe("America/Los_Angeles");
    expect(input.sourceConfidence).toBe(0.92);
  });

  it("applies overrides for title, category, dates, and busy status", () => {
    const input = buildCalendarEventInputFromCandidate(baseCandidate, {
      title: "Winter recess",
      category: EventCategory.SCHOOL_CLOSED,
      busyStatus: BusyStatus.BUSY,
      startAt: new Date("2027-12-22T00:00:00.000Z"),
      endAt: new Date("2028-01-02T00:00:00.000Z"),
      timezone: "America/New_York"
    });

    expect(input.title).toBe("Winter recess");
    expect(input.category).toBe(EventCategory.SCHOOL_CLOSED);
    expect(input.busyStatus).toBe(BusyStatus.BUSY);
    expect(input.startAt).toEqual(new Date("2027-12-22T00:00:00.000Z"));
    expect(input.endAt).toEqual(new Date("2028-01-02T00:00:00.000Z"));
    expect(input.timezone).toBe("America/New_York");
  });

  it("falls back to taxonomy default when candidate busy status is UNKNOWN", () => {
    const input = buildCalendarEventInputFromCandidate({
      ...baseCandidate,
      suggestedBusyStatus: BusyStatus.UNKNOWN,
      category: EventCategory.ACTIVITY_BUSY
    });

    expect(input.busyStatus).toBe(BusyStatus.BUSY);
  });

  it("recomputes the busy default when category overrides come without busy status", () => {
    const input = buildCalendarEventInputFromCandidate(
      {
        ...baseCandidate,
        suggestedBusyStatus: BusyStatus.UNKNOWN,
        category: EventCategory.UNKNOWN
      },
      { category: EventCategory.BREAK }
    );

    expect(input.busyStatus).toBe(BusyStatus.FREE);
  });

  it("accepts a numeric Decimal-like confidence value", () => {
    const input = buildCalendarEventInputFromCandidate({
      ...baseCandidate,
      confidence: "0.55" as unknown as number
    });

    expect(input.sourceConfidence).toBe(0.55);
  });
});

describe("parseCalendarEventFromCandidate", () => {
  it("returns a validated CalendarEvent payload", () => {
    const result = parseCalendarEventFromCandidate(baseCandidate);

    expect(result.busyStatus).toBe(BusyStatus.FREE);
    expect(result.title).toBe("Winter Break");
    expect(result.startAt).toEqual(baseCandidate.startAt);
  });

  it("rejects inverted dates supplied as overrides", () => {
    expect(() =>
      parseCalendarEventFromCandidate(baseCandidate, {
        startAt: new Date("2028-01-03T00:00:00.000Z"),
        endAt: new Date("2027-12-20T00:00:00.000Z")
      })
    ).toThrow();
  });
});

describe("serializeCandidate", () => {
  it("flags low-confidence or unknown-category candidates as needing review", () => {
    expect(serializeCandidate(baseCandidate).needsReview).toBe(false);
    expect(
      serializeCandidate({ ...baseCandidate, confidence: 0.55 }).needsReview
    ).toBe(true);
    expect(
      serializeCandidate({
        ...baseCandidate,
        category: EventCategory.UNKNOWN,
        confidence: 0.99
      }).needsReview
    ).toBe(true);
  });
});
