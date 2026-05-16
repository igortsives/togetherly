import { createHash } from "node:crypto";
import {
  RefreshStatus,
  ReviewStatus,
  SourceType,
  type CalendarSource
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { withSourceLock, type ExtendedTxClient } from "@/lib/db/locks";
import { refreshGoogleSource } from "@/lib/sources/google-ingest";
import { refreshHtmlSource } from "@/lib/sources/html-ingest";
import { refreshIcsSource } from "@/lib/sources/ics-ingest";
import { refreshMicrosoftSource } from "@/lib/sources/microsoft-ingest";
import { extractAndPersistPdf } from "@/lib/sources/pdf-ingest";

export type RefreshOutcome = {
  sourceId: string;
  refreshStatus: RefreshStatus;
  candidatesBefore: number;
  candidatesAfter: number;
  changeDetected: boolean;
};

export class UnsupportedSourceTypeError extends Error {
  constructor(sourceType: SourceType) {
    super(`Cannot refresh source of type ${sourceType}`);
    this.name = "UnsupportedSourceTypeError";
  }
}

export class SourceFamilyMismatchError extends Error {
  constructor(sourceId: string) {
    super(`Source ${sourceId} does not belong to the expected family.`);
    this.name = "SourceFamilyMismatchError";
  }
}

export async function refreshSource(
  sourceId: string,
  expectedFamilyId: string
): Promise<RefreshOutcome> {
  // Serialize concurrent refreshes of the same source (issue #40).
  // A second caller blocks on the Postgres advisory lock until the
  // winner commits, then proceeds — typically finding the candidate
  // set already current.
  //
  // The lock-holding `$transaction` is used for the family-ownership
  // check, the before/after candidate snapshots, the `lastFetchedAt`
  // / refreshStatus write, and the staleness fan-out. The actual
  // ingest work in `dispatchToOrchestrator` happens on a separate
  // connection (ingest modules use their own `$transaction([...])`
  // for the candidate-set rewrite). That's fine: the advisory lock
  // is held across the dispatch call so concurrent callers still
  // serialize, and the ingest write commits before the lock-holding
  // tx commits, so the next lock-acquirer sees the durable state.
  return withSourceLock(sourceId, async (tx) => {
    const source = await tx.calendarSource.findUniqueOrThrow({
      where: { id: sourceId },
      include: { calendar: { select: { familyId: true } } }
    });

    if (source.calendar.familyId !== expectedFamilyId) {
      throw new SourceFamilyMismatchError(sourceId);
    }

    const isFirstRefresh = source.lastParsedAt === null;
    const beforeSnapshot = await snapshotCandidatesForSource(sourceId, tx);

    try {
      await dispatchToOrchestrator(source);
    } catch (error) {
      await tx.calendarSource.update({
        where: { id: sourceId },
        data: {
          refreshStatus: RefreshStatus.FAILED,
          lastFetchedAt: new Date(),
          // Increment failure counter for issue #100 backoff. The
          // scheduler skips sources that exceed `MAX_FAILED_ATTEMPTS`.
          failedAttempts: { increment: 1 }
        }
      });
      throw error;
    }

    const afterSnapshot = await snapshotCandidatesForSource(sourceId, tx);

    const refreshStatus = resolveRefreshStatus({
      isFirstRefresh,
      beforeHash: beforeSnapshot.hash,
      afterHash: afterSnapshot.hash,
      candidatesBefore: beforeSnapshot.candidates.length,
      candidatesAfter: afterSnapshot.candidates.length
    });

    await tx.calendarSource.update({
      where: { id: sourceId },
      data: {
        refreshStatus,
        lastFetchedAt: new Date(),
        // Successful refresh resets the failure counter (#100).
        failedAttempts: 0
      }
    });

    const changeDetected = beforeSnapshot.hash !== afterSnapshot.hash;

    // Invalidate saved free-window searches when the underlying
    // candidate set actually changed (issue #41). Coarse-brush —
    // mark every search for this family stale rather than narrowing
    // by date overlap. Refinement is tracked as a follow-up.
    if (changeDetected) {
      await tx.freeWindowSearch.updateMany({
        where: { familyId: expectedFamilyId, stale: false },
        data: { stale: true }
      });
    }

    return {
      sourceId,
      refreshStatus,
      candidatesBefore: beforeSnapshot.candidates.length,
      candidatesAfter: afterSnapshot.candidates.length,
      changeDetected
    };
  });
}

async function dispatchToOrchestrator(source: CalendarSource): Promise<void> {
  switch (source.sourceType) {
    case SourceType.ICS:
      await refreshIcsSource(source.id);
      return;
    case SourceType.URL:
      await refreshHtmlSource(source.id);
      return;
    case SourceType.PDF_UPLOAD:
      await extractAndPersistPdf({ calendarSourceId: source.id });
      return;
    case SourceType.GOOGLE_CALENDAR:
      await refreshGoogleSource({ calendarSourceId: source.id });
      return;
    case SourceType.OUTLOOK_CALENDAR:
      await refreshMicrosoftSource({ calendarSourceId: source.id });
      return;
    default:
      throw new UnsupportedSourceTypeError(source.sourceType);
  }
}

export type CandidateSnapshotInput = {
  rawTitle: string;
  startAt: Date | string;
  endAt: Date | string;
  allDay: boolean;
  category: string;
  suggestedBusyStatus: string;
  evidenceLocator?: string | null;
};

export type CandidateSnapshot = {
  candidates: CandidateSnapshotInput[];
  hash: string;
};

export async function snapshotCandidatesForSource(
  sourceId: string,
  client: ExtendedTxClient | typeof prisma = prisma
): Promise<CandidateSnapshot> {
  const rows = await client.eventCandidate.findMany({
    where: { calendarSourceId: sourceId, reviewStatus: ReviewStatus.PENDING },
    select: {
      rawTitle: true,
      startAt: true,
      endAt: true,
      allDay: true,
      category: true,
      suggestedBusyStatus: true,
      evidenceLocator: true
    }
  });

  return { candidates: rows, hash: hashCandidateSet(rows) };
}

export function hashCandidateSet(candidates: CandidateSnapshotInput[]): string {
  const normalized = candidates
    .map((candidate) => ({
      rawTitle: candidate.rawTitle,
      startAt:
        candidate.startAt instanceof Date
          ? candidate.startAt.toISOString()
          : new Date(candidate.startAt).toISOString(),
      endAt:
        candidate.endAt instanceof Date
          ? candidate.endAt.toISOString()
          : new Date(candidate.endAt).toISOString(),
      allDay: candidate.allDay,
      category: candidate.category,
      suggestedBusyStatus: candidate.suggestedBusyStatus,
      evidenceLocator: candidate.evidenceLocator ?? null
    }))
    .sort((left, right) => {
      const a = JSON.stringify([
        left.startAt,
        left.endAt,
        left.rawTitle,
        left.evidenceLocator ?? null
      ]);
      const b = JSON.stringify([
        right.startAt,
        right.endAt,
        right.rawTitle,
        right.evidenceLocator ?? null
      ]);
      return a < b ? -1 : a > b ? 1 : 0;
    });

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export function resolveRefreshStatus(args: {
  isFirstRefresh: boolean;
  beforeHash: string;
  afterHash: string;
  candidatesBefore: number;
  candidatesAfter: number;
}): RefreshStatus {
  const {
    isFirstRefresh,
    beforeHash,
    afterHash,
    candidatesBefore,
    candidatesAfter
  } = args;

  if (candidatesBefore === 0 && candidatesAfter === 0) {
    return RefreshStatus.OK;
  }

  if (isFirstRefresh) {
    return RefreshStatus.NEEDS_REVIEW;
  }

  if (beforeHash === afterHash) {
    return RefreshStatus.OK;
  }

  return RefreshStatus.CHANGED;
}
