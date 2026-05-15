import { BusyStatus, CalendarType, EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { mapMicrosoftEventsToCandidates } from "./microsoft-ingest";
import type { MicrosoftCalendarEvent } from "./microsoft";

const baseArgs = {
  calendarId: "calendar-1",
  calendarSourceId: "source-1",
  calendarType: CalendarType.PARENT,
  defaultTimezone: "America/Los_Angeles"
};

function event(overrides: Partial<MicrosoftCalendarEvent>): MicrosoftCalendarEvent {
  return {
    id: "graph-event-1",
    subject: "Soccer practice",
    isCancelled: false,
    isAllDay: false,
    start: { dateTime: "2027-03-02T00:00:00.0000000", timeZone: "UTC" },
    end: { dateTime: "2027-03-02T02:00:00.0000000", timeZone: "UTC" },
    iCalUId: "uid-1@outlook.com",
    ...overrides
  };
}

describe("mapMicrosoftEventsToCandidates", () => {
  it("maps a timed event to a candidate with UTC timestamps", () => {
    const { candidates, errors } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      microsoftEvents: [event({})]
    });

    expect(errors).toEqual([]);
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.rawTitle).toBe("Soccer practice");
    expect(candidate.allDay).toBe(false);
    expect(candidate.startAt.toISOString()).toBe("2027-03-02T00:00:00.000Z");
    expect(candidate.endAt.toISOString()).toBe("2027-03-02T02:00:00.000Z");
    expect(candidate.evidenceLocator).toBe("uid-1@outlook.com");
  });

  it("maps an all-day event to a candidate anchored at UTC midnight", () => {
    const { candidates } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      microsoftEvents: [
        event({
          id: "all-day",
          subject: "Family trip",
          isAllDay: true,
          start: { dateTime: "2027-04-10T00:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2027-04-15T00:00:00.0000000", timeZone: "UTC" },
          iCalUId: undefined
        })
      ]
    });

    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.allDay).toBe(true);
    expect(candidate.startAt.toISOString()).toBe("2027-04-10T00:00:00.000Z");
    expect(candidate.endAt.toISOString()).toBe("2027-04-15T00:00:00.000Z");
    expect(candidate.evidenceLocator).toBe("all-day");
  });

  it("skips cancelled events", () => {
    const { candidates } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      microsoftEvents: [event({ isCancelled: true })]
    });
    expect(candidates).toEqual([]);
  });

  it("classifies events on an activity-type calendar as ACTIVITY_BUSY", () => {
    const { candidates } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      calendarType: CalendarType.SPORT,
      microsoftEvents: [event({})]
    });

    expect(candidates[0].category).toBe(EventCategory.ACTIVITY_BUSY);
    expect(candidates[0].suggestedBusyStatus).toBe(BusyStatus.BUSY);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("classifies events on a parent/family calendar as UNKNOWN for review", () => {
    const { candidates } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      microsoftEvents: [event({})]
    });

    expect(candidates[0].category).toBe(EventCategory.UNKNOWN);
    expect(candidates[0].suggestedBusyStatus).toBe(BusyStatus.UNKNOWN);
    expect(candidates[0].confidence).toBeLessThan(0.9);
  });

  it("falls back to '(untitled event)' for events without a subject", () => {
    const { candidates } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      microsoftEvents: [event({ subject: undefined })]
    });
    expect(candidates[0].rawTitle).toBe("(untitled event)");
  });

  it("joins bodyPreview into evidenceText after the title", () => {
    const { candidates } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      microsoftEvents: [
        event({ subject: "Doctor", bodyPreview: "Routine checkup with Dr. Smith" })
      ]
    });
    expect(candidates[0].evidenceText).toBe(
      "Doctor — Routine checkup with Dr. Smith"
    );
  });

  it("uses defaultTimezone when the event's timezone is UTC (from the Prefer header)", () => {
    const { candidates } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      defaultTimezone: "America/New_York",
      microsoftEvents: [event({})]
    });
    expect(candidates[0].timezone).toBe("America/New_York");
  });

  it("preserves a non-UTC source timezone when present", () => {
    const { candidates } = mapMicrosoftEventsToCandidates({
      ...baseArgs,
      microsoftEvents: [
        event({
          start: {
            dateTime: "2027-03-02T00:00:00.0000000",
            timeZone: "Europe/Berlin"
          },
          end: {
            dateTime: "2027-03-02T02:00:00.0000000",
            timeZone: "Europe/Berlin"
          }
        })
      ]
    });
    expect(candidates[0].timezone).toBe("Europe/Berlin");
  });
});
