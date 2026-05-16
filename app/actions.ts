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
import { storeCalendarPdf } from "@/lib/sources/storage";

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
      refreshStatus: input.refreshStatus
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
      refreshStatus: input.refreshStatus
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
    select: { id: true }
  });
  if (!source) {
    throw new Error("Source not found for this family.");
  }

  await prisma.calendarSource.delete({ where: { id: sourceId } });
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
      refreshStatus: input.refreshStatus
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
      refreshStatus: input.refreshStatus
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
