import { parse as parseDate } from "date-fns";
import { CalendarType, EventCategory } from "@prisma/client";
import {
  eventCandidateInputSchema,
  type EventCandidate
} from "@/lib/domain/schemas";

export type PdfTextExtractionOptions = {
  calendarId: string;
  calendarSourceId: string;
  calendarType: CalendarType;
  defaultTimezone: string;
};

export type PdfTextExtractionError = {
  line: number;
  page: number | null;
  snippet: string;
  reason: string;
};

export type PdfTextExtractionResult = {
  candidates: EventCandidate[];
  errors: PdfTextExtractionError[];
};

type ParsedDateRange = {
  start: Date;
  end: Date;
  matchedText: string;
};

type LineContext = {
  raw: string;
  text: string;
  index: number;
  page: number | null;
};

const EVIDENCE_TEXT_LIMIT = 1000;

const ACTIVITY_CALENDAR_TYPES: ReadonlySet<CalendarType> = new Set([
  CalendarType.SPORT,
  CalendarType.MUSIC,
  CalendarType.ACTIVITY,
  CalendarType.CAMP
]);

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const MONTH_INDEX_BY_NAME = new Map<string, number>(
  MONTH_NAMES.flatMap((name, index) => {
    const lower = name.toLowerCase();
    return [
      [lower, index],
      [lower.slice(0, 3), index],
      [lower.slice(0, 4), index]
    ] as [string, number][];
  })
);

const WEEKDAY_PATTERN = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)";
const WEEKDAY_RANGE_PATTERN = `${WEEKDAY_PATTERN}(?:\\s*[-\\u2013]\\s*${WEEKDAY_PATTERN})?`;
const MONTH_PATTERN =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December|Sept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

const DATE_RANGE_FULL = new RegExp(
  `${WEEKDAY_RANGE_PATTERN},\\s*(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s*(\\d{4})\\s*[-\\u2013]\\s*${WEEKDAY_RANGE_PATTERN},\\s*(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s*(\\d{4})`,
  "i"
);

const DATE_RANGE_CROSS_MONTH = new RegExp(
  `${WEEKDAY_RANGE_PATTERN},\\s*(${MONTH_PATTERN})\\s+(\\d{1,2})\\s*[-\\u2013]\\s*${WEEKDAY_RANGE_PATTERN},\\s*(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s*(\\d{4})`,
  "i"
);

const DATE_RANGE_SAME_MONTH = new RegExp(
  `${WEEKDAY_RANGE_PATTERN},\\s*(${MONTH_PATTERN})\\s+(\\d{1,2})\\s*[-\\u2013]\\s*(\\d{1,2}),\\s*(\\d{4})`,
  "i"
);

const DATE_SINGLE_FULL = new RegExp(
  `${WEEKDAY_PATTERN},\\s*(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s*(\\d{4})`,
  "i"
);

const DATE_NUMERIC_SHORT = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

const SECTION_HEADER_YEAR = new RegExp(
  `\\b(${MONTH_PATTERN})\\s+(\\d{4})\\b|\\b(?:FALL|WINTER|SPRING|SUMMER)\\s+(?:QUARTER|SEMESTER|SESSION|TERM)?\\s*(\\d{4})\\b|\\b(\\d{4})\\s*[-\\u2013]\\s*(\\d{4})\\b`,
  "i"
);

const PAGE_BREAK_PATTERN = /\f|^\s*Page\s+\d+\s*(?:of\s+\d+)?\s*$/i;

const BREAK_KEYWORDS = ["break", "vacation", "holiday", "no school", "no-school"];
const EXAM_KEYWORDS = ["final examination", "finals week", "finals", "final ", "exam", "midterm"];
const CLASS_KEYWORDS = [
  "instruction begins",
  "instruction ends",
  "first day",
  "last day",
  "classes begin",
  "classes end",
  "school resumes",
  "school starts",
  "school year begins",
  "school year ends",
  "quarter begins",
  "quarter ends",
  "semester begins",
  "semester ends"
];

