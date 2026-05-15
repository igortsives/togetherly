"use server";

import { RefreshStatus, SourceType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import {
  calendarInputSchema,
  calendarSourceInputSchema,
  childInputSchema
} from "@/lib/domain/schemas";
import { ensureDemoFamily } from "@/lib/family/dashboard";
import { parserTypeForSource } from "@/lib/sources/source-metadata";
import { storeCalendarPdf } from "@/lib/sources/storage";

export async function createChildAction(formData: FormData) {
  const family = await ensureDemoFamily();
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
  const family = await ensureDemoFamily();
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

  await ensureCalendarBelongsToDemoFamily(input.calendarId);

  await prisma.calendarSource.create({
    data: {
      calendarId: input.calendarId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      parserType: input.parserType,
      refreshStatus: input.refreshStatus
    }
  });

  revalidatePath("/");
}

export async function createPdfSourceAction(formData: FormData) {
  const calendarId = String(formData.get("calendarId") || "");
  const file = formData.get("pdfFile");

  if (!(file instanceof File)) {
    throw new Error("Choose a PDF calendar file before uploading.");
  }

  await ensureCalendarBelongsToDemoFamily(calendarId);
  const storedUpload = await storeCalendarPdf(file);
  const input = calendarSourceInputSchema.parse({
    calendarId,
    sourceType: SourceType.PDF_UPLOAD,
    uploadedFileKey: storedUpload.uploadedFileKey,
    parserType: parserTypeForSource(SourceType.PDF_UPLOAD),
    refreshStatus: RefreshStatus.NEEDS_REVIEW
  });

  await prisma.calendarSource.create({
    data: {
      calendarId: input.calendarId,
      sourceType: input.sourceType,
      uploadedFileKey: input.uploadedFileKey,
      contentHash: storedUpload.contentHash,
      parserType: input.parserType,
      refreshStatus: input.refreshStatus
    }
  });

  revalidatePath("/");
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

async function ensureCalendarBelongsToDemoFamily(calendarId: string) {
  const family = await ensureDemoFamily();
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
}
