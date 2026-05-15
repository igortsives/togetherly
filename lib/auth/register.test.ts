import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isUniqueConstraintError } from "./register";

describe("isUniqueConstraintError", () => {
  it("returns true for a P2002 PrismaClientKnownRequestError", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`email`)",
      { code: "P2002", clientVersion: "test" }
    );
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  it("returns false for a Prisma error with a different code", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Record not found",
      { code: "P2025", clientVersion: "test" }
    );
    expect(isUniqueConstraintError(err)).toBe(false);
  });

  it("returns false for a generic Error", () => {
    expect(isUniqueConstraintError(new Error("boom"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
    expect(isUniqueConstraintError("P2002")).toBe(false);
    expect(isUniqueConstraintError({ code: "P2002" })).toBe(false);
  });
});
