import {
  BusyStatus,
  CalendarType,
  EventCategory
} from "@prisma/client";
import { z } from "zod";
import {
  eventCandidateInputSchema,
  type EventCandidate
} from "@/lib/domain/schemas";
import {
  callLlmStructured,
  isLlmConfigured,
  LlmExtractionError
} from "@/lib/llm/anthropic";

/**
 * Issue #52 / Round 17 — LLM-primary extractor for HTML and PDF
 * sources. Same canonical output shape (`EventCandidate[]`) as the
 * heuristic extractors so everything downstream (boundary-pair
 * recognizer, matching engine, timeline, review queue) is agnostic
 * to which path produced the candidates.
 *
 * The LLM is constrained to the existing category enum and the
 * existing date-range semantics (iCal-exclusive end). Schema-violating
 * output is rejected so the caller can fall back to heuristics.
 *
 * Per PRIVACY §5.1 and PRD AI-004, the prompt MUST NOT contain:
 *   - parent name or email
 *   - child nickname
 *   - family / user ID
 *   - OAuth tokens or refresh tokens
 * The prompt CAN contain:
 *   - the public source text (HTML / PDF text)
 *   - the calendar type as context for classification
 */

export type LlmExtractionOptions = {
  calendarId: string;
  calendarSourceId: string;
  calendarType: CalendarType;
  defaultTimezone: string;
  /** Source content (already-fetched HTML body or already-extracted
   * PDF text). Caller is responsible for fetch + initial cleanup. */
  sourceText: string;
  /** Optional URL or filename for the LLM's evidence-locator output.
   * Not sent verbatim to the LLM; used only to compose the
   * `evidenceLocator` field on returned candidates. */
  sourceLabel?: string;
};

export type LlmExtractionResult = {
  candidates: EventCandidate[];
  /** Set when the LLM was called but produced zero candidates or
   * failed. Callers should fall back to the heuristic extractor when
   * this is truthy and `candidates` is empty. */
  fallbackReason?: string;
};

/**
 * Returns true when the wrapper should be tried before heuristics.
 * False forces the existing heuristic path (used when key is unset).
 */
export function shouldUseLlmExtractor(): boolean {
  return isLlmConfigured();
}

const SYSTEM_PROMPT = `You are an extractor for academic and family calendar pages.

The user will paste the text of a calendar page (HTML or PDF text). Extract every dated event you find — class start/end dates, breaks, holidays, exam periods, athletic events, school closures, family-relevant deadlines.

Respond with ONLY a JSON object matching this exact schema (no Markdown, no commentary):

{
  "events": [
    {
      "title": string,                  // human-readable event name
      "startDate": string,              // ISO 8601 date "YYYY-MM-DD"
      "endDate": string,                // ISO 8601 date "YYYY-MM-DD" — INCLUSIVE last day
      "allDay": boolean,                // true for full-day events; false for timed
      "category": one of:
        | "SCHOOL_CLOSED"   // holiday, weather day, staff day, school resumes
        | "BREAK"           // fall break, winter break, spring break, vacation
        | "CLASS_IN_SESSION"// term/quarter/semester begin/end markers, single instruction days
        | "EXAM_PERIOD"     // finals, midterms, reading week
        | "ACTIVITY_BUSY"   // practice, tournament, rehearsal, performance, camp
        | "OPTIONAL"        // optional attendance / configurable
        | "UNKNOWN",        // pick when no other category fits
      "confidence": number,             // 0.0-1.0; how sure you are of category + dates
      "evidenceText": string            // short verbatim quote from the source supporting this event
    },
    ...
  ]
}

Date rules:
- Use the YEAR shown on the source. If a year is implicit, infer from context (most academic calendars list a single school year like "2026-2027").
- For a date range that reads "Mar 13-21" inclusive, set startDate="YYYY-03-13" and endDate="YYYY-03-21".
- For a single-day event, startDate equals endDate.
- All dates are interpreted in the calendar's local timezone.

Confidence rules:
- 0.9+ when title clearly maps to a category and date is unambiguous.
- 0.6-0.9 when title is suggestive but ambiguous.
- < 0.6 when you are guessing.

Do NOT invent events. If the source has no dated content, return {"events": []}.
Do NOT return events outside the source text. Every event must trace to a verbatim quote in evidenceText.`;

const llmResponseSchema = z.object({
  events: z.array(
    z.object({
      title: z.string().trim().min(1).max(250),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
      allDay: z.boolean(),
      category: z.nativeEnum(EventCategory),
      confidence: z.number().min(0).max(1),
      evidenceText: z.string().trim().max(2000)
    })
  )
});

