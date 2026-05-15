import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { storeCalendarPdf } from "./storage";

const originalStorageRoot = process.env.FILE_STORAGE_ROOT;

afterEach(() => {
  process.env.FILE_STORAGE_ROOT = originalStorageRoot;
});

describe("storeCalendarPdf", () => {
  it("stores a PDF under a content-addressed key", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "togetherly-storage-"));
    process.env.FILE_STORAGE_ROOT = tempRoot;
    const file = makeUpload("calendar.pdf", "application/pdf", "%PDF-1.4\ncalendar");

    const stored = await storeCalendarPdf(file);
    const storedBytes = await readFile(path.join(tempRoot, stored.uploadedFileKey));

    expect(stored.uploadedFileKey).toMatch(/^calendar-sources\/[a-f0-9]{64}\.pdf$/);
    expect(stored.contentHash).toHaveLength(64);
    expect(stored.size).toBe(file.size);
    expect(storedBytes.toString()).toBe("%PDF-1.4\ncalendar");
  });

  it("rejects non-PDF uploads", async () => {
    const file = makeUpload("calendar.txt", "text/plain", "not a pdf");

    await expect(storeCalendarPdf(file)).rejects.toThrow("Only PDF");
  });
});

function makeUpload(name: string, type: string, content: string) {
  const bytes = Buffer.from(content);

  return {
    name,
    type,
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } as File;
}
