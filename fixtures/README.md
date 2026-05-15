# Parser Fixtures

This directory holds the source-of-truth inputs and expected outputs for
Togetherly's calendar extractors. Fixtures are the **input contract** for the
upcoming HTML extractor (issue #6), PDF extractor (issue #7), and continue to
back the ICS extractor (PR #22, issue #5).

```text
fixtures/
  sources/
    html/        # Raw HTML pages or hand-authored structural excerpts (.html)
    pdf/         # PDFs or extracted-text representations (.pdf and .pdf.txt)
    ics/         # RFC 5545 calendar feeds (.ics)
  expected-events/
    <source-slug>.json   # Hand-authored ground truth per fixture
```

## File naming

- Use kebab-case slugs that describe the institution and the academic year:
  `ucla-academic-calendar-2026-2027`, `vanderbilt-academic-calendar-2026-2027`,
  `saratoga-high-2026-2027`.
- The slug used in `fixtures/sources/<format>/<slug>.<ext>` MUST match the
  slug in `fixtures/expected-events/<slug>.json` so tests can pair raw input
  with expected output.

## Source files

Each raw source belongs to exactly one format directory:

| Format | Directory | Extensions |
|---|---|---|
| HTML pages / DOM excerpts | `sources/html/` | `.html` |
| Text-layer PDF representations | `sources/pdf/` | `.pdf`, `.pdf.txt` |
| ICS / Google subscribable feeds | `sources/ics/` | `.ics` |

Prefer authentic captures whenever the source allows it. When a target is
gated by login, dynamic JavaScript, image-only PDFs, or restrictive copyright,
fall back to **structural excerpts** as authorized by
`docs/SOURCE_CORPUS.md` ("prefer small excerpt fixtures or generated mock
fixtures that preserve structure without copying complete documents") and
label them as such in the file's leading comment. Record the same caveat in
`docs/SOURCE_CORPUS.md`.

`.pdf.txt` files represent the **text layer** extracted from a PDF (the kind
of string `pdf-parse` and similar libraries return). They are useful so the
PDF extractor's text-layer path can be tested deterministically without
shipping the binary PDF. When a real public PDF is available and reasonably
sized, prefer committing it as `.pdf` alongside the `.pdf.txt`.

## Expected-events schema

`fixtures/expected-events/<slug>.json` is a single object with two top-level
keys: `source` (metadata about the fixture) and `events` (the ground truth).

```jsonc
{
  "source": {
    "slug": "ucla-academic-calendar-2026-2027",
    "name": "Human-readable name of the calendar",
    "authoritativeUrl": "https://registrar.example.edu/...",
    "fixtureFiles": [
      "fixtures/sources/html/ucla-academic-calendar-2026-2027.html",
      "fixtures/sources/pdf/ucla-academic-calendar-2026-2027.pdf.txt"
    ],
    "sourceTimezone": "America/Los_Angeles",
    "capturedAt": "2026-05-14",
    "captureMethod": "live-fetch | structural-excerpt | partial-capture",
    "notes": "Anything an extractor author needs to know."
  },
  "events": [
    {
      "rawTitle": "Winter Break",
      "category": "BREAK",
      "suggestedBusyStatus": "FREE",
      "startAt": "2026-12-21T00:00:00.000Z",
      "endAt": "2027-01-05T00:00:00.000Z",
      "allDay": true,
      "evidenceLocator": "section#fall-2026 li:contains('Winter Break')"
    }
  ]
}
```

### Field rules

| Field | Rule |
|---|---|
| `rawTitle` | The exact human-readable label as it appears in the source, before any normalization. |
| `category` | Must be one of the `EventCategory` enum values from `prisma/schema.prisma`: `SCHOOL_CLOSED`, `BREAK`, `CLASS_IN_SESSION`, `EXAM_PERIOD`, `ACTIVITY_BUSY`, `OPTIONAL`, `UNKNOWN`, `MANUAL_BLOCK`. |
| `suggestedBusyStatus` | Must be one of the `BusyStatus` enum values: `BUSY`, `FREE`, `CONFIGURABLE`, `UNKNOWN`. |
| `startAt`, `endAt` | ISO 8601 UTC strings. For all-day events, use midnight UTC for the start date and midnight UTC for the day **after** the last covered day (exclusive end). |
| `allDay` | `true` for date-range school events; `false` for activity/sports events with clock times. |
| `evidenceLocator` | A pointer back to the source: a CSS selector for HTML fixtures, a page/line reference for PDF fixtures, or a UID/SUMMARY for ICS fixtures. The extractor's evidence trail must be checkable against this. |

### Category guidance

| Source phrase | Category | Default busy status |
|---|---|---|
| "Winter Break", "Spring Break", "Fall Break", "Thanksgiving Break" | `BREAK` | `FREE` |
| Single-day federal/state holiday ("Labor Day", "MLK Day", "Memorial Day", "Veterans Day", "Presidents Day", "Independence Day", "Cesar Chavez Day") | `SCHOOL_CLOSED` | `FREE` |
| "First Day of School", "Classes begin", "Instruction begins", "Last Day of School", "Classes end" | `CLASS_IN_SESSION` | `BUSY` |
| "Final Examinations", "Exam Period", "Reading Days" | `EXAM_PERIOD` | `BUSY` |
| Optional ceremonies ("Commencement", "Graduation", "Back to School Night") | `OPTIONAL` | `CONFIGURABLE` |
| Anything ambiguous | `UNKNOWN` | `UNKNOWN` |

## How to add a new corpus source

1. Identify the **authoritative URL** (registrar, district, or activity provider
   page). Avoid third-party aggregators.
2. Capture the raw source:
   - HTML: save the rendered page as `.html` into `sources/html/`.
   - PDF: save the file as `.pdf` into `sources/pdf/`. If the PDF is large or
     image-only, also commit a small `.pdf.txt` containing the text layer
     you want the extractor to consume.
   - ICS / Google subscribable feed: save as `.ics` into `sources/ics/`.
   - If the source requires login, dynamic JS, or has copyright issues, write
     a structural excerpt that reproduces the layout and label it as a fixture
     in a leading comment. Note the obstacle in `docs/SOURCE_CORPUS.md`.
3. Hand-author `fixtures/expected-events/<slug>.json` covering at minimum:
   - First and last day of instruction for the year.
   - Major breaks (Thanksgiving, Winter, Spring, Fall if applicable).
   - All single-day no-school holidays.
   - Exam periods (for universities).
4. Update `docs/SOURCE_CORPUS.md` with a row for the new source: name,
   format(s), authoritative URL, last-fetched date, and any caveats.
5. The extractor PRs (#6, #7, #5) will add test cases that read the fixture
   and assert produced candidates match the expected-events JSON.

## Copyright and privacy

- Only commit publicly accessible material. Never commit content from
  authenticated portals.
- For copyrighted bulletins or full PDFs, prefer the structural-excerpt path
  documented above.
- Never commit personal data, internal credentials, or anything that
  identifies a specific student.

## Related docs

- `docs/SOURCE_CORPUS.md` - the running corpus inventory and per-source notes.
- `docs/PARSING_STRATEGY.md` - the deterministic + LLM extraction pipeline
  these fixtures feed.
- `docs/ARCHITECTURE.md` - the broader `fixtures/` directory layout.
