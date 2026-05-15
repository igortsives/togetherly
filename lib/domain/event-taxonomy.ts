import { BusyStatus, EventCategory } from "@prisma/client";

export const defaultBusyStatusByCategory: Record<EventCategory, BusyStatus> = {
  [EventCategory.SCHOOL_CLOSED]: BusyStatus.FREE,
  [EventCategory.BREAK]: BusyStatus.FREE,
  [EventCategory.CLASS_IN_SESSION]: BusyStatus.BUSY,
  [EventCategory.EXAM_PERIOD]: BusyStatus.CONFIGURABLE,
  [EventCategory.ACTIVITY_BUSY]: BusyStatus.BUSY,
  [EventCategory.OPTIONAL]: BusyStatus.CONFIGURABLE,
  [EventCategory.UNKNOWN]: BusyStatus.UNKNOWN,
  [EventCategory.MANUAL_BLOCK]: BusyStatus.BUSY
};

export function getDefaultBusyStatus(category: EventCategory): BusyStatus {
  return defaultBusyStatusByCategory[category];
}

export function requiresParentReview(category: EventCategory, confidence: number) {
  return category === EventCategory.UNKNOWN || confidence < 0.9;
}
