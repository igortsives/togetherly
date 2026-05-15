import {
  BusyStatus,
  CalendarType,
  EventCategory,
  ParserType,
  RefreshStatus,
  ReviewStatus,
  SourceType
} from "@prisma/client";
import { z } from "zod";
import { getDefaultBusyStatus } from "./event-taxonomy";

const optionalUrl = z
  .string()
  .trim()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined));

const idSchema = z.string().trim().min(1);

export const childInputSchema = z.object({
  nickname: z.string().trim().min(1, "Nickname is required").max(80),
  color: z.string().trim().max(32).optional()
});

export const calendarInputSchema = z.object({
  childId: idSchema.optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Calendar name is required").max(120),
  type: z.nativeEnum(CalendarType),
  timezone: z.string().trim().max(80).optional()
});

export const calendarSourceInputSchema = z
  .object({
    calendarId: idSchema,
    sourceType: z.nativeEnum(SourceType),
    sourceUrl: optionalUrl,
    uploadedFileKey: z.string().trim().max(500).optional(),
    providerCalendarId: z.string().trim().max(500).optional(),
    parserType: z.nativeEnum(ParserType).default(ParserType.UNKNOWN),
    refreshStatus: z.nativeEnum(RefreshStatus).default(RefreshStatus.NEEDS_REVIEW)
  })
  .superRefine((source, context) => {
    const requiresUrl = source.sourceType === SourceType.URL || source.sourceType === SourceType.ICS;
    const requiresFile = source.sourceType === SourceType.PDF_UPLOAD;
    const requiresProvider =
      source.sourceType === SourceType.GOOGLE_CALENDAR ||
      source.sourceType === SourceType.OUTLOOK_CALENDAR;

    if (requiresUrl && !source.sourceUrl) {
      context.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "URL is required for this source type"
      });
    }

    if (requiresFile && !source.uploadedFileKey) {
      context.addIssue({
        code: "custom",
        path: ["uploadedFileKey"],
        message: "Uploaded file key is required for PDF sources"
      });
    }

    if (requiresProvider && !source.providerCalendarId) {
      context.addIssue({
        code: "custom",
        path: ["providerCalendarId"],
        message: "Provider calendar ID is required for calendar integrations"
      });
    }
  });

export const eventCandidateInputSchema = z
  .object({
    calendarSourceId: idSchema,
    calendarId: idSchema,
    rawTitle: z.string().trim().min(1).max(250),
    normalizedTitle: z.string().trim().max(250).optional(),
    category: z.nativeEnum(EventCategory).default(EventCategory.UNKNOWN),
    suggestedBusyStatus: z.nativeEnum(BusyStatus).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    allDay: z.boolean().default(true),
    timezone: z.string().trim().min(1).max(80),
    confidence: z.number().min(0).max(1),
    evidenceText: z.string().trim().max(2000).optional(),
    evidenceLocator: z.string().trim().max(500).optional(),
    reviewStatus: z.nativeEnum(ReviewStatus).default(ReviewStatus.PENDING)
  })
  .superRefine((event, context) => {
    if (event.endAt <= event.startAt) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Event end must be after start"
      });
    }
  })
  .transform((event) => ({
    ...event,
    suggestedBusyStatus:
      event.suggestedBusyStatus ?? getDefaultBusyStatus(event.category)
  }));

export const calendarEventInputSchema = z
  .object({
    calendarId: idSchema,
    eventCandidateId: idSchema.optional(),
    title: z.string().trim().min(1).max(250),
    category: z.nativeEnum(EventCategory),
    busyStatus: z.nativeEnum(BusyStatus).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    allDay: z.boolean().default(true),
    timezone: z.string().trim().min(1).max(80),
    sourceConfidence: z.number().min(0).max(1).optional()
  })
  .superRefine((event, context) => {
    if (event.endAt <= event.startAt) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Event end must be after start"
      });
    }
  })
  .transform((event) => ({
    ...event,
    busyStatus: event.busyStatus ?? getDefaultBusyStatus(event.category)
  }));

export type ChildInput = z.infer<typeof childInputSchema>;
export type CalendarInput = z.infer<typeof calendarInputSchema>;
export type CalendarSourceInput = z.infer<typeof calendarSourceInputSchema>;
export type EventCandidateInput = z.input<typeof eventCandidateInputSchema>;
export type CalendarEventInput = z.input<typeof calendarEventInputSchema>;
