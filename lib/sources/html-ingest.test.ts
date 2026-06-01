import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => {
  const stub = {
    calendarSource: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn()
    },
    eventCandidate: {
      deleteMany: vi.fn(),
      createMany: vi.fn()
    },
    $transaction: vi.fn()
  };
  return { prisma: stub };
});

vi.mock("@/lib/sources/extractors/llm", () => ({
  extractWithLlm: vi.fn(),
  shouldUseLlmExtractor: vi.fn(() => true)
}));

import { prisma } from "@/lib/db/prisma";
import { extractWithLlm } from "@/lib/sources/extractors/llm";
import { extractAndPersistHtml } from "./html-ingest";

const mockFindUniqueOrThrow = prisma.calendarSource
  .findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.calendarSource.update as unknown as ReturnType<
  typeof vi.fn
>;
const mockTransaction = (
  prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }
).$transaction;
const mockExtractWithLlm = extractWithLlm as unknown as ReturnType<typeof vi.fn>;

function makeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: "src-1",
    calendarId: "cal-1",
    sourceUrl: "https://example.com/cal",
    contentHash: null,
    lastParsedAt: null,
    ingestWindowStart: null,
    calendar: { id: "cal-1", type: "SCHOOL", timezone: "America/Los_Angeles" },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue({});
  mockTransaction.mockResolvedValue([]);
  mockExtractWithLlm.mockResolvedValue({ candidates: [] });
});

describe("extractAndPersistHtml content-hash short-circuit (issue #158)", () => {
  it("skips the LLM call when the fetched body is unchanged", async () => {
    mockFindUniqueOrThrow.mockResolvedValue(
      makeSource({
        contentHash: "hash-abc",
        lastParsedAt: new Date("2026-05-30T00:00:00.000Z")
      })
    );

    const result = await extractAndPersistHtml({
      calendarSourceId: "src-1",
      htmlText: "<html>unchanged</html>",
      contentHash: "hash-abc"
    });

    expect(result.skippedUnchanged).toBe(true);
    expect(mockExtractWithLlm).not.toHaveBeenCalled();
    // Only lastFetchedAt is bumped; no candidate rewrite transaction.
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "src-1" },
      data: { lastFetchedAt: expect.any(Date) }
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("runs the LLM when the fetched body changed", async () => {
    mockFindUniqueOrThrow.mockResolvedValue(
      makeSource({
        contentHash: "hash-old",
        lastParsedAt: new Date("2026-05-30T00:00:00.000Z")
      })
    );

    const result = await extractAndPersistHtml({
      calendarSourceId: "src-1",
      htmlText: "<html>new</html>",
      contentHash: "hash-new"
    });

    expect(result.skippedUnchanged).toBeUndefined();
    expect(mockExtractWithLlm).toHaveBeenCalledOnce();
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("runs the LLM on the first refresh even if a stale hash matches", async () => {
    // lastParsedAt null → never extracted → must run regardless of hash.
    mockFindUniqueOrThrow.mockResolvedValue(
      makeSource({ contentHash: "hash-abc", lastParsedAt: null })
    );

    await extractAndPersistHtml({
      calendarSourceId: "src-1",
      htmlText: "<html>first</html>",
      contentHash: "hash-abc"
    });

    expect(mockExtractWithLlm).toHaveBeenCalledOnce();
  });

  it("forces re-extraction when force=true even if the hash matches", async () => {
    mockFindUniqueOrThrow.mockResolvedValue(
      makeSource({
        contentHash: "hash-abc",
        lastParsedAt: new Date("2026-05-30T00:00:00.000Z")
      })
    );

    const result = await extractAndPersistHtml({
      calendarSourceId: "src-1",
      htmlText: "<html>same</html>",
      contentHash: "hash-abc",
      force: true
    });

    expect(result.skippedUnchanged).toBeUndefined();
    expect(mockExtractWithLlm).toHaveBeenCalledOnce();
  });
});
