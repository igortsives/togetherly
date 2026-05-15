export type DateRange = {
  start: Date;
  end: Date;
};

export type FreeWindow = DateRange & {
  durationDays: number;
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