export function extractPdfTextEvents(
  pdfText: string,
  options: PdfTextExtractionOptions
): PdfTextExtractionResult {
  const candidates: EventCandidate[] = [];
  const errors: PdfTextExtractionError[] = [];

  const lines = splitIntoLines(pdfText);
  let sectionYear: number | null = null;

  for (const line of lines) {
    if (!line.text) {
      continue;
    }

    const updatedYear = readSectionYear(line.text);
    if (updatedYear !== null) {
      sectionYear = updatedYear;
    }

    let ranges: ParsedDateRange[] = [];
    try {
      ranges = parseDateRanges(line.text, sectionYear);
    } catch (error) {
      errors.push({
        line: line.index,
        page: line.page,
        snippet: truncate(line.raw),
        reason: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    if (ranges.length === 0) {
      continue;
    }

    for (const range of ranges) {
      try {
        const candidate = buildCandidate({
          line,
          range,
          options
        });
        if (candidate) {
          candidates.push(candidate);
        }
      } catch (error) {
        errors.push({
          line: line.index,
          page: line.page,
          snippet: truncate(line.raw),
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return { candidates, errors };
}

function splitIntoLines(text: string): LineContext[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const rawLines = normalized.split("\n");
  const lines: LineContext[] = [];
  let pageNumber: number | null = normalized.includes("\f") ? 1 : null;

  rawLines.forEach((rawLine, idx) => {
    if (rawLine.includes("\f")) {
      pageNumber = (pageNumber ?? 0) + 1;
    }

    const stripped = rawLine.replace(/\f/g, "").trim();

    if (stripped.length > 0 && PAGE_BREAK_PATTERN.test(stripped)) {
      pageNumber = (pageNumber ?? 0) + 1;
      return;
    }

    lines.push({
      raw: rawLine,
      text: stripped,
      index: idx + 1,
      page: pageNumber
    });
  });

  return lines;
}

function readSectionYear(text: string): number | null {
  const match = SECTION_HEADER_YEAR.exec(text);
  if (!match) {
    return null;
  }
  const candidate = match[2] ?? match[3] ?? match[4];
  if (!candidate) {
    return null;
  }
  const year = Number.parseInt(candidate, 10);
  if (Number.isNaN(year)) {
    return null;
  }
  return year;
}

function parseDateRanges(text: string, sectionYear: number | null): ParsedDateRange[] {
  const ranges: ParsedDateRange[] = [];

  const fullRange = DATE_RANGE_FULL.exec(text);
  if (fullRange) {
    const [matched, startMonth, startDay, startYear, endMonth, endDay, endYear] =
      fullRange;
    const start = buildDate(startYear, startMonth, startDay);
    const end = buildDate(endYear, endMonth, endDay);
    ranges.push({ start, end: addOneDay(end), matchedText: matched });
    return ranges;
  }

  const crossMonth = DATE_RANGE_CROSS_MONTH.exec(text);
  if (crossMonth) {
    const [matched, startMonth, startDay, endMonth, endDay, year] = crossMonth;
    const start = buildDate(year, startMonth, startDay);
    const end = buildDate(year, endMonth, endDay);
    ranges.push({ start, end: addOneDay(end), matchedText: matched });
    return ranges;
  }

  const sameMonth = DATE_RANGE_SAME_MONTH.exec(text);
  if (sameMonth) {
    const [matched, month, startDay, endDay, year] = sameMonth;
    const start = buildDate(year, month, startDay);
    const end = buildDate(year, month, endDay);
    ranges.push({ start, end: addOneDay(end), matchedText: matched });
    return ranges;
  }

  const single = DATE_SINGLE_FULL.exec(text);
  if (single) {
    const [matched, month, day, year] = single;
    const start = buildDate(year, month, day);
    ranges.push({ start, end: addOneDay(start), matchedText: matched });
    return ranges;
  }

  const numeric = DATE_NUMERIC_SHORT.exec(text);
  if (numeric) {
    const [matched, monthRaw, dayRaw, yearRaw] = numeric;
    const yearValue = yearRaw
      ? normalizeShortYear(Number.parseInt(yearRaw, 10))
      : sectionYear;
    if (yearValue === null) {
      return ranges;
    }
    const start = buildDateFromNumbers(
      yearValue,
      Number.parseInt(monthRaw, 10),
      Number.parseInt(dayRaw, 10)
    );
    ranges.push({ start, end: addOneDay(start), matchedText: matched });
  }

  return ranges;
}

function buildDate(yearRaw: string, monthRaw: string, dayRaw: string): Date {
  const monthIndex = MONTH_INDEX_BY_NAME.get(monthRaw.toLowerCase());
  if (monthIndex === undefined) {
    throw new Error(`Unknown month "${monthRaw}"`);
  }
  return buildDateFromNumbers(
    Number.parseInt(yearRaw, 10),
    monthIndex + 1,
    Number.parseInt(dayRaw, 10)
  );
}

function buildDateFromNumbers(year: number, month1Based: number, day: number): Date {
  const iso = `${year}-${String(month1Based).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const reference = new Date(Date.UTC(year, month1Based - 1, day));
  const parsed = parseDate(iso, "yyyy-MM-dd", reference);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month1Based - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`Invalid date components ${iso}`);
  }
  return new Date(Date.UTC(year, month1Based - 1, day));
}

function addOneDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function normalizeShortYear(year: number): number {
  if (year < 100) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }
  return year;
}

type BuildCandidateInput = {
  line: LineContext;
  range: ParsedDateRange;
  options: PdfTextExtractionOptions;
};

function buildCandidate(input: BuildCandidateInput): EventCandidate | null {
  const { line, range, options } = input;

  const cleanedTitle = cleanTitle(line.text, range.matchedText);
  if (!cleanedTitle) {
    return null;
  }

  const { category, confidence } = classify(options.calendarType, cleanedTitle);
  const evidenceText = truncate(line.raw.trim().length > 0 ? line.raw.trim() : line.text);
  const evidenceLocator =
    line.page !== null ? `page:${line.page}:line:${line.index}` : `line:${line.index}`;

  return eventCandidateInputSchema.parse({
    calendarId: options.calendarId,
    calendarSourceId: options.calendarSourceId,
    rawTitle: cleanedTitle,
    category,
    startAt: range.start,
    endAt: range.end,
    allDay: true,
    timezone: options.defaultTimezone,
    confidence,
    evidenceText,
    evidenceLocator
  });
}

function cleanTitle(line: string, matchedText: string): string {
  let working = line.replace(matchedText, " ");
  working = working.replace(/\.{2,}/g, " ");
  working = working.replace(/\s*\([^)]*\)\s*$/, " ");
  working = working.replace(/[\s ]+/g, " ").trim();
  working = working.replace(/^[-–:,\s]+|[-–:,\s]+$/g, "").trim();
  working = working.replace(/^[MTWFS]\s+/, "").trim();
  working = working.replace(/\s+[HSMX]$/, "").trim();
  if (working.length > 250) {
    working = working.slice(0, 250).trim();
  }
  return working;
}

function classify(
  calendarType: CalendarType,
  title: string
): { category: EventCategory; confidence: number } {
  const normalized = title.toLowerCase();

  if (ACTIVITY_CALENDAR_TYPES.has(calendarType)) {
    return { category: EventCategory.ACTIVITY_BUSY, confidence: 0.7 };
  }

  if (BREAK_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { category: EventCategory.BREAK, confidence: 0.7 };
  }

  if (EXAM_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { category: EventCategory.EXAM_PERIOD, confidence: 0.65 };
  }

  if (CLASS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return { category: EventCategory.CLASS_IN_SESSION, confidence: 0.65 };
  }

  return { category: EventCategory.UNKNOWN, confidence: 0.4 };
}

function truncate(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= EVIDENCE_TEXT_LIMIT) {
    return trimmed;
  }
  return `${trimmed.slice(0, EVIDENCE_TEXT_LIMIT - 1)}…`;
}
