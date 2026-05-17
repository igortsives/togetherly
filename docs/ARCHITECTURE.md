# Architecture

## Decisions

| Area | Decision |
|---|---|
| Product surface | Private beta |
| Platform | Responsive web app first, native mobile later |
| Frontend | Next.js + TypeScript |
| Backend | Next.js server actions + route handlers for MVP; extract workers/services when ingestion load requires it |
| Database | PostgreSQL |
| ORM | Prisma |
| File storage | Local filesystem in development; object storage in beta/prod |
| Auth | NextAuth v5 (Auth.js) + Prisma adapter, JWT sessions, email/password (bcryptjs) + Google + Apple + Microsoft. Microsoft is both a sign-in option on `/login` (PR #119) and a linkable provider for Outlook calendar access. |
| Calendar integrations | PDF, URL, ICS, Google Calendar, Outlook Calendar |
| Parsing | Deterministic parsers for structured providers (ICS, Google, Microsoft Graph); LLM-only extraction for unstructured sources (HTML, PDF text) via Claude — heuristic HTML/PDF extractors were removed 2026-05-17, see [`DECISIONS.md`](./DECISIONS.md#2026-05-17--remove-heuristic-htmlpdf-extractors-llm-is-the-only-path). |
| Review model | Parent confirmation required before extracted events affect recommendations |

## System Overview

```mermaid
flowchart LR
  User["Parent Web App"] --> Auth["NextAuth (Auth.js)"]
  User --> Family["Family Setup"]
  User --> Sources["Source Import"]
  Sources --> Fetcher["Fetcher (URL/ICS/PDF blob/Provider API)"]
  Fetcher --> Extractors["Extractors: ICS (ical.js), HTML/PDF (Claude LLM), Google, Microsoft Graph"]
  Extractors --> Normalizer["Schema validation + classification"]
  Normalizer --> Review["Parent Review Queue (/review)"]
  Review --> Events["Confirmed CalendarEvent rows"]
  Events --> Matcher["Free Window Engine (lib/matching)"]
  Matcher --> UI["Timeline + /windows results"]
  User --> NlSearch["Natural-language search (lib/matching/nl-search.ts)"]
  NlSearch --> Matcher
  Fetcher --> Monitor["Source Monitor (lib/sources/scheduler.ts)"]
  Monitor --> Alerts["Stale-flag on FreeWindowSearch + dashboard chip"]
```

Source refresh runs on (a) inline creation, (b) parent-triggered manual refresh, and (c) the daily Vercel cron (`vercel.json` → `/api/internal/refresh-sources`). Change detection flips `FreeWindowSearch.stale` and chips the dashboard. Provider webhooks for near-real-time alerts remain deferred (#50).

## Core Services

| Service | Status | Responsibility |
|---|---|---|
| Auth service | Shipped (#17, PR #31; Microsoft on /login PR #119) | NextAuth v5 + Prisma adapter. Configured in [`auth.ts`](../auth.ts) and gated by [`proxy.ts`](../proxy.ts). Email/password via Credentials provider with bcrypt; Google, Apple, and Microsoft as OAuth sign-in options on `/login`. |
| Family service | Shipped | Families, children, calendar ownership, calendar tags. Pure helpers in [`lib/family/dashboard.ts`](../lib/family/dashboard.ts), [`lib/family/timeline.ts`](../lib/family/timeline.ts), and [`lib/family/dates.ts`](../lib/family/dates.ts) (TZ-correct YMD parsing via `parseYmdAtLocalMidnight`, PR #167). Auth-coupled session resolution in [`lib/family/session.ts`](../lib/family/session.ts). |
| Source service | Shipped (URL/ICS/PDF/Google/Outlook) | URL/PDF/ICS/provider source metadata. Provider-specific ingest orchestrators live in `lib/sources/*-ingest.ts`. Per-source ingest-window floor (`CalendarSource.ingestWindowStart`) applied via [`lib/sources/ingest-window.ts`](../lib/sources/ingest-window.ts) inside every extractor (PR #161). |
| Fetch service | Shipped | URL/ICS via global `fetch`; PDF via the local filesystem under `FILE_STORAGE_ROOT`; Google via Calendar API v3; Microsoft via Graph v1.0. |
| Extract service | Shipped | Pure ICS extractor at [`lib/sources/extractors/ics.ts`](../lib/sources/extractors/ics.ts); LLM-only extractor at [`lib/sources/extractors/llm.ts`](../lib/sources/extractors/llm.ts) drives HTML and PDF ingestion; plus provider mappers (`google-ingest.ts`, `microsoft-ingest.ts`). The heuristic HTML/PDF extractors were removed 2026-05-17 ([`DECISIONS.md`](./DECISIONS.md#2026-05-17--remove-heuristic-htmlpdf-extractors-llm-is-the-only-path)). |
| Normalize service | Shipped | Validation via `eventCandidateInputSchema` + classification (LLM emits the category for HTML/PDF, constrained to the `EventCategory` enum; provider-aware classification for ICS/Google/Outlook). |
| Review service | Shipped (#8, PR #23) | `/review` route + `lib/review/`. Pure helpers test-covered; server actions in `app/review/actions.ts`. |
| Matching service | Shipped (#9, PR #24; NL search PR #166) | `lib/matching/free-windows.ts` math + `lib/matching/event-busy.ts` interval mapper + `lib/matching/search.ts` server orchestration + `lib/matching/nl-search.ts` Claude-driven natural-language query parser (Round 18). |
| Alert service | Shipped (#12, #41, PRs #36 / #99) | `refreshSource` detects candidate-set changes and flips `FreeWindowSearch.stale`; `/windows` surfaces a re-run banner. Provider webhooks for near-real-time alerts remain deferred (#50). |

## Authentication

Implemented in [`auth.ts`](../auth.ts) using `next-auth@^5.0.0-beta` with `@auth/prisma-adapter`.

- **Session strategy:** JWT (no `Session` DB rows hit on every request). The `Session` and `VerificationToken` Prisma models exist for completeness but are unused by the current JWT-mode setup.
- **Providers:**
  - **Credentials** — always on. Reads `User.passwordHash` and verifies with `bcryptjs.compare`. Login schema in [`lib/auth/schemas.ts`](../lib/auth/schemas.ts).
  - **Google** — conditional on `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Scopes: `openid email profile https://www.googleapis.com/auth/calendar.readonly`. `access_type=offline`, `prompt=consent`, `allowDangerousEmailAccountLinking=true`.
  - **Apple** — conditional on `APPLE_CLIENT_ID`/`APPLE_CLIENT_SECRET`. Sign-in only; Apple Calendar API not used.
  - **Microsoft Entra ID** — conditional on `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`. Issuer `/common/v2.0` (work + personal accounts). Scopes: `openid email profile offline_access Calendars.ReadWrite`. `prompt=consent`, **no** `allowDangerousEmailAccountLinking` (PR #114, #76) — auto-link-by-email is a takeover vector for personal MSAs where Microsoft does not verify the email at the directory level. Surfaced on `/login` as "Continue with Microsoft" (PR #119) AND as a linkable provider for Outlook calendar access.
- **Proxy:** [`proxy.ts`](../proxy.ts) gates every route except `/login`, `/register`, `/api/auth/*`, `/_next/*`, and `/favicon.ico`. Unauthenticated requests redirect to `/login?callbackUrl=...`. (Renamed from `middleware.ts` for the Next 16 deprecation — same file convention, just the new name; matcher syntax is unchanged.)
- **Family resolution seam:** `requireUserFamily()` in [`lib/family/session.ts`](../lib/family/session.ts) is called by every server action and page reader. It lazily creates a `Family` row owned by the signed-in user if one doesn't exist.
- **Why the file split:** `dashboard.ts` is pure (no `@/auth` import) so the helper tests run under vitest without `server.deps.inline` transformation. `session.ts` is the auth-coupled wrapper.

## Calendar Provider Integrations

OAuth-backed calendar imports use the NextAuth `Account` row attached to the signed-in user. Tokens are stored as **plaintext columns** today (`access_token`, `refresh_token`, `expires_at`); `OAUTH_TOKEN_ENCRYPTION_KEY` is declared in `.env.example` but is not yet wired for column-level encryption — see [`TECH_DEBT.md`](./TECH_DEBT.md).

### Google Calendar (#13, PR #33)

- API client: [`lib/sources/google.ts`](../lib/sources/google.ts).
- Orchestrator: [`lib/sources/google-ingest.ts`](../lib/sources/google-ingest.ts).
- Token refresh: `oauth2.googleapis.com/token` with `grant_type=refresh_token`; rotated tokens land back in the `Account` row.
- API surface used: `/users/me/calendarList`, `/calendars/{id}/events?singleEvents=true&orderBy=startTime`.
- Sync window: 30 days back, 365 days forward. No scheduler.
- Connect flow: dashboard's `linkGoogleAccountAction` calls `signIn("google")`. With `allowDangerousEmailAccountLinking`, this links to the existing Togetherly user when the Google email matches.

### Outlook Calendar (#18, PR #34)

- API client: [`lib/sources/microsoft.ts`](../lib/sources/microsoft.ts).
- Orchestrator: [`lib/sources/microsoft-ingest.ts`](../lib/sources/microsoft-ingest.ts).
- Token refresh: `login.microsoftonline.com/common/oauth2/v2.0/token` with `grant_type=refresh_token` and the same scope set as the original grant.
- API surface used: `/v1.0/me/calendars` and `/v1.0/me/calendars/{id}/calendarView` with `Prefer: outlook.timezone="UTC"`. Pagination via `@odata.nextLink`.
- Sync window: 30 days back, 365 days forward.
- Connect flow: same shape as Google via `linkMicrosoftAccountAction`.

### URL / ICS / PDF

- ICS (#5, PR #22): [`lib/sources/extractors/ics.ts`](../lib/sources/extractors/ics.ts) using `ical.js`. RRULE expansion handled in-extractor.
- HTML: orchestrator at [`lib/sources/html-ingest.ts`](../lib/sources/html-ingest.ts) calls the LLM extractor at [`lib/sources/extractors/llm.ts`](../lib/sources/extractors/llm.ts). HTML is normalized to text (`jsdom`) before being passed to Claude. Without `ANTHROPIC_API_KEY`, refresh fails with `HtmlExtractionUnavailableError`. (Heuristic extractor removed 2026-05-17, see [`DECISIONS.md`](./DECISIONS.md#2026-05-17--remove-heuristic-htmlpdf-extractors-llm-is-the-only-path).)
- PDF text: orchestrator at [`lib/sources/pdf-ingest.ts`](../lib/sources/pdf-ingest.ts) calls the same LLM extractor. PDF text is read with `pdf-parse` (loaded via `createRequire`) before being passed to Claude. Without `ANTHROPIC_API_KEY`, refresh fails with `PdfExtractionUnavailableError`.
- LLM extractor: [`lib/sources/extractors/llm.ts`](../lib/sources/extractors/llm.ts) calls the wrapper at [`lib/llm/anthropic.ts`](../lib/llm/anthropic.ts) (Claude Sonnet) with a structured-output Zod schema constrained to the `EventCategory` enum.

## Repository Shape (current, not aspirational)

```text
app/
  api/auth/[...nextauth]/route.ts   NextAuth handler
  components/Timeline.tsx           Real per-child timeline (PR #27)
  login/, register/                 Auth surfaces (PR #31)
  review/                           Review queue UI + actions (PR #23)
  windows/                          Free-window search + results (PR #24)
  actions.ts                        Top-level server actions: source create/refresh/delete, search, sign-out, OAuth link/disconnect, calendar lifecycle (deleteCalendarAction / trimCalendarEventsAction / updateSourceIngestWindowAction, PR #161), natural-language search parse (parseNaturalLanguageSearchAction, PR #166)
  page.tsx                          Dashboard
  globals.css                       Utility CSS (Stitch design integration is #32)
auth.ts                             NextAuth config (root, imported by proxy + handlers)
proxy.ts                            Route gating (renamed from middleware.ts for Next 16)
lib/
  auth/schemas.ts                   Zod schemas for credentials login/register
  db/prisma.ts                      Prisma client singleton
  domain/                           Event taxonomy + canonical schemas
  family/
    dashboard.ts                    Pure family-resolution helpers
    session.ts                      auth() wrapper, requireUserFamily()
    timeline.ts                     Dashboard timeline data shaping (MIN_TERM_BLOCK_DAYS exported, PR #167)
    dates.ts                        TZ-correct YMD parsing (parseYmdAtLocalMidnight, PR #167)
  matching/                         free-windows + event-busy + search orchestrator + nl-search.ts (Claude-driven NL query parser, PR #166)
  review/                           Candidate → CalendarEvent helpers + queue reader
  llm/
    anthropic.ts                    Claude Sonnet wrapper with structured-output validation
  sources/
    extractors/                     ics.ts (pure parser) + llm.ts (Claude-driven HTML/PDF extractor)
    google.ts, google-ingest.ts     Google Calendar API client + orchestrator
    microsoft.ts, microsoft-ingest.ts Outlook API client + orchestrator
    ics-ingest.ts, html-ingest.ts, pdf-ingest.ts
    ingest-window.ts                Per-source ingest-window floor (PR #161)
    scheduler.ts, refresh.ts        Daily refresh + per-account locking + change detection
    source-metadata.ts, storage.ts  Source-type metadata + local PDF blob store (refcounted unlink, PR #167)
prisma/
  schema.prisma                     User/Account/Session + Family/Child/Calendar/CalendarSource/EventCandidate/CalendarEvent/FreeWindowSearch/FreeWindowResult
  migrations/
  seed.mjs                          Demo family seed (bcrypt-hashed passwordHash)
fixtures/
  README.md
  sources/{html,pdf,ics}/
  expected-events/
docs/
```

## Runtime Flow

1. Parent signs in via `/login` (credentials, Google, Apple, or Microsoft) or registers at `/register`. Middleware redirects all other routes to `/login` when unauthenticated.
2. `requireUserFamily()` resolves (or lazily creates) the parent's `Family` row on first dashboard load.
3. Parent creates children and calendars.
4. Parent adds a calendar source: URL/ICS/PDF directly, or links a Google/Microsoft account and picks one of their calendars.
5. The source-creation server action persists the `CalendarSource` row and **synchronously** kicks off the matching extractor/orchestrator. On success: `parserType` is set, `lastFetchedAt`/`lastParsedAt` are stamped, `refreshStatus` becomes `OK` (or `NEEDS_REVIEW` if any per-event errors), and `EventCandidate` rows are inserted. On failure: `refreshStatus=FAILED` and the error is logged.
6. Parent visits `/review`, confirms / edits / rejects candidates. Confirmation creates a `CalendarEvent` row linked to the candidate.
7. Parent visits `/windows`, picks date range + minimum days + unknown/exam-handling flags. The search action reads confirmed `CalendarEvent` rows, builds busy intervals, computes free windows with `findExplainedFreeWindows`, persists a `FreeWindowSearch` + `FreeWindowResult` rows, and redirects to the results view.
8. Dashboard `/` renders a per-child timeline of confirmed events with low-confidence shading and (when available) the latest recommended-window overlay.

## Deployment Assumption

Private beta can run as a hosted Next.js app with managed PostgreSQL and object storage. Background work is currently a route-triggered task (extractors fire inline during source creation). Move to a queue once source refresh (#12), large PDFs, or provider sync jobs require durable async processing.

## Architecture Risks

| Risk | Status | Mitigation |
|---|---|---|
| Ingestion jobs become slow | Open | Introduce queue and worker process before public launch. Today all extractors run inline during the create-source request. |
| LLM extraction is inconsistent | Mitigated | Claude is constrained to a Zod-validated structured output (canonical `eventCandidateInputSchema` shape, `EventCategory` enum). Schema-invalid candidates are dropped defensively. Refresh fails fast with `HtmlExtractionUnavailableError` / `PdfExtractionUnavailableError` when the API key is unset. Decision logged 2026-05-17 in [`DECISIONS.md`](./DECISIONS.md#2026-05-17--remove-heuristic-htmlpdf-extractors-llm-is-the-only-path). |
| OAuth tokens require strict handling | Partial | Auth.js encrypts cookies via `AUTH_SECRET`; provider tokens are stored as plaintext columns. Column-level encryption with `OAUTH_TOKEN_ENCRYPTION_KEY` is tracked in `TECH_DEBT.md`. |
| Date/time bugs affect recommendations | Mitigated | Extractors anchor all-day events at UTC midnight; ICS recurrence + DST tests live in `lib/sources/extractors/ics.test.ts`. |
| Parser code becomes source-specific | Mitigated | Fixtures live under `fixtures/sources/` keyed by structural pattern, not school name. The HTML/PDF path is institution-agnostic by construction — Claude reads any text-based calendar and emits the canonical schema; there is no per-institution code to maintain. |
| Email-based account linking allows takeover | Open | `allowDangerousEmailAccountLinking=true` on Google + Microsoft providers. Acceptable for private beta; revisit before public launch (`TECH_DEBT.md`). |
