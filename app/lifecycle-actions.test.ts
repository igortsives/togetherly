import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    calendar: {
      findFirst: vi.fn(),
      delete: vi.fn()
    },
    calendarSource: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    calendarEvent: {
      deleteMany: vi.fn()
    },
    eventCandidate: {
      deleteMany: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

vi.mock("@/lib/family/session", () => ({
  requireUserFamily: vi.fn(),
  getCurrentUserId: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn()
}));

vi.mock("@/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn()
}));

vi.mock("@/lib/sources/storage", () => ({
  deleteStoredUpload: vi.fn(),
  storeCalendarPdf: vi.fn()
}));

vi.mock("@/lib/sources/refresh", () => ({
  refreshSource: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { requireUserFamily } from "@/lib/family/session";
import { deleteStoredUpload } from "@/lib/sources/storage";
import {
  deleteCalendarAction,
  trimCalendarEventsAction,
  updateSourceIngestWindowAction
} from "./actions";

const mockRequireFamily = requireUserFamily as unknown as ReturnType<typeof vi.fn>;
const mockCalendarFindFirst = prisma.calendar.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockCalendarDelete = prisma.calendar.delete as unknown as ReturnType<typeof vi.fn>;
const mockSourceFindFirst = prisma.calendarSource.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockSourceUpdate = prisma.calendarSource.update as unknown as ReturnType<typeof vi.fn>;
const mockEventsDeleteMany = prisma.calendarEvent.deleteMany as unknown as ReturnType<typeof vi.fn>;
const mockCandidatesDeleteMany = prisma.eventCandidate.deleteMany as unknown as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mockDeleteUpload = deleteStoredUpload as unknown as ReturnType<typeof vi.fn>;

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

function formDataWith(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.append(key, value);
  }
  return data;
}

describe("deleteCalendarAction", () => {
  it("rejects a cross-family attempt", async () => {
    mockCalendarFindFirst.mockResolvedValue(null);
    await expect(
      deleteCalendarAction(formDataWith({ calendarId: "cal-other-family" }))
    ).rejects.toThrow("Calendar not found for this family.");
    expect(mockCalendarFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cal-other-family", familyId: "family-1" }
      })
    );
    expect(mockCalendarDelete).not.toHaveBeenCalled();
  });

  it("deletes the calendar and unlinks each uploaded PDF blob", async () => {
    mockCalendarFindFirst.mockResolvedValue({
      id: "cal-1",
      sources: [
        { uploadedFileKey: "blobs/abc.pdf" },
        { uploadedFileKey: null },
        { uploadedFileKey: "blobs/def.pdf" }
      ]
    });
    mockCalendarDelete.mockResolvedValue({});

    await deleteCalendarAction(formDataWith({ calendarId: "cal-1" }));

    expect(mockCalendarDelete).toHaveBeenCalledWith({ where: { id: "cal-1" } });
    expect(mockDeleteUpload).toHaveBeenCalledTimes(2);
    expect(mockDeleteUpload).toHaveBeenCalledWith("blobs/abc.pdf");
    expect(mockDeleteUpload).toHaveBeenCalledWith("blobs/def.pdf");
  });
});

