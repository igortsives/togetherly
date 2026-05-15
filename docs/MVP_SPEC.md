# MVP Spec

## MVP Statement

Togetherly MVP lets a private beta parent add children, import calendars from PDF, URL, ICS, Google Calendar, and Outlook Calendar, review extracted events, and find overlapping free windows for a requested duration.

## P0 Scope

| Capability | Requirement |
|---|---|
| Family setup | Create a family and add child nicknames |
| Calendar setup | Add multiple calendars per child |
| Source import | Add source by URL, PDF upload, ICS URL, Google Calendar, Outlook Calendar |
| Extraction | Extract candidate all-day and multi-day events from supported sources |
| Normalization | Assign canonical categories, busy/free status, confidence, and provenance |
| Parent review | Confirm, edit, or reject extracted candidate events |
| Matching | Search for overlapping free windows by date range and duration |
| Visualization | Show per-child busy/free timeline and recommended windows |
| Explanation | Show why a window is available or blocked |

## P1 Scope

- Source refresh and change alerts.
- Saved candidate windows.
- Export selected windows to Google or Outlook Calendar.
- Bulk confirm high-confidence events.
- Basic school/source search.
- Unknown/optional-event search preferences.

## P2 Scope

- OCR for scanned PDFs.
- Apple Calendar integration beyond Login with Apple.
- Native mobile app.
- Authenticated school/activity portal integrations.
- Email/newsletter calendar extraction.

## Out Of Scope For MVP

- Travel booking.
- Price optimization.
- Child accounts.
- Messaging between family members.
- Custody negotiation workflows.
- Automatic login to school portals.
- Guaranteed support for every school, district, university, camp, or activity provider.
- Fully autonomous recommendations without parent review.

## Acceptance Criteria

The MVP is ready for private beta when:

- A parent can sign up or log in with email/password, Google, or Apple.
- A parent can add at least two children and three total calendars.
- The app can import at least one source from each source family:
  - PDF or URL academic calendar.
  - ICS feed.
  - Google Calendar.
  - Outlook Calendar.
- The app can extract candidate events and create a review queue.
- Confirmed events are used in free-window matching.
- The parent can ask for a free window of at least N days within a date range.
- The app returns matching windows and conflict explanations.
- Low-confidence or unreviewed events do not silently affect default results.

## Initial Private Beta Constraints

- Supported geography: United States.
- Supported source corpus: UCLA, Vanderbilt, Saratoga High School / LGSUHSD, plus user-provided ICS and connected Google/Outlook calendars.
- Supported event types: breaks, holidays, school-closed days, term dates, exam periods, activity events, manual blocks.
- Supported users: invited private beta families only.

## First User Story

As a parent with one UCLA student and one Saratoga High student, I want to import both academic calendars and my family Google Calendar, so I can find a 5-day window when both children are likely free.
