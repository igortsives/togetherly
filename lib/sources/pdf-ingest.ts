import { readFile } from "node:fs/promises";
import path from "node:path";
import { ParserType, ReviewStatus } from "@prisma/client";
import pdfParseModule from "pdf-parse";
import { prisma } from "@/lib/db/prisma";
import { synthesizeBoundaryIntervals } from "@/lib/sources/extractors/boundary-pairs";
import {
  extractWithLlm,
  shouldUseLlmExtractor
} from "@/lib/sources/extractors/llm";
import { applyIngestWindow } from "@/lib/sources/ingest-window";

type PdfParseFn = (
  data: Buffer | Uint8Array
) => Promise<{ text?: string; numpages?: number }>;

// pdf-parse is a CommonJS module (`module.exports = fn`). Different bundlers
// surface that as either the bare function or `{ default: fn }`, so we resolve
// both shapes once at module load.
const pdfParse: PdfParseFn =
  (pdfParseModule as unknown as { default?: PdfParseFn }).default ??
  (pdfParseModule as unknown as PdfParseFn);

const MIN_TEXT_LAYER_LENGTH = 20;

export type PdfReadResult = {
  text: string;
  pageCount: number | null;
};

export type PdfIngestResult = {
  candidatesInserted: number;
};

/**
 * Custom error thrown when a PDF source is being refreshed but the
 * LLM extractor is not configured (`ANTHROPIC_API_KEY` unset). Decision
 * recorded in `docs/DECISIONS.md` (2026-05-17 — remove heuristic
 * fallback). Surfaces to the dashboard as `refreshStatus = FAILED`.
 */
export class PdfExtractionUnavailableError extends Error {
  constructor() {
    super(
      "AI extraction is not configured. PDF source ingestion requires ANTHROPIC_API_KEY. Contact the administrator."
    );
    this.name = "PdfExtractionUnavailableError";
  }
}

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
    throw new Error("PDF source is missing an uploaded file key.");
  }

  // Round 17 follow-up (2026-05-17): the LLM is the only PDF extractor.
  // See `docs/DECISIONS.md` for rationale.
  if (!shouldUseLlmExtractor()) {
    throw new PdfExtractionUnavailableError();
  }

  const { text } = await readPdfText(source.uploadedFileKey);

  const llm = await extractWithLlm({
    calendarId: source.calendarId,
    calendarSourceId: source.id,
    calendarType: source.calendar.type,
    defaultTimezone: source.calendar.timezone ?? "America/Los_Angeles",
    sourceText: text,
    sourceLabel: source.uploadedFileKey ?? undefined
  });

  const extracted = llm.candidates;

  // Issue #131: synthesize CLASS_IN_SESSION / EXAM_PERIOD intervals
  // from begin/end boundary pairs found in the extracted candidates.
  const synthesized = synthesizeBoundaryIntervals(extracted);
  const withBoundaries = extracted.concat(synthesized);

  // Issue #150: drop anything before the parent-configured floor.
  const candidates = applyIngestWindow(withBoundaries, source.ingestWindowStart);

  const candidateData = candidates.map((candidate) => ({
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
  }));

  await prisma.$transaction([
    prisma.eventCandidate.deleteMany({
      where: { calendarSourceId: source.id, reviewStatus: ReviewStatus.PENDING }
    }),
    ...(candidateData.length > 0
      ? [prisma.eventCandidate.createMany({ data: candidateData })]
      : []),
    prisma.calendarSource.update({
      where: { id: source.id },
      data: {
        parserType: ParserType.PDF_TEXT,
        lastFetchedAt: now,
        lastParsedAt: now
      }
    })
  ]);

  return { candidatesInserted: candidates.length };
}
