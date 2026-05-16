import { prisma } from "@/lib/db/prisma";
import {
  GoogleAccessError,
  GoogleAccountMissingError,
  ensureGoogleAccessToken,
  type GoogleApiDeps,
  type GoogleHttpClient
} from "@/lib/sources/google";
import {
  MicrosoftAccessError,
  MicrosoftAccountMissingError,
  ensureMicrosoftAccessToken,
  type MicrosoftApiDeps,
  type MicrosoftHttpClient
} from "@/lib/sources/microsoft";

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

export type WindowExportInput = {
  /** `FreeWindowResult.id` — used as a stable idempotency clue in the event body. */
  resultId: string;
  startDate: Date;
  endDate: Date;
  /** Optional UTC IANA tz string for Outlook events. */
  timezone?: string;
};

export type WindowExportResult = {
  providerEventId: string;
};

/**
 * Issue #45: export a saved free window to the parent's Google
 * Calendar as a tentative all-day event. Requires the
 * `calendar.events` scope (granted by re-linking the Google
 * account after PR #45's scope upgrade).
 */
export async function exportWindowToGoogle(
  userId: string,
  window: WindowExportInput,
  deps: GoogleApiDeps = {}
): Promise<WindowExportResult> {
  const token = await ensureGoogleAccessToken(userId, deps);
  const httpFetch: GoogleHttpClient = deps.fetch ?? globalThis.fetch;

  // Google all-day events use exclusive `end.date`. A window that
  // spans Mar 13–Mar 21 inclusive must be posted as start=Mar 13,
  // end=Mar 22.
  const startDate = toGoogleDateString(window.startDate);
  const endDate = toGoogleDateString(addDaysUtc(window.endDate, 1));

  const response = await httpFetch(`${GOOGLE_API_BASE}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      summary: "Togetherly trip",
      description: `Saved free window via Togetherly. (resultId: ${window.resultId})`,
      start: { date: startDate },
      end: { date: endDate },
      status: "tentative"
    })
  });

  if (!response.ok) {
    throw new GoogleAccessError(
      `Failed to create Google Calendar event (status ${response.status})`,
      response.status
    );
  }

  const body = (await response.json()) as { id: string };
  return { providerEventId: body.id };
}

/**
 * Issue #45: export a saved free window to the parent's Outlook
 * Calendar as a tentative all-day event. Requires the
 * `Calendars.ReadWrite` scope.
 */
export async function exportWindowToOutlook(
  userId: string,
  window: WindowExportInput,
  deps: MicrosoftApiDeps = {}
): Promise<WindowExportResult> {
  const token = await ensureMicrosoftAccessToken(userId, deps);
  const httpFetch: MicrosoftHttpClient = deps.fetch ?? globalThis.fetch;

  // Microsoft Graph all-day events: start.dateTime is midnight on
  // the start day, end.dateTime is midnight on the day after the
  // last day (same exclusive-end semantics as Google).
  const tz = window.timezone ?? "UTC";
  const startIso = toGraphAllDayIso(window.startDate);
  const endIso = toGraphAllDayIso(addDaysUtc(window.endDate, 1));

  const response = await httpFetch(`${GRAPH_API_BASE}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      subject: "Togetherly trip",
      body: {
        contentType: "Text",
        content: `Saved free window via Togetherly. (resultId: ${window.resultId})`
      },
      start: { dateTime: startIso, timeZone: tz },
      end: { dateTime: endIso, timeZone: tz },
      isAllDay: true,
      showAs: "tentative"
    })
  });

  if (!response.ok) {
    throw new MicrosoftAccessError(
      `Failed to create Outlook Calendar event (status ${response.status})`,
      response.status
    );
  }

  const body = (await response.json()) as { id: string };
  return { providerEventId: body.id };
}

/** Re-export errors so action callers can `instanceof` them. */
export {
  GoogleAccessError,
  GoogleAccountMissingError,
  MicrosoftAccessError,
  MicrosoftAccountMissingError
};

/**
 * Marks a `FreeWindowResult` as saved after a successful export.
 * Caller is expected to have already verified family ownership.
 */
export async function markFreeWindowSaved(resultId: string): Promise<void> {
  await prisma.freeWindowResult.update({
    where: { id: resultId },
    data: { saved: true }
  });
}

function toGoogleDateString(date: Date): string {
  // YYYY-MM-DD in UTC.
  return date.toISOString().slice(0, 10);
}

function toGraphAllDayIso(date: Date): string {
  // `2027-03-13T00:00:00.0000000` — Graph wants the seven-decimal
  // form, but the four-decimal form is also accepted in practice.
  // Slice off the trailing Z since Graph carries the tz separately.
  return `${date.toISOString().slice(0, 19)}.0000000`;
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
