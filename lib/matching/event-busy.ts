import { BusyStatus, EventCategory } from "@prisma/client";
import type { DateRange } from "./free-windows";

export type EventBusyOptions = {
  includeUnknownAsBusy: boolean;
  includeExamAsBusy: boolean;
  includeOptionalAsBusy?: boolean;
};

export type EventBusyInput = {
  id: string;
  title: string;
  category: EventCategory;
  busyStatus: BusyStatus;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  calendarId: string;
  calendarName: string;
};

export type BusyInterval = DateRange & {
  event: EventBusyInput;
};

export function buildBusyIntervals(
  events: EventBusyInput[],
  options: EventBusyOptions
): BusyInterval[] {
  return events.filter((event) => isEventBusy(event, options)).flatMap(
    (event): BusyInterval[] => {
      // Issue #131 / MAT-010: `CLASS_IN_SESSION` intervals are
      // weekdays-only. School is in session Mon-Fri; Sat/Sun inside
      // a term remain free. We split the interval into per-weekday
      // sub-intervals before handing it to the free-window matcher.
      if (event.category === EventCategory.CLASS_IN_SESSION) {
        return splitWeekdaysOnly(event);
      }
      return [{ start: event.startAt, end: event.endAt, event }];
    }
  );
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Split an interval into per-weekday sub-intervals, skipping Sat/Sun.
 * Each sub-interval covers one Mon-Fri day at UTC midnight boundaries.
 * Suitable for all-day class-in-session intervals; for timed events
 * the existing semantics would need a richer split — out of scope. */
function splitWeekdaysOnly(event: EventBusyInput): BusyInterval[] {
  const out: BusyInterval[] = [];
  // Iterate day-by-day from start (inclusive) to end (exclusive).
  const startMs = startOfUtcDay(event.startAt).getTime();
  const endMs = event.endAt.getTime();
  for (let dayMs = startMs; dayMs < endMs; dayMs += MS_PER_DAY) {
    const day = new Date(dayMs);
    const dow = day.getUTCDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) continue;
    out.push({
      start: day,
      end: new Date(dayMs + MS_PER_DAY),
      event
    });
  }
  return out;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function isEventBusy(
  event: Pick<EventBusyInput, "busyStatus" | "category">,
  options: EventBusyOptions
): boolean {
  switch (event.busyStatus) {
    case BusyStatus.BUSY:
      return true;
    case BusyStatus.FREE:
      return false;
    case BusyStatus.UNKNOWN:
      return options.includeUnknownAsBusy;
    case BusyStatus.CONFIGURABLE: {
      if (event.category === EventCategory.EXAM_PERIOD) {
        return options.includeExamAsBusy;
      }
      if (event.category === EventCategory.OPTIONAL) {
        return options.includeOptionalAsBusy ?? false;
      }
      return false;
    }
    default:
      return false;
  }
}
