import { prisma } from "@/lib/db/prisma";

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
    const message = error instanceof Error ? error.message : String(error);
    return { linked: true, calendars: [], error: message };
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

  const now = deps.now ? deps.now() : new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (
    account.access_token &&
    (!account.expires_at || account.expires_at - REFRESH_SKEW_SECONDS > nowSeconds)
  ) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new MicrosoftAccessError(
      "Microsoft access token expired and no refresh token is stored. Re-link the account."
    );
  }

  return refreshMicrosoftAccessToken(account.id, account.refresh_token, deps);
}

async function refreshMicrosoftAccessToken(
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
      scope: "openid email profile offline_access Calendars.Read"
    }).toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new MicrosoftAccessError(
      `Failed to refresh Microsoft access token: ${response.status} ${text}`,
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
    const text = await response.text();
    throw new MicrosoftAccessError(
      `Microsoft Graph request failed: ${response.status} ${text}`,
      response.status
    );
  }

  return response;
}
