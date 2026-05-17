import { EventCategory, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserFamily } from "@/lib/family/session";
import { freeWindowSearchInputSchema } from "@/lib/domain/schemas";
import { buildBusyIntervals } from "./event-busy";
import type { EventBusyInput } from "./event-busy";
import {
  findExplainedFreeWindows,
  type ExplainedFreeWindow
} from "./free-windows";

export type SearchFreeWindowsResult = {
  searchId: string;
  windows: ExplainedFreeWindow[];
  enabledCalendarCount: number;
  consideredEventCount: number;
};

export async function runFreeWindowSearch(
  formData: FormData
): Promise<SearchFreeWindowsResult> {
  const input = freeWindowSearchInputSchema.parse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    minimumDays: formData.get("minimumDays"),
    includeUnknownAsBusy: formData.get("includeUnknownAsBusy"),
    includeExamAsBusy: formData.get("includeExamAsBusy")
  });

  const family = await requireUserFamily();

  const calendars = await prisma.calendar.findMany({
    where: { familyId: family.id, enabled: true },
    select: { id: true, name: true }
  });

  const calendarNameById = new Map(
    calendars.map((calendar) => [calendar.id, calendar.name])
  );

  const events = calendars.length
    ? await prisma.calendarEvent.findMany({
        where: {
          calendarId: { in: calendars.map((calendar) => calendar.id) },
          startAt: { lt: input.endDate },
          endAt: { gt: input.startDate }
        },
        orderBy: { startAt: "asc" }
      })
    : [];

  const busyInputs: EventBusyInput[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    category: event.category,
    busyStatus: event.busyStatus,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    calendarId: event.calendarId,
    calendarName: calendarNameById.get(event.calendarId) || "Unknown calendar"
  }));

  const busyIntervals = buildBusyIntervals(busyInputs, {
    includeUnknownAsBusy: input.includeUnknownAsBusy,
    includeExamAsBusy: input.includeExamAsBusy
  });

  // MAT-009: also surface SCHOOL_CLOSED events to the matcher so it
  // can label Sat-start windows that bridge a Mon/Fri holiday as
  // "long weekend." These events stay free in the matching — they
  // only enrich the explanation.
  const holidayEvents = busyInputs.filter(
    (event) => event.category === EventCategory.SCHOOL_CLOSED
  );

  const windows = findExplainedFreeWindows(
    { start: input.startDate, end: input.endDate },
    busyIntervals,
    input.minimumDays,
    holidayEvents
  );

  const search = await prisma.freeWindowSearch.create({
    data: {
      familyId: family.id,
      startDate: input.startDate,
      endDate: input.endDate,
      minimumDays: input.minimumDays,
      includeUnknownAsBusy: input.includeUnknownAsBusy,
      includeExamAsBusy: input.includeExamAsBusy,
      results: {
        create: windows.map((window) => ({
          startDate: window.start,
          endDate: window.end,
          durationDays: window.durationDays,
          explanation: serializeExplanation(window) as Prisma.InputJsonValue
        }))
      }
    },
    select: { id: true }
  });

  return {
    searchId: search.id,
    windows,
    enabledCalendarCount: calendars.length,
    consideredEventCount: busyIntervals.length
  };
}

function serializeExplanation(window: ExplainedFreeWindow) {
  const serializeBlocking = (
    blocking: ExplainedFreeWindow["explanation"]["blockedBefore"]
  ) =>
    blocking
      ? {
          eventId: blocking.eventId,
          title: blocking.title,
          calendarId: blocking.calendarId,
          calendarName: blocking.calendarName,
          start: blocking.start.toISOString(),
          end: blocking.end.toISOString(),
          allDay: blocking.allDay
        }
      : undefined;

  return {
    blockedBefore: serializeBlocking(window.explanation.blockedBefore),
    blockedAfter: serializeBlocking(window.explanation.blockedAfter),
    longWeekend: window.explanation.longWeekend ?? false,
    longWeekendHolidays: window.explanation.longWeekendHolidays ?? []
  };
}
