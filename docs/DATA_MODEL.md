# Data Model

## Guiding Principles

- Store child data minimally.
- Preserve source provenance for every extracted event.
- Separate candidate extraction from confirmed events.
- Treat review status as a first-class data field.
- Keep event date handling explicit and testable.

## Core Entities

### User

| Field | Notes |
|---|---|
| id | Primary key |
| email | Unique |
| name | Optional |
| auth_provider | email, google, apple |
| created_at | Timestamp |
| updated_at | Timestamp |

### Family

| Field | Notes |
|---|---|
| id | Primary key |
| owner_user_id | User owner |
| name | Optional display name |
| timezone | Default family timezone |
| created_at | Timestamp |
| updated_at | Timestamp |

### Child

| Field | Notes |
|---|---|
| id | Primary key |
| family_id | Parent family |
| nickname | Required |
| color | UI helper |
| created_at | Timestamp |
| updated_at | Timestamp |

### Calendar

| Field | Notes |
|---|---|
| id | Primary key |
| family_id | Required |
| child_id | Optional for parent/family calendars |
| name | Display name |
| type | school, university, camp, sport, music, activity, parent, custody, other |
| enabled | Boolean |
| timezone | Optional override |
| created_at | Timestamp |
| updated_at | Timestamp |

### CalendarSource

| Field | Notes |
|---|---|
| id | Primary key |
| calendar_id | Required |
| source_type | url, pdf_upload, ics, google_calendar, outlook_calendar |
| source_url | Optional |
| uploaded_file_key | Optional |
| provider_calendar_id | Optional |
| content_hash | Optional |
| parser_type | html, pdf_text, pdf_ocr, ics, google, outlook, unknown |
| last_fetched_at | Optional |
| last_parsed_at | Optional |
| refresh_status | ok, failed, changed, needs_review |
| created_at | Timestamp |
| updated_at | Timestamp |

### EventCandidate

| Field | Notes |
|---|---|
| id | Primary key |
| calendar_source_id | Required |
| calendar_id | Required |
| raw_title | Extracted title |
| normalized_title | Optional |
| category | school_closed, break, class_in_session, exam_period, activity_busy, optional, unknown, manual_block |
| suggested_busy_status | busy, free, configurable, unknown |
| start_at | Timestamp or date boundary |
| end_at | Timestamp or date boundary |
| all_day | Boolean |
| timezone | Required |
| confidence | Decimal 0-1 |
| evidence_text | Source excerpt |
| evidence_locator | PDF page, DOM selector, feed UID, provider event ID |
| review_status | pending, confirmed, edited, rejected |
| created_at | Timestamp |
| updated_at | Timestamp |

### CalendarEvent

Confirmed or manually created event used by matching.

| Field | Notes |
|---|---|
| id | Primary key |
| calendar_id | Required |
| event_candidate_id | Optional source candidate |
| title | Required |
| category | Required |
| busy_status | busy, free, configurable |
| start_at | Required |
| end_at | Required |
| all_day | Boolean |
| timezone | Required |
| source_confidence | Optional |
| created_by | user, extractor, provider_sync |
| created_at | Timestamp |
| updated_at | Timestamp |

### FreeWindowSearch

| Field | Notes |
|---|---|
| id | Primary key |
| family_id | Required |
| start_date | Search boundary |
| end_date | Search boundary |
| minimum_days | Required |
| include_unknown_as_busy | Boolean |
| include_exam_periods_as_busy | Boolean |
| created_at | Timestamp |

### FreeWindowResult

| Field | Notes |
|---|---|
| id | Primary key |
| search_id | Required |
| start_date | Candidate window start |
| end_date | Candidate window end |
| duration_days | Integer |
| score | Optional ranking |
| explanation | JSON |
| saved | Boolean |

## Event Categories

| Category | Default Busy Status |
|---|---|
| school_closed | free |
| break | free |
| class_in_session | busy |
| exam_period | configurable |
| activity_busy | busy |
| optional | configurable |
| unknown | requires review |
| manual_block | busy |

## Date Handling Rules

- Store all-day school dates as date-like intervals with family/source timezone.
- Treat `end_at` as exclusive internally where possible.
- Preserve source timezone separately from user timezone.
- Use explicit tests for date ranges crossing daylight saving boundaries.
- Never infer student availability from university term dates without confidence and review.
