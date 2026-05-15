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
| `ucla-academic-calendar-2026-2027` | UCLA | HTML, PDF text-layer | https://registrar.ucla.edu/calendars/annual-academic-calendar | 2026-05-14 | Live fetch (WebFetch summary) | Dates verified against a live WebFetch of the registrar page on 2026-05-14. WebFetch returned markdown-summarized content rather than raw DOM, so the HTML fixture wraps the same dated rows in semantic HTML and is not a byte-for-byte DOM capture; event labels and dates match the live registrar. The PDF text-layer fixture is derived from the same WebFetch (the binary PDF at `/portals/50/documents/calendar/academiccalendar26-27.pdf` was not fetched separately). Winter Break and Spring Break between quarters are inferred from the gap between `Quarter ends` and the next `Quarter begins`. |
| `vanderbilt-academic-calendar-2026-2027` | Vanderbilt | HTML, PDF text-layer | https://registrar.vanderbilt.edu/calendars/2026-27-academic.php | 2026-05-14 | Live fetch (WebFetch summary) | Dates verified against a live WebFetch of the "Term Dates and Holidays" page on 2026-05-14. The companion `/calendars/2026-27-undergraduate.php` detail page rendered with no date payload via WebFetch (likely JS-rendered), so the summary page is the authoritative source for this fixture. WebFetch returned markdown-summarized content; the HTML fixture wraps the same dated rows in semantic HTML and is not a byte-for-byte DOM capture. Winter Break is inferred from the gap between Fall exam window end (Dec 19, 2026) and Spring `First day of classes` (Jan 11, 2027). Vanderbilt's published "Thanksgiving holidays in most schools" window spans Nov 21-29 (Sat-Sun); we encode it verbatim. |
| `saratoga-high-2026-2027` | Saratoga High School / LGSUHSD | HTML, PDF text-layer | https://www.saratogahigh.org/about-us/calendars-and-schedules and https://www.lgsuhsd.org/resources/calendars-schedules | 2026-05-14 | Structural excerpt (live capture deferred) | Live-capture attempt on 2026-05-14: WebFetch of the Saratoga High calendars page succeeded but listed only the 2025-26 LGSUHSD Instructional Calendar PDF (https://resources.finalsite.net/images/v1738342645/lgsuhsdorg/ycrbjiwrpj3qjbephko9/2025-26_LGSUHSD_Instructional_Calendar_-_Board_Approved_1282025.pdf); the district has not yet published a 2026-27 instructional calendar on that page. Direct WebFetch of the PDF and of the LGSUHSD district calendars page were denied by the sandboxed environment. The fixture remains a structural excerpt using canonical LGSUHSD K-12 anchors until the 2026-27 PDF is published and a live capture is permitted. |

### Capture-method log (2026-05-14)

- **UCLA** - Live fetch via Claude Code `WebFetch` against
  `https://registrar.ucla.edu/calendars/annual-academic-calendar`. WebFetch
  returned a markdown table that mirrors the registrar's quarter sections;
  event labels and dates are reproduced verbatim in the HTML and `.pdf.txt`
  fixtures. The binary PDF at
  `https://registrar.ucla.edu/portals/50/documents/calendar/academiccalendar26-27.pdf`
  was not fetched separately; pursue a direct PDF fetch when the PDF
  extractor (#7) lands.
- **Vanderbilt** - Live fetch via `WebFetch` against
  `https://registrar.vanderbilt.edu/calendars/2026-27.php` to discover the
  per-school calendar URLs, then against
  `https://registrar.vanderbilt.edu/calendars/2026-27-academic.php` (Term
  Dates and Holidays). The companion `/calendars/2026-27-undergraduate.php`
  detail page returned section headers but no date payload via WebFetch
  (likely JS-rendered); document this as a known limitation for the HTML
  extractor. The Owen / Law / Med / Divinity professional-school PDFs were
  not enumerated in this slice.
- **Saratoga High / LGSUHSD** - Partial live capture. `WebFetch` against
  `https://www.saratogahigh.org/about-us/calendars-and-schedules` succeeded
  and confirmed only a 2025-26 LGSUHSD Instructional Calendar PDF is
  currently linked. Direct `WebFetch` of the PDF and of
  `https://www.lgsuhsd.org/resources/calendars-schedules` was denied by the
  sandboxed environment. The 2026-27 instructional calendar is therefore
  deferred until the district posts the PDF and a live PDF/page fetch is
  permitted. Track follow-up under issue #19 (and the planned PDF-extractor
  issue #7) when the source becomes available.

### Sources not yet captured in this slice

- **UCLA subscribable Google calendar (ICS)** - UCLA does not publish a
  single canonical ICS feed for the annual academic calendar. Deferred.
- **UCLA 2026-27 binary PDF** - `https://registrar.ucla.edu/portals/50/documents/calendar/academiccalendar26-27.pdf`
  was not fetched as a binary in this slice. The `.pdf.txt` fixture is
  derived from the registrar HTML page. Direct PDF capture is queued behind
  the PDF extractor (#7).
- **Vanderbilt undergraduate detail page** - `https://registrar.vanderbilt.edu/calendars/2026-27-undergraduate.php`
  rendered with no date payload through `WebFetch` (likely JS-rendered).
  The Term Dates and Holidays summary page was used as the authoritative
  source for the 2026-2027 fixture.
- **Vanderbilt Owen / Law / Med / Divinity / Nursing separate PDFs** - the
  registrar links one PDF per professional school. The fixture covers the
  undergraduate calendar only; capturing the professional-school PDFs is
  queued behind the undergraduate work.
- **Saratoga High / LGSUHSD 2026-2027 instructional calendar PDF** - the
  district had not posted the 2026-27 PDF on the Saratoga High calendars
  page as of 2026-05-14, and direct WebFetch of the 2025-26 PDF and of the
  LGSUHSD district calendars page was denied by the sandboxed environment.
  The Saratoga fixture remains a structural excerpt pending publication of
  the 2026-27 PDF and a permitted live capture.
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
