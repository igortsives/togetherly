import { JSDOM } from "jsdom";
import { CalendarType, EventCategory } from "@prisma/client";
import {
  eventCandidateInputSchema,
  type EventCandidate
} from "@/lib/domain/schemas";

export type HtmlExtractionOptions = {
  calendarId: string;
  calendarSourceId: string;
  calendarType: CalendarType;
  defaultTimezone: string;
  defaultYear?: number;
};

export type HtmlExtractionError = {
  evidenceText: string;
  evidenceLocator: string | null;
  reason: string;
};

export type HtmlExtractionResult = {
  candidates: EventCandidate[];
  errors: HtmlExtractionError[];
};

type ParsedRange = {
  startAt: Date;
  endAt: Date;
};

type ClassifyResult = {
  category: EventCategory;
  confidence: number;
};

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

const DAY_NAME_PATTERN =
  /\b(?:mon|tue|tues|wed|wedn|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday|rsday|nday)?\b/gi;

const MULTI_DAY_NAME_PREFIX_PATTERN =
  /^(?:mon|tue|tues|wed|wedn|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday|rsday|nday)?(?:\s*[-–—\/]\s*(?:mon|tue|tues|wed|wedn|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday|rsday|nday)?)*\s*,?\s*/i;

const RANGE_SEPARATOR = /\s*[–—-]\s*/;
const EVIDENCE_TEXT_LIMIT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ACADEMIC_YEAR_PATTERN = /\b(20\d{2})\s*[-–—/]\s*(?:20)?(\d{2})\b/;
const SINGLE_YEAR_PATTERN = /\b(20\d{2})\b/;

const BREAK_KEYWORDS = [
  "break",
  "vacation",
  "holiday",
  "no school",
  "no classes",
  "school closed",
  "recess",
  "winter break",
  "spring break",
  "fall break",
  "thanksgiving"
];

const EXAM_KEYWORDS = ["final", "exam", "midterm"];

const CLASS_KEYWORDS = [
  "instruction begins",
  "instruction ends",
  "classes begin",
  "classes end",
  "term begins",
  "term ends",
  "quarter begins",
  "quarter ends",
  "semester begins",
  "semester ends",
  "first day",
  "last day",
  "session begins",
  "session ends",
  "session a",
  "session c",
  "session i",
  "session ii",
  "maymester",
  "summer session"
];

export function extractHtmlEvents(
  htmlText: string,
  options: HtmlExtractionOptions
): HtmlExtractionResult {
  const dom = new JSDOM(htmlText);
  const document = dom.window.document;

  const candidates: EventCandidate[] = [];
  const errors: HtmlExtractionError[] = [];
  const seen = new Set<string>();
  const inferredYear =
    options.defaultYear ?? inferDefaultYear(document) ?? new Date().getFullYear();

  for (const table of Array.from(document.querySelectorAll("table"))) {
    collectFromTable(table, options, inferredYear, candidates, errors, seen);
  }

  for (const dl of Array.from(document.querySelectorAll("dl"))) {
    collectFromDefinitionList(dl, options, inferredYear, candidates, errors, seen);
  }

  for (const list of Array.from(document.querySelectorAll("ul, ol"))) {
    collectFromList(list, options, inferredYear, candidates, errors, seen);
  }

  return { candidates, errors };
}

function inferDefaultYear(document: Document): number | null {
  const headings = Array.from(
    document.querySelectorAll("h1, h2, h3, title")
  ) as Element[];

  for (const heading of headings) {
    const text = heading.textContent ?? "";
    const academic = text.match(ACADEMIC_YEAR_PATTERN);
    if (academic) {
      return Number.parseInt(academic[1], 10);
    }
    const single = text.match(SINGLE_YEAR_PATTERN);
    if (single) {
      return Number.parseInt(single[1], 10);
    }
  }

  return null;
}

