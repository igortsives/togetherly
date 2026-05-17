export type IngestWindowCandidate = {
  startAt: Date | string;
};

export function applyIngestWindow<T extends IngestWindowCandidate>(
  candidates: T[],
  ingestWindowStart: Date | null | undefined
): T[] {
  if (!ingestWindowStart) {
    return candidates;
  }
  const floor = ingestWindowStart.getTime();
  return candidates.filter((candidate) => {
    const start =
      candidate.startAt instanceof Date
        ? candidate.startAt
        : new Date(candidate.startAt);
    return start.getTime() >= floor;
  });
}
