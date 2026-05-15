"use server";

import {
  BusyStatus,
  EventCategory,
  EventCreator,
  ReviewStatus
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUserFamily } from "@/lib/family/session";
import {
  buildCalendarEventInputFromCandidate,
  candidateConfidenceNumber,
  type CandidateOverrides
} from "@/lib/review/candidates";
import { calendarEventInputSchema } from "@/lib/domain/schemas";
import { requiresParentReview } from "@/lib/domain/event-taxonomy";

export async function confirmCandidateAction(formData: FormData) {
  const candidateId = String(formData.get("candidateId") || "");
  await confirmCandidate(candidateId, {}, ReviewStatus.CONFIRMED);
}

export async function bulkConfirmCandidatesAction(formData: FormData) {
  const candidateIds = Array.from(
    new Set(
      formData
        .getAll("candidateId")
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
    )
  );

  if (candidateIds.length === 0) {
    return;
  }

  const candidates = await loadCandidatesForCurrentFamily(candidateIds);

  const eligible = candidates.filter(
    (candidate) =>
      candidate.reviewStatus === ReviewStatus.PENDING &&
      !requiresParentReview(candidate.category, candidateConfidenceNumber(candidate))
  );

  if (eligible.length === 0) {
    return;
  }

  const operations = eligible.flatMap((candidate) => {
    const parsed = calendarEventInputSchema.parse(
      buildCalendarEventInputFromCandidate(candidate, {})
    );
    return [
      prisma.calendarEvent.create({
        data: {
          calendarId: parsed.calendarId,
          eventCandidateId: parsed.eventCandidateId,
          title: parsed.title,
          category: parsed.category,
          busyStatus: parsed.busyStatus,
          startAt: parsed.startAt,
          endAt: parsed.endAt,
          allDay: parsed.allDay,
          timezone: parsed.timezone,
          sourceConfidence: parsed.sourceConfidence,
          createdBy: EventCreator.EXTRACTOR
        }
      }),
      prisma.eventCandidate.update({
        where: { id: candidate.id },
        data: { reviewStatus: ReviewStatus.CONFIRMED }
      })
    ];
  });

  await prisma.$transaction(operations);

  revalidatePath("/review");
  revalidatePath("/");
}

export async function rejectCandidateAction(formData: FormData) {
  const candidateId = String(formData.get("candidateId") || "");

  if (!candidateId) {
    throw new Error("Candidate ID is required");
  }

  await ensureCandidateBelongsToCurrentFamily(candidateId);

  await prisma.eventCandidate.update({
    where: { id: candidateId },
    data: { reviewStatus: ReviewStatus.REJECTED }
  });

  revalidatePath("/review");
  revalidatePath("/");
}

export async function editAndConfirmCandidateAction(formData: FormData) {
  const candidateId = String(formData.get("candidateId") || "");

  const overrides: CandidateOverrides = {
    title: optionalString(formData.get("title")),
    category: optionalEnum(formData.get("category"), EventCategory),
    busyStatus: optionalEnum(formData.get("busyStatus"), BusyStatus),
    timezone: optionalString(formData.get("timezone"))
  };

  const startAt = optionalDate(formData.get("startAt"));
  const endAt = optionalDate(formData.get("endAt"));
  if (startAt) overrides.startAt = startAt;
  if (endAt) overrides.endAt = endAt;

  const allDayRaw = formData.get("allDay");
  if (allDayRaw !== null) {
    overrides.allDay = allDayRaw === "true" || allDayRaw === "on";
  }

  await confirmCandidate(candidateId, overrides, ReviewStatus.EDITED);
}

async function confirmCandidate(
  candidateId: string,
  overrides: CandidateOverrides,
  reviewStatus: typeof ReviewStatus.CONFIRMED | typeof ReviewStatus.EDITED
) {
  if (!candidateId) {
    throw new Error("Candidate ID is required");
  }

  const candidate = await ensureCandidateBelongsToCurrentFamily(candidateId);

  if (candidate.reviewStatus === ReviewStatus.CONFIRMED || candidate.reviewStatus === ReviewStatus.EDITED) {
    throw new Error("Candidate has already been confirmed.");
  }

  const parsed = calendarEventInputSchema.parse(
    buildCalendarEventInputFromCandidate(candidate, overrides)
  );

  await prisma.$transaction([
    prisma.calendarEvent.create({
      data: {
        calendarId: parsed.calendarId,
        eventCandidateId: parsed.eventCandidateId,
        title: parsed.title,
        category: parsed.category,
        busyStatus: parsed.busyStatus,
        startAt: parsed.startAt,
        endAt: parsed.endAt,
        allDay: parsed.allDay,
        timezone: parsed.timezone,
        sourceConfidence: parsed.sourceConfidence,
        createdBy: EventCreator.EXTRACTOR
      }
    }),
    prisma.eventCandidate.update({
      where: { id: candidateId },
      data: { reviewStatus }
    })
  ]);

  revalidatePath("/review");
  revalidatePath("/");
}

async function ensureCandidateBelongsToCurrentFamily(candidateId: string) {
  const family = await requireUserFamily();
  const candidate = await prisma.eventCandidate.findFirst({
    where: {
      id: candidateId,
      calendar: { familyId: family.id }
    }
  });

  if (!candidate) {
    throw new Error("Candidate not found for this family.");
  }

  return candidate;
}

async function loadCandidatesForCurrentFamily(candidateIds: string[]) {
  const family = await requireUserFamily();
  return prisma.eventCandidate.findMany({
    where: {
      id: { in: candidateIds },
      calendar: { familyId: family.id }
    }
  });
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  if (value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalDate(value: FormDataEntryValue | null): Date | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${text}`);
  }
  return date;
}

function optionalEnum<T extends Record<string, string>>(
  value: FormDataEntryValue | null,
  enumObject: T
): T[keyof T] | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  if (!(Object.values(enumObject) as string[]).includes(text)) {
    throw new Error(`Invalid value: ${text}`);
  }
  return text as T[keyof T];
}
