# Product Requirements Document: Togetherly

## 1. Executive Summary

Togetherly is a consumer app that helps parents find overlapping free time across children’s school, university, camp, sports, music, and afterschool calendars so families can plan vacations and getaways with less manual coordination.

The product should focus first on helping parents import, verify, and compare calendars from public school and university pages, PDFs, ICS feeds, and connected personal calendars. Fully automated discovery across every school, camp, and activity provider is a long-term goal, not the MVP.

### Recommendation

Build a private beta MVP focused on:

- Public calendar source import by URL, PDF upload, ICS feed, Google Calendar, and Outlook Calendar.
- Human-reviewed calendar extraction with confidence scoring.
- Overlapping free-window search by requested trip duration.
- Source monitoring and change alerts.

Do not begin with authenticated school portal scraping, travel booking, or guaranteed support for all schools and activities.

## 2. Problem Definition

Parents often need to coordinate vacation or getaway timing across multiple children whose schedules live in different places and formats:

- K-12 district calendars.
- Private school calendars.
- University academic calendars.
- Sports team schedules.
- Music, theater, tutoring, camps, and afterschool activities.
- Existing family, work, custody, or household calendars.

The current workflow is manual:

1. Search each school or activity website.
2. Find the correct academic or activity calendar.
3. Download or inspect PDFs, HTML tables, web pages, or calendar feeds.
4. Manually compare dates across children.
5. Re-check later when calendars change.

The core pain is not simply “families need a calendar.” It is: **parents need to discover when everyone is free, using schedule data that is scattered, inconsistent, and often published in difficult formats.**

## 3. Goals And Success Metrics

### Product Goals

- Help parents find shared free windows across multiple children’s calendars.
- Reduce manual searching and date comparison.
- Make source provenance and extraction confidence clear.
- Support messy real-world school and activity calendar formats.
- Build enough trust that parents can use the output for vacation planning.

### Success Metrics

| Metric | MVP Target |
|---|---:|
| Successful calendar imports per family | 3+ |
| Imported source types supported | URL, PDF, ICS, Google Calendar, Outlook Calendar |
| Parent confirmation completion rate | 70%+ |
| Free-window search completion rate | 80%+ after import |
| Extraction accuracy after parent review | 95%+ for confirmed events |
| Time to first useful result | Under 10 minutes |
| Change-alert accuracy | No silent changes for monitored sources |

## 4. Target Users

### Primary Persona: Multi-Child K-12 Parent

- Has 2+ children in different schools, grades, districts, or activity schedules.
- Plans family vacations around school breaks and holidays.
- Uses Google Calendar, Apple Calendar, paper calendars, emails, school PDFs, or parent portals.
- Main need: “Show me when everyone has at least 5 free days.”

### Secondary Persona: College + K-12 Family

- Has one child in college and one or more children in K-12.
- Needs to align college breaks, move-in/move-out periods, exam periods, and younger kids’ school breaks.
- Main need: “When is my college student home while the younger kids are also off?”

### Secondary Persona: Activity-Heavy Family

- Children participate in club sports, music, theater, dance, camps, tutoring, or competitions.
- Activity schedules may be in TeamSnap, SportsEngine, GameChanger, PDFs, emails, or calendar feeds.
- Main need: “Find weekends or weeks with no tournaments, rehearsals, camps, or school conflicts.”

### Secondary Persona: Co-Parenting Household

- Needs to factor in custody calendars and school/activity constraints.
- May use shared calendars or co-parenting apps.
- Main need: “Find trip windows that fit custody time and the children’s schedules.”

## 5. Primary Use Cases

| Use Case | Description | MVP Priority |
|---|---|---:|
| Find school breaks across children | Parent imports multiple school calendars and finds overlapping holidays/breaks. | P0 |
| Find trip windows of a requested length | Parent requests 3, 5, 7, or 14 free days. | P0 |
| Import a PDF academic calendar | Parent uploads or links a school PDF. | P0 |
| Import a web-based academic calendar | Parent links a school or university calendar page. | P0 |
| Import an ICS activity calendar | Parent imports TeamSnap, SportsEngine, school, or other calendar feeds. | P0 |
| Connect family calendar | Parent connects Google Calendar and Outlook Calendar to include existing events. | P0 |
| Monitor source changes | App alerts parent when imported source dates change. | P1 |
| Search for school by name | Parent searches for school/district and app suggests likely sources. | P1 |
| Add manual constraints | Parent blocks dates manually for known conflicts. | P1 |
| Export candidate travel holds | Parent adds candidate windows to Google/Apple/Outlook. | P1 |

## 6. Core User Journey

