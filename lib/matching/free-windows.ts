import type { BusyInterval, EventBusyInput } from "./event-busy";

export type DateRange = {
  start: Date;
  end: Date;
};

export type FreeWindow = DateRange & {
  durationDays: number;
};

export type BlockingEventSummary = {
  eventId: string;
  title: string;
  calendarId: string;
  calendarName: string;
  start: Date;
  end: Date;
  /** `end` is iCal-exclusive for all-day events (midnight of the day
   * AFTER the last visible day). UI code must subtract one day when
   * displaying an inclusive end label. See `inclusiveEnd` in
   * `lib/family/timeline.ts`. */
  allDay: boolean;
};

export type FreeWindowExplanation = {
  blockedBefore?: BlockingEventSummary;
  blockedAfter?: BlockingEventSummary;
};

export type ExplainedFreeWindow = FreeWindow & {
  explanation: FreeWindowExplanation;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function mergeRanges(ranges: DateRange[]): DateRange[] {
  const sorted = [...ranges].sort(
    (left, right) => left.start.getTime() - right.start.getTime()
  );

  return sorted.reduce<DateRange[]>((merged, range) => {
    const previous = merged.at(-1);

    if (!previous || range.start.getTime() > previous.end.getTime()) {
      merged.push({ ...range });
      return merged;
    }

    previous.end = new Date(Math.max(previous.end.getTime(), range.end.getTime()));
    return merged;
  }, []);
}

export function findFreeWindows(
  searchRange: DateRange,
  busyRanges: DateRange[],
  minimumDays: number
): FreeWindow[] {
  const mergedBusy = mergeRanges(
    busyRanges.filter(
      (range) =>
        range.end.getTime() > searchRange.start.getTime() &&
        range.start.getTime() < searchRange.end.getTime()
    )
  );

  let cursor = searchRange.start;
  const freeWindows: FreeWindow[] = [];

  for (const busy of mergedBusy) {
    const freeEnd = new Date(
      Math.min(busy.start.getTime(), searchRange.end.getTime())
    );
    addWindowIfLongEnough(freeWindows, cursor, freeEnd, minimumDays);
    cursor = new Date(Math.max(cursor.getTime(), busy.end.getTime()));
  }

  addWindowIfLongEnough(freeWindows, cursor, searchRange.end, minimumDays);
  return freeWindows;
}

export function findExplainedFreeWindows(
  searchRange: DateRange,
  busyIntervals: BusyInterval[],
  minimumDays: number
): ExplainedFreeWindow[] {
  const inRange = busyIntervals.filter(
    (interval) =>
      interval.end.getTime() > searchRange.start.getTime() &&
      interval.start.getTime() < searchRange.end.getTime()
  );

  const windows = findFreeWindows(
    searchRange,
    inRange.map((interval) => ({ start: interval.start, end: interval.end })),
    minimumDays
  );

  return windows.map((window) => ({
    ...window,
    explanation: explainWindow(window, inRange)
  }));
}

function explainWindow(
  window: FreeWindow,
  busyIntervals: BusyInterval[]
): FreeWindowExplanation {
  const before = pickBlockingBefore(window.start, busyIntervals);
  const after = pickBlockingAfter(window.end, busyIntervals);

  const explanation: FreeWindowExplanation = {};
  if (before) {
    explanation.blockedBefore = summarize(before);
  }
  if (after) {
    explanation.blockedAfter = summarize(after);
  }
  return explanation;
}

function pickBlockingBefore(
  windowStart: Date,
  busyIntervals: BusyInterval[]
): BusyInterval | undefined {
  const candidates = busyIntervals.filter(
    (interval) => interval.end.getTime() === windowStart.getTime()
  );
  if (candidates.length === 0) return undefined;

  return candidates.reduce((best, interval) =>
    interval.start.getTime() < best.start.getTime() ? interval : best
  );
}

function pickBlockingAfter(
  windowEnd: Date,
  busyIntervals: BusyInterval[]
): BusyInterval | undefined {
  const candidates = busyIntervals.filter(
    (interval) => interval.start.getTime() === windowEnd.getTime()
  );
  if (candidates.length === 0) return undefined;

  return candidates.reduce((best, interval) =>
    interval.end.getTime() > best.end.getTime() ? interval : best
  );
}

function summarize(interval: BusyInterval): BlockingEventSummary {
  const event: EventBusyInput = interval.event;
  return {
    eventId: event.id,
    title: event.title,
    calendarId: event.calendarId,
    calendarName: event.calendarName,
    start: event.startAt,
    end: event.endAt,
    allDay: event.allDay
  };
}

function addWindowIfLongEnough(
  windows: FreeWindow[],
  start: Date,
  end: Date,
  minimumDays: number
) {
  const durationDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);

  if (durationDays >= minimumDays) {
    windows.push({ start, end, durationDays });
  }
}
