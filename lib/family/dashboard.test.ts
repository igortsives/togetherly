import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    family: {
      findFirst: vi.fn(),
      create: vi.fn()
    }
  }
}));

vi.mock("@/auth", () => ({
  auth: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { resolveFamilyForUser, UnauthenticatedError } from "./dashboard";

const mockFindFirst = prisma.family.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockCreate = prisma.family.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveFamilyForUser", () => {
  it("returns the existing family when one is already owned", async () => {
    const family = {
      id: "family-1",
      ownerId: "user-1",
      timezone: "America/Los_Angeles"
    };
    mockFindFirst.mockResolvedValue(family);

    const result = await resolveFamilyForUser("user-1");

    expect(result).toBe(family);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { ownerId: "user-1" },
      orderBy: { createdAt: "asc" }
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a family lazily on first call for a new user", async () => {
    const newFamily = {
      id: "family-new",
      ownerId: "user-2",
      timezone: "America/Los_Angeles"
    };
    mockFindFirst.mockResolvedValue(null);
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
});

describe("UnauthenticatedError", () => {
  it("identifies as an Error subclass with the expected name", () => {
    const err = new UnauthenticatedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnauthenticatedError");
    expect(err.message).toBe("Sign in required");
  });
});
