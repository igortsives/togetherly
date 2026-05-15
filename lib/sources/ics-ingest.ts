import { createHash } from "node:crypto";
import { ParserType, RefreshStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  extractIcsEvents,
  type IcsExtractionError
} from "@/lib/sources/extractors/ics";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECURRENCE_LOOKBACK_DAYS = 30;
const RECURRENCE_LOOKAHEAD_DAYS = 2 * 365;

export type FetchedIcs = {
  text: string;
  contentHash: string;
};

export type IcsIngestResult = {
  candidatesInserted: number;
  errors: IcsExtractionError[];
};

export async function fetchIcs(url: string): Promise<FetchedIcs> {
  const response = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain;q=0.5" },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `ICS fetch failed for ${url}: ${response.status} ${response.statusText}`
    );
  }

  const text = await response.text();

  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error(`Response from ${url} did not contain an ICS calendar`);
  }

  const contentHash = createHash("sha256").update(text).digest("hex");
  return { text, contentHash };
}

export async function extractAndPersistIcs(args: {
  calendarSourceId: string;
  icsText: string;
  contentHash: string;
  now?: Date;
}): Promise<IcsIngestResult> {
  const now = args.now ?? new Date();
  const source = await prisma.calendarSource.findUniqueOrThrow({
    where: { id: args.calendarSourceId },
    include: { calendar: true }
  });

  const window = {
    start: new Date(now.getTime() - RECURRENCE_LOOKBACK_DAYS * DAY_MS),
    end: new Date(now.getTime() + RECURRENCE_LOOKAHEAD_DAYS * DAY_MS)
  };

  const { candidates, errors } = extractIcsEvents(args.icsText, {
    calendarId: source.calendarId,
    calendarSourceId: source.id,
    calendarType: source.calendar.type,
    defaultTimezone: source.calendar.timezone ?? "America/Los_Angeles",
    window
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
      parserType: ParserType.ICS,
      lastFetchedAt: now,
      lastParsedAt: now,
      refreshStatus:
        errors.length === 0 ? RefreshStatus.OK : RefreshStatus.NEEDS_REVIEW
    }
  });

  return { candidatesInserted: candidates.length, errors };
}

export async function refreshIcsSource(
  calendarSourceId: string
): Promise<IcsIngestResult> {
  const source = await prisma.calendarSource.findUniqueOrThrow({
    where: { id: calendarSourceId }
  });

  if (!source.sourceUrl) {
    throw new Error("ICS source is missing a URL");
  }

  try {
    const fetched = await fetchIcs(source.sourceUrl);
    return await extractAndPersistIcs({
      calendarSourceId,
      icsText: fetched.text,
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
