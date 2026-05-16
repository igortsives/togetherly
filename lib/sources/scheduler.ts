import { SourceType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { refreshSource } from "@/lib/sources/refresh";

/**
 * How often a source is eligible for an automatic refresh. The
 * scheduler-driven dispatcher picks up any source whose
 * `lastFetchedAt` is older than this (or null), excluding the static
 * source types listed in `STATIC_SOURCE_TYPES`.
 */
export const REFRESH_CADENCE_MS = 24 * 60 * 60 * 1000;

/** Source types that never need automatic refresh. */
export const STATIC_SOURCE_TYPES: ReadonlyArray<SourceType> = [
  SourceType.PDF_UPLOAD
];

/**
 * Issue #100: after this many consecutive failures, the scheduler
 * stops auto-refreshing a source. The user can still trigger a manual
 * refresh from the dashboard, which clears the counter on success.
 * Set high enough that a transient outage doesn't permanently exile
 * a source.
 */
export const MAX_FAILED_ATTEMPTS = 10;

export type ScheduledRefreshResult =
  | { sourceId: string; familyId: string; status: "ok"; changeDetected: boolean }
  | { sourceId: string; familyId: string; status: "error"; error: string }
  | { sourceId: string; familyId: string; status: "skipped"; reason: string };

export type ScheduledRefreshSummary = {
  examined: number;
  attempted: number;
  succeeded: number;
  failed: number;
  results: ScheduledRefreshResult[];
};

export type RefreshAllOptions = {
  now?: Date;
  cadenceMs?: number;
};

/**
 * Finds every source whose interval has elapsed and dispatches a
 * refresh. Errors are isolated — a failure on one source does not
 * stop the others. The per-source advisory lock inside `refreshSource`
 * already handles concurrent execution against the same row, so this
 * dispatcher can be invoked from overlapping cron firings without
 * duplicate work.
 *
 * Retry / backoff for repeatedly-failing sources is not yet modeled;
 * a failing source will be re-attempted on every tick until it
 * succeeds. Tracked in a follow-up.
 */
export async function refreshAllStaleSources(
  options: RefreshAllOptions = {}
): Promise<ScheduledRefreshSummary> {
  const now = options.now ?? new Date();
  const cadenceMs = options.cadenceMs ?? REFRESH_CADENCE_MS;
  const cutoff = new Date(now.getTime() - cadenceMs);

  const due = await prisma.calendarSource.findMany({
    where: {
      sourceType: { notIn: [...STATIC_SOURCE_TYPES] },
      failedAttempts: { lt: MAX_FAILED_ATTEMPTS },
      OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: cutoff } }]
    },
    select: {
      id: true,
      calendar: { select: { familyId: true } }
    }
  });

  const summary: ScheduledRefreshSummary = {
    examined: due.length,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    results: []
  };

  for (const row of due) {
    const sourceId = row.id;
    const familyId = row.calendar.familyId;
    summary.attempted += 1;
    try {
      const outcome = await refreshSource(sourceId, familyId);
      summary.succeeded += 1;
      summary.results.push({
        sourceId,
        familyId,
        status: "ok",
        changeDetected: outcome.changeDetected
      });
    } catch (error) {
      summary.failed += 1;
      const message =
        error instanceof Error ? error.message : String(error);
      console.error("Scheduled refresh failed", { sourceId, familyId, error });
      summary.results.push({
        sourceId,
        familyId,
        status: "error",
        error: message
      });
    }
  }

  return summary;
}
