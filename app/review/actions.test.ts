import { ReviewStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    eventCandidate: {
      findMany: vi.fn(),
      update: vi.fn()
    },
    calendarEvent: {
      create: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

vi.mock("@/lib/family/session", () => ({
  requireUserFamily: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/domain/event-taxonomy", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/domain/event-taxonomy")>(
      "@/lib/domain/event-taxonomy"
    );
  return actual;
});

vi.mock("@/lib/review/candidates", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/review/candidates")>(
      "@/lib/review/candidates"
    );
  return actual;
});

import { prisma } from "@/lib/db/prisma";
import { requireUserFamily } from "@/lib/family/session";
import { bulkConfirmCandidatesAction } from "./actions";

const mockFindMany = prisma.eventCandidate.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const mockTransaction = prisma.$transaction as unknown as ReturnType<
  typeof vi.fn
>;
const mockRequireFamily = requireUserFamily as unknown as ReturnType<
  typeof vi.fn
>;

const candidateBase = {
  calendarId: "cal-1",
  calendarSourceId: "src-1",
  rawTitle: "Spring Break",
  normalizedTitle: "spring break",
  category: "BREAK",
  suggestedBusyStatus: "FREE",
  startAt: new Date("2027-03-15T00:00:00.000Z"),
  endAt: new Date("2027-03-22T00:00:00.000Z"),
  allDay: true,
  timezone: "America/Los_Angeles",
  evidenceText: null,
  evidenceLocator: null,
  createdAt: new Date("2026-05-15T00:00:00.000Z"),
  updatedAt: new Date("2026-05-15T00:00:00.000Z")
};

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireFamily.mockResolvedValue({
    id: "family-1",
    ownerId: "user-1",
    name: null,
    timezone: "America/Los_Angeles",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  mockTransaction.mockResolvedValue([]);
});

function formDataWith(candidateIds: string[]): FormData {
  const data = new FormData();
  for (const id of candidateIds) {
    data.append("candidateId", id);
  }
  return data;
}

describe("bulkConfirmCandidatesAction", () => {
  it("is a no-op on empty input", async () => {
    await bulkConfirmCandidatesAction(new FormData());
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("scopes the findMany by the current family", async () => {
    mockFindMany.mockResolvedValue([]);
    await bulkConfirmCandidatesAction(formDataWith(["c-1", "c-2"]));
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["c-1", "c-2"] },
        calendar: { familyId: "family-1" }
      }
    });
  });

  it("returns without writing when no candidates load (cross-family attack)", async () => {
    mockFindMany.mockResolvedValue([]);
    await bulkConfirmCandidatesAction(formDataWith(["c-1"]));
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("skips ineligible candidates (non-PENDING or low confidence) and confirms the rest", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "c-1",
        ...candidateBase,
        confidence: "0.95",
        reviewStatus: ReviewStatus.PENDING
      },
      {
        id: "c-2",
        ...candidateBase,
        confidence: "0.5",
        reviewStatus: ReviewStatus.PENDING
      },
      {
        id: "c-3",
        ...candidateBase,
        confidence: "0.95",
        reviewStatus: ReviewStatus.CONFIRMED
      }
    ]);

    await bulkConfirmCandidatesAction(formDataWith(["c-1", "c-2", "c-3"]));

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const ops = mockTransaction.mock.calls[0][0] as unknown[];
    expect(ops).toHaveLength(2);
  });

  it("dedupes repeated candidate ids in the form payload", async () => {
    mockFindMany.mockResolvedValue([]);
    await bulkConfirmCandidatesAction(
      formDataWith(["c-1", "c-1", "c-1", "c-2"])
    );
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["c-1", "c-2"] },
        calendar: { familyId: "family-1" }
      }
    });
  });

  it("skips the transaction when no eligible candidates remain", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "c-1",
        ...candidateBase,
        confidence: "0.5",
        reviewStatus: ReviewStatus.PENDING
      }
    ]);
    await bulkConfirmCandidatesAction(formDataWith(["c-1"]));
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
