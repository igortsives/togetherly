# Engineering Setup

## Recommended Stack

| Layer | Choice |
|---|---|
| App | Next.js |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Auth.js or equivalent with email/password, Google, Apple |
| Calendar APIs | Google Calendar API, Microsoft Graph Calendar API |
| PDF extraction | Text/table extraction first; OCR later |
| ICS parsing | RFC 5545-compatible parser library |
| Testing | Unit tests for matching/parsing, integration tests for import flow, Playwright for core UI |

## Initial Setup Tasks

1. Scaffold Next.js + TypeScript app.
2. Add linting and formatting.
3. Add PostgreSQL and Prisma.
4. Define initial Prisma schema from `docs/DATA_MODEL.md`.
5. Add auth providers.
6. Add source import skeleton.
7. Add parser fixture directory.
8. Add matching engine tests before UI.
9. Add GitHub Actions for lint/test.

## Environment Variables

```text
DATABASE_URL=
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
OAUTH_TOKEN_ENCRYPTION_KEY=
FILE_STORAGE_ROOT=
```

## Development Commands

Exact commands should be filled in after scaffolding. Expected shape:

```bash
npm install
npm run dev
npm run lint
npm run test
npm run test:e2e
npx prisma migrate dev
```

## Test Strategy

| Area | Tests |
|---|---|
| Matching engine | Unit tests for busy/free interval union and intersection |
| Date handling | Timezone and all-day date range tests |
| Parsers | Fixture-based regression tests |
| Source import | Integration tests for URL/PDF/ICS/provider import |
| Review workflow | UI and API tests for confirm/edit/reject |
| Auth | Provider smoke tests in staging/private beta |

## Branching

- Default branch should be `main`.
- Feature branches should use `codex/` prefix unless otherwise requested.
- GitHub Issues should be linked from branches and pull requests.

## Definition Of Done

- Requirement linked to a GitHub Issue.
- Tests added or explicitly deferred.
- Parser changes include fixture coverage.
- UI changes checked on desktop and mobile widths.
- Sensitive data handling reviewed when touching auth, files, or provider integrations.
