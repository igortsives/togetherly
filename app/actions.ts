"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { calendarInputSchema, childInputSchema } from "@/lib/domain/schemas";
import { ensureDemoFamily } from "@/lib/family/dashboard";

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
