import { CalendarType, EventCategory, ParserType, RefreshStatus, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  eventCandidateInputSchema,
  type EventCandidate
} from "@/lib/domain/schemas";
import {
  listGoogleCalendarEvents,
  type GoogleApiDeps,
  type GoogleCalendarEvent
} from "@/lib/sources/google";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 30;
const LOOKAHEAD_DAYS = 365;
const EVIDENCE_TEXT_LIMIT = 1000;

const ACTIVITY_CALENDAR_TYPES: ReadonlySet<CalendarType> = new Set([
  CalendarType.SPORT,
  CalendarType.MUSIC,
  CalendarType.ACTIVITY,
  CalendarType.CAMP
]);

export type GoogleIngestError = {
  eventId: string | null;
  title: string | null;
  reason: string;
};

export type GoogleIngestResult = {
  candidatesInserted: number;
  errors: GoogleIngestError[];
};

export type RefreshGoogleSourceArgs = {
  calendarSourceId: string;
  now?: Date;
  deps?: GoogleApiDeps;
};

export async function refreshGoogleSource(
  args: RefreshGoogleSourceArgs
): Promise<GoogleIngestResult> {
  const now = args.now ?? new Date();

  const source = await prisma.calendarSource.findUniqueOrThrow({
    where: { id: args.calendarSourceId },
    include: { calendar: { include: { family: true } } }
  });

  if (!source.providerCalendarId) {
    throw new Error("Google calendar source is missing providerCalendarId");
  }

  try {
    const googleEvents = await listGoogleCalendarEvents(
      source.calendar.family.ownerId,
      source.providerCalendarId,
      {
        timeMin: new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS),
        timeMax: new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS)
      },
      args.deps
    );

    const { candidates, errors } = mapGoogleEventsToCandidates({
      googleEvents,
      calendarId: source.calendarId,
      calendarSourceId: source.id,
      calendarType: source.calendar.type,
      defaultTimezone:
        source.calendar.timezone ?? source.calendar.family.timezone
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
        parserType: ParserType.GOOGLE,
        lastFetchedAt: now,
        lastParsedAt: now
      }
    });

    return { candidatesInserted: candidates.length, errors };
  } catch (error) {
    await prisma.calendarSource.update({
      where: { id: args.calendarSourceId },
      data: {
        refreshStatus: RefreshStatus.FAILED,
        lastFetchedAt: now
      }
    });
    throw error;
  }
}

export type MapGoogleEventsArgs = {
  googleEvents: GoogleCalendarEvent[];
  calendarId: string;
  calendarSourceId: string;
  calendarType: CalendarType;
  defaultTimezone: string;
};

export type GoogleEventMappingResult = {
  candidates: EventCandidate[];
  errors: GoogleIngestError[];
};

export function mapGoogleEventsToCandidates(
  args: MapGoogleEventsArgs
): GoogleEventMappingResult {
  const candidates: EventCandidate[] = [];
  const errors: GoogleIngestError[] = [];

  for (const event of args.googleEvents) {
    try {
      const candidate = buildCandidate(event, args);
      if (candidate) candidates.push(candidate);
    } catch (error) {
      errors.push({
        eventId: event.id ?? null,
        title: event.summary ?? null,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { candidates, errors };
}

function buildCandidate(
  event: GoogleCalendarEvent,
  args: MapGoogleEventsArgs
): EventCandidate | null {
  if (event.status === "cancelled") return null;
  if (!event.start || !event.end) return null;

  const allDay = Boolean(event.start.date && !event.start.dateTime);
  const startAt = parseEventTime(event.start, allDay);
  const endAt = parseEventTime(event.end, allDay);
  if (!startAt || !endAt) return null;
  if (endAt.getTime() <= startAt.getTime()) return null;

  const rawTitle = (event.summary ?? "").trim() || "(untitled event)";
  const { category, confidence } = classify(args.calendarType, allDay);
  const evidenceText = buildEvidenceText(rawTitle, event.description ?? null);
  const evidenceLocator = event.iCalUID ?? event.id;
  const timezone =
    event.start.timeZone ?? event.end.timeZone ?? args.defaultTimezone;

  return eventCandidateInputSchema.parse({
    calendarId: args.calendarId,
    calendarSourceId: args.calendarSourceId,
    rawTitle,
    category,
    startAt,
    endAt,
    allDay,
    timezone,
    confidence,
    evidenceText,
    evidenceLocator
  });
}

function parseEventTime(
  time: GoogleCalendarEvent["start"],
  allDay: boolean
): Date | null {
  if (allDay && time.date) {
    const [yearStr, monthStr, dayStr] = time.date.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day)
    ) {
      return new Date(Date.UTC(year, month - 1, day));
    }
    return null;
  }

  if (time.dateTime) {
    const parsed = new Date(time.dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function classify(
  calendarType: CalendarType,
  allDay: boolean
): { category: EventCategory; confidence: number } {
  if (ACTIVITY_CALENDAR_TYPES.has(calendarType)) {
    return {
      category: EventCategory.ACTIVITY_BUSY,
      confidence: allDay ? 0.85 : 0.9
    };
  }
  return { category: EventCategory.UNKNOWN, confidence: 0.55 };
}

function buildEvidenceText(title: string, description: string | null): string {
  const parts = [title];
  if (description && description.trim().length > 0) {
    parts.push(description.trim());
  }
  const joined = parts.join(" — ");
  return joined.length > EVIDENCE_TEXT_LIMIT
    ? `${joined.slice(0, EVIDENCE_TEXT_LIMIT - 1)}…`
    : joined;
}
