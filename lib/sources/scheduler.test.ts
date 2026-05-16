import { SourceType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    calendarSource: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/sources/refresh", () => ({
  refreshSource: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { refreshSource } from "@/lib/sources/refresh";
import {
  MAX_FAILED_ATTEMPTS,
  REFRESH_CADENCE_MS,
  STATIC_SOURCE_TYPES,
  refreshAllStaleSources
} from "./scheduler";

const mockFindMany = prisma.calendarSource.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const mockRefreshSource = refreshSource as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("refreshAllStaleSources", () => {
  it("returns an empty summary when no sources are due", async () => {
    mockFindMany.mockResolvedValue([]);
    const summary = await refreshAllStaleSources();
    expect(summary).toEqual({
      examined: 0,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      results: []
    });
    expect(mockRefreshSource).not.toHaveBeenCalled();
  });

  it("dispatches refresh for each due source", async () => {
    mockFindMany.mockResolvedValue([
      { id: "src-a", calendar: { familyId: "fam-1" } },
      { id: "src-b", calendar: { familyId: "fam-2" } }
    ]);
    mockRefreshSource
      .mockResolvedValueOnce({
        sourceId: "src-a",
        refreshStatus: "OK",
        candidatesBefore: 0,
        candidatesAfter: 0,
        changeDetected: false
      })
      .mockResolvedValueOnce({
        sourceId: "src-b",
        refreshStatus: "CHANGED",
        candidatesBefore: 1,
        candidatesAfter: 2,
        changeDetected: true
      });

    const summary = await refreshAllStaleSources();

    expect(summary.examined).toBe(2);
    expect(summary.attempted).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.results).toEqual([
      {
        sourceId: "src-a",
        familyId: "fam-1",
        status: "ok",
        changeDetected: false
      },
      {
        sourceId: "src-b",
        familyId: "fam-2",
        status: "ok",
        changeDetected: true
      }
    ]);
    expect(mockRefreshSource).toHaveBeenCalledWith("src-a", "fam-1");
    expect(mockRefreshSource).toHaveBeenCalledWith("src-b", "fam-2");
  });

  it("isolates errors so a failing source does not stop the batch", async () => {
    mockFindMany.mockResolvedValue([
      { id: "src-a", calendar: { familyId: "fam-1" } },
      { id: "src-b", calendar: { familyId: "fam-2" } }
    ]);
    mockRefreshSource
      .mockRejectedValueOnce(new Error("network blew up"))
      .mockResolvedValueOnce({
        sourceId: "src-b",
        refreshStatus: "OK",
        candidatesBefore: 0,
        candidatesAfter: 0,
        changeDetected: false
      });

    const summary = await refreshAllStaleSources();

    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.results[0]).toMatchObject({
      sourceId: "src-a",
      status: "error",
      error: "network blew up"
    });
    expect(summary.results[1]).toMatchObject({
      sourceId: "src-b",
      status: "ok"
    });
  });

  it("computes the cadence cutoff from `now` and `cadenceMs`", async () => {
    mockFindMany.mockResolvedValue([]);
    const fixedNow = new Date("2026-05-15T12:00:00Z");
    await refreshAllStaleSources({ now: fixedNow, cadenceMs: 60_000 });

    const expectedCutoff = new Date(fixedNow.getTime() - 60_000);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          { lastFetchedAt: null },
          { lastFetchedAt: { lt: expectedCutoff } }
        ]
      }),
      select: expect.any(Object)
    });
  });

  it("excludes static source types from the dispatch set", async () => {
    mockFindMany.mockResolvedValue([]);
    await refreshAllStaleSources();
    const call = mockFindMany.mock.calls[0]?.[0] as {
      where: { sourceType: { notIn: SourceType[] } };
    };
    expect(call.where.sourceType.notIn).toEqual([...STATIC_SOURCE_TYPES]);
    expect(call.where.sourceType.notIn).toContain(SourceType.PDF_UPLOAD);
  });

  it("uses a 24-hour cadence by default", () => {
    expect(REFRESH_CADENCE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("excludes sources whose failedAttempts has reached MAX_FAILED_ATTEMPTS (#100)", async () => {
    mockFindMany.mockResolvedValue([]);
    await refreshAllStaleSources();
    const call = mockFindMany.mock.calls[0]?.[0] as {
      where: { failedAttempts: { lt: number } };
    };
    expect(call.where.failedAttempts).toEqual({ lt: MAX_FAILED_ATTEMPTS });
  });
});
