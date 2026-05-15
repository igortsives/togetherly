# Source Corpus

## Purpose

The source corpus gives engineering real calendar examples for parser development, regression tests, and product-quality review.

Initial focus:

- UCLA.
- Vanderbilt.
- Saratoga High School in Saratoga, California.
- Los Gatos-Saratoga Union High School District calendars.
- User-provided ICS examples for sports/activity calendars.
- Google Calendar and Outlook Calendar connected events.

## Initial Sources

| Institution | Source | Format | URL | Notes |
|---|---|---|---|---|
| UCLA | Annual Academic Calendar | HTML + PDF | https://registrar.ucla.edu/calendars/annual-academic-calendar | Registrar page includes annual academic calendar and downloadable PDF. Good structured university source. |
| UCLA | 2026-27 Academic Calendar PDF | PDF | https://registrar.ucla.edu/portals/50/documents/calendar/academiccalendar26-27.pdf | PDF source for testing PDF extraction against same registrar data. |
| Vanderbilt | 2026-2027 Calendars | HTML page + linked docs | https://registrar.vanderbilt.edu/calendars/2026-27.php | Registrar page lists undergraduate, graduate, professional, and exam calendars. |
| Vanderbilt | Owen 2026-2027 Academic Calendar | PDF | https://registrar.vanderbilt.edu/documents/26.27_Owen_Academic_Calendar.pdf | Useful professional-school PDF with break and exam periods. |
| Saratoga High School | Calendars and Bell Schedule | HTML page | https://www.saratogahigh.org/about-us/calendars-and-schedules | SHS page references all-in-one and individual calendars. |
| LGSUHSD | Calendars / Schedules | HTML page with linked district and school calendars | https://www.lgsuhsd.org/resources/calendars-schedules | District page lists 2025-26, 2026-27, 2027-28 instructional calendars and SHS Red/Blue calendars. |
| Saratoga High School | Guidance Event Calendar 2025-2026 | HTML table | https://www.saratogahigh.org/guidance/guidance-event-calendar-2025-2026 | Good table source with dates, grade, and descriptions. |

## Source-Corpus Storage Plan

```text
fixtures/
  sources/
    html/
      ucla-academic-calendar-2026-2027.html
      vanderbilt-academic-calendar-2026-2027.html
      saratoga-high-2026-2027.html
    pdf/
      ucla-academic-calendar-2026-2027.pdf.txt
      vanderbilt-academic-calendar-2026-2027.pdf.txt
      saratoga-high-2026-2027.pdf.txt
    ics/
      school-breaks.ics      (PR #22)
      team-practice.ics      (PR #22)
  expected-events/
    ucla-academic-calendar-2026-2027.json
    vanderbilt-academic-calendar-2026-2027.json
    saratoga-high-2026-2027.json
```

The layout is `fixtures/sources/<format>/<source-slug>.<ext>` per
`docs/ARCHITECTURE.md`. Each source slug pairs raw input with an
expected-events JSON file. See `fixtures/README.md` for the schema, category
mapping, and "how to add a new source" workflow.

Do not commit copyrighted source snapshots unless allowed. For private beta development, prefer small excerpt fixtures or generated mock fixtures that preserve structure without copying complete documents.

## Captured Corpus (2026-05-14)

