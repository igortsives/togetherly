import { createHash } from "node:crypto";
import { ParserType, RefreshStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  extractHtmlEvents,
  type HtmlExtractionError
} from "@/lib/sources/extractors/html";

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

  const { candidates, errors } = extractHtmlEvents(args.htmlText, {
    calendarId: source.calendarId,
    calendarSourceId: source.id,
    calendarType: source.calendar.type,
    defaultTimezone: source.calendar.timezone ?? "America/Los_Angeles"
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
      contentHash: args.contentHash,
      parserType: ParserType.HTML,
      lastFetchedAt: now,
      lastParsedAt: now,
      refreshStatus:
        errors.length === 0 ? RefreshStatus.OK : RefreshStatus.NEEDS_REVIEW
    }
  });

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

  try {
    const fetched = await fetchHtml(source.sourceUrl);
    return await extractAndPersistHtml({
      calendarSourceId,
      htmlText: fetched.text,
      contentHash: fetched.contentHash
    });
  } catch (error) {
    await prisma.calendarSource.update({
      where: { id: calendarSourceId },
      data: {
        refreshStatus: RefreshStatus.FAILED,
        lastFetchedAt: new Date()
      }
    });
    throw error;
  }
}
