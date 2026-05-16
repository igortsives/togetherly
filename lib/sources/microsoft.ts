import { prisma } from "@/lib/db/prisma";
import { withAccountLock, type AccountTxClient } from "@/lib/db/locks";

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const API_BASE = "https://graph.microsoft.com/v1.0";
const REFRESH_SKEW_SECONDS = 60;

export type MicrosoftHttpClient = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export type MicrosoftApiDeps = {
  fetch?: MicrosoftHttpClient;
  now?: () => Date;
};

export type MicrosoftCalendarListEntry = {
  id: string;
  name: string;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
  canShare?: boolean;
  owner?: { name?: string; address?: string };
};

export type MicrosoftEventTime = {
  dateTime: string;
  timeZone: string;
};

export type MicrosoftCalendarEvent = {
  id: string;
  iCalUId?: string;
  subject?: string;
  bodyPreview?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  seriesMasterId?: string;
  start: MicrosoftEventTime;
  end: MicrosoftEventTime;
  webLink?: string;
};

export class MicrosoftAccountMissingError extends Error {
  constructor() {
    super("No linked Microsoft account for this user");
    this.name = "MicrosoftAccountMissingError";
  }
}

export class MicrosoftAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = "MicrosoftAccessError";
  }
}

export type MicrosoftConnectionState =
  | { linked: false }
  | { linked: true; calendars: MicrosoftCalendarListEntry[]; error: null }
  | { linked: true; calendars: []; error: string };

export async function getMicrosoftConnectionState(
  userId: string,
  deps: MicrosoftApiDeps = {}
): Promise<MicrosoftConnectionState> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "microsoft-entra-id" },
    select: { id: true }
  });

  if (!account) {
    return { linked: false };
  }

  try {
    const calendars = await listMicrosoftCalendars(userId, deps);
    return { linked: true, calendars, error: null };
  } catch (error) {
    console.error("Microsoft connection probe failed", { userId, error });
    return {
      linked: true,
      calendars: [],
      error:
        "Couldn't reach Outlook Calendar with the linked account. Try re-linking, then refresh."
    };
  }
}

export async function listMicrosoftCalendars(
  userId: string,
  deps: MicrosoftApiDeps = {}
): Promise<MicrosoftCalendarListEntry[]> {
  const token = await ensureMicrosoftAccessToken(userId, deps);
  const response = await callGraphApi(
    `${API_BASE}/me/calendars?$top=100&$select=id,name,isDefaultCalendar,canEdit,canShare,owner`,
    token,
    deps
  );
  const body = (await response.json()) as {
    value?: MicrosoftCalendarListEntry[];
  };
  return body.value ?? [];
}

export async function listMicrosoftCalendarEvents(
  userId: string,
  calendarId: string,
  window: { timeMin: Date; timeMax: Date },
  deps: MicrosoftApiDeps = {}
): Promise<MicrosoftCalendarEvent[]> {
  const token = await ensureMicrosoftAccessToken(userId, deps);
  const events: MicrosoftCalendarEvent[] = [];

  const params = new URLSearchParams({
    startDateTime: window.timeMin.toISOString(),
    endDateTime: window.timeMax.toISOString(),
    $top: "100",
    $orderby: "start/dateTime",
    $select:
      "id,iCalUId,subject,bodyPreview,isAllDay,isCancelled,seriesMasterId,start,end,webLink"
  });

  let nextUrl: string | null = `${API_BASE}/me/calendars/${encodeURIComponent(
    calendarId
  )}/calendarView?${params.toString()}`;

  while (nextUrl) {
    const response: Response = await callGraphApi(nextUrl, token, deps);
    const body = (await response.json()) as {
      value?: MicrosoftCalendarEvent[];
      "@odata.nextLink"?: string;
    };
    if (body.value) events.push(...body.value);
    nextUrl = body["@odata.nextLink"] ?? null;
  }

  return events;
}

