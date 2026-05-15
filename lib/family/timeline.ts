import {
  BusyStatus,
  EventCategory,
  ReviewStatus,
  type CalendarEvent,
  type CalendarType
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserFamily } from "@/lib/family/session";
import { requiresParentReview } from "@/lib/domain/event-taxonomy";

export type TimelineBlockKind =
  | "busy"
  | "free"
  | "exam"
  | "optional"
  | "unknown";

export type TimelineBlock = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  leftPercent: number;
  widthPercent: number;
  kind: TimelineBlockKind;
  category: EventCategory;
  busyStatus: BusyStatus;
  lowConfidence: boolean;
};

export type TimelineCalendarSummary = {
  id: string;
  name: string;
  type: CalendarType;
  enabled: boolean;
  pendingCount: number;
  lowConfidenceCount: number;
};

export type TimelineWindow = {
  id: string;
  start: Date;
  end: Date;
  leftPercent: number;
  widthPercent: number;
  durationDays: number;
};

export type TimelineRow = {
  id: string;
  label: string;
  color: string | null;
  calendarSummaries: TimelineCalendarSummary[];
  blocks: TimelineBlock[];
  pendingCount: number;
  lowConfidenceCount: number;
};

export type TimelineRange = {
  start: Date;
  end: Date;
  totalDays: number;
  monthTicks: { label: string; leftPercent: number }[];
};

export type TimelineData = {
  dbAvailable: boolean;
  setupError: string | null;
  range: TimelineRange;
  rows: TimelineRow[];
  windows: TimelineWindow[];
  hasChildren: boolean;
  hasEvents: boolean;
  totalPending: number;
  totalLowConfidence: number;
};

export type TimelineEventInput = Pick<
  CalendarEvent,
  | "id"
  | "calendarId"
  | "title"
  | "category"
  | "busyStatus"
  | "startAt"
  | "endAt"
> & {
  sourceConfidence?: CalendarEvent["sourceConfidence"] | number | null;
};

export type TimelineCandidateCountByCalendar = Map<
  string,
  { pending: number; lowConfidence: number }
>;

export type TimelineWindowInput = {
  id: string;
  start: Date;
  end: Date;
  durationDays: number;
};

const DEFAULT_HORIZON_DAYS = 120;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RECENT_WINDOWS = 5;

const monthTickFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC"
});

export function defaultTimelineRange(now: Date = new Date()): TimelineRange {
  const start = startOfUtcDay(now);
  const end = new Date(start.getTime() + DEFAULT_HORIZON_DAYS * MS_PER_DAY);
  return buildRange(start, end);
}

