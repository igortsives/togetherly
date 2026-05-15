import { CalendarType, EventCategory, ParserType, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  eventCandidateInputSchema,
  type EventCandidate
} from "@/lib/domain/schemas";
import {
  listMicrosoftCalendarEvents,
  type MicrosoftApiDeps,
  type MicrosoftCalendarEvent
} from "@/lib/sources/microsoft";

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

export type MicrosoftIngestError = {
  eventId: string | null;
  title: string | null;
  reason: string;
};

export type MicrosoftIngestResult = {
  candidatesInserted: number;
  errors: MicrosoftIngestError[];
};

export type RefreshMicrosoftSourceArgs = {
  calendarSourceId: string;
  now?: Date;
  deps?: MicrosoftApiDeps;
};

export async function refreshMicrosoftSource(
  args: RefreshMicrosoftSourceArgs
): Promise<MicrosoftIngestResult> {
  const now = args.now ?? new Date();

  const source = await prisma.calendarSource.findUniqueOrThrow({
    where: { id: args.calendarSourceId },
    include: { calendar: { include: { family: true } } }
  });

  if (!source.providerCalendarId) {
    throw new Error("Microsoft calendar source is missing providerCalendarId");
  }

  const microsoftEvents = await listMicrosoftCalendarEvents(
    source.calendar.family.ownerId,
    source.providerCalendarId,
    {
      timeMin: new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS),
      timeMax: new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS)
    },
    args.deps
  );

  const { candidates, errors } = mapMicrosoftEventsToCandidates({
    microsoftEvents,
    calendarId: source.calendarId,
    calendarSourceId: source.id,
    calendarType: source.calendar.type,
    defaultTimezone:
      source.calendar.timezone ?? source.calendar.family.timezone
  });

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
        parserType: ParserType.OUTLOOK,
        lastFetchedAt: now,
        lastParsedAt: now
      }
    })
  ]);

  return { candidatesInserted: candidates.length, errors };
}

export type MapMicrosoftEventsArgs = {
  microsoftEvents: MicrosoftCalendarEvent[];
  calendarId: string;
  calendarSourceId: string;
  calendarType: CalendarType;
  defaultTimezone: string;
};

export type MicrosoftEventMappingResult = {
  candidates: EventCandidate[];
  errors: MicrosoftIngestError[];
};

export function mapMicrosoftEventsToCandidates(
  args: MapMicrosoftEventsArgs
): MicrosoftEventMappingResult {
  const candidates: EventCandidate[] = [];
  const errors: MicrosoftIngestError[] = [];

  for (const event of args.microsoftEvents) {
    try {
      const candidate = buildCandidate(event, args);
      if (candidate) candidates.push(candidate);
    } catch (error) {
      errors.push({
        eventId: event.id ?? null,
        title: event.subject ?? null,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { candidates, errors };
}

function buildCandidate(
  event: MicrosoftCalendarEvent,
  args: MapMicrosoftEventsArgs
): EventCandidate | null {
  if (event.isCancelled) return null;
  if (!event.start || !event.end) return null;

  const allDay = Boolean(event.isAllDay);
  const startAt = parseGraphTime(event.start, allDay);
  const endAt = parseGraphTime(event.end, allDay);
  if (!startAt || !endAt) return null;
  if (endAt.getTime() <= startAt.getTime()) return null;

  const rawTitle = (event.subject ?? "").trim() || "(untitled event)";
  const { category, confidence } = classify(args.calendarType, allDay);
  const evidenceText = buildEvidenceText(rawTitle, event.bodyPreview ?? null);
  const evidenceLocator = event.iCalUId ?? event.id;
  const timezone = resolveTimezone(event, args.defaultTimezone);

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

function parseGraphTime(
  time: MicrosoftCalendarEvent["start"],
  allDay: boolean
): Date | null {
  const raw = time.dateTime;
  if (!raw) return null;

  if (allDay) {
    const datePart = raw.slice(0, 10);
    const [yearStr, monthStr, dayStr] = datePart.split("-");
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

  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveTimezone(
  event: MicrosoftCalendarEvent,
  fallback: string
): string {
  const candidateZone =
    event.start?.timeZone && event.start.timeZone !== "UTC"
      ? event.start.timeZone
      : event.end?.timeZone && event.end.timeZone !== "UTC"
        ? event.end.timeZone
        : null;
  return candidateZone ?? fallback;
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

function buildEvidenceText(title: string, preview: string | null): string {
  const parts = [title];
  if (preview && preview.trim().length > 0) {
    parts.push(preview.trim());
  }
  const joined = parts.join(" — ");
  return joined.length > EVIDENCE_TEXT_LIMIT
    ? `${joined.slice(0, EVIDENCE_TEXT_LIMIT - 1)}…`
    : joined;
}
