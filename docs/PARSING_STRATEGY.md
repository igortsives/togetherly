# Parsing Strategy

## Strategy

Two extraction families, deliberately disjoint:

1. **Provider APIs (ICS, Google Calendar, Outlook Graph)** — structured-data sources extracted via their native APIs. No LLM required, no LLM used. ICS / Google / Outlook ingest paths are unaffected by Anthropic availability.
2. **LLM-only extraction for HTML and PDF** — Claude Sonnet (via `@anthropic-ai/sdk`) is the **single** extractor for unstructured text sources. Heuristic regex/keyword extractors were deleted on 2026-05-17 (see [`DECISIONS.md`](./DECISIONS.md#2026-05-17--remove-heuristic-htmlpdf-extractors-llm-is-the-only-path)). Output is structured-output Zod-validated. If `ANTHROPIC_API_KEY` is unset, HTML / PDF ingest fails fast with `HtmlExtractionUnavailableError` / `PdfExtractionUnavailableError`; the dashboard's refresh-failure pill surfaces it.

After the extractor returns candidates:

3. **Boundary-pair inference** — recognize `Quarter/Semester/Term Begins/Ends`, `First/Last Day of Classes`, `Final Examinations Begin/End` markers and synthesize `class_in_session` / `exam_period` interval candidates between them (EXT-009, Round 16). Runs on whichever extractor produced the candidates; the recognizer is agnostic to the path.
4. **Per-source ingest-window floor** — if `CalendarSource.ingestWindowStart` is set, [`lib/sources/ingest-window.ts`](../lib/sources/ingest-window.ts)'s `applyIngestWindow` drops candidates whose `startAt` is strictly before the floor (PR #161, closes [#150](https://github.com/igortsives/togetherly/issues/150)). Applied AFTER boundary synthesis so synthesized intervals are also filtered. Wired into all five ingest modules (ICS / HTML / PDF / Google / Outlook).
5. **Schema validation** for all extracted events (Zod). The canonical shape is `eventCandidateInputSchema` in `lib/domain/schemas.ts`. Every extractor must produce rows that satisfy it; output that fails validation is rejected, never persisted.
6. **Parent review** before extracted events affect recommendations.

## Source Pipeline

```mermaid
flowchart TD
  Input["URL / PDF / ICS / Google / Outlook"] --> Fetch["Fetch or receive source"]
  Fetch --> Classify["Classify format"]
  Classify --> ICS["ICS parser (ical.js)"]
  Classify --> Provider["Provider API mapper (Google/Outlook)"]
  Classify --> HTMLText["HTML body (raw text)"]
  Classify --> PDFText["PDF body (pdf-parse → text)"]
  HTMLText --> LLM["LLM extractor (Claude Sonnet)"]
  PDFText --> LLM
  ICS --> Schema["Canonical schema validation (Zod)"]
  Provider --> Schema
  LLM --> Schema
  Schema --> Boundary["Boundary-pair recognizer (post-pass)"]
  Boundary --> Floor["Ingest-window floor (per-source, optional)"]
  Floor --> Review["Parent review queue"]
```

## Parser Types

| Parser | Status | Implementation |
|---|---|---|
| ICS parser | ✅ Shipped (#5, PR #22) | [`lib/sources/extractors/ics.ts`](../lib/sources/extractors/ics.ts) via `ical.js`. Expands RRULE recurrence, handles DST, anchors all-day events at UTC midnight. |
| Google Calendar mapper | ✅ Shipped (#13, PR #33) | [`lib/sources/google-ingest.ts`](../lib/sources/google-ingest.ts) + [`google.ts`](../lib/sources/google.ts). Uses `singleEvents=true` so the API expands recurrence server-side. |
| Outlook Calendar mapper | ✅ Shipped (#18, PR #34) | [`lib/sources/microsoft-ingest.ts`](../lib/sources/microsoft-ingest.ts) + [`microsoft.ts`](../lib/sources/microsoft.ts) using Microsoft Graph `calendarView` with `Prefer: outlook.timezone="UTC"`. |
| HTML extractor | ✅ LLM-only (Round 17 + 2026-05-17 deprecation) | [`lib/sources/extractors/llm.ts`](../lib/sources/extractors/llm.ts) + [`lib/llm/anthropic.ts`](../lib/llm/anthropic.ts). Heuristic `extractHtmlEvents` deleted on 2026-05-17. PDF text reads through `pdf-parse` then through the same LLM extractor. |
| PDF extractor | ✅ LLM-only (Round 17 + 2026-05-17 deprecation) | Same as HTML — PDF source text is read via `pdf-parse` and sent through the LLM extractor. Heuristic `extractPdfTextEvents` deleted on 2026-05-17. |
| Boundary-pair recognizer | ✅ Shipped Round 16 (PR #140) | `lib/sources/extractors/boundary-pairs.ts` — pairs academic boundary keywords by chronology and synthesizes `CLASS_IN_SESSION` / `EXAM_PERIOD` candidates between them. Closes [#131](https://github.com/igortsives/togetherly/issues/131). |
| OCR parser | ⬜ Deferred (P2) | Out of scope for MVP per [`MVP_SPEC.md`](./MVP_SPEC.md#p2-scope). |

## Confidence Scoring

Confidence should combine:

- Date parse confidence.
- Event title confidence.
- Category confidence.
- Source format reliability.
- Parser reliability.
- Evidence quality.

Suggested bands:

| Confidence | Behavior |
|---:|---|
| 0.90-1.00 | High confidence; eligible for bulk confirmation |
| 0.70-0.89 | Normal review |
| 0.40-0.69 | Low-confidence review with warning |
| Below 0.40 | Do not recommend; ask user to enter manually |

## HTML / PDF Classification (LLM)

The LLM extractor returns a `category` from the `EventCategory` enum and a `confidence` (0-1) on every event. The system prompt at [`lib/sources/extractors/llm.ts`](../lib/sources/extractors/llm.ts) defines the contract:

- Category MUST be one of `SCHOOL_CLOSED` / `BREAK` / `CLASS_IN_SESSION` / `EXAM_PERIOD` / `ACTIVITY_BUSY` / `OPTIONAL` / `UNKNOWN`.
- Confidence 0.9+ when title clearly maps to a category and date is unambiguous; 0.6-0.9 when title is suggestive but ambiguous; <0.6 when guessing.
- Every event must trace to a verbatim `evidenceText` quote from the source.

ICS, Google, and Outlook ingest classify by calendar type instead (no LLM): activity-type calendars (SPORT/MUSIC/ACTIVITY/CAMP) get `ACTIVITY_BUSY` at ≥0.9; other types get `UNKNOWN` at 0.55. Those ingest paths don't depend on Anthropic availability.

## Boundary-Pair Inference (EXT-009)

The recognizer is **synonym-based, not literal-string-based**. Academic institutions use wildly different vocabulary — universities say "Quarter" or "Semester" or "Trimester" or "Term"; K-12 says "School" or "School Year"; some use "Instruction" or "Classes" or "Session" interchangeably. The recognizer composes phrases from three slots — a verb, an academic-unit noun, and an optional "Day of …" prefix — and pairs any matched begin-phrase with the next matched end-phrase chronologically within the same source.

### Slot 1: Begin verbs

`begins`, `starts`, `opens`, `commences`, plus the noun-phrase forms `First Day of …` and `Beginning of …`.

### Slot 2: End verbs

`ends`, `concludes`, `closes`, `finishes`, plus the noun-phrase forms `Last Day of …` and `End of …`.

### Slot 3: Academic-unit nouns

`Quarter`, `Semester`, `Trimester`, `Term`, `Module`, `Session`, `School Year`, `Academic Year`, `School`, `Instruction`, `Classes`. Singular or plural.

### Resulting interval

| Pair shape | Synthesized interval |
|---|---|
| `<unit> <begins>` ↔ `<unit> <ends>` (where unit is one of the academic-unit nouns) | `CLASS_IN_SESSION` (weekdaysOnly) |
| `First Day of <unit>` ↔ `Last Day of <unit>` | `CLASS_IN_SESSION` (weekdaysOnly) |
| Mix of the two (e.g. `Quarter Begins` ↔ `Last Day of Quarter`) | `CLASS_IN_SESSION` (weekdaysOnly) |
| Any `Final Examinations` / `Finals` / `Finals Week` / `Final Exams` begin ↔ matching end | `EXAM_PERIOD` |
| `Reading Days` / `Reading Period` / `Study Days` begin ↔ matching end | `EXAM_PERIOD` (lower confidence) |
| `Midterm Examinations` / `Midterms` / `Midterm Week` begin ↔ matching end | `EXAM_PERIOD` (lower confidence) |

### Examples this should match without per-school code

- UCLA (quarter system): `Fall Quarter Begins` ↔ `Fall Quarter Ends`; `Instruction Begins` ↔ `Instruction Ends`; `Final Examinations` ↔ `End of Final Examinations`.
- Vanderbilt (semester system): `Fall Semester Begins` ↔ `Fall Semester Ends`; `Classes Begin` ↔ `Classes End`.
- Stanford (quarter system): `Autumn Quarter Begins` ↔ `Autumn Quarter Ends`; `End-Quarter Period`.
- Most K-12 districts: `First Day of School` ↔ `Last Day of School`; `School Begins` ↔ `School Ends`.
- Independent schools / trimester systems: `Fall Trimester` ↔ `End of Fall Trimester`; `Winter Term Begins` ↔ `Winter Term Ends`.

### Markers that are NOT eligible for pairing

Single-day markers like `School Resumes`, `Classes Resume`, `Return from Break` MAY appear in the candidate set (the LLM categorizes them as `CLASS_IN_SESSION`) but are NOT paired by the recognizer — they have no natural counterpart and pairing them would generate runaway intervals that span the entire calendar. The recognizer also skips any begin/end candidate whose `confidence < 0.6`.

### Confidence and conflict handling

- A synthesized interval inherits the lower of its two boundary markers' confidences, capped at 0.85 (synthesized events never bulk-confirm — they always show in the review queue for parent inspection).
- If a source produces overlapping intervals (e.g., a malformed PDF lists two `Fall Quarter Begins` rows), the recognizer keeps the earliest begin paired with the latest end and records the conflict in the candidate's `evidenceText` for parent review.
- A begin marker without a matching end (within the same source, within 200 days) is NOT paired by the recognizer. The LLM is already the primary extractor for HTML/PDF; if a begin marker exists without an explicit end, the LLM has the opportunity to infer the implicit end up-front from the next term's start — handled in extraction rather than as a separate post-pass.

Pairing is chronological within a single `CalendarSource`. If a source contains only one marker (e.g., `Winter Quarter Begins` with no explicit end), the recognizer DOES NOT synthesize a half-open interval — the LLM extractor is responsible for inferring such bounds up-front since it is the primary HTML/PDF extractor. Boundary markers themselves remain in the candidate set so the parent can review them; the synthesized interval is an additional candidate with its own `evidenceLocator` pointing to both markers.

The `CLASS_IN_SESSION` carrier interval is consumed by `lib/matching/event-busy.ts` with a `weekdaysOnly` semantics — Sat/Sun inside an in-session range stay free (MAT-010).

## LLM Usage Rules (Round 17 onward)

- LLM features no-op gracefully when `ANTHROPIC_API_KEY` is unset.
- LLM output must be constrained to a strict structured-output schema (Zod-validated).
- LLM output must include evidence text or location for every event.
- LLM output must never create confirmed events directly. Output stays in the candidate queue subject to parent review.
- LLM output must be validated for date ranges and category values.
- Failed validation surfaces to the user as a refresh failure — there is no heuristic fallback anymore (deleted 2026-05-17). No silent application of unvalidated text.
- Per [`PRIVACY.md` §5.1](./PRIVACY.md#51-llm-assisted-extraction) and PRD AI-004: only public source text may be sent; no parent email/name, child nickname, family ID, OAuth tokens, or private PDFs.
- Logs record only `{ kind, candidateCount, latencyMs, success }` (AI-006).

## Initial Extraction Targets

- Breaks.
- Holidays.
- School-closed days.
- Term start/end.
- Instruction start/end.
- Exam periods.
- Activity events from ICS/provider calendars.

## Non-Targets For MVP Extraction

- Room-level school bell schedules.
- Individual university course schedules.
- Attendance records.
- Assignment deadlines.
- Portal-only data.
- Implicit availability without review.
