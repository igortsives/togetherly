import { prisma } from "@/lib/db/prisma";
import { revokeGoogleAccess } from "@/lib/sources/google";
import { revokeMicrosoftAccess } from "@/lib/sources/microsoft";
import { deleteStoredUpload } from "@/lib/sources/storage";

export type DeleteAccountResult = {
  userId: string;
  revokedProviders: string[];
  filesDeleted: number;
  filesMissing: number;
};

/**
 * Issue #43: orchestrates user-driven account deletion per
 * `docs/PRIVACY.md` §4.3.
 *
 * Step order matters:
 *  1. Read OAuth tokens off the linked `Account` rows BEFORE the
 *     cascading delete removes them.
 *  2. Read all PDF blob keys via the user's `Family → Calendar →
 *     CalendarSource` chain, also before delete.
 *  3. Best-effort revoke each provider token (Google + Microsoft).
 *     Revocation failures are logged but never abort the delete —
 *     the parent's data has to disappear regardless.
 *  4. Delete the `User` row. Postgres cascades remove Family, Child,
 *     Calendar, CalendarSource, EventCandidate, CalendarEvent,
 *     FreeWindowSearch, FreeWindowResult, Account, BetaFeedback,
 *     and Session in one statement.
 *  5. After the DB delete commits, best-effort unlink the PDF blobs
 *     from disk. Doing this last means a partial-deletion failure
 *     leaves orphan files on disk (recoverable via an audit job)
 *     rather than orphan DB rows pointing to missing files (which
 *     would surface as 500s for the user before they're signed out).
 *  6. Emit an info-level audit log line carrying the userId only —
 *     never the email, name, or any imported event content (see
 *     `docs/PRIVACY.md` §6).
 */
export async function deleteUserAccount(args: {
  userId: string;
}): Promise<DeleteAccountResult> {
  const { userId } = args;

  const accounts = await prisma.account.findMany({
    where: { userId },
    select: {
      id: true,
      provider: true,
      access_token: true,
      refresh_token: true
    }
  });

  const family = await prisma.family.findUnique({
    where: { ownerId: userId },
    select: {
      id: true,
      calendars: {
        select: {
          sources: {
            select: { uploadedFileKey: true }
          }
        }
      }
    }
  });

  const uploadedFileKeys = (family?.calendars ?? [])
    .flatMap((calendar) => calendar.sources)
    .map((source) => source.uploadedFileKey)
    .filter((key): key is string => typeof key === "string" && key.length > 0);

  const revokedProviders: string[] = [];
  for (const account of accounts) {
    if (account.provider === "google") {
      const token = account.refresh_token ?? account.access_token;
      if (token && (await revokeGoogleAccess(token))) {
        revokedProviders.push("google");
      }
    } else if (account.provider === "microsoft-entra-id") {
      if (
        account.access_token &&
        (await revokeMicrosoftAccess(account.access_token))
      ) {
        revokedProviders.push("microsoft-entra-id");
      }
    }
  }

  await prisma.user.delete({ where: { id: userId } });

  let filesDeleted = 0;
  let filesMissing = 0;
  for (const key of uploadedFileKeys) {
    const removed = await deleteStoredUpload(key);
    if (removed) {
      filesDeleted += 1;
    } else {
      filesMissing += 1;
    }
  }

  console.info("User account deleted", {
    userId,
    revokedProviders,
    filesDeleted,
    filesMissing
  });

  return {
    userId,
    revokedProviders,
    filesDeleted,
    filesMissing
  };
}
