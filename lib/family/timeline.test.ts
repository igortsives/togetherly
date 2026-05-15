import { BusyStatus, EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildRange,
  buildTimelineBlocks,
  buildTimelineWindows,
  classifyBlockKind,
  computeBlockGeometry,
  defaultTimelineRange,
  type TimelineEventInput
} from "./timeline";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

function makeEvent(
  overrides: Partial<TimelineEventInput> = {}
): TimelineEventInput {
  return {
    id: "event-1",
    calendarId: "calendar-1",
    title: "Sample event",
    category: EventCategory.CLASS_IN_SESSION,
    busyStatus: BusyStatus.BUSY,
    startAt: date("2027-01-04"),
    endAt: date("2027-01-06"),
    sourceConfidence: 0.95,
    ...overrides
  };
}

describe("buildRange", () => {
  it("computes total days and creates a month tick for every visible month", () => {
    const range = buildRange(date("2027-01-15"), date("2027-04-15"));
    expect(range.totalDays).toBe(90);
    const labels = range.monthTicks.map((tick) => tick.label);
    expect(labels).toEqual(["Jan", "Feb", "Mar", "Apr"]);
    expect(range.monthTicks[0].leftPercent).toBe(0);
    expect(range.monthTicks.at(-1)!.leftPercent).toBeLessThanOrEqual(100);
  });
});

describe("defaultTimelineRange", () => {
  it("spans 120 days from the start of today", () => {
    const range = defaultTimelineRange(date("2027-06-15"));
    expect(range.totalDays).toBe(120);
    expect(range.start.toISOString()).toBe("2027-06-15T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2027-10-13T00:00:00.000Z");
  });
});

describe("classifyBlockKind", () => {
  it("maps exam periods to the exam kind even when configurable", () => {
    expect(
      classifyBlockKind(EventCategory.EXAM_PERIOD, BusyStatus.CONFIGURABLE)
    ).toBe("exam");
  });

  it("maps unknown status events to the unknown kind", () => {
    expect(classifyBlockKind(EventCategory.UNKNOWN, BusyStatus.UNKNOWN)).toBe(
      "unknown"
    );
    expect(
      classifyBlockKind(EventCategory.CLASS_IN_SESSION, BusyStatus.UNKNOWN)
    ).toBe("unknown");
  });

  it("maps FREE status to the free kind", () => {
    expect(classifyBlockKind(EventCategory.BREAK, BusyStatus.FREE)).toBe(
      "free"
    );
  });

  it("falls back to busy for explicit BUSY events", () => {
    expect(
      classifyBlockKind(EventCategory.CLASS_IN_SESSION, BusyStatus.BUSY)
    ).toBe("busy");
  });
});

describe("computeBlockGeometry", () => {
  const range = buildRange(date("2027-01-01"), date("2027-01-11"));

  it("places a fully visible event using percent offsets", () => {
    const geometry = computeBlockGeometry(
      { startAt: date("2027-01-03"), endAt: date("2027-01-05") },
      range
    );
    expect(geometry).toEqual({ leftPercent: 20, widthPercent: 20 });
  });

  it("clamps events that start before the visible range", () => {
    const geometry = computeBlockGeometry(
      { startAt: date("2026-12-25"), endAt: date("2027-01-03") },
      range
    );
    expect(geometry?.leftPercent).toBe(0);
    expect(geometry?.widthPercent).toBe(20);
  });

  it("clamps events that end after the visible range", () => {
    const geometry = computeBlockGeometry(
      { startAt: date("2027-01-09"), endAt: date("2027-02-01") },
      range
    );
    expect(geometry?.leftPercent).toBe(80);
    expect(geometry?.widthPercent).toBe(20);
  });

  it("returns null for events fully outside the visible range", () => {
    expect(
      computeBlockGeometry(
        { startAt: date("2026-12-20"), endAt: date("2026-12-30") },
        range
      )
    ).toBeNull();
    expect(
      computeBlockGeometry(
        { startAt: date("2027-02-01"), endAt: date("2027-02-05") },
        range
      )
    ).toBeNull();
  });

  it("gives single-day events a minimum visible width", () => {
    const longRange = buildRange(date("2027-01-01"), date("2030-01-01"));
    const geometry = computeBlockGeometry(
      { startAt: date("2027-01-05"), endAt: date("2027-01-06") },
      longRange
    );
    expect(geometry?.widthPercent).toBeGreaterThanOrEqual(0.6);
  });
});

