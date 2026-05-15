import { BusyStatus, CalendarType, EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { mapGoogleEventsToCandidates } from "./google-ingest";
import type { GoogleCalendarEvent } from "./google";

const baseArgs = {
  calendarId: "calendar-1",
  calendarSourceId: "source-1",
  calendarType: CalendarType.PARENT,
  defaultTimezone: "America/Los_Angeles"
};

function event(overrides: Partial<GoogleCalendarEvent>): GoogleCalendarEvent {
  return {
    id: "google-event-1",
    summary: "Soccer practice",
    status: "confirmed",
    start: { dateTime: "2027-03-01T16:00:00-08:00", timeZone: "America/Los_Angeles" },
    end: { dateTime: "2027-03-01T18:00:00-08:00", timeZone: "America/Los_Angeles" },
    iCalUID: "uid-1@google.com",
    ...overrides
  };
}

describe("mapGoogleEventsToCandidates", () => {
  it("maps a timed event to a candidate with UTC timestamps", () => {
    const { candidates, errors } = mapGoogleEventsToCandidates({
      ...baseArgs,
      googleEvents: [event({})]
    });

    expect(errors).toEqual([]);
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.rawTitle).toBe("Soccer practice");
    expect(candidate.allDay).toBe(false);
    expect(candidate.startAt.toISOString()).toBe("2027-03-02T00:00:00.000Z");
    expect(candidate.endAt.toISOString()).toBe("2027-03-02T02:00:00.000Z");
    expect(candidate.timezone).toBe("America/Los_Angeles");
    expect(candidate.evidenceLocator).toBe("uid-1@google.com");
  });

  it("maps an all-day event to a candidate anchored at UTC midnight", () => {
    const { candidates } = mapGoogleEventsToCandidates({
      ...baseArgs,
      googleEvents: [
        event({
          id: "all-day-event",
          summary: "Family trip",
          start: { date: "2027-04-10" },
          end: { date: "2027-04-15" },
          iCalUID: undefined
        })
      ]
    });

    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.allDay).toBe(true);
    expect(candidate.startAt.toISOString()).toBe("2027-04-10T00:00:00.000Z");
    expect(candidate.endAt.toISOString()).toBe("2027-04-15T00:00:00.000Z");
    expect(candidate.evidenceLocator).toBe("all-day-event");
  });

  it("skips cancelled events", () => {
    const { candidates } = mapGoogleEventsToCandidates({
      ...baseArgs,
      googleEvents: [event({ status: "cancelled" })]
    });
    expect(candidates).toEqual([]);
  });

  it("classifies events on an activity-type calendar as ACTIVITY_BUSY", () => {
    const { candidates } = mapGoogleEventsToCandidates({
      ...baseArgs,
      calendarType: CalendarType.SPORT,
      googleEvents: [event({})]
    });

    expect(candidates[0].category).toBe(EventCategory.ACTIVITY_BUSY);
    expect(candidates[0].suggestedBusyStatus).toBe(BusyStatus.BUSY);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("classifies events on a parent/family calendar as UNKNOWN for review", () => {
    const { candidates } = mapGoogleEventsToCandidates({
      ...baseArgs,
      googleEvents: [event({})]
    });

    expect(candidates[0].category).toBe(EventCategory.UNKNOWN);
    expect(candidates[0].suggestedBusyStatus).toBe(BusyStatus.UNKNOWN);
    expect(candidates[0].confidence).toBeLessThan(0.9);
  });

  it("falls back to '(untitled event)' for events without a summary", () => {
    const { candidates } = mapGoogleEventsToCandidates({
      ...baseArgs,
      googleEvents: [event({ summary: undefined })]
    });
    expect(candidates[0].rawTitle).toBe("(untitled event)");
  });

  it("joins description into evidenceText after the title", () => {
    const { candidates } = mapGoogleEventsToCandidates({
      ...baseArgs,
      googleEvents: [
        event({ summary: "Doctor", description: "Routine checkup with Dr. Smith" })
      ]
    });
    expect(candidates[0].evidenceText).toBe(
      "Doctor — Routine checkup with Dr. Smith"
    );
  });

  it("uses defaultTimezone when the event has no timezone info", () => {
    const { candidates } = mapGoogleEventsToCandidates({
      ...baseArgs,
      defaultTimezone: "America/New_York",
      googleEvents: [
        event({
          start: { dateTime: "2027-03-01T16:00:00Z" },
          end: { dateTime: "2027-03-01T18:00:00Z" }
        })
      ]
    });
    expect(candidates[0].timezone).toBe("America/New_York");
  });
});
