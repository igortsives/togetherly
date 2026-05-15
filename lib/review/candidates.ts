import {
  BusyStatus,
  EventCategory,
  type EventCandidate
} from "@prisma/client";
import { getDefaultBusyStatus, requiresParentReview } from "@/lib/domain/event-taxonomy";
import {
  type CalendarEventInput,
  calendarEventInputSchema
} from "@/lib/domain/schemas";

export type CandidateOverrides = {
  title?: string;
  category?: EventCategory;
  busyStatus?: BusyStatus;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  timezone?: string;
};

export type SerializedCandidate = {
  id: string;
  calendarId: string;
  calendarSourceId: string;
  rawTitle: string;
  normalizedTitle: string | null;
  category: EventCategory;
  suggestedBusyStatus: BusyStatus;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  timezone: string;
  confidence: number;
  evidenceText: string | null;
  evidenceLocator: string | null;
  needsReview: boolean;
};

type CandidateLike = Pick<
  EventCandidate,
  | "id"
  | "calendarId"
  | "calendarSourceId"
  | "rawTitle"
  | "normalizedTitle"
  | "category"
  | "suggestedBusyStatus"
  | "startAt"
  | "endAt"
  | "allDay"
  | "timezone"
  | "evidenceText"
  | "evidenceLocator"
> & {
  confidence: EventCandidate["confidence"] | number;
};

export function candidateConfidenceNumber(candidate: CandidateLike): number {
  const value = candidate.confidence;
  if (typeof value === "number") {
    return value;
  }
  return Number(value);
}

export function buildCalendarEventInputFromCandidate(
  candidate: CandidateLike,
  overrides: CandidateOverrides = {}
): CalendarEventInput {
  const category = overrides.category ?? candidate.category;
  const fallbackBusy =
    candidate.suggestedBusyStatus && candidate.suggestedBusyStatus !== BusyStatus.UNKNOWN
      ? candidate.suggestedBusyStatus
      : getDefaultBusyStatus(category);

  return {
    calendarId: candidate.calendarId,
    eventCandidateId: candidate.id,
    title: (overrides.title ?? candidate.rawTitle).trim(),
    category,
    busyStatus: overrides.busyStatus ?? fallbackBusy,
    startAt: overrides.startAt ?? candidate.startAt,
    endAt: overrides.endAt ?? candidate.endAt,
    allDay: overrides.allDay ?? candidate.allDay,
    timezone: overrides.timezone ?? candidate.timezone,
    sourceConfidence: candidateConfidenceNumber(candidate)
  };
}

export function parseCalendarEventFromCandidate(
  candidate: CandidateLike,
  overrides: CandidateOverrides = {}
) {
  return calendarEventInputSchema.parse(
    buildCalendarEventInputFromCandidate(candidate, overrides)
  );
}

export function serializeCandidate(candidate: CandidateLike): SerializedCandidate {
  const confidence = candidateConfidenceNumber(candidate);

  return {
    id: candidate.id,
    calendarId: candidate.calendarId,
    calendarSourceId: candidate.calendarSourceId,
    rawTitle: candidate.rawTitle,
    normalizedTitle: candidate.normalizedTitle,
    category: candidate.category,
    suggestedBusyStatus: candidate.suggestedBusyStatus,
    startAt: candidate.startAt,
    endAt: candidate.endAt,
    allDay: candidate.allDay,
    timezone: candidate.timezone,
    confidence,
    evidenceText: candidate.evidenceText,
    evidenceLocator: candidate.evidenceLocator,
    needsReview: requiresParentReview(candidate.category, confidence)
  };
}
