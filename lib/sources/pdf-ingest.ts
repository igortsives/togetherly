import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { ParserType, RefreshStatus, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  extractPdfTextEvents,
  type PdfTextExtractionError
} from "@/lib/sources/extractors/pdf";

const MIN_TEXT_LAYER_LENGTH = 20;

export type PdfReadResult = {
  text: string;
  pageCount: number | null;
};

export type PdfIngestResult = {
  candidatesInserted: number;
  errors: PdfTextExtractionError[];
};

export async function readPdfText(uploadedFileKey: string): Promise<PdfReadResult> {
  if (!uploadedFileKey) {
    throw new Error("PDF source is missing an uploaded file key.");
  }

  const storageRoot =
    process.env.FILE_STORAGE_ROOT || path.join(process.cwd(), "storage");
  const absolutePath = path.join(storageRoot, uploadedFileKey);

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    throw new Error(
      `Unable to read PDF at ${uploadedFileKey}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const pdfParse = await loadPdfParse();

  try {
    const parsed = await pdfParse(buffer);
    const text = typeof parsed.text === "string" ? parsed.text : "";

    if (text.trim().length < MIN_TEXT_LAYER_LENGTH) {
      throw new Error(
        "PDF has no extractable text layer. Scanned PDFs require OCR (out of scope for MVP)."
      );
    }

    return {
      text,
      pageCount: typeof parsed.numpages === "number" ? parsed.numpages : null
    };
  } catch (error) {
    throw new Error(
      `Failed to extract text from PDF ${uploadedFileKey}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function extractAndPersistPdf(args: {
  calendarSourceId: string;
  now?: Date;
}): Promise<PdfIngestResult> {
  const now = args.now ?? new Date();
  const source = await prisma.calendarSource.findUniqueOrThrow({
    where: { id: args.calendarSourceId },
    include: { calendar: true }
  });

  if (!source.uploadedFileKey) {
    await markFailed(source.id, now);
    throw new Error("PDF source is missing an uploaded file key.");
  }

  try {
    const { text } = await readPdfText(source.uploadedFileKey);

    const { candidates, errors } = extractPdfTextEvents(text, {
      calendarId: source.calendarId,
      calendarSourceId: source.id,
      calendarType: source.calendar.type,
      defaultTimezone: source.calendar.timezone ?? "America/Los_Angeles"
    });

    await prisma.eventCandidate.deleteMany({
      where: { calendarSourceId: source.id, reviewStatus: ReviewStatus.PENDING }
    });

    if (candidates.length > 0) {
      await prisma.eventCandidate.createMany({
        data: candidates.map((candidate) => ({
          calendarId: candidate.calendarId,
          calendarSourceId: candidate.calendarSourceId,
          rawTitle: candidate.rawTitle,
          normalizedTitle: candidate.normalizedTitle ?? null,
          category: candidate.category,
          suggestedBusyStatus: candidate.suggestedBusyStatus,
          startAt: candidate.startAt,
          endAt: candidate.endAt,
          allDay: candidate.allDay,
          timezone: candidate.timezone,
          confidence: candidate.confidence,
          evidenceText: candidate.evidenceText ?? null,
          evidenceLocator: candidate.evidenceLocator ?? null,
          reviewStatus: candidate.reviewStatus
        }))
      });
    }

    await prisma.calendarSource.update({
      where: { id: source.id },
      data: {
        parserType: ParserType.PDF_TEXT,
        lastFetchedAt: now,
        lastParsedAt: now
      }
    });

    return { candidatesInserted: candidates.length, errors };
  } catch (error) {
    await markFailed(source.id, now);
    throw error;
  }
}

async function markFailed(calendarSourceId: string, now: Date) {
  await prisma.calendarSource.update({
    where: { id: calendarSourceId },
    data: {
      refreshStatus: RefreshStatus.FAILED,
      parserType: ParserType.PDF_TEXT,
      lastFetchedAt: now
    }
  });
}

type PdfParseFn = (
  data: Buffer | Uint8Array
) => Promise<{ text?: string; numpages?: number }>;

async function loadPdfParse(): Promise<PdfParseFn> {
  try {
    const require = createRequire(import.meta.url);
    const moduleName = ["pdf", "parse"].join("-");
    const imported = require(moduleName) as PdfParseFn | { default: PdfParseFn };
    if (typeof imported === "function") {
      return imported;
    }
    if (typeof imported.default === "function") {
      return imported.default;
    }
    throw new Error("pdf-parse module did not expose a callable function.");
  } catch (error) {
    throw new Error(
      `pdf-parse is required for PDF ingestion but could not be loaded: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