| Source slug | Institution | Format(s) | Authoritative URL | Last fetched | Capture method | Caveats |
|---|---|---|---|---|---|---|
| `ucla-academic-calendar-2026-2027` | UCLA | HTML, PDF text-layer | https://registrar.ucla.edu/calendars/annual-academic-calendar (PDF: https://registrar.ucla.edu/portals/50/documents/calendar/academiccalendar26-27.pdf) | 2026-05-14 | Structural excerpt (offline) | Network egress blocked in the fixture-authoring environment; HTML and PDF excerpts mirror the registrar's quarter-table layout. Dates use canonical UCLA quarter-system anchors and known federal holidays. Re-verify against live registrar HTML/PDF before depending on dated values. |
| `vanderbilt-academic-calendar-2026-2027` | Vanderbilt | HTML, PDF text-layer | https://registrar.vanderbilt.edu/calendars/2026-27.php (PDF: https://registrar.vanderbilt.edu/documents/26.27_Owen_Academic_Calendar.pdf) | 2026-05-14 | Structural excerpt (offline) | Same network-egress caveat as UCLA. Vanderbilt registrar uses semester structure; the Owen PDF is a representative professional-school PDF and is the closest single-document target. Owen and undergraduate dates differ in detail; the fixture reflects the undergraduate side. |
| `saratoga-high-2026-2027` | Saratoga High School / LGSUHSD | HTML, PDF text-layer | https://www.lgsuhsd.org/resources/calendars-schedules (district calendars page) and https://www.saratogahigh.org/about-us/calendars-and-schedules (SHS calendars) | 2026-05-14 | Structural excerpt (offline) | Same network-egress caveat. SHS publishes Red/Blue rotation calendars; this fixture covers the all-school instructional calendar only. District also publishes prior-year and following-year calendars; only 2026-2027 is captured here. |

### Network-egress caveat

This corpus slice was authored in a sandboxed environment that denied
outbound HTTP, `WebFetch`, and `WebSearch`. The fixture files in
`fixtures/sources/html/` and `fixtures/sources/pdf/` are therefore
**hand-authored structural excerpts** rather than verbatim captures, as
authorized by the "small excerpt fixtures or generated mock fixtures"
guidance above. Each fixture's leading comment marks it as such. A follow-up
task should re-capture each authoritative URL with live tooling (`curl`,
`fetch`, or `WebFetch`), diff it against the structural excerpt, and update
the corresponding `fixtures/expected-events/<slug>.json` file. Track the
re-capture work in issue #19 follow-ups (or a new issue if #19 has closed).

### Sources not yet captured in this slice

- **UCLA subscribable Google calendar (ICS)** - UCLA does not publish a
  single canonical ICS feed for the annual academic calendar. Deferred.
- **Vanderbilt Owen / Law / Med separate PDFs** - the registrar links one
  PDF per professional school. The fixture covers the undergraduate
  calendar only; capturing the professional-school PDFs is queued behind
  the undergraduate work.
- **Saratoga High Red/Blue rotation calendar** - SHS publishes a separate
  bell-rotation calendar that drives day-of-week class scheduling. Out of
  scope for MVP per `docs/PARSING_STRATEGY.md` ("Room-level school bell
  schedules" are a non-target).
- **Guidance Event Calendar 2025-2026** (originally listed in this doc) -
  deferred to a later corpus slice; the 2026-2027 cycle is the MVP target.

## Parser Regression Criteria

Each fixture should define:

- Source URL.
- Source format.
- Expected parser type.
- Expected canonical events.
- Expected event categories.
- Expected busy/free defaults.
- Known ambiguous events.
- Date range edge cases.

## Copyright and Privacy Handling

- Only commit publicly accessible material. Calendars behind login pages
  (parent portals, Schoology, etc.) are out of scope.
- Public registrar / district calendars are factual data, but the surrounding
  formatting and prose may be copyrighted. Prefer **small excerpt fixtures**
  that preserve structure, or hand-authored structural excerpts modeled on
  the published layout, rather than verbatim full-page captures.
- Every fixture file must carry a leading comment that names the
  authoritative URL and identifies whether it is a live capture, a partial
  capture, or a structural excerpt (see `fixtures/README.md`).
- Never commit identifiers, student names, addresses, contact details, or
  anything that could deanonymize a specific child or family.
- When in doubt about reuse, prefer paraphrased structural excerpts that
  exercise the parser pattern but do not reproduce protected text wholesale.

## Known Source Questions

- Which Vanderbilt calendar should represent a typical undergraduate student versus professional school students?
- Does Saratoga High expose calendar feeds or only web calendars/doc links?
- Do UCLA term dates alone sufficiently represent student availability, or should exam periods default to busy?
- Should district instructional calendars or school-specific bell calendars be prioritized for Saratoga High?
