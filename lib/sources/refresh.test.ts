import { RefreshStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  hashCandidateSet,
  resolveRefreshStatus,
  type CandidateSnapshotInput
} from "./refresh";

const baseCandidate: CandidateSnapshotInput = {
  rawTitle: "Spring Break",
  startAt: new Date("2027-03-13T00:00:00.000Z"),
  endAt: new Date("2027-03-22T00:00:00.000Z"),
  allDay: true,
  category: "BREAK",
  suggestedBusyStatus: "FREE",
  evidenceLocator: "uid-spring-break@example.com"
};

function variant(
  overrides: Partial<CandidateSnapshotInput>
): CandidateSnapshotInput {
  return { ...baseCandidate, ...overrides };
}

describe("hashCandidateSet", () => {
  it("returns the same hash for the same inputs", () => {
    expect(hashCandidateSet([baseCandidate])).toBe(
      hashCandidateSet([baseCandidate])
    );
  });

  it("is order-independent", () => {
    const a = variant({ rawTitle: "A", evidenceLocator: "a" });
    const b = variant({ rawTitle: "B", evidenceLocator: "b" });
    expect(hashCandidateSet([a, b])).toBe(hashCandidateSet([b, a]));
  });

  it("treats Date inputs and equivalent ISO strings as identical", () => {
    const dateForm = variant({});
    const stringForm = variant({
      startAt: "2027-03-13T00:00:00.000Z",
      endAt: "2027-03-22T00:00:00.000Z"
    });
    expect(hashCandidateSet([dateForm])).toBe(hashCandidateSet([stringForm]));
  });

  it("changes the hash when a date moves", () => {
    const moved = variant({
      endAt: new Date("2027-03-23T00:00:00.000Z")
    });
    expect(hashCandidateSet([baseCandidate])).not.toBe(
      hashCandidateSet([moved])
    );
  });

  it("changes the hash when an event is added", () => {
    const second = variant({
      rawTitle: "Fall Break",
      evidenceLocator: "uid-fall-break@example.com",
      startAt: new Date("2026-10-22T00:00:00.000Z"),
      endAt: new Date("2026-10-24T00:00:00.000Z")
    });
    expect(hashCandidateSet([baseCandidate])).not.toBe(
      hashCandidateSet([baseCandidate, second])
    );
  });

  it("changes the hash when category flips", () => {
    const reclassified = variant({ category: "EXAM_PERIOD" });
    expect(hashCandidateSet([baseCandidate])).not.toBe(
      hashCandidateSet([reclassified])
    );
  });

  it("returns the same hash for empty input every time", () => {
    expect(hashCandidateSet([])).toBe(hashCandidateSet([]));
  });
});

describe("resolveRefreshStatus", () => {
  it("returns OK when the after-snapshot is empty", () => {
    expect(
      resolveRefreshStatus({
        isFirstRefresh: false,
        beforeHash: "a",
        afterHash: "b",
        candidatesAfter: 0
      })
    ).toBe(RefreshStatus.OK);
  });

  it("returns NEEDS_REVIEW on the first refresh when candidates were produced", () => {
    expect(
      resolveRefreshStatus({
        isFirstRefresh: true,
        beforeHash: "empty",
        afterHash: "non-empty",
        candidatesAfter: 5
      })
    ).toBe(RefreshStatus.NEEDS_REVIEW);
  });

  it("returns OK on a subsequent refresh when the candidate set is unchanged", () => {
    expect(
      resolveRefreshStatus({
        isFirstRefresh: false,
        beforeHash: "abc",
        afterHash: "abc",
        candidatesAfter: 4
      })
    ).toBe(RefreshStatus.OK);
  });

  it("returns CHANGED on a subsequent refresh when the set differs", () => {
    expect(
      resolveRefreshStatus({
        isFirstRefresh: false,
        beforeHash: "abc",
        afterHash: "def",
        candidatesAfter: 4
      })
    ).toBe(RefreshStatus.CHANGED);
  });
});
