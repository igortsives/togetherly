import { CalendarType, Prisma, type Family } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type DashboardFamily = Awaited<ReturnType<typeof getFamilyDashboard>>;

const FALLBACK_TIMEZONE = "America/Los_Angeles";

const dashboardFamilyInclude = {
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
} as const satisfies Prisma.FamilyInclude;

type HydratedFamily = Prisma.FamilyGetPayload<{
  include: typeof dashboardFamilyInclude;
}>;

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in required");
    this.name = "UnauthenticatedError";
  }
}

export async function resolveFamilyForUser(userId: string): Promise<Family> {
  const existing = await prisma.family.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return existing;
  }

  return prisma.family.create({
    data: {
      ownerId: userId,
      timezone: FALLBACK_TIMEZONE
    }
  });
}

export async function getFamilyDashboard(userId: string | null) {
  try {
    if (!userId) {
      return {
        dbAvailable: true as const,
        family: emptyFamilyShape(),
        setupError: null,
        authenticated: false as const
      };
    }

    const family = await resolveFamilyForUser(userId);
    const hydratedFamily = await prisma.family.findUniqueOrThrow({
      where: { id: family.id },
      include: dashboardFamilyInclude
    });

    return {
      dbAvailable: true as const,
      family: hydratedFamily,
      setupError: null,
      authenticated: true as const
    };
  } catch (error) {
    console.error("Unable to load family dashboard", error);

    return {
      dbAvailable: false as const,
      family: emptyFamilyShape(),
      setupError:
        "Connect local PostgreSQL and run the Prisma migration to enable family setup.",
      authenticated: false as const
    };
  }
}

function emptyFamilyShape(): HydratedFamily {
  return {
    id: "",
    ownerId: "",
    name: null,
    timezone: FALLBACK_TIMEZONE,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    children: [],
    calendars: []
  };
}

export const calendarTypeOptions = Object.values(CalendarType);
