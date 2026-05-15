import ICAL from "ical.js";
import { CalendarType, EventCategory } from "@prisma/client";
import {
  eventCandidateInputSchema,
  type EventCandidate
} from "@/lib/domain/schemas";

export type IcsExtractionOptions = {
  calendarId: string;
  calendarSourceId: string;
  calendarType: CalendarType;
  defaultTimezone: string;
  window: { start: Date; end: Date };
};

export type IcsExtractionError = {
  uid: string | null;
  title: string | null;
  reason: string;
};

export type IcsExtractionResult = {
  candidates: EventCandidate[];
  errors: IcsExtractionError[];
};

const ACTIVITY_CALENDAR_TYPES: ReadonlySet<CalendarType> = new Set([
  CalendarType.SPORT,
  CalendarType.MUSIC,
  CalendarType.ACTIVITY,
  CalendarType.CAMP
]);

const EVIDENCE_TEXT_LIMIT = 1000;

export function extractIcsEvents(
  icsText: string,
  options: IcsExtractionOptions
): IcsExtractionResult {
  const jcal = ICAL.parse(icsText);
  const root = new ICAL.Component(jcal);
  registerVTimezones(root);

  const candidates: EventCandidate[] = [];
  const errors: IcsExtractionError[] = [];

  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    const uid = safeUid(event);

    try {
      if (event.isRecurring()) {
        candidates.push(...expandRecurrence(event, uid, options, errors));
      } else {
        const candidate = buildCandidate({
          uid,
          title: event.summary ?? "",
          description: event.description ?? null,
          startTime: event.startDate,
          endTime: event.endDate,
          options,
          recurrenceId: null
        });

        if (candidate && overlaps(candidate, options.window)) {
          candidates.push(candidate);
        }
      }
    } catch (error) {
      errors.push({
        uid,
        title: event.summary ?? null,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { candidates, errors };
}

function registerVTimezones(root: ICAL.Component) {
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    const tzid = vtimezone.getFirstPropertyValue("tzid");
    if (typeof tzid === "string" && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone));
    }
  }
}

function expandRecurrence(
  event: ICAL.Event,
  uid: string,
  options: IcsExtractionOptions,
  errors: IcsExtractionError[]
): EventCandidate[] {
  const occurrences: EventCandidate[] = [];
  const iterator = event.iterator();
  let next: ICAL.Time | null = iterator.next();

  while (next) {
    const occurrenceStart = next.toJSDate();

    if (occurrenceStart.getTime() > options.window.end.getTime()) {
      break;
    }

    try {
      const details = event.getOccurrenceDetails(next);
      const candidate = buildCandidate({
        uid,
        title: details.item.summary ?? event.summary ?? "",
        description: details.item.description ?? event.description ?? null,
        startTime: details.startDate,
        endTime: details.endDate,
        options,
        recurrenceId: next.toICALString()
      });

      if (candidate && overlaps(candidate, options.window)) {
        occurrences.push(candidate);
      }
    } catch (error) {
      errors.push({
        uid,
        title: event.summary ?? null,
        reason: error instanceof Error ? error.message : String(error)
      });
    }

    next = iterator.next();
  }

  return occurrences;
}

type BuildCandidateInput = {
  uid: string;
  title: string;
  description: string | null;
  startTime: ICAL.Time;
  endTime: ICAL.Time;
  options: IcsExtractionOptions;
  recurrenceId: string | null;
};

function buildCandidate(input: BuildCandidateInput): EventCandidate | null {
  const { uid, title, description, startTime, endTime, options, recurrenceId } =
    input;

  const allDay = startTime.isDate;
  const timezone = resolveTimezone(startTime, options.defaultTimezone);
  const startAt = allDay ? toUtcDate(startTime) : startTime.toJSDate();
  const endAt = allDay ? toUtcDate(endTime) : endTime.toJSDate();

  if (endAt.getTime() <= startAt.getTime()) {
    return null;
  }

  const rawTitle = title.trim() || "(untitled event)";
  const { category, confidence } = classify(options.calendarType, allDay);
  const evidenceText = buildEvidenceText(rawTitle, description);
  const evidenceLocator = recurrenceId ? `${uid}#${recurrenceId}` : uid;

  return eventCandidateInputSchema.parse({
    calendarId: options.calendarId,
    calendarSourceId: options.calendarSourceId,
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

function classify(
  calendarType: CalendarType,
  allDay: boolean
): { category: EventCategory; confidence: number } {
  if (ACTIVITY_CALENDAR_TYPES.has(calendarType)) {
    return {
      category: EventCategory.ACTIVITY_BUSY,
      confidence: allDay ? 0.85 : 0.92
    };
  }

  return { category: EventCategory.UNKNOWN, confidence: 0.55 };
}

function toUtcDate(time: ICAL.Time): Date {
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

function resolveTimezone(time: ICAL.Time, fallback: string): string {
  const zone = time.zone;

  if (zone && typeof zone.tzid === "string" && zone.tzid !== "floating") {
    return zone.tzid === "Z" ? "UTC" : zone.tzid;
  }

  return fallback;
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

function overlaps(
  candidate: EventCandidate,
  window: { start: Date; end: Date }
): boolean {
  return (
    candidate.endAt.getTime() > window.start.getTime() &&
    candidate.startAt.getTime() < window.end.getTime()
  );
}

function safeUid(event: ICAL.Event): string {
  const uid = event.uid;
  if (typeof uid === "string" && uid.length > 0) {
    return uid;
  }
  return `anonymous-${event.summary ?? ""}-${event.startDate?.toICALString() ?? ""}`;
}
