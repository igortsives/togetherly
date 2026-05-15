import { CalendarType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type DashboardFamily = Awaited<ReturnType<typeof getFamilyDashboard>>;

const demoFamilyId = "demo-family";
const demoUserEmail = "beta-parent@togetherly.local";

export async function ensureDemoFamily() {
  const user = await prisma.user.upsert({
    where: { email: demoUserEmail },
    update: {},
    create: {
      email: demoUserEmail,
      name: "Beta Parent"
    }
  });

  return prisma.family.upsert({
    where: { id: demoFamilyId },
    update: {},
    create: {
      id: demoFamilyId,
      ownerId: user.id,
      name: "Demo Family",
      timezone: "America/Los_Angeles"
    }
  });
}

export async function getFamilyDashboard() {
  try {
    const family = await ensureDemoFamily();
    const hydratedFamily = await prisma.family.findUniqueOrThrow({
      where: { id: family.id },
      include: {
        children: {
          include: {
            calendars: {
              orderBy: { createdAt: "asc" }
            }
          },
          orderBy: { createdAt: "asc" }
        },
        calendars: {
          include: {
            child: true,
            sources: true,
            events: true,
            candidates: true
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    return {
      dbAvailable: true as const,
      family: hydratedFamily,
      setupError: null
    };
  } catch (error) {
    console.error("Unable to load family dashboard", error);

    return {
      dbAvailable: false as const,
      family: {
        id: demoFamilyId,
        name: "Demo Family",
        timezone: "America/Los_Angeles",
        children: [],
        calendars: []
      },
      setupError:
        "Connect local PostgreSQL and run the Prisma migration to enable family setup."
    };
  }
}

export const calendarTypeOptions = Object.values(CalendarType);
