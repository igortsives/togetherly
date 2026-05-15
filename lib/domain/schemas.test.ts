import { BusyStatus, EventCategory, SourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getDefaultBusyStatus, requiresParentReview } from "./event-taxonomy";
import {
  calendarEventInputSchema,
  calendarSourceInputSchema,
  eventCandidateInputSchema
} from "./schemas";

describe("event taxonomy", () => {
  it("maps MVP categories to default busy/free behavior", () => {
    expect(getDefaultBusyStatus(EventCategory.BREAK)).toBe(BusyStatus.FREE);
    expect(getDefaultBusyStatus(EventCategory.CLASS_IN_SESSION)).toBe(
      BusyStatus.BUSY
    );
    expect(getDefaultBusyStatus(EventCategory.EXAM_PERIOD)).toBe(
      BusyStatus.CONFIGURABLE
    );
    expect(getDefaultBusyStatus(EventCategory.UNKNOWN)).toBe(BusyStatus.UNKNOWN);
  });

  it("requires review for unknown or lower-confidence events", () => {
    expect(requiresParentReview(EventCategory.UNKNOWN, 0.99)).toBe(true);
    expect(requiresParentReview(EventCategory.BREAK, 0.72)).toBe(true);
    expect(requiresParentReview(EventCategory.BREAK, 0.94)).toBe(false);
  });
});

describe("calendar source schema", () => {
  it("requires URL for URL and ICS source types", () => {
    expect(
      calendarSourceInputSchema.safeParse({
        calendarId: "calendar-1",
        sourceType: SourceType.URL
      }).success
    ).toBe(false);
  });
});

describe("event schemas", () => {
  it("defaults event candidate busy status from category", () => {
    const result = eventCandidateInputSchema.parse({
      calendarSourceId: "source-1",
      calendarId: "calendar-1",
      rawTitle: "Winter Break",
      category: EventCategory.BREAK,
      startAt: "2027-12-20T00:00:00.000Z",
      endAt: "2028-01-03T00:00:00.000Z",
      timezone: "America/Los_Angeles",
      confidence: 0.95
    });

    expect(result.suggestedBusyStatus).toBe(BusyStatus.FREE);
  });

  it("rejects inverted date ranges", () => {
    const result = calendarEventInputSchema.safeParse({
      calendarId: "calendar-1",
      title: "Practice",
      category: EventCategory.ACTIVITY_BUSY,
      startAt: "2027-02-02T00:00:00.000Z",
      endAt: "2027-02-01T00:00:00.000Z",
      timezone: "America/Los_Angeles"
    });

    expect(result.success).toBe(false);
  });
});
