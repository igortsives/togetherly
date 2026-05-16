import { prisma } from "@/lib/db/prisma";

/**
 * Transaction-client type for the extended Prisma client in
 * `lib/db/prisma.ts`. `Prisma.TransactionClient` from `@prisma/client`
 * matches the base client, not the `$extends`-wrapped one we actually
 * use, so consumers that need a `tx` parameter type should import
 * `AccountTxClient` from here.
 */
export type AccountTxClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/**
 * Serializes OAuth token-refresh per `Account` row to avoid concurrent
 * refreshers racing through the provider's token endpoint with the
 * same `refresh_token` (issue #66).
 *
 * Implemented as a Postgres transaction-scoped advisory lock keyed by
 * a deterministic hash of the account id. The lock is released
 * automatically when the surrounding `$transaction` commits or rolls
 * back — no manual unlock path to leak.
 *
 * The id is a CUID string; `pg_advisory_xact_lock` only accepts
 * integers, so we hash the id to a `bigint` via the standard
 * `('x' || md5(...))::bit(64)::bigint` pattern and namespace the
 * lock space with a fixed prefix to avoid collisions with unrelated
 * advisory locks future code might add.
 */
const LOCK_NAMESPACE = "oauth-token-refresh";

export async function withAccountLock<T>(
  accountId: string,
  fn: (tx: AccountTxClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const lockKey = `${LOCK_NAMESPACE}:${accountId}`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ('x' || substr(md5(${lockKey}), 1, 16))::bit(64)::bigint
      )
    `;
    return fn(tx);
  });
}
