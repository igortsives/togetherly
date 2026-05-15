import { Prisma } from "@prisma/client";

/**
 * Account-enumeration defense for `registerCredentialsAction`.
 * Prisma raises `P2002` ("Unique constraint failed") when an INSERT
 * collides with an existing row — for `User.email` that means the
 * address is already registered. The register action treats this as
 * a non-error so the response is byte-identical to a fresh signup.
 *
 * See `docs/PRIVACY.md` §1.1 and issue #62.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}
