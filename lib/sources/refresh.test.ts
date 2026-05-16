import { RefreshStatus, SourceType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => {
  const stub = {
    calendarSource: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn()
    },
    eventCandidate: {
      findMany: vi.fn()
    },
    freeWindowSearch: {
      updateMany: vi.fn()
    },
    $executeRaw: vi.fn()
  } as {
    calendarSource: {
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    eventCandidate: { findMany: ReturnType<typeof vi.fn> };
    freeWindowSearch: { updateMany: ReturnType<typeof vi.fn> };
    $executeRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
  };
  stub.$transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: typeof stub) => unknown) => cb(stub));
  return { prisma: stub };
});

vi.mock("@/lib/sources/google-ingest", () => ({
  refreshGoogleSource: vi.fn()
}));
vi.mock("@/lib/sources/html-ingest", () => ({
  refreshHtmlSource: vi.fn()
}));
vi.mock("@/lib/sources/ics-ingest", () => ({
  refreshIcsSource: vi.fn()
}));
vi.mock("@/lib/sources/microsoft-ingest", () => ({
  refreshMicrosoftSource: vi.fn()
}));
vi.mock("@/lib/sources/pdf-ingest", () => ({
  extractAndPersistPdf: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { refreshHtmlSource } from "@/lib/sources/html-ingest";
import {
  hashCandidateSet,
  refreshSource,
  resolveRefreshStatus,
  SourceFamilyMismatchError,
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
  it("returns OK only when both snapshots are empty (no work to do)", () => {
    expect(
      resolveRefreshStatus({
        isFirstRefresh: false,
        beforeHash: "empty",
        afterHash: "empty",
        candidatesBefore: 0,
        candidatesAfter: 0
      })
    ).toBe(RefreshStatus.OK);
  });

  it("returns CHANGED when a previously-non-empty PENDING set is wiped", () => {
    // Regression: an extractor that returns zero events for a source that
    // previously had unreviewed candidates must NOT silently report OK.
    expect(
      resolveRefreshStatus({
        isFirstRefresh: false,
        beforeHash: "had-twelve",
        afterHash: "empty",
        candidatesBefore: 12,
        candidatesAfter: 0
      })
    ).toBe(RefreshStatus.CHANGED);
  });

  it("returns NEEDS_REVIEW on the first refresh when candidates were produced", () => {
    expect(
      resolveRefreshStatus({
        isFirstRefresh: true,
        beforeHash: "empty",
        afterHash: "non-empty",
        candidatesBefore: 0,
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
        candidatesBefore: 4,
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
        candidatesBefore: 4,
        candidatesAfter: 4
      })
    ).toBe(RefreshStatus.CHANGED);
  });
});

describe("refreshSource family ownership", () => {
  const mockFindUniqueOrThrow =
    prisma.calendarSource.findUniqueOrThrow as unknown as ReturnType<
      typeof vi.fn
    >;
  const mockUpdate = prisma.calendarSource.update as unknown as ReturnType<
    typeof vi.fn
  >;
  const mockFindMany = prisma.eventCandidate.findMany as unknown as ReturnType<
    typeof vi.fn
  >;
  const mockFreeWindowUpdateMany = (
    prisma as unknown as {
      freeWindowSearch: { updateMany: ReturnType<typeof vi.fn> };
    }
  ).freeWindowSearch.updateMany;
  const mockRefreshHtmlSource = refreshHtmlSource as unknown as ReturnType<
    typeof vi.fn
  >;

  function makeSource(familyId: string) {
    return {
      id: "source-1",
      calendarId: "calendar-1",
      sourceType: SourceType.URL,
      sourceUrl: "https://example.com/calendar",
      lastParsedAt: null,
      refreshStatus: RefreshStatus.NEEDS_REVIEW,
      calendar: { familyId }
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    const txMock = (
      prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }
    ).$transaction;
    txMock.mockImplementation(async (cb: (tx: typeof prisma) => unknown) =>
      cb(prisma)
    );
    mockFindMany.mockResolvedValue([]);
    mockUpdate.mockResolvedValue({});
    mockFreeWindowUpdateMany.mockResolvedValue({ count: 0 });
    mockRefreshHtmlSource.mockResolvedValue(undefined);
  });

  it("throws SourceFamilyMismatchError when the source belongs to a different family", async () => {
    mockFindUniqueOrThrow.mockResolvedValue(makeSource("family-other"));

    await expect(refreshSource("source-1", "family-expected")).rejects.toBeInstanceOf(
      SourceFamilyMismatchError
    );

    expect(mockRefreshHtmlSource).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("dispatches to the per-type orchestrator when the source belongs to the expected family", async () => {
    mockFindUniqueOrThrow.mockResolvedValue(makeSource("family-expected"));

    const outcome = await refreshSource("source-1", "family-expected");

    expect(mockRefreshHtmlSource).toHaveBeenCalledWith("source-1");
    expect(outcome.sourceId).toBe("source-1");
  });

  it("loads the calendar relation so familyId can be checked", async () => {
    mockFindUniqueOrThrow.mockResolvedValue(makeSource("family-expected"));

    await refreshSource("source-1", "family-expected");

    expect(mockFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "source-1" },
      include: { calendar: { select: { familyId: true } } }
    });
  });

  it("marks free-window searches stale when the candidate set changed", async () => {
    mockFindUniqueOrThrow.mockResolvedValue(makeSource("family-expected"));
    // First snapshot (before): empty; second (after): one candidate.
    // Different hashes → changeDetected true → updateMany fires.
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          rawTitle: "Spring Break",
          startAt: new Date("2027-03-13T00:00:00.000Z"),
          endAt: new Date("2027-03-22T00:00:00.000Z"),
          allDay: true,
          category: "BREAK",
          suggestedBusyStatus: "FREE",
          evidenceLocator: "uid"
        }
      ]);

    const outcome = await refreshSource("source-1", "family-expected");

    expect(outcome.changeDetected).toBe(true);
    expect(mockFreeWindowUpdateMany).toHaveBeenCalledWith({
      where: { familyId: "family-expected", stale: false },
      data: { stale: true }
    });
  });

  it("does NOT mark searches stale when the candidate set is unchanged", async () => {
    const sameCandidate = {
      rawTitle: "Spring Break",
      startAt: new Date("2027-03-13T00:00:00.000Z"),
      endAt: new Date("2027-03-22T00:00:00.000Z"),
      allDay: true,
      category: "BREAK",
      suggestedBusyStatus: "FREE",
      evidenceLocator: "uid"
    };
    const stableSource = {
      ...makeSource("family-expected"),
      lastParsedAt: new Date("2026-01-01T00:00:00.000Z")
    };
    mockFindUniqueOrThrow.mockResolvedValue(stableSource);
    mockFindMany
      .mockResolvedValueOnce([sameCandidate])
      .mockResolvedValueOnce([sameCandidate]);

    const outcome = await refreshSource("source-1", "family-expected");

    expect(outcome.changeDetected).toBe(false);
    expect(mockFreeWindowUpdateMany).not.toHaveBeenCalled();
  });

  it("writes lastFetchedAt on successful refresh", async () => {
    mockFindUniqueOrThrow.mockResolvedValue(makeSource("family-expected"));

    await refreshSource("source-1", "family-expected");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "source-1" },
        data: expect.objectContaining({ lastFetchedAt: expect.any(Date) })
      })
    );
  });
});