function collectFromTable(
  table: Element,
  options: HtmlExtractionOptions,
  fallbackYear: number,
  candidates: EventCandidate[],
  errors: HtmlExtractionError[],
  seen: Set<string>
) {
  const headerCells = Array.from(
    table.querySelectorAll("thead th, thead td, tr:first-child th")
  ) as Element[];

  if (headerCells.length < 2) {
    return;
  }

  const headerTexts = headerCells.map((cell) =>
    (cell.textContent ?? "").trim().toLowerCase()
  );

  const dateColumns = headerTexts
    .map((text, index) => ({ text, index }))
    .filter(({ text }) =>
      /\b(date|start|begins?|end|ends?|when|from|to|through|day)\b/.test(text)
    );

  if (dateColumns.length === 0) {
    return;
  }

  const labelIndex = headerTexts.findIndex(
    (text, index) =>
      !dateColumns.some((column) => column.index === index) &&
      /(event|description|name|period|quarter|semester|term|item|holiday|activity)/.test(
        text
      )
  );

  const resolvedLabelIndex =
    labelIndex >= 0
      ? labelIndex
      : headerTexts.findIndex(
          (_, index) => !dateColumns.some((column) => column.index === index)
        );

  if (resolvedLabelIndex < 0) {
    return;
  }

  const sectionYear = sectionYearFor(table, fallbackYear);
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  const rows =
    bodyRows.length > 0
      ? bodyRows
      : Array.from(table.querySelectorAll("tr")).slice(1);

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length === 0) {
      return;
    }

    const labelCell = cells[resolvedLabelIndex];
    if (!labelCell) {
      return;
    }
    const title = cleanText(labelCell.textContent ?? "");
    if (!title) {
      return;
    }

    if (dateColumns.length === 1) {
      const dateCell = cells[dateColumns[0].index];
      if (!dateCell) {
        return;
      }
      const dateText = cleanText(dateCell.textContent ?? "");
      const locator = buildTableLocator(table, rowIndex);
      pushCandidate({
        title,
        rawDateText: dateText,
        sectionYear,
        evidenceLocator: locator,
        evidenceText: `${title} — ${dateText}`,
        options,
        candidates,
        errors,
        seen
      });
    } else if (dateColumns.length >= 2) {
      const startCell = cells[dateColumns[0].index];
      const endCell = cells[dateColumns[1].index];
      if (!startCell || !endCell) {
        return;
      }
      const startText = cleanText(startCell.textContent ?? "");
      const endText = cleanText(endCell.textContent ?? "");
      const locator = buildTableLocator(table, rowIndex);
      pushCandidate({
        title,
        rawDateText: `${startText} - ${endText}`,
        sectionYear,
        evidenceLocator: locator,
        evidenceText: `${title} — ${startText} → ${endText}`,
        options,
        candidates,
        errors,
        seen
      });
    }
  });
}

function collectFromDefinitionList(
  dl: Element,
  options: HtmlExtractionOptions,
  fallbackYear: number,
  candidates: EventCandidate[],
  errors: HtmlExtractionError[],
  seen: Set<string>
) {
  const children = Array.from(dl.children) as Element[];
  const sectionYear = sectionYearFor(dl, fallbackYear);

  let currentTitle: string | null = null;
  let currentLocator: string | null = null;

  children.forEach((child, index) => {
    const tag = child.tagName.toLowerCase();
    if (tag === "dt") {
      currentTitle = cleanText(child.textContent ?? "");
      currentLocator = `dl > dt:nth-child(${index + 1})`;
      return;
    }

    if (tag === "dd" && currentTitle) {
      const dateText = cleanText(child.textContent ?? "");
      pushCandidate({
        title: currentTitle,
        rawDateText: dateText,
        sectionYear,
        evidenceLocator: currentLocator,
        evidenceText: `${currentTitle} — ${dateText}`,
        options,
        candidates,
        errors,
        seen
      });
      currentTitle = null;
      currentLocator = null;
    }
  });
}

function collectFromList(
  list: Element,
  options: HtmlExtractionOptions,
  fallbackYear: number,
  candidates: EventCandidate[],
  errors: HtmlExtractionError[],
  seen: Set<string>
) {
  const items = Array.from(list.children).filter(
    (child) => child.tagName.toLowerCase() === "li"
  ) as Element[];

  if (items.length === 0) {
    return;
  }

  const sectionYear = sectionYearFor(list, fallbackYear);
  const tag = list.tagName.toLowerCase();

  items.forEach((item, index) => {
    const rawText = cleanText(item.textContent ?? "");
    if (!rawText) {
      return;
    }

    const parsed = splitListItem(item, rawText);
    if (!parsed) {
      return;
    }

    const locator = `${tag} > li:nth-child(${index + 1})`;
    pushCandidate({
      title: parsed.title,
      rawDateText: parsed.dateText,
      sectionYear,
      evidenceLocator: locator,
      evidenceText: rawText,
      options,
      candidates,
      errors,
      seen
    });
  });
}