### First-Run Flow

1. Parent creates a family profile.
2. Parent adds children by nickname.
3. Parent adds one or more calendars per child.
4. App asks for a source:
   - Search school or organization name.
   - Paste URL.
   - Upload PDF.
   - Paste ICS feed.
   - Connect Google Calendar.
   - Connect Outlook Calendar.
5. App fetches and classifies source.
6. App extracts candidate calendar events.
7. Parent reviews extracted events and confirms or edits them.
8. Parent enters desired free time:
   - Minimum duration.
   - Earliest/latest travel date.
   - Weekday/weekend preference.
   - Optional blackout dates.
9. App displays overlapping free windows.
10. Parent saves, exports, or shares candidate windows.

### Returning Flow

1. App monitors source changes.
2. Parent receives alert when an imported source changes.
3. Parent reviews changed dates.
4. App recalculates free windows.

## 7. Functional Requirements

### 7.1 Family And Calendar Setup

| ID | Requirement | Priority |
|---|---|---:|
| FAM-001 | User can create a family profile. | P0 |
| FAM-002 | User can add children using nicknames. | P0 |
| FAM-003 | User can add multiple calendars per child. | P0 |
| FAM-004 | User can tag a calendar as school, university, camp, sport, music, activity, parent, custody, or other. | P0 |
| FAM-005 | User can disable a calendar without deleting it. | P1 |

### 7.2 Source Acquisition

| ID | Requirement | Priority |
|---|---|---:|
| SRC-001 | User can paste a public calendar URL. | P0 |
| SRC-002 | User can upload a PDF calendar. | P0 |
| SRC-003 | User can paste an ICS calendar feed URL. | P0 |
| SRC-004 | User can connect Google Calendar. | P0 |
| SRC-005 | User can connect Outlook Calendar. | P0 |
| SRC-006 | User can search by school, district, university, camp, or activity name and receive candidate sources. | P1 |
| SRC-007 | App stores source URL, file hash, parser type, fetch timestamp, and provenance. | P0 |
| SRC-008 | App can re-fetch monitored public URLs and ICS feeds. | P1 |

### 7.3 Extraction And Normalization

| ID | Requirement | Priority |
|---|---|---:|
| EXT-001 | App extracts events from text-based PDFs. | P0 |
| EXT-002 | App extracts events from HTML tables and calendar pages. | P0 |
| EXT-003 | App imports events from ICS feeds. | P0 |
| EXT-004 | App identifies all-day and multi-day date ranges. | P0 |
| EXT-005 | App assigns event categories. | P0 |
| EXT-006 | App assigns extraction confidence per event. | P0 |
| EXT-007 | App preserves source evidence for each extracted event. | P0 |
| EXT-008 | App supports OCR for scanned/image PDFs. | P2 |

### 7.4 Event Taxonomy

Supported MVP event categories:

| Category | Meaning | Counts As Busy? |
|---|---|---:|
| `school_closed` | No school due to holiday, staff day, weather makeup day, etc. | No |
| `break` | Fall, winter, spring, summer, Thanksgiving, or similar break. | No |
| `class_in_session` | Regular instruction day or term date range. | Yes |
| `exam_period` | Finals, midterms, reading period, testing week. | Configurable |
| `activity_busy` | Practice, tournament, rehearsal, camp, performance. | Yes |
| `optional` | Optional attendance or optional event. | Configurable |
| `unknown` | Event meaning is unclear. | Requires review |
| `manual_block` | Parent-entered conflict. | Yes |

### 7.5 Parent Review

| ID | Requirement | Priority |
|---|---|---:|
| REV-001 | User must review extracted events before they affect recommendations. | P0 |
| REV-002 | User can edit event name, date, category, and busy/free status. | P0 |
| REV-003 | App highlights low-confidence events. | P0 |
| REV-004 | App shows source evidence for each event. | P0 |
| REV-005 | User can bulk-confirm high-confidence events. | P1 |

### 7.6 Free Window Search

| ID | Requirement | Priority |
|---|---|---:|
| MAT-001 | User can specify desired duration in days or weeks. | P0 |
| MAT-002 | User can specify date range to search within. | P0 |
| MAT-003 | App computes overlapping free windows across selected calendars. | P0 |
| MAT-004 | App shows which calendars create conflicts for rejected dates. | P0 |
| MAT-005 | App ranks free windows by quality. | P1 |
| MAT-006 | User can include or exclude optional/unknown events. | P1 |
| MAT-007 | User can save candidate windows. | P1 |

### 7.7 Visualization

