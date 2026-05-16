import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    family: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn()
    }
  }
}));

vi.mock("@/auth", () => ({
  auth: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { resolveFamilyForUser, UnauthenticatedError } from "./dashboard";

const mockFindUnique = prisma.family.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const mockFindUniqueOrThrow =
  prisma.family.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const mockCreate = prisma.family.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("resolveFamilyForUser", () => {
  it("returns the existing family when one is already owned", async () => {
    const family = {
      id: "family-1",
      ownerId: "user-1",
      timezone: "America/Los_Angeles"
    };
    mockFindUnique.mockResolvedValue(family);

    const result = await resolveFamilyForUser("user-1");

    expect(result).toBe(family);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { ownerId: "user-1" }
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a family lazily on first call for a new user", async () => {
    const newFamily = {
      id: "family-new",
      ownerId: "user-2",
      timezone: "America/Los_Angeles"
    };
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(newFamily);

    const result = await resolveFamilyForUser("user-2");

    expect(result).toBe(newFamily);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        ownerId: "user-2",
        timezone: "America/Los_Angeles"
      }
    });
  });

  it("recovers from the create race by re-reading on P2002", async () => {
    const winningFamily = {
      id: "family-winner",
      ownerId: "user-3",
      timezone: "America/Los_Angeles"
    };
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "test" }
      )
    );
    mockFindUniqueOrThrow.mockResolvedValue(winningFamily);

    const result = await resolveFamilyForUser("user-3");

    expect(result).toBe(winningFamily);
    expect(mockFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { ownerId: "user-3" }
    });
  });

  it("rethrows non-P2002 errors from create", async () => {
    const otherError = new Error("connection refused");
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockRejectedValue(otherError);

    await expect(resolveFamilyForUser("user-4")).rejects.toBe(otherError);
    expect(mockFindUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe("UnauthenticatedError", () => {
  it("identifies as an Error subclass with the expected name", () => {
    const err = new UnauthenticatedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnauthenticatedError");
    expect(err.message).toBe("Sign in required");
  });
});
