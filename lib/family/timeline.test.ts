import { BusyStatus, EventCategory, SourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildRange,
  buildTimelineBlocks,
  buildTimelineWindows,
  classifyBlockKind,
  computeBlockGeometry,
  defaultTimelineRange,
  inclusiveEnd,
  sourceColor,
  sourceTypeLabel,
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
    allDay: true,
    calendarName: "Test calendar",
    sourceType: null,
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


describe("sourceColor (#130)", () => {
  it("returns the same color for the same source id every time", () => {
    expect(sourceColor("src-abc-123")).toBe(sourceColor("src-abc-123"));
  });

  it("returns different colors for different source ids", () => {
    // Not a strict guarantee (hash collisions exist) but the slot
    // space is 360 hues so the odds of collision on two arbitrary
    // strings are low. The two below are crafted to hash differently.
    const a = sourceColor("source-one");
    const b = sourceColor("source-two");
    expect(a).not.toBe(b);
  });

  it("falls back to a neutral gray for null (manually-added events)", () => {
    expect(sourceColor(null)).toBe("hsl(0, 0%, 60%)");
  });

  it("returns a valid HSL string", () => {
    expect(sourceColor("anything")).toMatch(/^hsl\(\d+,\s+\d+%,\s+\d+%\)$/);
  });
});

describe("buildTimelineBlocks source attribution (#130)", () => {
  it("populates sourceId and sourceColor on every block", () => {
    const range = buildRange(date("2027-01-01"), date("2027-01-31"));
    const blocks = buildTimelineBlocks(
      [
        {
          id: "e1",
          calendarId: "cal-a",
          title: "Some event",
          category: EventCategory.BREAK,
          busyStatus: BusyStatus.FREE,
          startAt: date("2027-01-10"),
          endAt: date("2027-01-12"),
          allDay: true,
          sourceConfidence: 0.95,
          calendarName: "UCLA",
          sourceType: SourceType.URL,
          sourceId: "src-ucla-1"
        },
        {
          id: "e2",
          calendarId: "cal-b",
          title: "Manually added",
          category: EventCategory.MANUAL_BLOCK,
          busyStatus: BusyStatus.BUSY,
          startAt: date("2027-01-15"),
          endAt: date("2027-01-16"),
          allDay: true,
          sourceConfidence: 1,
          calendarName: "Family",
          sourceType: null,
          sourceId: null
        }
      ],
      range
    );

    expect(blocks[0].sourceId).toBe("src-ucla-1");
    expect(blocks[0].sourceColor).toBe(sourceColor("src-ucla-1"));
    expect(blocks[1].sourceId).toBeNull();
    expect(blocks[1].sourceColor).toBe(sourceColor(null));
  });
});

describe("inclusiveEnd (#129)", () => {
  it("subtracts 1ms from all-day end so the formatted day is the last visible day", () => {
    const exclusiveEnd = date("2026-02-17");
    const visible = inclusiveEnd(exclusiveEnd, true);
    // The visible end is on Feb 16 (any standard date formatter prints it that way).
    expect(visible.getUTCFullYear()).toBe(2026);
    expect(visible.getUTCMonth()).toBe(1); // Feb
    expect(visible.getUTCDate()).toBe(16);
  });

  it("returns timed events unchanged", () => {
    const end = new Date("2026-02-16T15:30:00.000Z");
    expect(inclusiveEnd(end, false)).toBe(end);
  });

  it("handles a multi-day all-day range (Mar 13-21 inclusive stored as start=Mar 13, end=Mar 22)", () => {
    const exclusiveEnd = date("2027-03-22");
    const visible = inclusiveEnd(exclusiveEnd, true);
    expect(visible.getUTCDate()).toBe(21);
    expect(visible.getUTCMonth()).toBe(2); // Mar
  });
});

describe("sourceTypeLabel", () => {
  it("maps each source type to a parent-readable label", () => {
    expect(sourceTypeLabel(SourceType.GOOGLE_CALENDAR)).toBe("Google Calendar");
    expect(sourceTypeLabel(SourceType.OUTLOOK_CALENDAR)).toBe("Outlook Calendar");
    expect(sourceTypeLabel(SourceType.ICS)).toBe("ICS subscription");
    expect(sourceTypeLabel(SourceType.URL)).toBe("Web page extract");
    expect(sourceTypeLabel(SourceType.PDF_UPLOAD)).toBe("PDF upload");
  });

  it("falls back to \"Added manually\" for null (no candidate link)", () => {
    expect(sourceTypeLabel(null)).toBe("Added manually");
  });
});

describe("buildTimelineBlocks provenance", () => {
  it("attaches calendarName and sourceLabel to each block", () => {
    const range = buildRange(date("2027-01-01"), date("2027-01-31"));
    const blocks = buildTimelineBlocks(
      [
        {
          id: "e1",
          calendarId: "cal-a",
          title: "Spring Break",
          category: EventCategory.BREAK,
          busyStatus: BusyStatus.FREE,
          startAt: date("2027-01-10"),
          endAt: date("2027-01-15"),
          allDay: true,
          sourceConfidence: 0.95,
          calendarName: "UCLA Academic Calendar",
          sourceType: SourceType.URL
        }
      ],
      range
    );
    expect(blocks[0].calendarName).toBe("UCLA Academic Calendar");
    expect(blocks[0].sourceLabel).toBe("Web page extract");
  });
});
