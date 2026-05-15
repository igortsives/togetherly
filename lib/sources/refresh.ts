import { createHash } from "node:crypto";
import {
  RefreshStatus,
  ReviewStatus,
  SourceType,
  type CalendarSource
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
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

export async function refreshSource(sourceId: string): Promise<RefreshOutcome> {
  const source = await prisma.calendarSource.findUniqueOrThrow({
    where: { id: sourceId }
  });

  const isFirstRefresh = source.lastParsedAt === null;
  const beforeSnapshot = await snapshotCandidatesForSource(sourceId);

  try {
    await dispatchToOrchestrator(source);
  } catch (error) {
    await prisma.calendarSource.update({
      where: { id: sourceId },
      data: { refreshStatus: RefreshStatus.FAILED, lastFetchedAt: new Date() }
    });
    throw error;
  }

  const afterSnapshot = await snapshotCandidatesForSource(sourceId);

  const refreshStatus = resolveRefreshStatus({
    isFirstRefresh,
    beforeHash: beforeSnapshot.hash,
    afterHash: afterSnapshot.hash,
    candidatesAfter: afterSnapshot.candidates.length
  });

  await prisma.calendarSource.update({
    where: { id: sourceId },
    data: { refreshStatus }
  });

  return {
    sourceId,
    refreshStatus,
    candidatesBefore: beforeSnapshot.candidates.length,
    candidatesAfter: afterSnapshot.candidates.length,
    changeDetected: beforeSnapshot.hash !== afterSnapshot.hash
  };
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
  sourceId: string
): Promise<CandidateSnapshot> {
  const rows = await prisma.eventCandidate.findMany({
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
      const a = `${left.startAt}|${left.endAt}|${left.rawTitle}|${left.evidenceLocator ?? ""}`;
      const b = `${right.startAt}|${right.endAt}|${right.rawTitle}|${right.evidenceLocator ?? ""}`;
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
  candidatesAfter: number;
}): RefreshStatus {
  const { isFirstRefresh, beforeHash, afterHash, candidatesAfter } = args;

  if (candidatesAfter === 0) {
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
