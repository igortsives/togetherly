import { EventCategory } from "@prisma/client";
import {
  eventCandidateInputSchema,
  type EventCandidate
} from "@/lib/domain/schemas";

/**
 * Issue #131: synonym-based academic boundary-pair recognizer.
 *
 * The recognizer composes phrases from three slots — begin/end verbs,
 * academic-unit nouns, and noun-phrase forms — so it works across
 * institutions without per-school code:
 *
 *   - Quarter systems (UCLA, Stanford):  Fall Quarter Begins / Ends
 *   - Semester systems (Vanderbilt):     Fall Semester Begins / Ends
 *   - K-12 districts:                    First Day of School / Last Day of School
 *   - Trimester / independent schools:   Winter Term Begins / Winter Term Ends
 *
 * See `docs/PARSING_STRATEGY.md#boundary-pair-inference-ext-009` for the
 * canonical slot list.
 *
 * The pass takes the existing single-day candidate set and emits
 * ADDITIONAL synthesized interval candidates with category
 * `CLASS_IN_SESSION` (for term/quarter/semester pairs) or `EXAM_PERIOD`
 * (for finals/midterms/reading-days pairs). Original boundary markers
 * are NOT removed — the parent still sees them in the review queue.
 */

const CLASS_UNIT_PATTERN =
  "(?:quarter|semester|trimester|term|module|session|school\\s+year|academic\\s+year|school|instruction|classes|sessions|modules|terms|trimesters|semesters|quarters)";

const EXAM_UNIT_PATTERN =
  "(?:final\\s+examinations?|finals(?:\\s+week)?|final\\s+exams?|midterm\\s+examinations?|midterms(?:\\s+week)?|reading\\s+days?|reading\\s+period|study\\s+days?)";

// Excludes "resumes" intentionally — single-day "School Resumes" markers
// would otherwise create runaway pairings.
const BEGIN_VERB_PATTERN = "(?:begins?|starts?|opens?|commences?)";
const END_VERB_PATTERN = "(?:ends?|concludes?|closes?|finishes?)";

type BoundaryKind = "class" | "exam";
type BoundarySide = "begin" | "end";

export type BoundaryMatch = {
  kind: BoundaryKind;
  side: BoundarySide;
};

export type AcademicCalendarSystem =
  | "quarter"
  | "semester"
  | "trimester"
  | "term"
  | "k12"
  | "module"
  | "session"
  | "unknown";

const CLASS_PATTERNS: { side: BoundarySide; re: RegExp }[] = [
  // "Fall Quarter Begins", "Quarter Begins", "Instruction Begins"
  {
    side: "begin",
    re: new RegExp(`(?:^|\\s)${CLASS_UNIT_PATTERN}\\s+${BEGIN_VERB_PATTERN}\\b`, "i")
  },
  // "Fall Quarter Ends", "Instruction Ends"
  {
    side: "end",
    re: new RegExp(`(?:^|\\s)${CLASS_UNIT_PATTERN}\\s+${END_VERB_PATTERN}\\b`, "i")
  },
  // "First Day of Classes", "First Day of School", "First Day of Term"
  {
    side: "begin",
    re: new RegExp(
      `\\bfirst\\s+day\\s+of\\s+(?:the\\s+)?(?:\\S+\\s+)?${CLASS_UNIT_PATTERN}\\b`,
      "i"
    )
  },
  // "Last Day of Classes", "Last Day of School"
  {
    side: "end",
    re: new RegExp(
      `\\blast\\s+day\\s+of\\s+(?:the\\s+)?(?:\\S+\\s+)?${CLASS_UNIT_PATTERN}\\b`,
      "i"
    )
  },
  // "Beginning of Term", "Beginning of Fall Quarter"
  {
    side: "begin",
    re: new RegExp(
      `\\bbeginning\\s+of\\s+(?:the\\s+)?(?:\\S+\\s+)?${CLASS_UNIT_PATTERN}\\b`,
      "i"
    )
  },
  // "End of Quarter", "End of Fall Term"
  {
    side: "end",
    re: new RegExp(
      `\\bend\\s+of\\s+(?:the\\s+)?(?:\\S+\\s+)?${CLASS_UNIT_PATTERN}\\b`,
      "i"
    )
  }
];

