import { ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserFamily } from "@/lib/family/session";
import { serializeCandidate, type SerializedCandidate } from "./candidates";

export type ReviewQueueGroup = {
  calendarId: string;
  calendarName: string;
  calendarType: string;
  childNickname: string | null;
  candidates: SerializedCandidate[];
};

export type ReviewQueue = {
  dbAvailable: true;
  groups: ReviewQueueGroup[];
  totalPending: number;
  setupError: null;
};

export type ReviewQueueUnavailable = {
  dbAvailable: false;
  groups: never[];
  totalPending: 0;
  setupError: string;
};

export async function getReviewQueue(): Promise<ReviewQueue | ReviewQueueUnavailable> {
  try {
    const family = await requireUserFamily();

    const calendars = await prisma.calendar.findMany({
      where: { familyId: family.id },
      include: {
        child: true,
        candidates: {
          where: { reviewStatus: ReviewStatus.PENDING },
          orderBy: [{ startAt: "asc" }, { createdAt: "asc" }]
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const groups: ReviewQueueGroup[] = calendars
      .filter((calendar) => calendar.candidates.length > 0)
      .map((calendar) => ({
        calendarId: calendar.id,
        calendarName: calendar.name,
        calendarType: calendar.type,
        childNickname: calendar.child?.nickname ?? null,
        candidates: calendar.candidates.map(serializeCandidate)
      }));

    const totalPending = groups.reduce(
      (total, group) => total + group.candidates.length,
      0
    );

    return {
      dbAvailable: true,
      groups,
      totalPending,
      setupError: null
    };
  } catch (error) {
    console.error("Unable to load review queue", error);

    return {
      dbAvailable: false,
      groups: [],
      totalPending: 0,
      setupError:
        "Connect local PostgreSQL and run the Prisma migration to load the review queue."
    };
  }
}
