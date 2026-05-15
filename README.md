# Togetherly

Togetherly helps families find overlapping free time across children's school, university, camp, sports, music, and afterschool calendars so parents can plan vacations and getaways with less manual calendar work.

## Product Direction

- Platform: responsive web app first, native mobile later.
- Surface: private beta.
- Auth: email/password, Google login, Login with Apple, plus Microsoft account linking for Outlook Calendar.
- Data: PostgreSQL.
- Calendar imports: PDF, URL, ICS, Google Calendar, and Outlook Calendar.
- Parsing: deterministic parsers shipped today; LLM-assisted extraction is deferred.
- Initial source corpus: UCLA (live), Vanderbilt (live), Saratoga High School / Los Gatos-Saratoga Union High School District (still synthetic).

## Quick Start

```bash
npm install
cp .env.example .env  # fill in DATABASE_URL + AUTH_SECRET at minimum
npx prisma migrate dev
npm run prisma:seed   # optional; creates a demo family
npm run dev           # http://localhost:3000
```

Sign in at `/login` with the seeded demo user (`beta-parent@togetherly.local` / `togetherly-dev`, override via `SEED_DEMO_PASSWORD`) or register a new account at `/register`. Google and Microsoft OAuth buttons appear conditionally when their `*_CLIENT_ID`/`*_CLIENT_SECRET` env vars are set.

**Heads-up:** if you migrate the schema after a previous seed without re-running `npm run prisma:seed`, the demo user has no `passwordHash` and credentials sign-in fails. Re-run the seed to fix.

## Surfaces

| Route | Purpose |
|---|---|
| `/` | Family setup, sources panel (URL/ICS/PDF/Google/Outlook), per-child timeline |
| `/login`, `/register` | Auth surfaces (gated by [`proxy.ts`](./proxy.ts)) |
| `/review` | Confirm / edit / reject extracted candidates before they affect matching |
| `/windows` | Free-window search form and results with conflict explanations |

## Validation

```bash
npm run lint
npm run typecheck
npm test            # vitest
npm run build       # production build
```

## Documents

- [PRD](./PRD.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [MVP Spec](./docs/MVP_SPEC.md)
- [Data Model](./docs/DATA_MODEL.md)
- [Parsing Strategy](./docs/PARSING_STRATEGY.md)
- [Source Corpus](./docs/SOURCE_CORPUS.md)
- [Private Beta Plan](./docs/BETA_PLAN.md)
- [Security And Privacy](./docs/SECURITY_PRIVACY.md)
- [Privacy And Child-Data Handling](./docs/PRIVACY.md)
- [Engineering Setup](./docs/ENGINEERING_SETUP.md)
- [Tech Debt + TODOs](./docs/TECH_DEBT.md)
- [GitHub Tracking](./docs/GITHUB_TRACKING.md)
- [Roadmap](./docs/ROADMAP.md)

## GitHub Tracking

GitHub Issues is the source of truth for execution tracking. The first milestone is `MVP Prototype`.