| ID | Requirement | Priority |
|---|---|---:|
| UI-001 | App shows a timeline or calendar heatmap of free and busy periods. | P0 |
| UI-002 | App distinguishes confirmed, low-confidence, and unreviewed data. | P0 |
| UI-003 | App shows recommended windows as selectable ranges. | P0 |
| UI-004 | App shows per-child calendar rows for comparison. | P0 |
| UI-005 | App supports mobile-first planning flow. | P1 |

### 7.8 Export And Alerts

| ID | Requirement | Priority |
|---|---|---:|
| EXP-001 | User can export selected windows to Google Calendar. | P1 |
| EXP-002 | User can export selected windows to Outlook Calendar. | P1 |
| EXP-003 | User can copy/share selected windows. | P1 |
| ALT-001 | App can detect source changes by URL hash or ICS feed update. | P1 |
| ALT-002 | App alerts user when monitored source changes may affect saved windows. | P1 |

## 8. Data Source Feasibility

### Source Types

| Source Type | Feasibility | MVP Approach |
|---|---|---|
| Public K-12 district calendars | High for large districts | URL search/import, HTML/PDF parsing |
| Public university registrar calendars | High | URL import, HTML/PDF parsing, sometimes ICS/Google calendar |
| Private school calendars | Medium | URL/PDF/ICS import, manual fallback |
| Camps | Medium-low | URL/PDF import, manual fallback |
| Sports/activity platforms | Medium-high when user provides ICS | ICS import first, authenticated integrations later |
| School portals | Low for MVP | Do not support login-based scraping |
| Emails/newsletters | Medium long-term | Defer to future AI/email ingestion |

### Concrete Source Examples

| Source | Format | Feasibility Notes |
|---|---|---|
| NYC Public Schools calendar | HTML page and PDFs | Large public district, structured date rows, multilingual PDFs. |
| LAUSD instructional calendars | Web pages and PDFs | Large district with public calendar documents. |
| Fairfax County Public Schools calendar | PDF grid | Extractable, but grid/legend interpretation may require review. |
| UCLA annual academic calendar | HTML tables and PDF | Structured registrar data, good university example. |
| Stanford academic calendar for parents | Web page | Useful but warns families to account for exam/course-specific schedules. |
| University of Michigan calendars | PDFs and Google calendar | Good example of registrar calendar plus subscribable calendar. |
| TeamSnap schedules | Calendar sync/ICS | Reliable if user has access to team feed. |
| SportsEngine team schedules | Calendar sync/ICS | Useful for activity calendars; sync delay possible. |

## 9. Technical Approach

### System Components

| Component | Responsibility |
|---|---|
| Source registry | Stores URLs, uploaded files, feed metadata, hashes, parser history, and provenance. |
| Fetcher | Downloads public pages/PDFs and refreshes ICS feeds. |
| Classifier | Determines source type: PDF, HTML table, ICS, calendar page, scanned image, unknown. |
| Extractor | Extracts candidate events and date ranges. |
| Normalizer | Converts extracted events into canonical event schema. |
| Review service | Manages human confirmation, edits, and confidence states. |
| Interval engine | Computes busy/free windows across selected calendars. |
| Alert engine | Detects source changes and recomputes affected windows. |
| UI | Calendar visualization, source review, and free-window selection. |

### Canonical Event Schema

```json
{
  "id": "evt_123",
  "calendar_id": "cal_456",
  "child_id": "child_789",
  "title": "Spring Break",
  "category": "break",
  "busy_status": "free",
  "start_date": "2027-03-22",
  "end_date": "2027-03-26",
  "all_day": true,
  "timezone": "America/New_York",
  "confidence": 0.94,
  "review_status": "confirmed",
  "source": {
    "type": "pdf",
    "url": "https://example.edu/calendar.pdf",
    "page": 1,
    "evidence": "Spring Break: March 22-26"
  }
}
```

### Free Window Matching Logic

1. Normalize all selected calendars into busy/free intervals.
2. Convert uncertain events according to user preference:
   - Treat unknown as busy.
   - Treat unknown as warning.
   - Exclude unknown.
3. Union busy intervals per child.
4. Compute complements within requested search range.
5. Intersect free intervals across all selected children/calendars.
6. Filter by minimum duration.
7. Rank windows by:
   - Length.
   - Number of adjacent weekends.
   - Distance from uncertain events.
   - User preference.
   - Fewer partial conflicts.

## 10. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Accuracy | Confirmed events should be traceable to source evidence. |
| Trust | Recommendations must explain why a window is free. |
| Privacy | Store minimal child data; nicknames should be sufficient. |
| Security | Do not store school portal credentials in MVP. |
| Performance | Free-window computation should complete in under 2 seconds for typical family calendars. |
| Reliability | Imported sources should maintain fetch history and change detection. |
| Accessibility | Calendar visualization must be usable without color alone. |
| Mobile | Parent setup and review flow must work on mobile. |

