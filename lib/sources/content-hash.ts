/**
 * Issue #158: content-hash short-circuit for HTML/PDF LLM refreshes.
 *
 * Since 2026-05-17 every HTML/PDF refresh fires a Claude call (the
 * heuristic extractors were deleted — see `docs/DECISIONS.md`). Most
 * calendars don't change day to day, so re-extracting an unchanged
 * body is pure waste. This helper decides whether the (expensive) LLM
 * extraction can be skipped because the fetched content is identical
 * to what we last extracted.
 *
 * Pure + side-effect-free so it can be unit-tested directly.
 */
export function shouldSkipExtraction(args: {
  /** Manual dashboard refresh — the parent's signal to re-extract even
   * if the page hasn't changed. Always forces a full extraction. */
  force: boolean;
  /** Null until the source has been parsed at least once. A source we
   * have never parsed must always extract. */
  lastParsedAt: Date | null;
  /** The hash persisted on the last successful extraction. */
  storedHash: string | null;
  /** The hash of the body we just fetched (HTML/ICS), or the immutable
   * file hash for a content-addressed PDF upload. */
  fetchedHash: string | null;
}): boolean {
  if (args.force) {
    return false;
  }
  if (args.lastParsedAt === null) {
    return false;
  }
  return (
    args.storedHash !== null &&
    args.fetchedHash !== null &&
    args.storedHash === args.fetchedHash
  );
}
