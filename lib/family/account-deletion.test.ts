import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: { findMany: vi.fn() },
    family: { findUnique: vi.fn() },
    user: { delete: vi.fn() }
  }
}));

vi.mock("@/lib/sources/google", () => ({
  revokeGoogleAccess: vi.fn()
}));

vi.mock("@/lib/sources/microsoft", () => ({
  revokeMicrosoftAccess: vi.fn()
}));

vi.mock("@/lib/sources/storage", () => ({
  deleteStoredUpload: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { revokeGoogleAccess } from "@/lib/sources/google";
import { revokeMicrosoftAccess } from "@/lib/sources/microsoft";
import { deleteStoredUpload } from "@/lib/sources/storage";
import { deleteUserAccount } from "./account-deletion";

const mockAccountFindMany = prisma.account.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const mockFamilyFindUnique = prisma.family.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const mockUserDelete = prisma.user.delete as unknown as ReturnType<typeof vi.fn>;
const mockRevokeGoogle = revokeGoogleAccess as unknown as ReturnType<
  typeof vi.fn
>;
const mockRevokeMicrosoft = revokeMicrosoftAccess as unknown as ReturnType<
  typeof vi.fn
>;
const mockDeleteUpload = deleteStoredUpload as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.resetAllMocks();
  mockUserDelete.mockResolvedValue({});
});

describe("deleteUserAccount", () => {
  it("handles a user with no linked accounts and no uploaded files", async () => {
    mockAccountFindMany.mockResolvedValue([]);
    mockFamilyFindUnique.mockResolvedValue(null);

    const result = await deleteUserAccount({ userId: "user-1" });

    expect(result).toEqual({
      userId: "user-1",
      revokedProviders: [],
      filesDeleted: 0,
      filesMissing: 0
    });
    expect(mockRevokeGoogle).not.toHaveBeenCalled();
    expect(mockRevokeMicrosoft).not.toHaveBeenCalled();
    expect(mockDeleteUpload).not.toHaveBeenCalled();
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("revokes Google with the refresh_token and Microsoft with the access_token", async () => {
    mockAccountFindMany.mockResolvedValue([
      {
        id: "acc-g",
        provider: "google",
        access_token: "g-at",
        refresh_token: "g-rt"
      },
      {
        id: "acc-m",
        provider: "microsoft-entra-id",
        access_token: "m-at",
        refresh_token: null
      }
    ]);
    mockFamilyFindUnique.mockResolvedValue(null);
    mockRevokeGoogle.mockResolvedValue(true);
    mockRevokeMicrosoft.mockResolvedValue(true);

    const result = await deleteUserAccount({ userId: "user-1" });

    expect(mockRevokeGoogle).toHaveBeenCalledWith("g-rt");
    expect(mockRevokeMicrosoft).toHaveBeenCalledWith("m-at");
    expect(result.revokedProviders).toEqual([
      "google",
      "microsoft-entra-id"
    ]);
  });

  it("deletes uploaded PDF blobs after the DB cascade", async () => {
    mockAccountFindMany.mockResolvedValue([]);
    mockFamilyFindUnique.mockResolvedValue({
      id: "fam-1",
      calendars: [
        {
          sources: [
            { uploadedFileKey: "calendar-sources/aaa.pdf" },
            { uploadedFileKey: null },
            { uploadedFileKey: "calendar-sources/bbb.pdf" }
          ]
        },
        { sources: [{ uploadedFileKey: "calendar-sources/ccc.pdf" }] }
      ]
    });
    mockDeleteUpload
      .mockResolvedValueOnce(true) // aaa
      .mockResolvedValueOnce(false) // bbb (missing)
      .mockResolvedValueOnce(true); // ccc

    const result = await deleteUserAccount({ userId: "user-1" });

    expect(mockDeleteUpload).toHaveBeenCalledTimes(3);
    expect(mockDeleteUpload).toHaveBeenCalledWith("calendar-sources/aaa.pdf");
    expect(mockDeleteUpload).toHaveBeenCalledWith("calendar-sources/bbb.pdf");
    expect(mockDeleteUpload).toHaveBeenCalledWith("calendar-sources/ccc.pdf");
    expect(result.filesDeleted).toBe(2);
    expect(result.filesMissing).toBe(1);
  });

  it("deletes the User row regardless of revoke failures", async () => {
    mockAccountFindMany.mockResolvedValue([
      {
        id: "acc-g",
        provider: "google",
        access_token: null,
        refresh_token: "g-rt"
      }
    ]);
    mockFamilyFindUnique.mockResolvedValue(null);
    mockRevokeGoogle.mockResolvedValue(false);

    const result = await deleteUserAccount({ userId: "user-1" });

    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(result.revokedProviders).toEqual([]);
  });

  it("skips revoke when both tokens are null but still deletes the User", async () => {
    mockAccountFindMany.mockResolvedValue([
      {
        id: "acc-g",
        provider: "google",
        access_token: null,
        refresh_token: null
      }
    ]);
    mockFamilyFindUnique.mockResolvedValue(null);

    await deleteUserAccount({ userId: "user-1" });

    expect(mockRevokeGoogle).not.toHaveBeenCalled();
    expect(mockUserDelete).toHaveBeenCalled();
  });

  it("performs DB delete BEFORE blob delete (so a blob-unlink failure doesn't orphan rows)", async () => {
    const callOrder: string[] = [];
    mockAccountFindMany.mockResolvedValue([]);
    mockFamilyFindUnique.mockResolvedValue({
      id: "fam-1",
      calendars: [{ sources: [{ uploadedFileKey: "k1" }] }]
    });
    mockUserDelete.mockImplementation(async () => {
      callOrder.push("userDelete");
      return {};
    });
    mockDeleteUpload.mockImplementation(async () => {
      callOrder.push("deleteUpload");
      return true;
    });

    await deleteUserAccount({ userId: "user-1" });

    expect(callOrder).toEqual(["userDelete", "deleteUpload"]);
  });
});