const SOURCE_TEXT_LIMIT = 50_000; // ~12K tokens worst case

export async function extractWithLlm(
  options: LlmExtractionOptions
): Promise<LlmExtractionResult> {
  if (!shouldUseLlmExtractor()) {
    return { candidates: [], fallbackReason: "ANTHROPIC_API_KEY not set" };
  }

  const trimmed = options.sourceText.trim();
  if (trimmed.length === 0) {
    return { candidates: [], fallbackReason: "Source text was empty" };
  }

  // Cheap pre-truncation — the LLM can't read 500KB of HTML anyway.
  // Caller is responsible for stripping nav/footer; we just cap.
  const truncated =
    trimmed.length > SOURCE_TEXT_LIMIT
      ? trimmed.slice(0, SOURCE_TEXT_LIMIT)
      : trimmed;

  const userContent = buildUserContent(options, truncated);

  let response: z.infer<typeof llmResponseSchema> | null;
  try {
    response = await callLlmStructured({
      kind: `extract-${options.calendarType.toLowerCase()}`,
      systemPrompt: SYSTEM_PROMPT,
      userContent,
      responseSchema: llmResponseSchema
    });
  } catch (error) {
    if (error instanceof LlmExtractionError) {
      // Surfaces to the calling ingest module which stamps the
      // CalendarSource with `refreshStatus = FAILED`. There is no
      // heuristic fallback path since PR #157 — the parent retries
      // or removes the source.
      console.warn("LLM extractor failed", { reason: error.message });
      return { candidates: [], fallbackReason: error.message };
    }
    throw error;
  }

  if (response === null) {
    return { candidates: [], fallbackReason: "ANTHROPIC_API_KEY not set" };
  }

  const candidates: EventCandidate[] = [];
  for (const event of response.events) {
    const candidate = toCandidate(event, options);
    if (candidate) candidates.push(candidate);
  }

  return { candidates };
}

function buildUserContent(
  options: LlmExtractionOptions,
  sourceText: string
): string {
  const sourceLabelLine = options.sourceLabel
    ? `Source: ${options.sourceLabel}\n`
    : "";
  const calendarTypeLine = `Calendar type: ${options.calendarType}\n`;
  const timezoneLine = `Local timezone: ${options.defaultTimezone}\n\n`;
  return `${sourceLabelLine}${calendarTypeLine}${timezoneLine}Source text follows:\n\n${sourceText}`;
}

function toCandidate(
  event: z.infer<typeof llmResponseSchema>["events"][number],
  options: LlmExtractionOptions
): EventCandidate | null {
  const startAt = parseIsoDate(event.startDate);
  if (!startAt) return null;

  // iCal-exclusive end: take the inclusive end-date and add one day
  // so it lines up with how every other extractor stores all-day
  // ranges. For timed events the LLM is currently constrained to
  // allDay=true via the date-only schema; future extension can add
  // time-of-day fields.
  const endInclusive = parseIsoDate(event.endDate) ?? startAt;
  const endAt = new Date(endInclusive.getTime() + 24 * 60 * 60 * 1000);

  if (endAt <= startAt) return null;

  try {
    return eventCandidateInputSchema.parse({
      calendarId: options.calendarId,
      calendarSourceId: options.calendarSourceId,
      rawTitle: event.title,
      category: event.category,
      suggestedBusyStatus: defaultBusyForCategory(event.category),
      startAt,
      endAt,
      allDay: event.allDay,
      timezone: options.defaultTimezone,
      confidence: event.confidence,
      evidenceText: event.evidenceText,
      evidenceLocator: options.sourceLabel
        ? `llm:${options.sourceLabel}`
        : "llm:source"
    });
  } catch {
    return null;
  }
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  // UTC midnight, matching how the other extractors store all-day.
  return new Date(Date.UTC(year, month - 1, day));
}

function defaultBusyForCategory(category: EventCategory): BusyStatus {
  switch (category) {
    case EventCategory.SCHOOL_CLOSED:
    case EventCategory.BREAK:
      return BusyStatus.FREE;
    case EventCategory.CLASS_IN_SESSION:
    case EventCategory.ACTIVITY_BUSY:
    case EventCategory.MANUAL_BLOCK:
      return BusyStatus.BUSY;
    case EventCategory.EXAM_PERIOD:
    case EventCategory.OPTIONAL:
      return BusyStatus.CONFIGURABLE;
    case EventCategory.UNKNOWN:
    default:
      return BusyStatus.UNKNOWN;
  }
}