const EXAM_PATTERNS: { side: BoundarySide; re: RegExp }[] = [
  // "Final Examinations Begin", "Finals Week Starts"
  {
    side: "begin",
    re: new RegExp(`${EXAM_UNIT_PATTERN}\\s+${BEGIN_VERB_PATTERN}\\b`, "i")
  },
  // "Final Examinations End", "Finals Week Ends"
  {
    side: "end",
    re: new RegExp(`${EXAM_UNIT_PATTERN}\\s+${END_VERB_PATTERN}\\b`, "i")
  },
  // "End of Final Examinations", "End of Finals Week"
  {
    side: "end",
    re: new RegExp(`end\\s+of\\s+${EXAM_UNIT_PATTERN}\\b`, "i")
  },
  // "Beginning of Final Examinations"
  {
    side: "begin",
    re: new RegExp(`beginning\\s+of\\s+${EXAM_UNIT_PATTERN}\\b`, "i")
  }
];

export function matchBoundary(title: string): BoundaryMatch | null {
  const normalized = title.trim();
  if (!normalized) return null;

  // Exam patterns first — "Final Examinations Begin" should be classified
  // as exam, not as a class-in-session begin.
  for (const { side, re } of EXAM_PATTERNS) {
    if (re.test(normalized)) return { kind: "exam", side };
  }
  for (const { side, re } of CLASS_PATTERNS) {
    if (re.test(normalized)) return { kind: "class", side };
  }
  return null;
}

type MarkedCandidate = {
  candidate: EventCandidate;
  boundary: BoundaryMatch;
};