describe("buildTimelineBlocks", () => {
  const range = buildRange(date("2027-01-01"), date("2027-01-11"));

  it("sorts blocks by start and skips events outside the range", () => {
    const blocks = buildTimelineBlocks(
      [
        makeEvent({
          id: "later",
          startAt: date("2027-01-07"),
          endAt: date("2027-01-09")
        }),
        makeEvent({
          id: "earlier",
          startAt: date("2027-01-02"),
          endAt: date("2027-01-04")
        }),
        makeEvent({
          id: "outside",
          startAt: date("2027-02-01"),
          endAt: date("2027-02-05")
        })
      ],
      range
    );

    expect(blocks.map((block) => block.id)).toEqual(["earlier", "later"]);
  });

  it("flags low-confidence blocks based on category and confidence", () => {
    const blocks = buildTimelineBlocks(
      [
        makeEvent({ id: "high", sourceConfidence: 0.95 }),
        makeEvent({
          id: "low",
          sourceConfidence: 0.4,
          startAt: date("2027-01-07"),
          endAt: date("2027-01-09")
        }),
        makeEvent({
          id: "unknown",
          category: EventCategory.UNKNOWN,
          busyStatus: BusyStatus.UNKNOWN,
          sourceConfidence: 0.99,
          startAt: date("2027-01-04"),
          endAt: date("2027-01-05")
        })
      ],
      range
    );

    const byId = new Map(blocks.map((block) => [block.id, block]));
    expect(byId.get("high")?.lowConfidence).toBe(false);
    expect(byId.get("low")?.lowConfidence).toBe(true);
    expect(byId.get("unknown")?.lowConfidence).toBe(true);
    expect(byId.get("unknown")?.kind).toBe("unknown");
  });

  it("accepts numeric, decimal-shaped, and null source confidence values", () => {
    const blocks = buildTimelineBlocks(
      [
        makeEvent({ id: "numeric", sourceConfidence: 0.5 }),
        makeEvent({
          id: "string-shaped",
          startAt: date("2027-01-07"),
          endAt: date("2027-01-08"),
          sourceConfidence: "0.4" as unknown as number
        }),
        makeEvent({
          id: "null-confidence",
          startAt: date("2027-01-09"),
          endAt: date("2027-01-10"),
          sourceConfidence: null
        })
      ],
      range
    );

    const byId = new Map(blocks.map((block) => [block.id, block]));
    expect(byId.get("numeric")?.lowConfidence).toBe(true);
    expect(byId.get("string-shaped")?.lowConfidence).toBe(true);
    expect(byId.get("null-confidence")?.lowConfidence).toBe(false);
  });
});

describe("buildTimelineWindows", () => {
  const range = buildRange(date("2027-01-01"), date("2027-01-11"));

  it("computes geometry for recommended windows", () => {
    const windows = buildTimelineWindows(
      [
        {
          id: "win-1",
          start: date("2027-01-03"),
          end: date("2027-01-06"),
          durationDays: 3
        },
        {
          id: "win-outside",
          start: date("2027-03-01"),
          end: date("2027-03-05"),
          durationDays: 4
        }
      ],
      range
    );

    expect(windows).toHaveLength(1);
    expect(windows[0].leftPercent).toBe(20);
    expect(windows[0].widthPercent).toBe(30);
  });
});
