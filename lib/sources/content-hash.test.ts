import { describe, expect, it } from "vitest";
import { shouldSkipExtraction } from "./content-hash";

describe("shouldSkipExtraction (issue #158)", () => {
  const parsed = new Date("2026-05-30T00:00:00.000Z");

  it("skips when the source was parsed and the hash is unchanged", () => {
    expect(
      shouldSkipExtraction({
        force: false,
        lastParsedAt: parsed,
        storedHash: "abc",
        fetchedHash: "abc"
      })
    ).toBe(true);
  });

  it("does NOT skip when the hash differs", () => {
    expect(
      shouldSkipExtraction({
        force: false,
        lastParsedAt: parsed,
        storedHash: "abc",
        fetchedHash: "def"
      })
    ).toBe(false);
  });

  it("does NOT skip on the first refresh (never parsed)", () => {
    expect(
      shouldSkipExtraction({
        force: false,
        lastParsedAt: null,
        storedHash: "abc",
        fetchedHash: "abc"
      })
    ).toBe(false);
  });

  it("does NOT skip when force is set, even if hashes match (manual refresh)", () => {
    expect(
      shouldSkipExtraction({
        force: true,
        lastParsedAt: parsed,
        storedHash: "abc",
        fetchedHash: "abc"
      })
    ).toBe(false);
  });

  it("does NOT skip when no hash was previously stored", () => {
    expect(
      shouldSkipExtraction({
        force: false,
        lastParsedAt: parsed,
        storedHash: null,
        fetchedHash: "abc"
      })
    ).toBe(false);
  });

  it("does NOT skip when the fetched hash is missing", () => {
    expect(
      shouldSkipExtraction({
        force: false,
        lastParsedAt: parsed,
        storedHash: "abc",
        fetchedHash: null
      })
    ).toBe(false);
  });
});