type PushArgs = {
  title: string;
  rawDateText: string;
  sectionYear: number;
  evidenceLocator: string | null;
  evidenceText: string;
  options: HtmlExtractionOptions;
  candidates: EventCandidate[];
  errors: HtmlExtractionError[];
  seen: Set<string>;
};

function pushCandidate(args: PushArgs) {
  const {
    title,
    rawDateText,
    sectionYear,
    evidenceLocator,
    evidenceText,
    options,
    candidates,
    errors,
    seen
  } = args;

  if (!title || !rawDateText) {
    return;
  }

  let range: ParsedRange;
  try {
    range = parseDateRange(rawDateText, sectionYear);
  } catch (error) {
    errors.push({
      evidenceText,
      evidenceLocator,
      reason: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  const dedupeKey = `${title}::${range.startAt.toISOString()}::${range.endAt.toISOString()}`;
  if (seen.has(dedupeKey)) {
    return;
  }
  seen.add(dedupeKey);

  const { category, confidence } = classifyTitle(title);

  try {
    const candidate = eventCandidateInputSchema.parse({
      calendarId: options.calendarId,
      calendarSourceId: options.calendarSourceId,
      rawTitle: title.length > 250 ? title.slice(0, 250) : title,
      category,
      startAt: range.startAt,
      endAt: range.endAt,
      allDay: true,
      timezone: options.defaultTimezone,
      confidence,
      evidenceText: clampEvidence(evidenceText),
      evidenceLocator: evidenceLocator ?? undefined
    });
    candidates.push(candidate);
  } catch (error) {
    errors.push({
      evidenceText,
      evidenceLocator,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

function splitListItem(
  item: Element,
  rawText: string
): { title: string; dateText: string } | null {
  const strong = item.querySelector("strong, b");
  if (strong) {
    const dateText = cleanText(strong.textContent ?? "");
    const titleText = cleanText(
      rawText.replace(dateText, "").replace(/^[\s—–\-:.,]+/, "")
    );
    if (dateText && titleText) {
      return { title: titleText, dateText };
    }
  }

  const separator = rawText.match(/\s[—–-]\s/);
  if (separator && typeof separator.index === "number") {
    const left = cleanText(rawText.slice(0, separator.index));
    const right = cleanText(rawText.slice(separator.index + separator[0].length));
    if (left && right) {
      if (hasDateTokens(left) && !hasDateTokens(right)) {
        return { title: right, dateText: left };
      }
      if (!hasDateTokens(left) && hasDateTokens(right)) {
        return { title: left, dateText: right };
      }
    }
  }

  return null;
}

function hasDateTokens(text: string): boolean {
  const lower = text.toLowerCase();
  for (const month of Object.keys(MONTHS)) {
    if (lower.includes(month)) {
      return true;
    }
  }
  return /\b\d{1,2}\b/.test(text);
}

function parseDateRange(rawText: string, fallbackYear: number): ParsedRange {
  const normalized = rawText.replace(/ /g, " ").trim();
  if (!normalized) {
    throw new Error("Empty date text");
  }

  const collapsed = normalized
    .replace(/\b(?:from|on|through|to)\b/gi, "-")
    .replace(/\s+/g, " ")
    .trim();

  const trimmed = collapsed.replace(MULTI_DAY_NAME_PREFIX_PATTERN, "").trim();
  const cleaned = trimmed.replace(DAY_NAME_PATTERN, "").trim();
  const tidy = cleaned.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();

  const segments = splitRange(tidy);

  if (segments.length === 1) {
    const hint = parseDateTokens(segments[0]);
    const date = finalizeDate(hint, { month: null, day: null, year: null }, fallbackYear, "right");
    return { startAt: utcDate(date), endAt: utcDate(addOneDay(date)) };
  }

  const [leftRaw, rightRaw] = segments;
  const leftHint = parseDateTokens(leftRaw);
  const rightHint = parseDateTokens(rightRaw);

  const right = finalizeDate(rightHint, leftHint, fallbackYear, "right");
  const left = finalizeDate(leftHint, right, fallbackYear, "left");

  if (left.year > right.year || (left.year === right.year && compareMD(left, right) > 0)) {
    throw new Error(`Date range out of order: ${rawText}`);
  }

  return {
    startAt: utcDate(left),
    endAt: utcDate(addOneDay(right))
  };
}

type DateHint = {
  month: number | null;
  day: number | null;
  year: number | null;
};

function parseDateTokens(raw: string): DateHint {
  const text = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const tokens = text.split(" ").filter(Boolean);

  let month: number | null = null;
  let day: number | null = null;
  let year: number | null = null;

  for (const token of tokens) {
    if (month === null) {
      const candidate = monthFromToken(token);
      if (candidate !== null) {
        month = candidate;
        continue;
      }
    }
    const numeric = Number.parseInt(token, 10);
    if (Number.isFinite(numeric)) {
      if (numeric >= 1000) {
        year = numeric;
      } else if (day === null) {
        day = numeric;
      }
    }
  }

  return { month, day, year };
}

function finalizeDate(
  primary: DateHint,
  fallbackHint: DateHint | ParsedDate,
  fallbackYear: number,
  side: "left" | "right"
): ParsedDate {
  let month = primary.month;
  const day = primary.day;
  let year = primary.year;

  if (month === null) {
    month = "month" in fallbackHint ? fallbackHint.month : null;
  }
  if (year === null) {
    year = "year" in fallbackHint ? fallbackHint.year : null;
  }

  if (month === null || day === null) {
    throw new Error(
      `Could not parse ${side} date segment with month=${month} day=${day}`
    );
  }

  if (year === null) {
    year = fallbackYear;
  }

  if (
    side === "left" &&
    "year" in fallbackHint &&
    typeof fallbackHint.year === "number" &&
    month > fallbackHint.month! &&
    year === fallbackHint.year
  ) {
    year = fallbackHint.year - 1;
  }

  return { year, month, day };
}

function splitRange(text: string): string[] {
  const parts = text.split(RANGE_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) {
    return parts;
  }
  if (parts.length === 2) {
    return parts;
  }

  if (parts.length >= 3) {
    const month = monthFromToken(parts[0].split(" ")[0]);
    const dayLeft = Number.parseInt(parts[1], 10);
    if (month !== null && Number.isFinite(dayLeft)) {
      return [`${capitalize(parts[0].split(" ")[0])} ${dayLeft}`, parts.slice(2).join(" ")];
    }
  }

  return [parts[0], parts.slice(1).join(" ")];
}

type ParsedDate = { year: number; month: number; day: number };

function monthFromToken(token: string): number | null {
  const key = token.replace(/[^a-z]/gi, "").toLowerCase();
  if (!key) {
    return null;
  }
  return key in MONTHS ? MONTHS[key] : null;
}

function compareMD(a: ParsedDate, b: ParsedDate): number {
  if (a.month !== b.month) {
    return a.month - b.month;
  }
  return a.day - b.day;
}

function addOneDay(date: ParsedDate): ParsedDate {
  const next = new Date(Date.UTC(date.year, date.month, date.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth(),
    day: next.getUTCDate()
  };
}

function utcDate(date: ParsedDate): Date {
  return new Date(Date.UTC(date.year, date.month, date.day));
}

function sectionYearFor(element: Element, fallback: number): number {
  let current: Element | null = element;
  while (current) {
    let sibling: Element | null = current.previousElementSibling;
    while (sibling) {
      const text = sibling.textContent ?? "";
      const academic = text.match(ACADEMIC_YEAR_PATTERN);
      if (academic) {
        return Number.parseInt(academic[1], 10);
      }
      const single = text.match(SINGLE_YEAR_PATTERN);
      if (single) {
        return Number.parseInt(single[1], 10);
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return fallback;
}

function classifyTitle(title: string): ClassifyResult {
  const lower = title.toLowerCase();

  for (const keyword of CLASS_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { category: EventCategory.CLASS_IN_SESSION, confidence: 0.65 };
    }
  }

  for (const keyword of EXAM_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { category: EventCategory.EXAM_PERIOD, confidence: 0.65 };
    }
  }

  for (const keyword of BREAK_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { category: EventCategory.BREAK, confidence: 0.7 };
    }
  }

  return { category: EventCategory.UNKNOWN, confidence: 0.4 };
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clampEvidence(text: string): string {
  if (text.length <= EVIDENCE_TEXT_LIMIT) {
    return text;
  }
  return `${text.slice(0, EVIDENCE_TEXT_LIMIT - 1)}…`;
}

function buildTableLocator(table: Element, rowIndex: number): string {
  const className = table.getAttribute("class");
  const id = table.getAttribute("id");
  const prefix = id ? `table#${id}` : className ? `table.${className.split(/\s+/)[0]}` : "table";
  return `${prefix} > tbody > tr:nth-child(${rowIndex + 1})`;
}

function capitalize(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export const __testing__ = {
  parseDateRange,
  classifyTitle,
  DAY_MS
};