## 11. MVP Scope

### In Scope

- Family profile with child nicknames.
- Email/password, Google login, and Login with Apple.
- Add calendar source by URL, PDF upload, ICS URL, Google Calendar, and Outlook Calendar.
- Extract school/university breaks, holidays, term dates, exams, and activity conflicts.
- Parent review and confirmation workflow.
- Free-window search by requested duration.
- Calendar/timeline visualization.
- Source provenance and confidence scores.
- Basic source refresh and change alerting for public URLs and ICS feeds.

### Out Of Scope

- Authenticated scraping of school portals.
- Automatic login to TeamSnap, SportsEngine, GameChanger, ParentSquare, or school systems.
- Travel booking.
- Price optimization.
- Messaging between parents.
- Child accounts.
- Full course-level university schedule ingestion.
- Guaranteed support for every school/camp/activity provider.
- Fully autonomous recommendations without parent review.

## 12. Competitive Landscape

| Product | Category | Relevance | Gap |
|---|---|---|---|
| Cozi | Family calendar | Strong family organizer | Does not discover/normalize school PDFs or optimize free windows. |
| Google Calendar / Apple Calendar | General calendar | Common household infrastructure | Requires manual event entry and comparison. |
| FamilyWall | Family organizer | Shared family calendar | Not focused on source ingestion or vacation-window discovery. |
| TimeTree / Jam | Shared calendars | Family/group scheduling | Organizes known events, not messy academic data. |
| Skylight / Hearth | Family calendar display | Strong at visibility | Depends on existing synced calendars. |
| TeamSnap / SportsEngine | Activity scheduling | Important data sources | Vertical schedule systems, not cross-family free-time planners. |
| Ohai.ai / Ollie | AI family assistants | Adjacent AI calendar automation | Broader assistant products; not specialized in academic/activity calendar normalization. |
| OurFamilyWizard | Co-parenting calendar | Relevant for custody scheduling | Not focused on academic source discovery and vacation windows. |

## 13. Risks And Mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| Calendar extraction is wrong | High | Require review, show evidence, use confidence scoring. |
| Source formats vary widely | High | Start with URL/PDF/ICS/user-confirmed import; build parser corpus over time. |
| Parents do not trust recommendations | High | Explain every result and show conflicts/source provenance. |
| Activity data behind login | Medium-high | Support ICS and user-connected calendars first. |
| Calendar changes after planning | Medium-high | Monitor sources and alert on changes. |
| University availability is more nuanced than academic calendar | Medium | Label exams/course schedules as caveats; allow manual blocks. |
| Standalone app may be too narrow | Medium | Position as free-window finder with calendar integrations, not a replacement calendar. |
| Privacy concerns around children’s schedules | Medium | Minimal data, no portal credentials, clear deletion/export controls. |

## 14. Open Questions

- Which user segment has the strongest willingness to pay: K-12 families, college + K-12 families, or activity-heavy families?
- Should Togetherly become a standalone family calendar or stay as a planning layer on top of existing calendars?
- How much manual review will parents tolerate during setup?
- Should unknown events default to busy for safety?
- What is the clearest monetization model: subscription, seasonal planning pass, or freemium?

## 15. Suggested Release Plan

### Phase 1: Prototype

- Manual URL/PDF/ICS import.
- Email/password, Google login, and Login with Apple.
- Google Calendar and Outlook Calendar import.
- Basic extraction from selected source examples.
- Parent review screen.
- Free-window interval engine.
- Simple timeline visualization.

### Phase 2: MVP Beta

- Improved PDF and HTML parsing.
- Source confidence scoring.
- Saved windows.
- Change detection for monitored sources.
- Candidate source search for common schools/universities.

### Phase 3: Public Launch

- Parser coverage across top districts and universities.
- Better mobile onboarding.
- Share/export flows.
- Activity calendar feed library.
- Paid plan for unlimited calendars, monitoring, and alerts.

## 16. Build Recommendation

Proceed with a constrained MVP.

The product is feasible if the team treats source acquisition as a confidence-based workflow rather than a fully automatic guarantee. The strongest first version is a planning assistant that imports and verifies calendars, computes overlapping free windows, and gives parents confidence through source-backed explanations.

The product should not initially promise “we find every calendar automatically.” It should promise: **“Bring us your kids’ school and activity calendars, and we’ll show when your whole family is free.”**
