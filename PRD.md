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
| EXT-009 | App recognizes academic-calendar boundary pairs using a **synonym-based recognizer** that composes phrases from a verb slot (`begins`/`starts`/`opens`/`commences` and end variants), an academic-unit-noun slot (`Quarter`/`Semester`/`Trimester`/`Term`/`Module`/`Session`/`School Year`/`School`/`Instruction`/`Classes`), and noun-phrase forms (`First/Last Day of …`). Matched begin-end pairs synthesize `class_in_session` or `exam_period` intervals. The recognizer must work across academic-system vocabularies (quarter / semester / trimester) and across K-12 and higher-ed phrasings without per-school code. See [`PARSING_STRATEGY.md`](../docs/PARSING_STRATEGY.md#boundary-pair-inference-ext-009) for the full slot definitions and conflict-handling rules. | P1 |
| EXT-010 | When heuristic classification is uncertain (`unknown` category or `confidence < 0.6`), the extractor escalates the candidate to an LLM-assisted classification pass with structured output. The LLM is given the candidate's title, evidence text, source provider type, and the calendar's surrounding events; it returns `{ category, confidence, reasoning }`. Falls back gracefully to the heuristic result when the LLM API key is unset. | P1 |

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
| MAT-008 | User can type a natural-language query ("a free week around Christmas", "long weekend in October", "a week when both kids are off school") and the app parses it into a structured search via LLM. The parsed intent is shown to the user before the search runs so it can be adjusted. The structured form remains available as an expert mode. | P1 |
| MAT-009 | When a free window is bracketed by a Saturday-Sunday weekend and contains a Monday or Friday `school_closed` holiday, the explanation flags it as a `long_weekend` so the UI can surface "extends Memorial Day" / "extends Presidents' Day" labels. The window is found regardless; this is a labelling improvement. | P1 |
| MAT-010 | When matching computes busy intervals from a `class_in_session` interval (synthesized via EXT-009), Saturdays and Sundays inside that interval remain free. School is in session Mon-Fri only. | P1 |

### 7.7 Visualization

| ID | Requirement | Priority |
|---|---|---:|
| UI-001 | App shows a timeline or calendar heatmap of free and busy periods. | P0 |
| UI-002 | App distinguishes confirmed, low-confidence, and unreviewed data. | P0 |
| UI-003 | App shows recommended windows as selectable ranges. | P0 |
| UI-004 | App shows per-child calendar rows for comparison. | P0 |
| UI-005 | App supports mobile-first planning flow. | P1 |
| UI-006 | App surfaces a **source legend** at the top of the timeline listing every active source as a toggleable chip (name, color, provider icon, on/off). Each event block carries a thin source-colored stripe layered on top of its category color so the parent can see at a glance which source contributed which event. Toggle state is persisted in the URL. | P1 |
| UI-007 | Clicking any event block opens a **drilldown side panel** showing the event title, source name, provider type, evidence locator (page/line/UID), sibling events from the same source that week, and a "hide this source" quick action. | P1 |
| UI-008 | The dashboard offers a **term-overview** alternate view mode (toggled in the header) showing months across the top and one row per child / parent, with `class_in_session` / `exam_period` / `break` blocks spanning the appropriate months. The same source filters and drilldown apply. | P2 |

### 7.8 Export And Alerts

| ID | Requirement | Priority |
|---|---|---:|
| EXP-001 | User can export selected windows to Google Calendar. | P1 |
| EXP-002 | User can export selected windows to Outlook Calendar. | P1 |
| EXP-003 | User can copy/share selected windows. | P1 |
| ALT-001 | App can detect source changes by URL hash or ICS feed update. | P1 |
| ALT-002 | App alerts user when monitored source changes may affect saved windows. | P1 |

### 7.9 AI / LLM-Assisted Intelligence

Heuristic parsers handle the well-structured majority of calendars but degrade gracefully on edge cases. Where the heuristics are unsure, an LLM (Claude Sonnet via the Anthropic SDK) provides a fallback layer. Every LLM use is bounded in scope, falls back to heuristics when the API key is unset, and shows its work to the user where it influences a decision.

| ID | Requirement | Priority |
|---|---|---:|
| AI-001 | An `ANTHROPIC_API_KEY` env var enables LLM features. All AI flows must no-op gracefully when the key is unset so local dev / CI without the key still produces a working product (heuristics only). | P1 |
| AI-002 | LLM-assisted classification of ambiguous events (per EXT-010) batches all ambiguous candidates from a single source refresh into one Claude call. A refresh that produces no ambiguous candidates makes zero LLM calls. Expected cost: ~$0.01 per refresh that fires the LLM. Most refreshes will not fire it because the candidate set is unchanged between runs. | P1 |
| AI-003 | Natural-language search parser (per MAT-008) shows the parsed intent to the user before running the search. The user can adjust the inferred fields. The structured form remains the expert mode. | P1 |
| AI-004 | LLM input contexts include the family's children's nicknames, the active source names, today's date, and the user-provided text. LLM input MUST NOT include OAuth tokens, refresh tokens, or imported event titles outside the scope of the immediate query. | P1 |
| AI-005 | LLM outputs are validated against structured-output schemas (Zod) before being applied. Schema violations fall back to heuristics or surface the failure to the user; no silent application of free-form text. | P1 |
| AI-006 | LLM-assisted operations log only their `{ kind, candidateCount, latencyMs, success }` shape — never the prompt, response body, or imported content. | P1 |

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
- Email/password, Google login, Login with Apple, Continue with Microsoft.
- Add calendar source by URL, PDF upload, ICS URL, Google Calendar, and Outlook Calendar.
- Extract school/university breaks, holidays, term dates, exams, and activity conflicts.
- **Boundary-pair inference (EXT-009): synthesize `class_in_session` and `exam_period` intervals between recognized academic boundaries so academic calendars carry meaningful busy/free semantics.**
- **LLM-assisted fallback classification (EXT-010) for ambiguous events.**
- Parent review and confirmation workflow.
- Free-window search by requested duration **or by natural-language query (MAT-008)**.
- **Long-weekend recognition (MAT-009) and weekend carve-out within in-session intervals (MAT-010).**
- Calendar/timeline visualization with **source-aware legend, per-source filter, and drilldown side panel (UI-006, UI-007)**.
- Optional term-overview view mode (UI-008).
- Source provenance and confidence scores.
- Basic source refresh and change alerting for public URLs and ICS feeds.
- Export saved free windows to Google or Outlook Calendar.
- In-product account deletion and OAuth disconnect.

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

### Phase 1: Prototype (shipped)

- Manual URL/PDF/ICS import.
- Email/password, Google login, Login with Apple, Continue with Microsoft.
- Google Calendar and Outlook Calendar import.
- Basic extraction from selected source examples.
- Parent review screen.
- Free-window interval engine.
- Simple timeline visualization.
- Source provenance on timeline tooltips.
- Source refresh scheduler + change detection.
- Export saved windows to Google / Outlook.
- Account deletion + OAuth disconnect.

### Phase 2: Intelligent MVP Beta (in progress — Rounds 15-18)

- **Round 15 — UI foundations**: all-day end-day display fix; source legend + filter + drilldown side panel.
- **Round 16 — Semantic redesign**: boundary-pair inference; weekend carve-out from in-session ranges; long-weekend labelling; optional term-overview view mode.
- **Round 17 — LLM foundation**: Anthropic SDK plumbing; LLM-assisted classification of ambiguous extracted events (closes #52).
- **Round 18 — Natural-language search**: free-text input on `/windows` that parses to structured search params via Claude, with a "show parse before running" UX.
- **Round 19 — UAT gate**: end-to-end UAT against real UCLA / Vanderbilt / Google / ICS sources. Decision point: limited cohort release vs continue iterating.

The user-acceptance bar for Phase 2 is that a parent can import a real academic calendar (UCLA PDF or similar) and get *meaningful* busy/free shading on the timeline without having to mentally invert "begins"/"ends" markers into term ranges.

### Phase 3: Public Launch

- Parser coverage across top districts and universities (close out [#11](https://github.com/igortsives/togetherly/issues/11) corpus research).
- Saratoga / LGSUHSD corpus capture (close out [#19](https://github.com/igortsives/togetherly/issues/19)).
- Better mobile onboarding.
- Share/export flows beyond personal-calendar export.
- Activity calendar feed library.
- Provider webhooks for near-real-time change detection (close out [#50](https://github.com/igortsives/togetherly/issues/50)).
- Paid plan for unlimited calendars, monitoring, and alerts.

## 16. Build Recommendation

Proceed with a constrained MVP.

The product is feasible if the team treats source acquisition as a confidence-based workflow rather than a fully automatic guarantee. The strongest first version is a planning assistant that imports and verifies calendars, computes overlapping free windows, and gives parents confidence through source-backed explanations.

The product should not initially promise “we find every calendar automatically.” It should promise: **“Bring us your kids’ school and activity calendars, and we’ll show when your whole family is free.”**
