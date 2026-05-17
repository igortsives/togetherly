import {
  BusyStatus,
  EventCategory,
  ReviewStatus,
  SourceType,
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
  calendarName: string;
  sourceLabel: string;
  /** For all-day events, `end` is stored as midnight of the day AFTER
   * the last visible day (iCal exclusive-end). UI code that displays
   * the end-day label MUST subtract one day. The `inclusiveEnd` helper
   * below is the single source of truth for that math. */
  allDay: boolean;
  /** `CalendarSource.id` for the source legend filter and the
   * per-block source-color stripe (#130). `null` for manually-created
   * events that have no originating source. */
  sourceId: string | null;
  /** Deterministic HSL color string derived from `sourceId` for the
   * legend swatch and the per-block stripe (#130). */
  sourceColor: string;
};

/** Distinct source surfaced on the source legend (#130). */
export type TimelineSource = {
  sourceId: string;
  /** Display name = parent calendar name. */
  calendarName: string;
  /** Provider-type label (Google Calendar / PDF upload / etc). */
  sourceLabel: string;
  /** Same color used for the per-block stripe. */
  color: string;
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
  /** All distinct sources contributing events in the visible window
   * (#130). Drives the source legend at the top of the dashboard. */
  sources: TimelineSource[];
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
  | "allDay"
> & {
  sourceConfidence?: CalendarEvent["sourceConfidence"] | number | null;
  calendarName: string;
  /** `null` for manually-added events (no originating CalendarSource). */
  sourceType?: SourceType | null;
  /** `CalendarSource.id`, or `null` for manually-added events. */
  sourceId?: string | null;
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

    const sourceId = event.sourceId ?? null;
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
      lowConfidence,
      calendarName: event.calendarName,
      sourceLabel: sourceTypeLabel(event.sourceType ?? null),
      allDay: event.allDay,
      sourceId,
      sourceColor: sourceColor(sourceId)
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

/**
 * Convert an iCal-exclusive `end` to the inclusive last-visible-day
 * for display. Issue #129.
 *
 * All-day events are stored with `end` = midnight of the day AFTER
 * the last visible day (the iCal convention). Direct display of that
 * Date prints "Mar 22" for a Mar 13-21 event, which confuses parents.
 * For all-day events, this returns `end - 1ms` which lands inside
 * the last visible day so any date formatter renders it correctly.
 * For timed events `end` is the real instant — return as-is.
 *
 * `FreeWindowResult` rows use the same exclusive-end convention from
 * the matching engine (durationDays = (end - start) / DAY), so this
 * helper applies there too (pass `allDay = true` since results are
 * always day-granular).
 */
export function inclusiveEnd(end: Date, allDay: boolean): Date {
  if (!allDay) return end;
  return new Date(end.getTime() - 1);
}

/** Deterministic HSL color derived from a source id (#130). Returns
 * a CSS `hsl(h, s%, l%)` string. The hash is a 32-bit FNV-1a so
 * the color is stable across server restarts but uncorrelated with
 * the id's lexical order. `null` (manually-added events) gets a
 * neutral gray. */
export function sourceColor(sourceId: string | null): string {
  if (!sourceId) return "hsl(0, 0%, 60%)";
  let hash = 2166136261;
  for (let i = 0; i < sourceId.length; i++) {
    hash ^= sourceId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 62%, 48%)`;
}

/** Human-readable label for the originating source type. Issue #51. */
export function sourceTypeLabel(sourceType: SourceType | null): string {
  switch (sourceType) {
    case SourceType.GOOGLE_CALENDAR:
      return "Google Calendar";
    case SourceType.OUTLOOK_CALENDAR:
      return "Outlook Calendar";
    case SourceType.ICS:
      return "ICS subscription";
    case SourceType.URL:
      return "Web page extract";
    case SourceType.PDF_UPLOAD:
      return "PDF upload";
    case null:
    default:
      return "Added manually";
  }
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
  options: {
    now?: Date;
    horizonDays?: number;
    /** Per-source filter from the URL `?hide=...` param (#130). */
    hiddenSourceIds?: Set<string>;
  } = {}
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
          orderBy: { startAt: "asc" },
          include: {
            eventCandidate: {
              select: {
                calendarSource: { select: { id: true, sourceType: true } }
              }
            }
          }
        })
      : [];

    const hiddenSourceIds = options.hiddenSourceIds ?? new Set<string>();
    const visibleEvents = events.filter((event) => {
      const sourceId = event.eventCandidate?.calendarSource?.id ?? null;
      // A manually-created event (sourceId === null) is never hidden
      // by the source filter — the user has no source toggle for it.
      if (sourceId === null) return true;
      return !hiddenSourceIds.has(sourceId);
    });

    // Map calendarId → name for provenance labels (#51). Both the
    // child calendars and the family calendars contribute.
    const calendarNameById = new Map<string, string>();
    for (const child of children) {
      for (const cal of child.calendars) calendarNameById.set(cal.id, cal.name);
    }
    for (const cal of familyCalendars) {
      calendarNameById.set(cal.id, cal.name);
    }

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
    for (const event of visibleEvents) {
      const list = eventsByCalendar.get(event.calendarId) ?? [];
      list.push(event);
      eventsByCalendar.set(event.calendarId, list);
    }

    // Build the source legend from EVERY event in the window
    // (including hidden ones) so the parent can re-enable a hidden
    // source from the legend. We iterate `events`, not `visibleEvents`.
    const sourcesMap = new Map<string, TimelineSource>();
    for (const event of events) {
      const src = event.eventCandidate?.calendarSource;
      if (!src) continue;
      if (sourcesMap.has(src.id)) continue;
      sourcesMap.set(src.id, {
        sourceId: src.id,
        calendarName:
          calendarNameById.get(event.calendarId) ?? "Unknown calendar",
        sourceLabel: sourceTypeLabel(src.sourceType),
        color: sourceColor(src.id)
      });
    }
    const sources = Array.from(sourcesMap.values()).sort((a, b) =>
      a.calendarName.localeCompare(b.calendarName)
    );

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
          sourceConfidence: event.sourceConfidence,
          allDay: event.allDay,
          calendarName:
            calendarNameById.get(event.calendarId) ?? "Unknown calendar",
          sourceType:
            event.eventCandidate?.calendarSource?.sourceType ?? null,
          sourceId: event.eventCandidate?.calendarSource?.id ?? null
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
          sourceConfidence: event.sourceConfidence,
          allDay: event.allDay,
          calendarName:
            calendarNameById.get(event.calendarId) ?? "Unknown calendar",
          sourceType:
            event.eventCandidate?.calendarSource?.sourceType ?? null,
          sourceId: event.eventCandidate?.calendarSource?.id ?? null
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
      totalLowConfidence,
      sources
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
      totalLowConfidence: 0,
      sources: []
    };
  }
}