type SynthesizeOptions = {
  /** A begin marker without an end within this many days is discarded
   * by the recognizer (LLM post-pass is the fallback). Default 365 —
   * covers a full K-12 academic year (Aug-Jun is ~10 months) while
   * still rejecting nonsensical multi-year pairings. */
  maxPairGapDays?: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Run the boundary-pair pass on a candidate list. Returns ONLY the
 * newly synthesized interval candidates — callers should concatenate
 * them with the original list.
 *
 * Pairing rule: each begin marker pairs with the next chronological
 * end marker of the same kind (class / exam) within `maxPairGapDays`.
 * Once paired, the end marker is removed from the pool. A begin
 * marker without a matching end is silently dropped (#131 acceptance
 * criterion — single-day fallbacks are the LLM pass's job).
 */
export function synthesizeBoundaryIntervals(
  candidates: EventCandidate[],
  options: SynthesizeOptions = {}
): EventCandidate[] {
  const maxGapMs = (options.maxPairGapDays ?? 365) * MS_PER_DAY;

  const marked: MarkedCandidate[] = [];
  for (const candidate of candidates) {
    const boundary = matchBoundary(candidate.rawTitle);
    if (boundary) marked.push({ candidate, boundary });
  }

  if (marked.length < 2) return [];

  // Sort by start time so chronology-based pairing is straightforward.
  marked.sort(
    (a, b) => a.candidate.startAt.getTime() - b.candidate.startAt.getTime()
  );

  // Split into begin / end pools per kind. Use mutable arrays so we
  // can remove an end marker once it's been paired.
  const beginByKind: Record<BoundaryKind, MarkedCandidate[]> = {
    class: [],
    exam: []
  };
  const endByKind: Record<BoundaryKind, MarkedCandidate[]> = {
    class: [],
    exam: []
  };
  for (const m of marked) {
    (m.boundary.side === "begin" ? beginByKind : endByKind)[m.boundary.kind].push(m);
  }

  const synthesized: EventCandidate[] = [];

  for (const kind of ["class", "exam"] as const) {
    const begins = beginByKind[kind];
    const ends = endByKind[kind];
    const usedEnds = new Set<number>();

    for (const begin of begins) {
      // Find earliest end after this begin's startAt, within the gap.
      let pairIndex = -1;
      for (let i = 0; i < ends.length; i++) {
        if (usedEnds.has(i)) continue;
        const end = ends[i];
        if (end.candidate.startAt < begin.candidate.startAt) continue;
        const gap =
          end.candidate.endAt.getTime() - begin.candidate.startAt.getTime();
        if (gap > maxGapMs) continue;
        pairIndex = i;
        break;
      }
      if (pairIndex === -1) continue;
      const end = ends[pairIndex];
      usedEnds.add(pairIndex);

      synthesized.push(buildSynthesized(begin, end, kind));
    }
  }

  return synthesized;
}

function buildSynthesized(
  begin: MarkedCandidate,
  end: MarkedCandidate,
  kind: BoundaryKind
): EventCandidate {
  const category =
    kind === "class" ? EventCategory.CLASS_IN_SESSION : EventCategory.EXAM_PERIOD;

  // Synthesized intervals inherit min(beginConf, endConf) capped at
  // 0.85 — they never bulk-confirm. See PARSING_STRATEGY §
  // "Confidence and conflict handling".
  const beginConf =
    typeof begin.candidate.confidence === "number"
      ? begin.candidate.confidence
      : 0.6;
  const endConf =
    typeof end.candidate.confidence === "number" ? end.candidate.confidence : 0.6;
  const confidence = Math.min(beginConf, endConf, 0.85);

  const title =
    kind === "class"
      ? synthesizeClassTitle(begin.candidate.rawTitle, end.candidate.rawTitle)
      : synthesizeExamTitle(begin.candidate.rawTitle, end.candidate.rawTitle);

  const evidenceText = `Inferred from boundary pair: "${begin.candidate.rawTitle}" (${begin.candidate.startAt
    .toISOString()
    .slice(0, 10)}) → "${end.candidate.rawTitle}" (${end.candidate.endAt
    .toISOString()
    .slice(0, 10)})`;

  const evidenceLocator =
    begin.candidate.evidenceLocator && end.candidate.evidenceLocator
      ? `${begin.candidate.evidenceLocator}+${end.candidate.evidenceLocator}`
      : begin.candidate.evidenceLocator ??
        end.candidate.evidenceLocator ??
        undefined;

  return eventCandidateInputSchema.parse({
    calendarId: begin.candidate.calendarId,
    calendarSourceId: begin.candidate.calendarSourceId,
    rawTitle: title,
    category,
    startAt: begin.candidate.startAt,
    endAt: end.candidate.endAt,
    allDay: true,
    timezone: begin.candidate.timezone,
    confidence,
    evidenceText,
    evidenceLocator
  });
}

function synthesizeClassTitle(beginTitle: string, endTitle: string): string {
  // Try to find a common qualifier (e.g. "Fall", "Winter") so the
  // synthesized title reads "Fall Term in Session" rather than the
  // generic "Term in Session". Falls back to the begin marker if no
  // shared prefix is detected.
  const qualifier = sharedQualifier(beginTitle, endTitle);
  if (qualifier) return `${qualifier} term in session`;
  return "Term in session";
}

function synthesizeExamTitle(beginTitle: string, endTitle: string): string {
  const qualifier = sharedQualifier(beginTitle, endTitle);
  if (qualifier) return `${qualifier} exam period`;
  return "Exam period";
}

function sharedQualifier(begin: string, end: string): string | null {
  const SEASONS = ["fall", "autumn", "winter", "spring", "summer"];
  const beginLower = begin.toLowerCase();
  const endLower = end.toLowerCase();
  for (const season of SEASONS) {
    if (beginLower.includes(season) && endLower.includes(season)) {
      return season.charAt(0).toUpperCase() + season.slice(1);
    }
  }
  return null;
}
