# Decisions

## Accepted Product Decisions

| Decision | Value |
|---|---|
| App platform | Responsive web app first, native mobile later |
| Auth model | Email/password, Google login, Login with Apple |
| Data storage | PostgreSQL |
| Calendar integrations | PDF, URL, ICS, Google Calendar, Outlook Calendar in MVP |
| Parsing strategy | Hybrid deterministic + LLM-assisted |
| First source corpus | UCLA, Vanderbilt, Saratoga High School / LGSUHSD |
| Product surface | Private beta |

## Notes

- Privacy is not considered a blocker, but baseline security controls are still required because the app handles children’s schedules and OAuth tokens.
- Parent review remains required before extracted source data affects recommendations.
- The MVP should prove ingestion and trust before expanding into native mobile or authenticated school portal integrations.
