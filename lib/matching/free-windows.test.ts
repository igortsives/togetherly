import { BusyStatus, EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { BusyInterval } from "./event-busy";
import {
  findExplainedFreeWindows,
  findFreeWindows,
  mergeRanges
} from "./free-windows";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("mergeRanges", () => {
  it("merges overlapping busy ranges", () => {
    expect(
      mergeRanges([
        { start: date("2027-01-03"), end: date("2027-01-06") },
        { start: date("2027-01-05"), end: date("2027-01-08") }
      ])
    ).toEqual([{ start: date("2027-01-03"), end: date("2027-01-08") }]);
  });
});

describe("findFreeWindows", () => {
  it("returns windows that satisfy the requested duration", () => {
    const windows = findFreeWindows(
      { start: date("2027-01-01"), end: date("2027-01-15") },
      [
        { start: date("2027-01-04"), end: date("2027-01-06") },
        { start: date("2027-01-10"), end: date("2027-01-11") }
      ],
      3
    );

    expect(windows).toEqual([
      {
        start: date("2027-01-01"),
        end: date("2027-01-04"),
        durationDays: 3
      },
      {
        start: date("2027-01-06"),
        end: date("2027-01-10"),
        durationDays: 4
      },
      {
        start: date("2027-01-11"),
        end: date("2027-01-15"),
        durationDays: 4
      }
    ]);
  });
});

function busyInterval(
  start: string,
  end: string,
  overrides: Partial<BusyInterval["event"]> = {}
): BusyInterval {
  return {
    start: date(start),
    end: date(end),
    event: {
      id: `${overrides.id ?? "ev"}-${start}`,
      title: overrides.title ?? "Class in session",
      category: overrides.category ?? EventCategory.CLASS_IN_SESSION,
      busyStatus: overrides.busyStatus ?? BusyStatus.BUSY,
      startAt: date(start),
      endAt: date(end),
      calendarId: overrides.calendarId ?? "cal-1",
      calendarName: overrides.calendarName ?? "Sample calendar"
    }
  };
}

describe("findExplainedFreeWindows", () => {
  it("attaches blocking events to each window boundary", () => {
    const windows = findExplainedFreeWindows(
      { start: date("2027-01-01"), end: date("2027-01-15") },
      [
        busyInterval("2027-01-04", "2027-01-06", {
          title: "Finals",
          calendarName: "UCLA"
        }),
        busyInterval("2027-01-10", "2027-01-11", {
          title: "Tournament",
          calendarName: "Soccer"
        })
      ],
      3
    );

    expect(windows).toHaveLength(3);
    expect(windows[0].explanation.blockedBefore).toBeUndefined();
    expect(windows[0].explanation.blockedAfter?.title).toBe("Finals");
    expect(windows[1].explanation.blockedBefore?.title).toBe("Finals");
    expect(windows[1].explanation.blockedAfter?.title).toBe("Tournament");
    expect(windows[2].explanation.blockedBefore?.title).toBe("Tournament");
    expect(windows[2].explanation.blockedAfter).toBeUndefined();
  });

  it("picks the longest contributing event when multiple share a merged boundary", () => {
    const windows = findExplainedFreeWindows(
      { start: date("2027-01-01"), end: date("2027-01-20") },
      [
        busyInterval("2027-01-04", "2027-01-09", {
          title: "Long break prep",
          calendarName: "UCLA"
        }),
        busyInterval("2027-01-06", "2027-01-09", {
          title: "Music recital",
          calendarName: "Music"
        })
      ],
      3
    );

    expect(windows).toHaveLength(2);
    expect(windows[1].explanation.blockedBefore?.title).toBe("Long break prep");
  });
});
