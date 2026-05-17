import { createHash } from "node:crypto";
import { ParserType, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { EventCandidate } from "@/lib/domain/schemas";
import {
  extractHtmlEvents,
  type HtmlExtractionError
} from "@/lib/sources/extractors/html";
import {
  extractWithLlm,
  shouldUseLlmExtractor
} from "@/lib/sources/extractors/llm";
import { synthesizeBoundaryIntervals } from "@/lib/sources/extractors/boundary-pairs";

export type FetchedHtml = {
  text: string;
  contentHash: string;
};

export type HtmlIngestResult = {
  candidatesInserted: number;
  errors: HtmlExtractionError[];
};

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

  // Round 17 / #52: try the LLM extractor first when configured.
  // It handles arbitrary HTML structures (headerless tables, attribute-
  // encoded dates, grid layouts) that the heuristic walker doesn't.
  // The heuristic stays as a fallback for unconfigured deploys (CI,
  // local dev without a key) and for LLM failures.
  let extracted: EventCandidate[] = [];
  let errors: HtmlExtractionError[] = [];

  if (shouldUseLlmExtractor()) {
    const llm = await extractWithLlm({
      calendarId: source.calendarId,
      calendarSourceId: source.id,
      calendarType: source.calendar.type,
      defaultTimezone: source.calendar.timezone ?? "America/Los_Angeles",
      sourceText: args.htmlText,
      sourceLabel: source.sourceUrl ?? undefined
    });
    if (llm.candidates.length > 0) {
      extracted = llm.candidates;
    } else {
      console.info(
        "LLM extractor produced no candidates; falling back to heuristic",
        { sourceId: source.id, reason: llm.fallbackReason }
      );
    }
  }

  if (extracted.length === 0) {
    const heuristic = extractHtmlEvents(args.htmlText, {
      calendarId: source.calendarId,
      calendarSourceId: source.id,
      calendarType: source.calendar.type,
      defaultTimezone: source.calendar.timezone ?? "America/Los_Angeles"
    });
    extracted = heuristic.candidates;
    errors = heuristic.errors;
  }

  // Issue #131: synthesize CLASS_IN_SESSION / EXAM_PERIOD intervals
  // from begin/end boundary pairs found in the extracted candidates.
  // Runs on whichever extractor produced the candidate set — the
  // boundary recognizer is agnostic to the extractor.
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

  return { candidatesInserted: candidates.length, errors };
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
