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
          id: "busy-class",
          busyStatus: BusyStatus.BUSY,
          category: EventCategory.CLASS_IN_SESSION,
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
      "busy-class",
      "unknown-event"
    ]);
    expect(intervals[0]).toMatchObject({
      start: date("2027-01-04"),
      end: date("2027-01-06")
    });
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
