import { RefreshStatus, SourceType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: {
      findFirst: vi.fn(),
      delete: vi.fn()
    },
    calendarSource: {
      updateMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/sources/google", () => ({
  revokeGoogleAccess: vi.fn()
}));

vi.mock("@/lib/sources/microsoft", () => ({
  revokeMicrosoftAccess: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { revokeGoogleAccess } from "@/lib/sources/google";
import { revokeMicrosoftAccess } from "@/lib/sources/microsoft";
import { disconnectProviderForFamily } from "./disconnect";

const mockFindFirst = prisma.account.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const mockAccountDelete = prisma.account.delete as unknown as ReturnType<
  typeof vi.fn
>;
const mockSourceUpdateMany =
  prisma.calendarSource.updateMany as unknown as ReturnType<typeof vi.fn>;
const mockRevokeGoogle = revokeGoogleAccess as unknown as ReturnType<
  typeof vi.fn
>;
const mockRevokeMicrosoft = revokeMicrosoftAccess as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("disconnectProviderForFamily", () => {
  it("returns an empty result when no account is linked", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await disconnectProviderForFamily({
      userId: "user-1",
      familyId: "family-1",
      provider: "google"
    });

    expect(result).toEqual({
      removedAccount: false,
      revokedWithProvider: false,
      affectedSources: 0
    });
    expect(mockAccountDelete).not.toHaveBeenCalled();
    expect(mockSourceUpdateMany).not.toHaveBeenCalled();
    expect(mockRevokeGoogle).not.toHaveBeenCalled();
  });

  it("revokes Google with the refresh_token, deletes the Account, and marks GOOGLE_CALENDAR sources FAILED", async () => {
    mockFindFirst.mockResolvedValue({
      id: "acc-1",
      provider: "google",
      access_token: "at-1",
      refresh_token: "rt-1"
    });
    mockRevokeGoogle.mockResolvedValue(true);
    mockSourceUpdateMany.mockResolvedValue({ count: 2 });

    const result = await disconnectProviderForFamily({
      userId: "user-1",
      familyId: "family-1",
      provider: "google"
    });

    expect(mockRevokeGoogle).toHaveBeenCalledWith("rt-1");
    expect(mockAccountDelete).toHaveBeenCalledWith({ where: { id: "acc-1" } });
    expect(mockSourceUpdateMany).toHaveBeenCalledWith({
      where: {
        sourceType: SourceType.GOOGLE_CALENDAR,
        calendar: { familyId: "family-1" },
        refreshStatus: { not: RefreshStatus.FAILED }
      },
      data: { refreshStatus: RefreshStatus.FAILED }
    });
    expect(result).toEqual({
      removedAccount: true,
      revokedWithProvider: true,
      affectedSources: 2
    });
  });

  it("falls back to access_token when refresh_token is missing", async () => {
    mockFindFirst.mockResolvedValue({
      id: "acc-1",
      provider: "google",
      access_token: "at-1",
      refresh_token: null
    });
    mockRevokeGoogle.mockResolvedValue(true);
    mockSourceUpdateMany.mockResolvedValue({ count: 0 });

    await disconnectProviderForFamily({
      userId: "user-1",
      familyId: "family-1",
      provider: "google"
    });

    expect(mockRevokeGoogle).toHaveBeenCalledWith("at-1");
  });

  it("still deletes locally when Google revoke returns false", async () => {
    mockFindFirst.mockResolvedValue({
      id: "acc-1",
      provider: "google",
      access_token: "at-1",
      refresh_token: "rt-1"
    });
    mockRevokeGoogle.mockResolvedValue(false);
    mockSourceUpdateMany.mockResolvedValue({ count: 1 });

    const result = await disconnectProviderForFamily({
      userId: "user-1",
      familyId: "family-1",
      provider: "google"
    });

    expect(mockAccountDelete).toHaveBeenCalled();
    expect(result.revokedWithProvider).toBe(false);
    expect(result.removedAccount).toBe(true);
  });

  it("revokes Microsoft with the access_token and marks OUTLOOK_CALENDAR sources FAILED", async () => {
    mockFindFirst.mockResolvedValue({
      id: "acc-2",
      provider: "microsoft-entra-id",
      access_token: "at-ms",
      refresh_token: "rt-ms"
    });
    mockRevokeMicrosoft.mockResolvedValue(true);
    mockSourceUpdateMany.mockResolvedValue({ count: 3 });

    const result = await disconnectProviderForFamily({
      userId: "user-1",
      familyId: "family-1",
      provider: "microsoft-entra-id"
    });

    expect(mockRevokeMicrosoft).toHaveBeenCalledWith("at-ms");
    expect(mockSourceUpdateMany).toHaveBeenCalledWith({
      where: {
        sourceType: SourceType.OUTLOOK_CALENDAR,
        calendar: { familyId: "family-1" },
        refreshStatus: { not: RefreshStatus.FAILED }
      },
      data: { refreshStatus: RefreshStatus.FAILED }
    });
    expect(result).toMatchObject({
      removedAccount: true,
      revokedWithProvider: true,
      affectedSources: 3
    });
  });

  it("skips revoke when no token is stored but still deletes locally", async () => {
    mockFindFirst.mockResolvedValue({
      id: "acc-3",
      provider: "google",
      access_token: null,
      refresh_token: null
    });
    mockSourceUpdateMany.mockResolvedValue({ count: 0 });

    const result = await disconnectProviderForFamily({
      userId: "user-1",
      familyId: "family-1",
      provider: "google"
    });

    expect(mockRevokeGoogle).not.toHaveBeenCalled();
    expect(mockAccountDelete).toHaveBeenCalled();
    expect(result).toEqual({
      removedAccount: true,
      revokedWithProvider: false,
      affectedSources: 0
    });
  });
});
