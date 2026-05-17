import { describe, expect, it } from "vitest";
import { applyIngestWindow } from "./ingest-window";

describe("applyIngestWindow", () => {
  const candidates = [
    { id: "a", startAt: new Date("2026-01-15T00:00:00.000Z") },
    { id: "b", startAt: new Date("2026-08-30T00:00:00.000Z") },
    { id: "c", startAt: new Date("2027-01-01T00:00:00.000Z") }
  ];

  it("returns the input unchanged when no floor is set", () => {
    expect(applyIngestWindow(candidates, null)).toEqual(candidates);
    expect(applyIngestWindow(candidates, undefined)).toEqual(candidates);
  });

  it("keeps candidates on or after the floor", () => {
    const result = applyIngestWindow(
      candidates,
      new Date("2026-08-30T00:00:00.000Z")
    );
    expect(result.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("drops candidates strictly before the floor", () => {
    const result = applyIngestWindow(
      candidates,
      new Date("2026-12-31T23:59:59.999Z")
    );
    expect(result.map((c) => c.id)).toEqual(["c"]);
  });

  it("accepts startAt as an ISO string", () => {
    const stringCandidates = [
      { id: "x", startAt: "2026-01-01T00:00:00.000Z" },
      { id: "y", startAt: "2026-06-01T00:00:00.000Z" }
    ];
    const result = applyIngestWindow(
      stringCandidates,
      new Date("2026-06-01T00:00:00.000Z")
    );
    expect(result.map((c) => c.id)).toEqual(["y"]);
  });
});