export function buildRange(start: Date, end: Date): TimelineRange {
  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
  );

  const monthTicks: TimelineRange["monthTicks"] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  );

  while (cursor.getTime() <= end.getTime()) {
    const tickStart = cursor.getTime() < start.getTime() ? start : cursor;
    const leftPercent = clampPercent(
      ((tickStart.getTime() - start.getTime()) / (end.getTime() - start.getTime())) *
        100
    );
    monthTicks.push({
      label: monthTickFormatter.format(cursor),
      leftPercent
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return { start, end, totalDays, monthTicks };
}

export function classifyBlockKind(
  category: EventCategory,
  busyStatus: BusyStatus
): TimelineBlockKind {
  if (category === EventCategory.EXAM_PERIOD) return "exam";
  if (category === EventCategory.OPTIONAL) return "optional";
  if (
    busyStatus === BusyStatus.UNKNOWN ||
    category === EventCategory.UNKNOWN
  ) {
    return "unknown";
  }
  if (busyStatus === BusyStatus.FREE) return "free";
  return "busy";
}

export function computeBlockGeometry(
  event: Pick<TimelineEventInput, "startAt" | "endAt">,
  range: TimelineRange
): { leftPercent: number; widthPercent: number } | null {
  const rangeStartMs = range.start.getTime();
  const rangeEndMs = range.end.getTime();
  const rangeWidthMs = rangeEndMs - rangeStartMs;
  if (rangeWidthMs <= 0) return null;

  const eventStartMs = event.startAt.getTime();
  const eventEndMs = event.endAt.getTime();

  const clampedStart = Math.max(eventStartMs, rangeStartMs);
  const clampedEnd = Math.min(eventEndMs, rangeEndMs);

  if (clampedEnd <= clampedStart) return null;

  const leftPercent = ((clampedStart - rangeStartMs) / rangeWidthMs) * 100;
  const widthPercent = ((clampedEnd - clampedStart) / rangeWidthMs) * 100;

  return {
    leftPercent: clampPercent(leftPercent),
    widthPercent: Math.max(widthPercent, 0.6)
  };
}

export function buildTimelineBlocks(
  events: TimelineEventInput[],
  range: TimelineRange
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  for (const event of events) {
    const geometry = computeBlockGeometry(event, range);
    if (!geometry) continue;

    const kind = classifyBlockKind(event.category, event.busyStatus);
    const confidenceNumber = toConfidenceNumber(event.sourceConfidence ?? null);
    const lowConfidence =
      confidenceNumber !== null &&
      requiresParentReview(event.category, confidenceNumber);

    blocks.push({
      id: event.id,
      title: event.title,
      start: event.startAt,
      end: event.endAt,
      leftPercent: geometry.leftPercent,
      widthPercent: geometry.widthPercent,
      kind,
      category: event.category,
      busyStatus: event.busyStatus,
      lowConfidence
    });
  }

  return blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function buildTimelineWindows(
  windows: TimelineWindowInput[],
  range: TimelineRange
): TimelineWindow[] {
  const result: TimelineWindow[] = [];
  for (const window of windows) {
    const geometry = computeBlockGeometry(
      { startAt: window.start, endAt: window.end },
      range
    );
    if (!geometry) continue;
    result.push({
      id: window.id,
      start: window.start,
      end: window.end,
      leftPercent: geometry.leftPercent,
      widthPercent: geometry.widthPercent,
      durationDays: window.durationDays
    });
  }
  return result;
}

export function blockKindLabel(kind: TimelineBlockKind): string {
  switch (kind) {
    case "busy":
      return "Busy";
    case "free":
      return "Free";
    case "exam":
      return "Exam period";
    case "optional":
      return "Optional";
    case "unknown":
      return "Unreviewed status";
  }
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function toConfidenceNumber(
  value: CalendarEvent["sourceConfidence"] | number | null
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getTimelineData(
  options: { now?: Date; horizonDays?: number } = {}
): Promise<TimelineData> {
  const now = options.now ?? new Date();
  const horizon = options.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const start = startOfUtcDay(now);
  const end = new Date(start.getTime() + horizon * MS_PER_DAY);
  const range = buildRange(start, end);

  try {
    const family = await requireUserFamily();

    const children = await prisma.child.findMany({
      where: { familyId: family.id },
      include: {
        calendars: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const familyCalendars = await prisma.calendar.findMany({
      where: { familyId: family.id, childId: null },
      orderBy: { createdAt: "asc" }
    });

    const allCalendarIds = [
      ...children.flatMap((child) => child.calendars.map((c) => c.id)),
      ...familyCalendars.map((c) => c.id)
    ];

    const events = allCalendarIds.length
      ? await prisma.calendarEvent.findMany({
          where: {
            calendarId: { in: allCalendarIds },
            startAt: { lt: end },
            endAt: { gt: start }
          },
          orderBy: { startAt: "asc" }
        })
      : [];

    const candidateGroups = allCalendarIds.length
      ? await prisma.eventCandidate.findMany({
          where: {
            calendarId: { in: allCalendarIds },
            reviewStatus: ReviewStatus.PENDING,
            startAt: { lt: end },
            endAt: { gt: start }
          },
          select: {
            calendarId: true,
            category: true,
            confidence: true
          }
        })
      : [];

    const candidateCounts: TimelineCandidateCountByCalendar = new Map();
    for (const candidate of candidateGroups) {
      const entry = candidateCounts.get(candidate.calendarId) ?? {
        pending: 0,
        lowConfidence: 0
      };
      entry.pending += 1;
      const confidence = toConfidenceNumber(candidate.confidence) ?? 0;
      if (requiresParentReview(candidate.category, confidence)) {
        entry.lowConfidence += 1;
      }
      candidateCounts.set(candidate.calendarId, entry);
    }

    const eventsByCalendar = new Map<string, typeof events>();
    for (const event of events) {
      const list = eventsByCalendar.get(event.calendarId) ?? [];
      list.push(event);
      eventsByCalendar.set(event.calendarId, list);
    }

    const rows: TimelineRow[] = [];

    for (const child of children) {
      const childEvents = child.calendars.flatMap(
        (calendar) => eventsByCalendar.get(calendar.id) ?? []
      );
      const blocks = buildTimelineBlocks(
        childEvents.map((event) => ({
          id: event.id,
          calendarId: event.calendarId,
          title: event.title,
          category: event.category,
          busyStatus: event.busyStatus,
          startAt: event.startAt,
          endAt: event.endAt,
          sourceConfidence: event.sourceConfidence
        })),
        range
      );

      const summaries: TimelineCalendarSummary[] = child.calendars.map(
        (calendar) => {
          const counts = candidateCounts.get(calendar.id);
          return {
            id: calendar.id,
            name: calendar.name,
            type: calendar.type,
            enabled: calendar.enabled,
            pendingCount: counts?.pending ?? 0,
            lowConfidenceCount: counts?.lowConfidence ?? 0
          };
        }
      );

      rows.push({
        id: child.id,
        label: child.nickname,
        color: child.color,
        calendarSummaries: summaries,
        blocks,
        pendingCount: summaries.reduce((sum, s) => sum + s.pendingCount, 0),
        lowConfidenceCount: summaries.reduce(
          (sum, s) => sum + s.lowConfidenceCount,
          0
        )
      });
    }

    if (familyCalendars.length > 0) {
      const familyEvents = familyCalendars.flatMap(
        (calendar) => eventsByCalendar.get(calendar.id) ?? []
      );
      const blocks = buildTimelineBlocks(
        familyEvents.map((event) => ({
          id: event.id,
          calendarId: event.calendarId,
          title: event.title,
          category: event.category,
          busyStatus: event.busyStatus,
          startAt: event.startAt,
          endAt: event.endAt,
          sourceConfidence: event.sourceConfidence
        })),
        range
      );

      const summaries: TimelineCalendarSummary[] = familyCalendars.map(
        (calendar) => {
          const counts = candidateCounts.get(calendar.id);
          return {
            id: calendar.id,
            name: calendar.name,
            type: calendar.type,
            enabled: calendar.enabled,
            pendingCount: counts?.pending ?? 0,
            lowConfidenceCount: counts?.lowConfidence ?? 0
          };
        }
      );

      rows.push({
        id: "family-shared",
        label: "Family / parents",
        color: null,
        calendarSummaries: summaries,
        blocks,
        pendingCount: summaries.reduce((sum, s) => sum + s.pendingCount, 0),
        lowConfidenceCount: summaries.reduce(
          (sum, s) => sum + s.lowConfidenceCount,
          0
        )
      });
    }

    const recentSearch = await prisma.freeWindowSearch.findFirst({
      where: { familyId: family.id },
      orderBy: { createdAt: "desc" },
      include: {
        results: {
          orderBy: { startDate: "asc" },
          take: MAX_RECENT_WINDOWS
        }
      }
    });

    const windows = recentSearch
      ? buildTimelineWindows(
          recentSearch.results.map((result) => ({
            id: result.id,
            start: result.startDate,
            end: result.endDate,
            durationDays: result.durationDays
          })),
          range
        )
      : [];

    const totalPending = rows.reduce((sum, row) => sum + row.pendingCount, 0);
    const totalLowConfidence = rows.reduce(
      (sum, row) => sum + row.lowConfidenceCount,
      0
    );

    return {
      dbAvailable: true,
      setupError: null,
      range,
      rows,
      windows,
      hasChildren: children.length > 0,
      hasEvents: events.length > 0,
      totalPending,
      totalLowConfidence
    };
  } catch (error) {
    console.error("Unable to load timeline data", error);
    return {
      dbAvailable: false,
      setupError:
        "Connect local PostgreSQL and run the Prisma migration to load the family timeline.",
      range,
      rows: [],
      windows: [],
      hasChildren: false,
      hasEvents: false,
      totalPending: 0,
      totalLowConfidence: 0
    };
  }
}
