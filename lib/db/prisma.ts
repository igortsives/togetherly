import { PrismaClient } from "@prisma/client";
import { decryptToken, encryptToken } from "@/lib/auth/oauth-tokens";

/**
 * Scope note: this $extends block wraps direct `account.*` queries only.
 * If you load Account rows via a related-record include (e.g.
 * `prisma.user.findFirst({ include: { accounts: true } })`), the rows
 * come back UN-DECRYPTED because the wrap is keyed on the `account`
 * model, not on `user`. For OAuth token reads, use a direct query like
 * `prisma.account.findFirst({ where: { userId, provider } })` — see
 * `lib/sources/google.ts` and `lib/sources/microsoft.ts` for the pattern.
 *
 * The wrap also only matches `typeof value === "string"`, so a Prisma
 * `data: { access_token: { set: "..." } }` update would skip encryption.
 * Use direct string assignment when writing token fields.
 */

const ENCRYPTED_ACCOUNT_FIELDS = ["access_token", "refresh_token", "id_token"] as const;
type EncryptedAccountField = (typeof ENCRYPTED_ACCOUNT_FIELDS)[number];

function encryptAccountWriteData<T extends Record<string, unknown> | undefined>(data: T): T {
  if (!data) return data;
  const next = { ...data } as Record<string, unknown>;
  for (const field of ENCRYPTED_ACCOUNT_FIELDS) {
    const value = next[field];
    if (typeof value === "string" && value.length > 0) {
      next[field] = encryptToken(value);
    }
  }
  return next as T;
}

function decryptAccountReadRow<T extends Record<string, unknown> | null | undefined>(row: T): T {
  if (!row) return row;
  const next = { ...row } as Record<string, unknown>;
  for (const field of ENCRYPTED_ACCOUNT_FIELDS) {
    const value = next[field];
    if (typeof value === "string" && value.length > 0) {
      try {
        next[field] = decryptToken(value);
      } catch (error) {
        // Surface misconfiguration loudly: a wrong/rotated key would
        // otherwise silently null every account row. The user-facing
        // behaviour stays the same (null token → "no linked account"
        // re-link prompt) but operators get a signal.
        console.warn("OAuth token decrypt failed for Account row", {
          field,
          accountId: next.id,
          reason: error instanceof Error ? error.message : String(error)
        });
        next[field] = null;
      }
    }
  }
  return next as T;
}

function buildPrisma() {
  const base = new PrismaClient();
  return base.$extends({
    name: "encryptOAuthTokens",
    query: {
      account: {
        async create({ args, query }) {
          if (args.data) {
            args.data = encryptAccountWriteData(
              args.data as Record<string, unknown>
            ) as typeof args.data;
          }
          return query(args);
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((row) =>
              encryptAccountWriteData(row as Record<string, unknown>)
            ) as typeof args.data;
          } else if (args.data) {
            args.data = encryptAccountWriteData(
              args.data as Record<string, unknown>
            ) as typeof args.data;
          }
          return query(args);
        },
        async update({ args, query }) {
          if (args.data) {
            args.data = encryptAccountWriteData(
              args.data as Record<string, unknown>
            ) as typeof args.data;
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          if (args.data) {
            args.data = encryptAccountWriteData(
              args.data as Record<string, unknown>
            ) as typeof args.data;
          }
          return query(args);
        },
        async upsert({ args, query }) {
          if (args.create) {
            args.create = encryptAccountWriteData(
              args.create as Record<string, unknown>
            ) as typeof args.create;
          }
          if (args.update) {
            args.update = encryptAccountWriteData(
              args.update as Record<string, unknown>
            ) as typeof args.update;
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          return decryptAccountReadRow(await query(args));
        },
        async findFirstOrThrow({ args, query }) {
          return decryptAccountReadRow(await query(args));
        },
        async findUnique({ args, query }) {
          return decryptAccountReadRow(await query(args));
        },
        async findUniqueOrThrow({ args, query }) {
          return decryptAccountReadRow(await query(args));
        },
        async findMany({ args, query }) {
          const rows = await query(args);
          return rows.map((row) => decryptAccountReadRow(row));
        }
      }
    }
  });
}

type ExtendedPrisma = ReturnType<typeof buildPrisma>;

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrisma;
};

export const prisma: ExtendedPrisma = globalForPrisma.prisma ?? buildPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { EncryptedAccountField };
