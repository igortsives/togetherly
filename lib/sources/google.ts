import { prisma } from "@/lib/db/prisma";
import { withAccountLock, type AccountTxClient } from "@/lib/db/locks";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/calendar/v3";
const REFRESH_SKEW_SECONDS = 60;

export type GoogleHttpClient = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export type GoogleApiDeps = {
  fetch?: GoogleHttpClient;
  now?: () => Date;
};

export type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  primary?: boolean;
  timeZone?: string;
  accessRole: string;
};

export type GoogleCalendarEventTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  start: GoogleCalendarEventTime;
  end: GoogleCalendarEventTime;
  htmlLink?: string;
  recurringEventId?: string;
};

export class GoogleAccountMissingError extends Error {
  constructor() {
    super("No linked Google account for this user");
    this.name = "GoogleAccountMissingError";
  }
}

export class GoogleAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = "GoogleAccessError";
  }
}

export type GoogleConnectionState =
  | { linked: false }
  | { linked: true; calendars: GoogleCalendarListEntry[]; error: null }
  | { linked: true; calendars: []; error: string };

export async function getGoogleConnectionState(
  userId: string,
  deps: GoogleApiDeps = {}
): Promise<GoogleConnectionState> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { id: true }
  });

  if (!account) {
    return { linked: false };
  }

  try {
    const calendars = await listGoogleCalendars(userId, deps);
    return { linked: true, calendars, error: null };
  } catch (error) {
    console.error("Google connection probe failed", { userId, error });
    return {
      linked: true,
      calendars: [],
      error:
        "Couldn't reach Google Calendar with the linked account. Try re-linking, then refresh."
    };
  }
}

export async function listGoogleCalendars(
  userId: string,
  deps: GoogleApiDeps = {}
): Promise<GoogleCalendarListEntry[]> {
  const token = await ensureGoogleAccessToken(userId, deps);
  const response = await callGoogleApi(
    `${API_BASE}/users/me/calendarList?minAccessRole=reader&maxResults=250`,
    token,
    deps
  );
  const body = (await response.json()) as {
    items?: GoogleCalendarListEntry[];
  };
  return body.items ?? [];
}

export async function listGoogleCalendarEvents(
  userId: string,
  calendarId: string,
  window: { timeMin: Date; timeMax: Date },
  deps: GoogleApiDeps = {}
): Promise<GoogleCalendarEvent[]> {
  const token = await ensureGoogleAccessToken(userId, deps);
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: window.timeMin.toISOString(),
      timeMax: window.timeMax.toISOString(),
      maxResults: "250",
      showDeleted: "false"
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await callGoogleApi(
      `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      token,
      deps
    );

    const body = (await response.json()) as {
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
    };
    if (body.items) events.push(...body.items);
    pageToken = body.nextPageToken;
  } while (pageToken);

  return events;
}

export async function ensureGoogleAccessToken(
  userId: string,
  deps: GoogleApiDeps = {}
): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    orderBy: { createdAt: "desc" }
  });

  if (!account) {
    throw new GoogleAccountMissingError();
  }

  if (!tokenNeedsRefresh(account, deps)) {
    return account.access_token!;
  }

  if (!account.refresh_token) {
    throw new GoogleAccessError(
      "Google access token expired and no refresh token is stored. Re-link the account."
    );
  }

  // Serialize concurrent refreshers against the same Account (#66).
  // A second caller that enters the lock after the winner committed
  // will see the freshly-rotated token and skip the HTTP refresh.
  return withAccountLock(account.id, async (tx) => {
    const fresh = await tx.account.findUniqueOrThrow({
      where: { id: account.id }
    });

    if (!tokenNeedsRefresh(fresh, deps)) {
      return fresh.access_token!;
    }

    if (!fresh.refresh_token) {
      throw new GoogleAccessError(
        "Google access token expired and no refresh token is stored. Re-link the account."
      );
    }

    return refreshGoogleAccessToken(tx, fresh.id, fresh.refresh_token, deps);
  });
}

function tokenNeedsRefresh(
  account: { access_token: string | null; expires_at: number | null },
  deps: GoogleApiDeps
): boolean {
  if (!account.access_token) return true;
  if (!account.expires_at) return false;
  const now = deps.now ? deps.now() : new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return account.expires_at - REFRESH_SKEW_SECONDS <= nowSeconds;
}

async function refreshGoogleAccessToken(
  tx: AccountTxClient,
  accountId: string,
  refreshToken: string,
  deps: GoogleApiDeps
): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleAccessError(
      "Google OAuth client is not configured (GOOGLE_CLIENT_ID/SECRET missing)"
    );
  }

  const httpFetch: GoogleHttpClient = deps.fetch ?? globalThis.fetch;
  const response = await httpFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }).toString()
  });

  if (!response.ok) {
    // On invalid_grant, the refresh token is permanently dead — Google
    // has revoked it (user de-authorized, password change, etc).
    // Null it out so the next call surfaces the "re-link your account"
    // error path instead of silently grinding through retries.
    if (await isInvalidGrant(response)) {
      await tx.account.update({
        where: { id: accountId },
        data: { refresh_token: null }
      });
      throw new GoogleAccessError(
        "Google refresh token is no longer valid. Re-link the account.",
        response.status
      );
    }
    throw new GoogleAccessError(
      `Failed to refresh Google access token (status ${response.status})`,
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
 * Best-effort revoke against Google's revocation endpoint
 * (`oauth2.googleapis.com/revoke`). Returns `true` on a 2xx, `false`
 * on any other outcome. Callers should treat a `false` as
 * "logged-and-continue" — the local Account row is still deleted by
 * the disconnect flow so the user is unblocked even if Google's
 * endpoint is unreachable.
 */
export async function revokeGoogleAccess(
  token: string,
  deps: GoogleApiDeps = {}
): Promise<boolean> {
  const httpFetch: GoogleHttpClient = deps.fetch ?? globalThis.fetch;
  try {
    const response = await httpFetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    );
    if (!response.ok) {
      console.warn("Google token revoke returned non-OK", {
        status: response.status
      });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Google token revoke threw", {
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

async function callGoogleApi(
  url: string,
  accessToken: string,
  deps: GoogleApiDeps
): Promise<Response> {
  const httpFetch: GoogleHttpClient = deps.fetch ?? globalThis.fetch;
  const response = await httpFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new GoogleAccessError(
      `Google Calendar API request failed (status ${response.status})`,
      response.status
    );
  }

  return response;
}
