"use server";

import { RefreshStatus, SourceType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { sanitizeRedirectPath } from "@/lib/auth/redirects";
import { prisma } from "@/lib/db/prisma";
import {
  betaFeedbackInputSchema,
  calendarInputSchema,
  calendarSourceInputSchema,
  childInputSchema
} from "@/lib/domain/schemas";
import { getCurrentUserId, requireUserFamily } from "@/lib/family/session";
import { runFreeWindowSearch } from "@/lib/matching/search";
import { deleteUserAccount } from "@/lib/family/account-deletion";
import { disconnectProviderForFamily } from "@/lib/sources/disconnect";
import {
  exportWindowToGoogle,
  exportWindowToOutlook,
  markFreeWindowSaved
} from "@/lib/sources/export";
import { refreshSource } from "@/lib/sources/refresh";
import { parserTypeForSource } from "@/lib/sources/source-metadata";
import { deleteStoredUpload, storeCalendarPdf } from "@/lib/sources/storage";
import { parseNaturalLanguageSearch } from "@/lib/matching/nl-search";

export async function createChildAction(formData: FormData) {
  const family = await requireUserFamily();
  const input = childInputSchema.parse({
    nickname: formData.get("nickname"),
    color: formData.get("color") || undefined
  });

  await prisma.child.create({
    data: {
      familyId: family.id,
      nickname: input.nickname,
      color: input.color
    }
  });

  revalidatePath("/");
}

export async function createCalendarAction(formData: FormData) {
  const family = await requireUserFamily();
  const input = calendarInputSchema.parse({
    childId: formData.get("childId") || undefined,
    name: formData.get("name"),
    type: formData.get("type"),
    timezone: formData.get("timezone") || family.timezone
  });

  await prisma.calendar.create({
    data: {
      familyId: family.id,
      childId: input.childId,
      name: input.name,
      type: input.type,
      timezone: input.timezone || family.timezone
    }
  });

  revalidatePath("/");
}

export async function createUrlSourceAction(formData: FormData) {
  const calendarId = String(formData.get("calendarId") || "");
  const sourceType = String(formData.get("sourceType") || SourceType.URL) as SourceType;
  const parserType = parserTypeForSource(sourceType);
  const ingestWindowStart = parseOptionalIngestWindowStart(
    formData.get("ingestWindowStart")
  );
  const input = calendarSourceInputSchema.parse({
    calendarId,
    sourceType,
    sourceUrl: formData.get("sourceUrl"),
    parserType,
    refreshStatus: RefreshStatus.NEEDS_REVIEW
  });

  const family = await ensureCalendarBelongsToCurrentFamily(input.calendarId);

  const source = await prisma.calendarSource.create({
    data: {
      calendarId: input.calendarId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      parserType: input.parserType,
      refreshStatus: input.refreshStatus,
      ingestWindowStart
    }
  });

  try {
    await refreshSource(source.id, family.id);
  } catch (error) {
    console.error("Source extraction failed", { sourceId: source.id, error });
  }

  revalidatePath("/");
}

export async function createPdfSourceAction(formData: FormData) {
  const calendarId = String(formData.get("calendarId") || "");
  const file = formData.get("pdfFile");
  const ingestWindowStart = parseOptionalIngestWindowStart(
    formData.get("ingestWindowStart")
  );

  if (!(file instanceof File)) {
    throw new Error("Choose a PDF calendar file before uploading.");
  }

  const family = await ensureCalendarBelongsToCurrentFamily(calendarId);
  const storedUpload = await storeCalendarPdf(file);
  const input = calendarSourceInputSchema.parse({
    calendarId,
    sourceType: SourceType.PDF_UPLOAD,
    uploadedFileKey: storedUpload.uploadedFileKey,
    parserType: parserTypeForSource(SourceType.PDF_UPLOAD),
    refreshStatus: RefreshStatus.NEEDS_REVIEW
  });

  const source = await prisma.calendarSource.create({
    data: {
      calendarId: input.calendarId,
      sourceType: input.sourceType,
      uploadedFileKey: input.uploadedFileKey,
      contentHash: storedUpload.contentHash,
      parserType: input.parserType,
      refreshStatus: input.refreshStatus,
      ingestWindowStart
    }
  });

  try {
    await refreshSource(source.id, family.id);
  } catch (error) {
    console.error("PDF extraction failed", { sourceId: source.id, error });
  }

  revalidatePath("/");
}

export async function refreshSourceAction(formData: FormData) {
  const sourceId = String(formData.get("sourceId") || "");
  if (!sourceId) {
    throw new Error("Source ID is required");
  }

  const family = await requireUserFamily();
  const source = await prisma.calendarSource.findFirst({
    where: { id: sourceId, calendar: { familyId: family.id } },
    select: { id: true }
  });
  if (!source) {
    throw new Error("Source not found for this family.");
  }

  try {
    await refreshSource(sourceId, family.id);
  } catch (error) {
    console.error("Manual source refresh failed", { sourceId, error });
  }

  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/windows");
}

export async function deleteSourceAction(formData: FormData) {
  const sourceId = String(formData.get("sourceId") || "");
  if (!sourceId) {
    throw new Error("Source ID is required");
  }

  const family = await requireUserFamily();
  const source = await prisma.calendarSource.findFirst({
    where: { id: sourceId, calendar: { familyId: family.id } },
    select: { id: true, uploadedFileKey: true }
  });
  if (!source) {
    throw new Error("Source not found for this family.");
  }

  await prisma.calendarSource.delete({ where: { id: sourceId } });
  if (source.uploadedFileKey) {
    await deleteStoredUpload(source.uploadedFileKey);
  }
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/windows");
}

export async function deleteCalendarAction(formData: FormData) {
  const calendarId = String(formData.get("calendarId") || "");
  if (!calendarId) {
    throw new Error("Calendar ID is required");
  }

  const family = await requireUserFamily();
  const calendar = await prisma.calendar.findFirst({
    where: { id: calendarId, familyId: family.id },
    select: {
      id: true,
      sources: { select: { uploadedFileKey: true } }
    }
  });
  if (!calendar) {
    throw new Error("Calendar not found for this family.");
  }

  // Postgres cascades remove CalendarSource, EventCandidate, CalendarEvent.
  await prisma.calendar.delete({ where: { id: calendar.id } });

  for (const source of calendar.sources) {
    if (source.uploadedFileKey) {
      await deleteStoredUpload(source.uploadedFileKey);
    }
  }

  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/windows");
}

export async function trimCalendarEventsAction(formData: FormData) {
  const calendarId = String(formData.get("calendarId") || "");
  const cutoffRaw = String(formData.get("cutoffDate") || "");
  const direction = String(formData.get("direction") || "");

  if (!calendarId) {
    throw new Error("Calendar ID is required");
  }
  if (direction !== "delete-before" && direction !== "delete-after") {
    throw new Error("Direction must be delete-before or delete-after");
  }

  const cutoff = parseRequiredCutoffDate(cutoffRaw);

  const family = await requireUserFamily();
  const calendar = await prisma.calendar.findFirst({
    where: { id: calendarId, familyId: family.id },
    select: { id: true }
  });
  if (!calendar) {
    throw new Error("Calendar not found for this family.");
  }

  const startAtFilter =
    direction === "delete-before" ? { lt: cutoff } : { gte: cutoff };

  await prisma.$transaction([
    prisma.calendarEvent.deleteMany({
      where: { calendarId: calendar.id, startAt: startAtFilter }
    }),
    prisma.eventCandidate.deleteMany({
      where: { calendarId: calendar.id, startAt: startAtFilter }
    })
  ]);

  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/windows");
}

export async function updateSourceIngestWindowAction(formData: FormData) {
  const sourceId = String(formData.get("sourceId") || "");
  if (!sourceId) {
    throw new Error("Source ID is required");
  }

  const family = await requireUserFamily();
  const source = await prisma.calendarSource.findFirst({
    where: { id: sourceId, calendar: { familyId: family.id } },
    select: { id: true }
  });
  if (!source) {
    throw new Error("Source not found for this family.");
  }

  const ingestWindowStart = parseOptionalIngestWindowStart(
    formData.get("ingestWindowStart")
  );

  await prisma.calendarSource.update({
    where: { id: source.id },
    data: { ingestWindowStart }
  });

  // Prune candidates that are now before the floor. CalendarEvent rows
  // (confirmed by the parent) are left alone — the floor applies to
  // future ingest, not retroactive matching state. Use
  // trimCalendarEventsAction to also drop confirmed events.
  if (ingestWindowStart) {
    await prisma.eventCandidate.deleteMany({
      where: { calendarSourceId: source.id, startAt: { lt: ingestWindowStart } }
    });
  }

  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/windows");
}

export async function toggleCalendarAction(formData: FormData) {
  const calendarId = String(formData.get("calendarId") || "");
  const enabled = String(formData.get("enabled") || "") === "true";

  if (!calendarId) {
    throw new Error("Calendar ID is required");
  }

  await prisma.calendar.update({
    where: { id: calendarId },
    data: { enabled: !enabled }
  });

  revalidatePath("/");
}

export async function searchFreeWindowsAction(formData: FormData) {
  const result = await runFreeWindowSearch(formData);
  revalidatePath("/windows");
  redirect(`/windows?searchId=${result.searchId}`);
}

const NL_QUERY_MAX_LEN = 280;

export async function parseNaturalLanguageSearchAction(formData: FormData) {
  const rawQuery = String(formData.get("nlQuery") || "");
  const query = rawQuery.slice(0, NL_QUERY_MAX_LEN).trim();

  if (!query) {
    redirect("/windows?nlError=empty");
  }

  const family = await requireUserFamily();

  const [children, sources] = await Promise.all([
    prisma.child.findMany({
      where: { familyId: family.id },
      select: { nickname: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.calendarSource.findMany({
      where: { calendar: { familyId: family.id } },
      select: {
        sourceUrl: true,
        uploadedFileKey: true,
        providerCalendarId: true,
        sourceType: true,
        calendar: { select: { name: true } }
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const sourceLabels = sources.map((source) => labelForLlmContext(source));

  const outcome = await parseNaturalLanguageSearch({
    query,
    today: new Date(),
    familyTimezone: family.timezone,
    childNicknames: children.map((c) => c.nickname),
    sourceLabels
  });

  if (outcome.kind === "unavailable") {
    const params = new URLSearchParams({ nlError: "unavailable", nlQuery: query });
    redirect(`/windows?${params.toString()}`);
  }
  if (outcome.kind === "parse_failed") {
    const params = new URLSearchParams({
      nlError: "parse-failed",
      nlQuery: query
    });
    redirect(`/windows?${params.toString()}`);
  }

  const parse = outcome.parse;
  if (parse.intent === "out_of_scope") {
    const params = new URLSearchParams({
      nlError: "out-of-scope",
      nlExplanation: parse.explanation,
      nlQuery: query
    });
    redirect(`/windows?${params.toString()}`);
  }

  const params = new URLSearchParams();
  params.set("nlQuery", query);
  params.set("nlExplanation", parse.explanation);
  params.set("nlConfidence", parse.confidence.toFixed(2));
  if (parse.parsedStartDate) params.set("parsedStartDate", parse.parsedStartDate);
  if (parse.parsedEndDate) params.set("parsedEndDate", parse.parsedEndDate);
  if (parse.minimumDays !== null) {
    params.set("parsedMinimumDays", String(parse.minimumDays));
  }

  redirect(`/windows?${params.toString()}`);
}

function labelForLlmContext(source: {
  sourceType: string;
  sourceUrl: string | null;
  uploadedFileKey: string | null;
  providerCalendarId: string | null;
  calendar: { name: string };
}): string {
  const hint =
    source.sourceUrl ||
    source.providerCalendarId ||
    (source.uploadedFileKey ? "PDF upload" : source.sourceType);
  return `${source.calendar.name} (${hint})`;
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function linkGoogleAccountAction() {
  await signIn("google", { redirectTo: "/" });
}

export async function linkMicrosoftAccountAction() {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

async function loadFreeWindowResultForCurrentFamily(resultId: string) {
  const family = await requireUserFamily();
  const result = await prisma.freeWindowResult.findFirst({
    where: {
      id: resultId,
      search: { familyId: family.id }
    },
    include: {
      search: { select: { familyId: true } }
    }
  });
  if (!result) {
    throw new Error("Free-window result not found for this family.");
  }
  return { result, family };
}

export async function exportFreeWindowToGoogleAction(formData: FormData) {
  const resultId = String(formData.get("resultId") || "");
  if (!resultId) throw new Error("Result ID is required");

  const { result, family } = await loadFreeWindowResultForCurrentFamily(
    resultId
  );

  await exportWindowToGoogle(family.ownerId, {
    resultId: result.id,
    startDate: result.startDate,
    endDate: result.endDate,
    timezone: family.timezone
  });
  await markFreeWindowSaved(result.id);

  revalidatePath("/windows");
}

export async function exportFreeWindowToOutlookAction(formData: FormData) {
  const resultId = String(formData.get("resultId") || "");
  if (!resultId) throw new Error("Result ID is required");

  const { result, family } = await loadFreeWindowResultForCurrentFamily(
    resultId
  );

  await exportWindowToOutlook(family.ownerId, {
    resultId: result.id,
    startDate: result.startDate,
    endDate: result.endDate,
    timezone: family.timezone
  });
  await markFreeWindowSaved(result.id);

  revalidatePath("/windows");
}

export async function disconnectGoogleAccountAction() {
  const family = await requireUserFamily();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Sign in required.");
  }
  await disconnectProviderForFamily({
    userId,
    familyId: family.id,
    provider: "google"
  });
  revalidatePath("/");
}

export async function deleteAccountAction(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Sign in required.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });
  if (!user) {
    throw new Error("Account not found.");
  }

  const typedEmail = String(formData.get("confirmEmail") || "")
    .trim()
    .toLowerCase();
  if (typedEmail !== user.email.toLowerCase()) {
    redirect("/account?error=confirm");
  }

  await deleteUserAccount({ userId });
  await signOut({ redirectTo: "/login?deleted=1" });
}

export async function disconnectMicrosoftAccountAction() {
  const family = await requireUserFamily();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Sign in required.");
  }
  await disconnectProviderForFamily({
    userId,
    familyId: family.id,
    provider: "microsoft-entra-id"
  });
  revalidatePath("/");
}

export async function createGoogleCalendarSourceAction(formData: FormData) {
  const calendarId = String(formData.get("calendarId") || "");
  const providerCalendarId = String(formData.get("providerCalendarId") || "");
  const ingestWindowStart = parseOptionalIngestWindowStart(
    formData.get("ingestWindowStart")
  );

  const input = calendarSourceInputSchema.parse({
    calendarId,
    sourceType: SourceType.GOOGLE_CALENDAR,
    providerCalendarId,
    parserType: parserTypeForSource(SourceType.GOOGLE_CALENDAR),
    refreshStatus: RefreshStatus.NEEDS_REVIEW
  });

  const family = await ensureCalendarBelongsToCurrentFamily(input.calendarId);

  const existing = await prisma.calendarSource.findFirst({
    where: {
      calendarId: input.calendarId,
      sourceType: SourceType.GOOGLE_CALENDAR,
      providerCalendarId: input.providerCalendarId
    },
    select: { id: true }
  });
  if (existing) {
    throw new Error("This Google calendar is already imported into the selected calendar.");
  }

  const source = await prisma.calendarSource.create({
    data: {
      calendarId: input.calendarId,
      sourceType: input.sourceType,
      providerCalendarId: input.providerCalendarId,
      parserType: input.parserType,
      refreshStatus: input.refreshStatus,
      ingestWindowStart
    }
  });

  try {
    await refreshSource(source.id, family.id);
  } catch (error) {
    console.error("Google Calendar extraction failed", {
      sourceId: source.id,
      error
    });
  }

  revalidatePath("/");
}

export async function createOutlookCalendarSourceAction(formData: FormData) {
  const calendarId = String(formData.get("calendarId") || "");
  const providerCalendarId = String(formData.get("providerCalendarId") || "");
  const ingestWindowStart = parseOptionalIngestWindowStart(
    formData.get("ingestWindowStart")
  );

  const input = calendarSourceInputSchema.parse({
    calendarId,
    sourceType: SourceType.OUTLOOK_CALENDAR,
    providerCalendarId,
    parserType: parserTypeForSource(SourceType.OUTLOOK_CALENDAR),
    refreshStatus: RefreshStatus.NEEDS_REVIEW
  });

  const family = await ensureCalendarBelongsToCurrentFamily(input.calendarId);

  const existing = await prisma.calendarSource.findFirst({
    where: {
      calendarId: input.calendarId,
      sourceType: SourceType.OUTLOOK_CALENDAR,
      providerCalendarId: input.providerCalendarId
    },
    select: { id: true }
  });
  if (existing) {
    throw new Error(
      "This Outlook calendar is already imported into the selected calendar."
    );
  }

  const source = await prisma.calendarSource.create({
    data: {
      calendarId: input.calendarId,
      sourceType: input.sourceType,
      providerCalendarId: input.providerCalendarId,
      parserType: input.parserType,
      refreshStatus: input.refreshStatus,
      ingestWindowStart
    }
  });

  try {
    await refreshSource(source.id, family.id);
  } catch (error) {
    console.error("Outlook Calendar extraction failed", {
      sourceId: source.id,
      error
    });
  }

  revalidatePath("/");
}

export async function submitBetaFeedbackAction(formData: FormData) {
  await requireUserFamily();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Sign in to send feedback.");
  }

  const input = betaFeedbackInputSchema.parse({
    route: formData.get("route"),
    score: formData.get("score"),
    body: formData.get("body"),
    allowFollowUp: formData.get("allowFollowUp")
  });

  const target = sanitizeRedirectPath(input.route);

  await prisma.betaFeedback.create({
    data: {
      userId,
      route: target,
      score: input.score,
      body: input.body,
      allowFollowUp: input.allowFollowUp
    }
  });

  revalidatePath(target);
  revalidatePath("/feedback");

  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}feedback=sent`);
}

function parseOptionalIngestWindowStart(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parseYmdToUtcMidnight(trimmed, "ingestWindowStart");
}

function parseRequiredCutoffDate(value: string): Date {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("A cutoff date is required");
  }
  return parseYmdToUtcMidnight(trimmed, "cutoffDate");
}

function parseYmdToUtcMidnight(value: string, fieldName: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`${fieldName} must be a YYYY-MM-DD date`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, month - 1, day);
  const parsed = new Date(utcMs);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is not a valid date`);
  }
  return parsed;
}

async function ensureCalendarBelongsToCurrentFamily(calendarId: string) {
  const family = await requireUserFamily();
  const calendar = await prisma.calendar.findFirst({
    where: {
      id: calendarId,
      familyId: family.id
    },
    select: { id: true }
  });

  if (!calendar) {
    throw new Error("Choose a valid calendar before importing a source.");
  }

  return family;
}