describe("trimCalendarEventsAction", () => {
  it("rejects an unknown direction", async () => {
    await expect(
      trimCalendarEventsAction(
        formDataWith({
          calendarId: "cal-1",
          cutoffDate: "2026-09-01",
          direction: "delete-everything"
        })
      )
    ).rejects.toThrow("Direction must be delete-before or delete-after");
    expect(mockCalendarFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a cross-family attempt", async () => {
    mockCalendarFindFirst.mockResolvedValue(null);
    await expect(
      trimCalendarEventsAction(
        formDataWith({
          calendarId: "cal-other",
          cutoffDate: "2026-09-01",
          direction: "delete-after"
        })
      )
    ).rejects.toThrow("Calendar not found for this family.");
  });

  it("applies a gte cutoff to events and candidates for delete-after", async () => {
    mockCalendarFindFirst.mockResolvedValue({ id: "cal-1" });
    mockEventsDeleteMany.mockResolvedValue({ count: 0 });
    mockCandidatesDeleteMany.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      return Promise.all(ops);
    });

    await trimCalendarEventsAction(
      formDataWith({
        calendarId: "cal-1",
        cutoffDate: "2026-09-01",
        direction: "delete-after"
      })
    );

    // 2026-09-01 PT midnight = 2026-09-01T07:00 UTC (PDT, -7h).
    const cutoffPt = new Date("2026-09-01T07:00:00.000Z");
    expect(mockEventsDeleteMany).toHaveBeenCalledWith({
      where: {
        calendarId: "cal-1",
        startAt: { gte: cutoffPt }
      }
    });
    expect(mockCandidatesDeleteMany).toHaveBeenCalledWith({
      where: {
        calendarId: "cal-1",
        startAt: { gte: cutoffPt }
      }
    });
    // Both deleteMany calls land inside a single $transaction so the
    // review queue and confirmed-events stay consistent.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const txOps = mockTransaction.mock.calls[0][0] as unknown[];
    expect(Array.isArray(txOps)).toBe(true);
    expect(txOps).toHaveLength(2);
  });

  it("applies an lt cutoff to events and candidates for delete-before", async () => {
    mockCalendarFindFirst.mockResolvedValue({ id: "cal-1" });
    mockEventsDeleteMany.mockResolvedValue({ count: 0 });
    mockCandidatesDeleteMany.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      return Promise.all(ops);
    });

    await trimCalendarEventsAction(
      formDataWith({
        calendarId: "cal-1",
        cutoffDate: "2026-09-01",
        direction: "delete-before"
      })
    );

    expect(mockEventsDeleteMany).toHaveBeenCalledWith({
      where: {
        calendarId: "cal-1",
        startAt: { lt: new Date("2026-09-01T07:00:00.000Z") }
      }
    });
  });

  it("rejects an invalid cutoff but only after family scoping passes", async () => {
    mockCalendarFindFirst.mockResolvedValue({ id: "cal-1" });
    await expect(
      trimCalendarEventsAction(
        formDataWith({
          calendarId: "cal-1",
          cutoffDate: "tomorrow",
          direction: "delete-after"
        })
      )
    ).rejects.toThrow("cutoffDate must be a YYYY-MM-DD date");
  });
});

describe("updateSourceIngestWindowAction", () => {
  it("rejects a cross-family attempt with the correct ownership probe", async () => {
    mockSourceFindFirst.mockResolvedValue(null);
    await expect(
      updateSourceIngestWindowAction(
        formDataWith({ sourceId: "src-other", ingestWindowStart: "2026-09-01" })
      )
    ).rejects.toThrow("Source not found for this family.");
    expect(mockSourceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "src-other",
          calendar: { familyId: "family-1" }
        }
      })
    );
    expect(mockSourceUpdate).not.toHaveBeenCalled();
  });

  it("sets the floor and prunes pending candidates before it", async () => {
    mockSourceFindFirst.mockResolvedValue({ id: "src-1" });
    mockSourceUpdate.mockResolvedValue({});
    mockCandidatesDeleteMany.mockResolvedValue({ count: 0 });

    await updateSourceIngestWindowAction(
      formDataWith({ sourceId: "src-1", ingestWindowStart: "2026-09-01" })
    );

    // 2026-09-01 PT midnight = 2026-09-01T07:00 UTC (PDT, -7h).
    const floor = new Date("2026-09-01T07:00:00.000Z");
    expect(mockSourceUpdate).toHaveBeenCalledWith({
      where: { id: "src-1" },
      data: { ingestWindowStart: floor }
    });
    expect(mockCandidatesDeleteMany).toHaveBeenCalledWith({
      where: { calendarSourceId: "src-1", startAt: { lt: floor } }
    });
  });

  it("clears the floor and does not prune when the field is blank", async () => {
    mockSourceFindFirst.mockResolvedValue({ id: "src-1" });
    mockSourceUpdate.mockResolvedValue({});

    await updateSourceIngestWindowAction(
      formDataWith({ sourceId: "src-1", ingestWindowStart: "" })
    );

    expect(mockSourceUpdate).toHaveBeenCalledWith({
      where: { id: "src-1" },
      data: { ingestWindowStart: null }
    });
    expect(mockCandidatesDeleteMany).not.toHaveBeenCalled();
  });
});