export async function ensureMicrosoftAccessToken(
  userId: string,
  deps: MicrosoftApiDeps = {}
): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "microsoft-entra-id" },
    orderBy: { createdAt: "desc" }
  });

  if (!account) {
    throw new MicrosoftAccountMissingError();
  }

  if (!tokenNeedsRefresh(account, deps)) {
    return account.access_token!;
  }

  if (!account.refresh_token) {
    throw new MicrosoftAccessError(
      "Microsoft access token expired and no refresh token is stored. Re-link the account."
    );
  }

  // Serialize concurrent refreshers against the same Account (#66).
  return withAccountLock(account.id, async (tx) => {
    const fresh = await tx.account.findUniqueOrThrow({
      where: { id: account.id }
    });

    if (!tokenNeedsRefresh(fresh, deps)) {
      return fresh.access_token!;
    }

    if (!fresh.refresh_token) {
      throw new MicrosoftAccessError(
        "Microsoft access token expired and no refresh token is stored. Re-link the account."
      );
    }

    return refreshMicrosoftAccessToken(tx, fresh.id, fresh.refresh_token, deps);
  });
}

function tokenNeedsRefresh(
  account: { access_token: string | null; expires_at: number | null },
  deps: MicrosoftApiDeps
): boolean {
  if (!account.access_token) return true;
  if (!account.expires_at) return false;
  const now = deps.now ? deps.now() : new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return account.expires_at - REFRESH_SKEW_SECONDS <= nowSeconds;
}

async function refreshMicrosoftAccessToken(
  tx: AccountTxClient,
  accountId: string,
  refreshToken: string,
  deps: MicrosoftApiDeps
): Promise<string> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new MicrosoftAccessError(
      "Microsoft OAuth client is not configured (MICROSOFT_CLIENT_ID/SECRET missing)"
    );
  }

  const httpFetch: MicrosoftHttpClient = deps.fetch ?? globalThis.fetch;
  const response = await httpFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "openid email profile offline_access Calendars.ReadWrite"
    }).toString()
  });

  if (!response.ok) {
    if (await isInvalidGrant(response)) {
      await tx.account.update({
        where: { id: accountId },
        data: { refresh_token: null }
      });
      throw new MicrosoftAccessError(
        "Microsoft refresh token is no longer valid. Re-link the account.",
        response.status
      );
    }
    throw new MicrosoftAccessError(
      `Failed to refresh Microsoft access token (status ${response.status})`,
      response.status
    );
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
  };

  const expiresAt = Math.floor(Date.now() / 1000) + body.expires_in;
  await tx.account.update({
    where: { id: accountId },
    data: {
      access_token: body.access_token,
      expires_at: expiresAt,
      refresh_token: body.refresh_token ?? refreshToken,
      scope: body.scope ?? undefined,
      token_type: body.token_type ?? undefined
    }
  });

  return body.access_token;
}

/**
 * Best-effort revoke against Microsoft Graph
 * (`/me/revokeSignInSessions`). Microsoft does not expose a public
 * single-token revocation endpoint, so this is the closest practical
 * option — it revokes all signed-in sessions for the user, which
 * forces the refresh token to invalidate on next exchange. Many beta
 * tokens won't have the required directory write scope, so failure
 * is the expected case; the caller still deletes the Account row
 * locally so the user is unblocked.
 */
export async function revokeMicrosoftAccess(
  accessToken: string,
  deps: MicrosoftApiDeps = {}
): Promise<boolean> {
  const httpFetch: MicrosoftHttpClient = deps.fetch ?? globalThis.fetch;
  try {
    const response = await httpFetch(
      `${API_BASE}/me/revokeSignInSessions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (!response.ok) {
      console.warn("Microsoft revokeSignInSessions returned non-OK", {
        status: response.status
      });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Microsoft revokeSignInSessions threw", {
      reason: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function isInvalidGrant(response: Response): Promise<boolean> {
  try {
    const cloned = response.clone();
    const body = (await cloned.json()) as { error?: string };
    return body.error === "invalid_grant";
  } catch {
    return false;
  }
}

async function callGraphApi(
  url: string,
  accessToken: string,
  deps: MicrosoftApiDeps
): Promise<Response> {
  const httpFetch: MicrosoftHttpClient = deps.fetch ?? globalThis.fetch;
  const response = await httpFetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"'
    }
  });

  if (!response.ok) {
    throw new MicrosoftAccessError(
      `Microsoft Graph request failed (status ${response.status})`,
      response.status
    );
  }

  return response;
}
