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
    ucla/
      annual-academic-calendar.html
      academiccalendar26-27.pdf
    vanderbilt/
      calendars-2026-27.html
      owen-academic-calendar-2026-27.pdf
    saratoga-high/
      calendars-and-schedules.html
      guidance-event-calendar-2025-2026.html
    sample-ics/
      team-schedule.ics
  expected-events/
    ucla-annual-2026-27.json
    vanderbilt-undergrad-2026-27.json
    saratoga-guidance-2025-26.json
```

Do not commit copyrighted source snapshots unless allowed. For private beta development, prefer small excerpt fixtures or generated mock fixtures that preserve structure without copying complete documents.

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

## Known Source Questions

- Which Vanderbilt calendar should represent a typical undergraduate student versus professional school students?
- Does Saratoga High expose calendar feeds or only web calendars/doc links?
- Do UCLA term dates alone sufficiently represent student availability, or should exam periods default to busy?
- Should district instructional calendars or school-specific bell calendars be prioritized for Saratoga High?
