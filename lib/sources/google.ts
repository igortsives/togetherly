import { prisma } from "@/lib/db/prisma";

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
    const message = error instanceof Error ? error.message : String(error);
    return { linked: true, calendars: [], error: message };
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

  const now = deps.now ? deps.now() : new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (
    account.access_token &&
    (!account.expires_at || account.expires_at - REFRESH_SKEW_SECONDS > nowSeconds)
  ) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new GoogleAccessError(
      "Google access token expired and no refresh token is stored. Re-link the account."
    );
  }

  return refreshGoogleAccessToken(account.id, account.refresh_token, deps);
}

async function refreshGoogleAccessToken(
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
    const text = await response.text();
    throw new GoogleAccessError(
      `Failed to refresh Google access token: ${response.status} ${text}`,
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
  await prisma.account.update({
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
    const text = await response.text();
    throw new GoogleAccessError(
      `Google Calendar API request failed: ${response.status} ${text}`,
      response.status
    );
  }

  return response;
}
