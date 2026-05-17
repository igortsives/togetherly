import { BusyStatus, EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildBusyIntervals, isEventBusy } from "./event-busy";
import type { EventBusyInput, EventBusyOptions } from "./event-busy";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

function makeEvent(overrides: Partial<EventBusyInput> = {}): EventBusyInput {
  return {
    id: "event-1",
    title: "Sample event",
    category: EventCategory.CLASS_IN_SESSION,
    busyStatus: BusyStatus.BUSY,
    startAt: date("2027-01-04"),
    endAt: date("2027-01-06"),
    allDay: true,
    calendarId: "calendar-1",
    calendarName: "Sample calendar",
    ...overrides
  };
}

const defaultOptions: EventBusyOptions = {
  includeUnknownAsBusy: true,
  includeExamAsBusy: true,
  includeOptionalAsBusy: false
};

describe("isEventBusy", () => {
  it("treats BUSY events as busy regardless of options", () => {
    expect(
      isEventBusy(
        { busyStatus: BusyStatus.BUSY, category: EventCategory.CLASS_IN_SESSION },
        { includeUnknownAsBusy: false, includeExamAsBusy: false }
      )
    ).toBe(true);
  });

  it("treats FREE events as never busy", () => {
    expect(
      isEventBusy(
        { busyStatus: BusyStatus.FREE, category: EventCategory.BREAK },
        { includeUnknownAsBusy: true, includeExamAsBusy: true }
      )
    ).toBe(false);
  });

  it("treats UNKNOWN events as busy only when includeUnknownAsBusy is set", () => {
    const event = {
      busyStatus: BusyStatus.UNKNOWN,
      category: EventCategory.UNKNOWN
    };

    expect(
      isEventBusy(event, { includeUnknownAsBusy: true, includeExamAsBusy: true })
    ).toBe(true);
    expect(
      isEventBusy(event, { includeUnknownAsBusy: false, includeExamAsBusy: true })
    ).toBe(false);
  });

  it("treats CONFIGURABLE exam periods as busy only when includeExamAsBusy is set", () => {
    const event = {
      busyStatus: BusyStatus.CONFIGURABLE,
      category: EventCategory.EXAM_PERIOD
    };

    expect(
      isEventBusy(event, { includeUnknownAsBusy: false, includeExamAsBusy: true })
    ).toBe(true);
    expect(
      isEventBusy(event, { includeUnknownAsBusy: true, includeExamAsBusy: false })
    ).toBe(false);
  });

  it("treats CONFIGURABLE optional events as free by default", () => {
    const event = {
      busyStatus: BusyStatus.CONFIGURABLE,
      category: EventCategory.OPTIONAL
    };

    expect(
      isEventBusy(event, { includeUnknownAsBusy: true, includeExamAsBusy: true })
    ).toBe(false);
    expect(
      isEventBusy(event, {
        includeUnknownAsBusy: false,
        includeExamAsBusy: false,
        includeOptionalAsBusy: true
      })
    ).toBe(true);
  });
});

describe("buildBusyIntervals", () => {
  it("filters out free events and preserves source event metadata", () => {
    const intervals = buildBusyIntervals(
      [
        makeEvent({
          id: "busy-activity",
          busyStatus: BusyStatus.BUSY,
          category: EventCategory.ACTIVITY_BUSY,
          startAt: date("2027-01-04"),
          endAt: date("2027-01-06")
        }),
        makeEvent({
          id: "free-break",
          busyStatus: BusyStatus.FREE,
          category: EventCategory.BREAK,
          startAt: date("2027-01-06"),
          endAt: date("2027-01-10")
        }),
        makeEvent({
          id: "unknown-event",
          busyStatus: BusyStatus.UNKNOWN,
          category: EventCategory.UNKNOWN,
          startAt: date("2027-01-12"),
          endAt: date("2027-01-13")
        })
      ],
      defaultOptions
    );

    expect(intervals.map((interval) => interval.event.id)).toEqual([
      "busy-activity",
      "unknown-event"
    ]);
    expect(intervals[0]).toMatchObject({
      start: date("2027-01-04"),
      end: date("2027-01-06")
    });
  });

  it("splits CLASS_IN_SESSION intervals into weekday-only sub-intervals (MAT-010)", () => {
    // Jan 4 2027 is a Monday. Span Mon Jan 4 → Mon Jan 11 covers two
    // weekend days (Sat Jan 9 + Sun Jan 10) which should be carved out.
    const intervals = buildBusyIntervals(
      [
        makeEvent({
          id: "term",
          busyStatus: BusyStatus.BUSY,
          category: EventCategory.CLASS_IN_SESSION,
          startAt: date("2027-01-04"),
          endAt: date("2027-01-11")
        })
      ],
      defaultOptions
    );

    // Expect Mon, Tue, Wed, Thu, Fri (5 sub-intervals), no Sat/Sun.
    expect(intervals).toHaveLength(5);
    const startsLocal = intervals.map((i) =>
      i.start.toISOString().slice(0, 10)
    );
    expect(startsLocal).toEqual([
      "2027-01-04",
      "2027-01-05",
      "2027-01-06",
      "2027-01-07",
      "2027-01-08"
    ]);
  });

  it("non-class categories are NOT split into weekday sub-intervals", () => {
    const intervals = buildBusyIntervals(
      [
        makeEvent({
          id: "tournament",
          busyStatus: BusyStatus.BUSY,
          category: EventCategory.ACTIVITY_BUSY,
          startAt: date("2027-01-09"), // Saturday
          endAt: date("2027-01-11")    // Monday (exclusive)
        })
      ],
      defaultOptions
    );

    expect(intervals).toHaveLength(1);
    expect(intervals[0].start).toEqual(date("2027-01-09"));
    expect(intervals[0].end).toEqual(date("2027-01-11"));
  });

  it("respects includeExamAsBusy for CONFIGURABLE exam periods", () => {
    const events = [
      makeEvent({
        id: "exam-1",
        busyStatus: BusyStatus.CONFIGURABLE,
        category: EventCategory.EXAM_PERIOD,
        startAt: date("2027-03-10"),
        endAt: date("2027-03-14")
      })
    ];

    const withExam = buildBusyIntervals(events, {
      includeUnknownAsBusy: false,
      includeExamAsBusy: true
    });
    const withoutExam = buildBusyIntervals(events, {
      includeUnknownAsBusy: false,
      includeExamAsBusy: false
    });

    expect(withExam).toHaveLength(1);
    expect(withoutExam).toHaveLength(0);
  });
});
