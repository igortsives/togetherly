import { describe, expect, it } from "vitest";
import { findFreeWindows, mergeRanges } from "./free-windows";

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
