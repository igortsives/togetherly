import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const maxUploadBytes = 10 * 1024 * 1024;

export type StoredUpload = {
  uploadedFileKey: string;
  contentHash: string;
  size: number;
};

export async function storeCalendarPdf(file: File): Promise<StoredUpload> {
  if (!file || file.size === 0) {
    throw new Error("Choose a PDF calendar file before uploading.");
  }

  if (file.size > maxUploadBytes) {
    throw new Error("PDF calendar files must be smaller than 10 MB.");
  }

  if (!isPdf(file)) {
    throw new Error("Only PDF calendar files are supported for this upload path.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const uploadedFileKey = path.join("calendar-sources", `${contentHash}.pdf`);
  const storageRoot = process.env.FILE_STORAGE_ROOT || path.join(process.cwd(), "storage");
  const destination = path.join(storageRoot, uploadedFileKey);

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });

  return {
    uploadedFileKey,
    contentHash,
    size: file.size
  };
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * Best-effort delete of a stored upload by its `uploadedFileKey`.
 * Used by the account-deletion flow (#43) and the
 * delete-source / delete-calendar paths (#148, #163). Missing files
 * (`ENOENT`) are treated as already-gone — not an error.
 *
 * NOTE: blobs are content-addressed by sha256 (`<hash>.pdf`). Two
 * `CalendarSource` rows (in the same family or across families) that
 * uploaded the same PDF share one blob. Callers MUST refcount before
 * unlinking — use `isUploadOrphaned(...)` to verify no remaining
 * source rows reference the key (#163). The account-deletion flow
 * relies on its own ordering: rows are deleted first, then the blobs
 * are unlinked.
 */
export async function deleteStoredUpload(
  uploadedFileKey: string
): Promise<boolean> {
  const storageRoot =
    process.env.FILE_STORAGE_ROOT || path.join(process.cwd(), "storage");
  const destination = path.join(storageRoot, uploadedFileKey);
  try {
    await unlink(destination);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return false;
    }
    console.warn("Failed to delete stored upload", {
      uploadedFileKey,
      code
    });
    return false;
  }
}
