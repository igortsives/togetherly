import { BusyStatus, EventCategory } from "@prisma/client";
import type { DateRange } from "./free-windows";

export type EventBusyOptions = {
  includeUnknownAsBusy: boolean;
  includeExamAsBusy: boolean;
  includeOptionalAsBusy?: boolean;
};

export type EventBusyInput = {
  id: string;
  title: string;
  category: EventCategory;
  busyStatus: BusyStatus;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  calendarId: string;
  calendarName: string;
};

export type BusyInterval = DateRange & {
  event: EventBusyInput;
};

export function buildBusyIntervals(
  events: EventBusyInput[],
  options: EventBusyOptions
): BusyInterval[] {
  return events
    .filter((event) => isEventBusy(event, options))
    .map((event) => ({
      start: event.startAt,
      end: event.endAt,
      event
    }));
}

export function isEventBusy(
  event: Pick<EventBusyInput, "busyStatus" | "category">,
  options: EventBusyOptions
): boolean {
  switch (event.busyStatus) {
    case BusyStatus.BUSY:
      return true;
    case BusyStatus.FREE:
      return false;
    case BusyStatus.UNKNOWN:
      return options.includeUnknownAsBusy;
    case BusyStatus.CONFIGURABLE: {
      if (event.category === EventCategory.EXAM_PERIOD) {
        return options.includeExamAsBusy;
      }
      if (event.category === EventCategory.OPTIONAL) {
        return options.includeOptionalAsBusy ?? false;
      }
      return false;
    }
    default:
      return false;
  }
}
