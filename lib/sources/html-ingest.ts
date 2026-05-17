import { createHash } from "node:crypto";
import { ParserType, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { synthesizeBoundaryIntervals } from "@/lib/sources/extractors/boundary-pairs";
import {
  extractWithLlm,
  shouldUseLlmExtractor
} from "@/lib/sources/extractors/llm";

export type FetchedHtml = {
  text: string;
  contentHash: string;
};

export type HtmlIngestResult = {
  candidatesInserted: number;
};

/**
 * Custom error thrown when an HTML source is being refreshed but the
 * LLM extractor is not configured (`ANTHROPIC_API_KEY` unset). Decision
 * recorded in `docs/DECISIONS.md` (2026-05-17 — remove heuristic
 * fallback). Surfaces to the dashboard as `refreshStatus = FAILED`.
 */
export class HtmlExtractionUnavailableError extends Error {
  constructor() {
    super(
      "AI extraction is not configured. HTML source ingestion requires ANTHROPIC_API_KEY. Contact the administrator."
    );
    this.name = "HtmlExtractionUnavailableError";
  }
}

export async function fetchHtml(url: string): Promise<FetchedHtml> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html, application/xhtml+xml;q=0.9, text/plain;q=0.5"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `HTML fetch failed for ${url}: ${response.status} ${response.statusText}`
    );
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Response from ${url} was empty`);
  }

  const contentHash = createHash("sha256").update(text).digest("hex");
  return { text, contentHash };
}

export async function extractAndPersistHtml(args: {
  calendarSourceId: string;
  htmlText: string;
  contentHash: string;
  now?: Date;
}): Promise<HtmlIngestResult> {
  const now = args.now ?? new Date();
  const source = await prisma.calendarSource.findUniqueOrThrow({
    where: { id: args.calendarSourceId },
    include: { calendar: true }
  });

  // Round 17 follow-up (2026-05-17): the LLM is the only HTML extractor.
  // Heuristic extractor was removed because (a) it silently failed on
  // any HTML structure outside the curated fixture set, and (b) maintaining
  // a parallel code path that didn't actually work for real users was a
  // net negative. See `docs/DECISIONS.md` for the full rationale.
  if (!shouldUseLlmExtractor()) {
    throw new HtmlExtractionUnavailableError();
  }

  const llm = await extractWithLlm({
    calendarId: source.calendarId,
    calendarSourceId: source.id,
    calendarType: source.calendar.type,
    defaultTimezone: source.calendar.timezone ?? "America/Los_Angeles",
    sourceText: args.htmlText,
    sourceLabel: source.sourceUrl ?? undefined
  });

  const extracted = llm.candidates;

  // Issue #131: synthesize CLASS_IN_SESSION / EXAM_PERIOD intervals
  // from begin/end boundary pairs found in the extracted candidates.
  const candidates = extracted.concat(synthesizeBoundaryIntervals(extracted));

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
        contentHash: args.contentHash,
        parserType: ParserType.HTML,
        lastFetchedAt: now,
        lastParsedAt: now
      }
    })
  ]);

  return { candidatesInserted: candidates.length };
}

export async function refreshHtmlSource(
  calendarSourceId: string
): Promise<HtmlIngestResult> {
  const source = await prisma.calendarSource.findUniqueOrThrow({
    where: { id: calendarSourceId }
  });

  if (!source.sourceUrl) {
    throw new Error("HTML source is missing a URL");
  }

  const fetched = await fetchHtml(source.sourceUrl);
  return extractAndPersistHtml({
    calendarSourceId,
    htmlText: fetched.text,
    contentHash: fetched.contentHash
  });
}
