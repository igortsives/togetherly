/**
 * Issue #162 — parent-supplied `YYYY-MM-DD` dates (cutoff for
 * `trimCalendarEventsAction`, floor for `updateSourceIngestWindowAction`,
 * floor for the source-create actions) must be interpreted in the
 * family's local timezone, not UTC.
 *
 * Without this, a parent in `America/Los_Angeles` who picks
 * `2026-09-01` actually gets a cutoff/floor of `2026-08-31 17:00 PT`
 * because `Date.UTC(2026, 8, 1)` is UTC midnight = previous-day 17:00
 * PT during PDT. The off-by-eight-hours error trims the wrong day.
 *
 * `parseYmdAtLocalMidnight(ymd, timezone)` returns the UTC instant
 * that corresponds to local midnight in the supplied timezone for the
 * given calendar date. No new dependency — uses `Intl.DateTimeFormat`
 * for offset computation and works for any IANA zone.
 *
 * Edge cases:
 * - Invalid YMD strings throw `Error(`${fieldName} must be a YYYY-MM-DD date`)`.
 * - Invalid timezone names fall back to UTC and emit a console warning
 *   so a typo in `family.timezone` is loud, not silent.
 * - DST transitions: US zones transition at 02:00 local. Midnight is
 *   always unambiguous, so the offset computation is stable for the
 *   dates this helper sees.
 */

const YMD_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmdAtLocalMidnight(
  ymd: string,
  timezone: string,
  fieldName: string
): Date {
  const trimmed = ymd.trim();
  const match = YMD_REGEX.exec(trimmed);
  if (!match) {
    throw new Error(`${fieldName} must be a YYYY-MM-DD date`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const guessUtcMs = Date.UTC(year, month - 1, day);
  const guess = new Date(guessUtcMs);
  if (Number.isNaN(guess.getTime())) {
    throw new Error(`${fieldName} is not a valid date`);
  }

  const offsetMs = tzOffsetMsAt(guess, timezone);
  return new Date(guessUtcMs - offsetMs);
}

/**
 * Return the timezone offset (in ms) that the supplied IANA zone has
 * at the given UTC instant. Positive for zones east of UTC, negative
 * for west (so PT during PDT is `-7 * 60 * 60 * 1000`).
 *
 * Implementation: format the instant in the target zone, reconstruct
 * the "wall clock" components as a Date.UTC, and take the difference.
 * Reference: https://stackoverflow.com/a/53652131 (the two-pass trick).
 */
function tzOffsetMsAt(instant: Date, timezone: string): number {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  } catch (error) {
    console.warn("Unknown family timezone — falling back to UTC", {
      timezone,
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }

  const parts = fmt.formatToParts(instant);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  let hour = part("hour");
  // `hour12: false` can emit "24" for midnight in some engines; normalize.
  if (hour === 24) hour = 0;

  const naiveUtcMs = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    hour,
    part("minute"),
    part("second")
  );

  return naiveUtcMs - instant.getTime();
}
