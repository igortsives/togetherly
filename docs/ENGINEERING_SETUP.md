# Engineering Setup

## Stack (as built)

| Layer | Choice |
|---|---|
| App | Next.js 16 (Turbopack dev server) |
| Language | TypeScript (strict) |
| Database | PostgreSQL |
| ORM | Prisma 6 |
| Auth | NextAuth v5 (Auth.js) + `@auth/prisma-adapter`, JWT sessions, `bcryptjs` for credentials |
| Calendar APIs | Google Calendar API v3, Microsoft Graph v1.0 |
| ICS parsing | `ical.js` |
| HTML parsing | `jsdom` (runtime dependency) |
| PDF extraction | `pdf-parse` (text-layer only; OCR deferred) |
| Testing | Vitest + Testing Library; jsdom environment |

## Prerequisites

- Node 22+ (Next 16 requirement).
- PostgreSQL accessible via `DATABASE_URL`.
- For OAuth providers, the matching `*_CLIENT_ID`/`*_CLIENT_SECRET` pair. Each provider is conditional on its env vars — leaving them empty disables the provider without breaking the build.

## Environment Variables

```text
# Required
DATABASE_URL=postgresql://...
AUTH_SECRET=                     # used by Auth.js to encrypt cookies and JWTs

# Optional providers (each pair is independently optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Required when any OAuth provider is enabled — encrypts access/refresh/id_token columns
# in the Account table. Generate with: openssl rand -base64 32
# Rotating this key invalidates every linked OAuth account (users must re-link).
OAUTH_TOKEN_ENCRYPTION_KEY=

# Local PDF blob storage root (defaults to ./storage)
FILE_STORAGE_ROOT=

# Optional: override the seed user's password
SEED_DEMO_PASSWORD=togetherly-dev
```

See [`.env.example`](../.env.example) for the canonical template.

## OAuth Credential Setup

Both providers need a redirect URI of `http://localhost:3000/api/auth/callback/<provider>` in their developer console.

### Google

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Enable the Google Calendar API on the project.
3. Create an OAuth 2.0 Client ID of type "Web application".
4. Add redirect URI `http://localhost:3000/api/auth/callback/google`.
5. Add scopes during the OAuth consent screen setup: `userinfo.email`, `userinfo.profile`, `openid`, `https://www.googleapis.com/auth/calendar.readonly`.
6. Copy the client ID and secret into `.env`.

### Microsoft

1. Register an app in [Entra ID](https://entra.microsoft.com/) → App registrations → New registration.
2. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts" (matches our `/common/v2.0` issuer).
3. Add redirect URI `http://localhost:3000/api/auth/callback/microsoft-entra-id` (Web platform).
4. Under "Certificates & secrets", create a client secret and copy the value.
5. Under "API permissions", add `Calendars.Read` (delegated) and `offline_access`. Grant admin consent if your tenant requires it.
6. Copy the Application (client) ID and secret into `.env`.

### Apple

1. Apple Sign In requires an Apple developer account, a Services ID, and an authentication key. See [Apple's docs](https://developer.apple.com/documentation/sign_in_with_apple).
2. The "client secret" is a JWT you generate from the key; rotate it periodically. Most teams generate it once at deploy time.

## First-Time Local Setup

```bash
npm install
cp .env.example .env  # fill in DATABASE_URL + AUTH_SECRET at minimum
npx prisma migrate dev
npm run prisma:seed   # demo family at beta-parent@togetherly.local / togetherly-dev
npm run dev
```

Sign in at `http://localhost:3000/login` or register a fresh account at `/register`.

### Seed-after-migration gotcha

If you already had a `beta-parent@togetherly.local` user from an earlier seed and then ran `npx prisma migrate dev` to apply the auth migration, the demo user **exists but has no `passwordHash`** — the new column is null for existing rows. Credentials sign-in returns `CredentialsSignin` until you re-run `npm run prisma:seed`, which upserts the bcrypt hash. The seed is safe to re-run.

## Development Commands

```bash
npm run dev          # Next dev server with Turbopack
npm run build        # prisma generate + next build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:watch   # vitest in watch mode
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
npm run prisma:seed  # via the `prisma.seed` config in package.json (`npx prisma db seed`)
```

## Test Strategy

| Area | Tests | Where |
|---|---|---|
| Matching engine | Unit tests for busy/free interval union, intersection, and explained-window helpers | `lib/matching/*.test.ts` |
| Date handling | All-day UTC anchoring, DST-aware ICS recurrence, range parsing | `lib/sources/extractors/ics.test.ts`, `pdf.test.ts`, `html.test.ts` |
| Parsers | Fixture-backed regression tests for ICS + HTML + PDF + Google + Microsoft event mapping | `lib/sources/**.test.ts` and `fixtures/sources/` |
| Source import | Pure-mapping coverage for each extractor; orchestrator paths are exercised through integration of mocked Prisma + injected fetch | `lib/sources/*-ingest.test.ts`, `google.test.ts`, `microsoft.test.ts` |
| Review workflow | Helper unit tests for candidate → CalendarEvent mapping with overrides | `lib/review/candidates.test.ts` |
| Auth | Pure resolution test for `resolveFamilyForUser` + `UnauthenticatedError` shape | `lib/family/dashboard.test.ts` |
| E2E (Playwright) | Not yet implemented; deferred to Phase 3 |

### Vitest gotcha

`vitest.config.ts` declares `server.deps.inline: ["next-auth", "@auth/core", "@auth/prisma-adapter"]`. Without this, modules that transitively import `next-auth` fail to resolve `next/server` under the jsdom environment. This is a known interop gap with next-auth v5 beta; re-evaluate when the stable release lands.

The `@/` path alias is configured in `vitest.config.ts` (mirrors `tsconfig.json`).

## Branching

- Default branch is `main`.
- Feature branches use the `codex/` prefix.
- Every change goes through a GitHub PR; squash-merge is the established workflow (PR title becomes the squash commit subject).

## Definition Of Done

- Requirement linked to a GitHub Issue (or explicitly tracked in `docs/TECH_DEBT.md`).
- Tests added or explicitly deferred with a comment.
- Parser changes include fixture coverage.
- UI changes checked on the dashboard and any new routes; accessibility per [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) (color is never the sole carrier of state).
- Sensitive-data handling reviewed against [`docs/PRIVACY.md`](./PRIVACY.md) when touching auth, files, or provider integrations.
- All four gates green: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
