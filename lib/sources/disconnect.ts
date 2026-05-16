import { RefreshStatus, SourceType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { revokeGoogleAccess } from "@/lib/sources/google";
import { revokeMicrosoftAccess } from "@/lib/sources/microsoft";

export type OAuthProvider = "google" | "microsoft-entra-id";

export type DisconnectResult = {
  removedAccount: boolean;
  revokedWithProvider: boolean;
  affectedSources: number;
};

const PROVIDER_SOURCE_TYPE: Record<OAuthProvider, SourceType> = {
  google: SourceType.GOOGLE_CALENDAR,
  "microsoft-entra-id": SourceType.OUTLOOK_CALENDAR
};

/**
 * Issue #42: revoke + unlink a provider account.
 *
 * Steps (each best-effort and order-sensitive):
 *  1. Find the `Account` row for `(userId, provider)`. Read the
 *     decrypted access/refresh tokens via the prisma `$extends` wrap.
 *  2. Attempt to revoke with the provider. Failure is logged and
 *     ignored — we still delete locally so the user is unblocked.
 *  3. Delete the `Account` row.
 *  4. Mark every `CalendarSource` of the matching type in the family
 *     as `refreshStatus = FAILED`. Imported `CalendarEvent` rows are
 *     preserved (per `docs/PRIVACY.md` §3.3).
 */
export async function disconnectProviderForFamily(args: {
  userId: string;
  familyId: string;
  provider: OAuthProvider;
}): Promise<DisconnectResult> {
  const { userId, familyId, provider } = args;

  const account = await prisma.account.findFirst({
    where: { userId, provider },
    orderBy: { createdAt: "desc" }
  });

  if (!account) {
    return {
      removedAccount: false,
      revokedWithProvider: false,
      affectedSources: 0
    };
  }

  let revokedWithProvider = false;
  if (provider === "google") {
    const token = account.refresh_token ?? account.access_token;
    if (token) {
      revokedWithProvider = await revokeGoogleAccess(token);
    }
  } else if (provider === "microsoft-entra-id") {
    if (account.access_token) {
      revokedWithProvider = await revokeMicrosoftAccess(account.access_token);
    }
  }

  await prisma.account.delete({ where: { id: account.id } });

  const affected = await prisma.calendarSource.updateMany({
    where: {
      sourceType: PROVIDER_SOURCE_TYPE[provider],
      calendar: { familyId },
      refreshStatus: { not: RefreshStatus.FAILED }
    },
    data: { refreshStatus: RefreshStatus.FAILED }
  });

  return {
    removedAccount: true,
    revokedWithProvider,
    affectedSources: affected.count
  };
}
