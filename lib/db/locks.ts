import { prisma } from "@/lib/db/prisma";

/**
 * Transaction-client type for the extended Prisma client in
 * `lib/db/prisma.ts`. `Prisma.TransactionClient` from `@prisma/client`
 * matches the base client, not the `$extends`-wrapped one we actually
 * use, so consumers that need a `tx` parameter type should import
 * `ExtendedTxClient` from here.
 */
export type ExtendedTxClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/** Backwards-compatible alias for the OAuth refresh path. */
export type AccountTxClient = ExtendedTxClient;

/**
 * Serializes work against a `(namespace, key)` pair via a Postgres
 * transaction-scoped advisory lock. The lock is released
 * automatically when the surrounding `$transaction` commits or rolls
 * back — no manual unlock path to leak.
 *
 * `key` is a string (CUIDs, account IDs, …); we hash it to a
 * `bigint` via the standard `('x' || md5(...))::bit(64)::bigint`
 * pattern. The namespace is folded into the hash input so unrelated
 * advisory locks across the app land in different 64-bit slots.
 */
export async function withAdvisoryLock<T>(
  namespace: string,
  key: string,
  fn: (tx: ExtendedTxClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const lockKey = `${namespace}:${key}`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ('x' || substr(md5(${lockKey}), 1, 16))::bit(64)::bigint
      )
    `;
    return fn(tx);
  });
}

/** OAuth token-refresh lock (issue #66). */
export async function withAccountLock<T>(
  accountId: string,
  fn: (tx: ExtendedTxClient) => Promise<T>
): Promise<T> {
  return withAdvisoryLock("oauth-token-refresh", accountId, fn);
}

/** CalendarSource refresh lock (issue #40). Prevents two refreshers
 * from racing the same source's candidate-set rewrite. */
export async function withSourceLock<T>(
  sourceId: string,
  fn: (tx: ExtendedTxClient) => Promise<T>
): Promise<T> {
  return withAdvisoryLock("source-refresh", sourceId, fn);
}
