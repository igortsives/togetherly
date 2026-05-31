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
  /** Set when another refresher already held a fresh claim, so this
   * call did no work (issue #170). */
  skipped?: "in-progress";
};

export type RefreshOptions = {
  /** Manual dashboard refresh: re-extract even if the fetched content
   * is byte-identical to the last extraction (issue #158). */
  force?: boolean;
};

/**
 * How long a `refreshStartedAt` claim is honored before a new
 * refresher treats it as stale and reclaims (issue #170). Must sit
 * comfortably above worst-case LLM latency so a slow-but-alive refresh
 * isn't stolen, while still recovering promptly from a crashed worker
 * that left the claim set.
 */
export const REFRESH_CLAIM_TTL_MS = 15 * 60 * 1000;

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
  expectedFamilyId: string,
  options: RefreshOptions = {}
): Promise<RefreshOutcome> {
  const now = new Date();

  // PHASE 1 — claim (brief lock-holding transaction).
  //
  // Serialize concurrent refreshes of the same source (issue #40) and
  // ensure only one refresher runs the LLM (issue #170). We take the
  // advisory lock only long enough to check ownership, snapshot the
  // current candidate set, and stamp `refreshStartedAt`. A concurrent
  // refresher that finds a fresh claim bails immediately; a stale
  // claim (crashed worker) is reclaimable after REFRESH_CLAIM_TTL_MS.
  // Crucially the LLM call does NOT happen here, so the Postgres
  // connection is held for milliseconds, not the whole 8-15s round-trip.
  const claim = await withSourceLock(sourceId, async (tx) => {
    const source = await tx.calendarSource.findUniqueOrThrow({
      where: { id: sourceId },
      include: { calendar: { select: { familyId: true } } }
    });

    if (source.calendar.familyId !== expectedFamilyId) {
      throw new SourceFamilyMismatchError(sourceId);
    }

    const claimIsFresh =
      source.refreshStartedAt != null &&
      now.getTime() - source.refreshStartedAt.getTime() < REFRESH_CLAIM_TTL_MS;
    if (claimIsFresh) {
      return { kind: "busy" as const, source };
    }

    const beforeSnapshot = await snapshotCandidatesForSource(sourceId, tx);
    await tx.calendarSource.update({
      where: { id: sourceId },
      data: { refreshStartedAt: now }
    });

    return { kind: "claimed" as const, source, beforeSnapshot };
  });

  if (claim.kind === "busy") {
    const candidatesNow = await snapshotCandidatesForSource(sourceId);
    return {
      sourceId,
      refreshStatus: claim.source.refreshStatus,
      candidatesBefore: candidatesNow.candidates.length,
      candidatesAfter: candidatesNow.candidates.length,
      changeDetected: false,
      skipped: "in-progress"
    };
  }

  const { source, beforeSnapshot } = claim;
  const isFirstRefresh = source.lastParsedAt === null;

  // PHASE 2 — fetch + extract (NO transaction, NO lock held).
  //
  // This is where the LLM call lives. The ingest module fetches the
  // source, runs the (content-hash-gated) extractor, and rewrites the
  // candidate set in its own short `$transaction([...])`. None of that
  // pins the refresh lock.
  try {
    await dispatchToOrchestrator(source, options);
  } catch (error) {
    // PHASE 3a — failure bookkeeping (brief lock-holding transaction).
    await withSourceLock(sourceId, async (tx) => {
      await tx.calendarSource.update({
        where: { id: sourceId },
        data: {
          refreshStatus: RefreshStatus.FAILED,
          lastFetchedAt: new Date(),
          // Increment failure counter for issue #100 backoff. The
          // scheduler skips sources that exceed `MAX_FAILED_ATTEMPTS`.
          failedAttempts: { increment: 1 },
          // Release the claim so the next attempt can proceed.
          refreshStartedAt: null
        }
      });
    });
    throw error;
  }

  // PHASE 3b — success bookkeeping (brief lock-holding transaction).
  return withSourceLock(sourceId, async (tx) => {
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
        // Successful refresh resets the failure counter (#100) and
        // releases the claim (#170).
        failedAttempts: 0,
        refreshStartedAt: null
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

async function dispatchToOrchestrator(
  source: CalendarSource,
  options: RefreshOptions
): Promise<void> {
  switch (source.sourceType) {
    case SourceType.ICS:
      await refreshIcsSource(source.id);
      return;
    case SourceType.URL:
      await refreshHtmlSource(source.id, options);
      return;
    case SourceType.PDF_UPLOAD:
      await extractAndPersistPdf({ calendarSourceId: source.id, ...options });
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
