# Decisions

## Accepted Product Decisions

| Decision | Value |
|---|---|
| App platform | Responsive web app first, native mobile later |
| Auth model | Email/password, Google login, Login with Apple, Continue with Microsoft |
| Data storage | PostgreSQL |
| Calendar integrations | PDF, URL, ICS, Google Calendar, Outlook Calendar in MVP |
| Parsing strategy | Provider APIs for structured sources (ICS / Google / Outlook); LLM-only extraction (Claude Sonnet) for unstructured HTML / PDF — no deterministic HTML/PDF parser, no heuristic fallback (deleted 2026-05-17). Format-agnostic boundary-pair inference runs as a post-pass on whatever the extractor produces. |
| Free-window search input | Structured form AND natural-language query (LLM-parsed) |
| Source fixtures | UCLA + Vanderbilt (live 2026-27 captures). Role under LLM-only extraction: regression tests for our format-agnostic post-processing + an offline prompt-eval set — NOT per-format parser validation, and not a guarantee that a later year's format will extract cleanly (resilience to format drift comes from the LLM + confidence + review queue, not fixtures). |
| Product surface | Private beta |
| LLM provider | Anthropic Claude (Sonnet) via `@anthropic-ai/sdk` |
| Beta launch gating | UAT pass at end of Round 19 (Phase 2.5 redesign) |

## Notes

- Privacy is not considered a blocker, but baseline security controls are still required because the app handles children's schedules and OAuth tokens.
- Parent review remains required before extracted source data affects recommendations.
- The MVP should prove ingestion and trust before expanding into native mobile or authenticated school portal integrations.

## Decision Log

### 2026-05-16 — Defer private-beta invitations until Intelligent Calendar Redesign is complete

UAT of the UCLA PDF import revealed that academic calendars do not carry the busy/free semantics a parent expects. Term boundaries are ingested as isolated markers; the time between them is not treated as in-session. Weekends within a term are not carved out. Long-weekend free windows are not flagged. Single-day all-day events render as two days because the exclusive `endAt` is displayed literally. Source attribution is buried in tooltips, not surfaced as a first-class UX. The free-window search UI requires precise date inputs which parents do not think in.

Decision: do not invite even a small cohort until these gaps are closed. Captured as Phase 2.5 in [`ROADMAP.md`](./ROADMAP.md) (Rounds 15-18) with a UAT gate in Round 19.

Trade-off considered:
- **Alternative**: ship to 2-3 friendly families now to get real-world feedback.
- **Rejected because**: first impressions matter; the gaps named are not edge cases but the most common use case (school-aged child with an academic calendar).

### 2026-05-16 — Adopt Anthropic Claude as the LLM provider

Two capabilities require an LLM: classification of ambiguous extracted events (EXT-010) and natural-language parsing of free-window search queries (MAT-008). Both are bounded in scope, structured-output-constrained, and have heuristic fallbacks.

Decision: use Anthropic Claude (Sonnet) via the official `@anthropic-ai/sdk`. `ANTHROPIC_API_KEY` env var; product no-ops gracefully when unset so local dev / CI without a key still produces a working product.

Trade-off considered:
- **Alternative**: OpenAI GPT-4o, Google Gemini, on-device open model.
- **Rejected reasoning**: Claude's structured-output and tool-use ergonomics are the cleanest of the three for our shape of work; cost is bounded; we have institutional familiarity. On-device is a non-starter for parse latency.

### 2026-05-17 — Remove heuristic HTML/PDF extractors; LLM is the only path

PR #152 shipped LLM-primary extraction with the heuristic kept as a fallback "for unconfigured deploys." Independent review of PR #152 surfaced that the fallback only worked on the three hand-curated fixtures (UCLA, Vanderbilt, Saratoga) and silently failed on the real-world Vanderbilt URL ([#151](https://github.com/igortsives/togetherly/issues/151)) — confirming the strategic concern that per-format heuristics don't scale.

The fallback was therefore "works on test fixtures, fails on real users without an API key" — the worst of both worlds. Maintaining ~1,200 lines of regex/keyword heuristic code that doesn't actually rescue real users is a net negative.

Decision: delete the heuristic HTML and PDF extractors. Make `ANTHROPIC_API_KEY` a hard dependency for HTML/PDF ingestion. Surface a clean `HtmlExtractionUnavailableError` / `PdfExtractionUnavailableError` when the key is unset; the existing source-refresh-failure UX (refresh button → "Failed" pill, manual retry) handles it.

Trade-offs accepted:
- **Hard dependency on Anthropic API availability** for HTML/PDF ingestion (not for Google/Outlook/ICS, not for free-window search, not for auth — those paths are unchanged).
- **Local-dev / CI setup friction**: every developer needs an Anthropic key. CI uses a placeholder because tests mock the SDK. Documented in [`ENGINEERING_SETUP.md`](./ENGINEERING_SETUP.md).
- **Cost**: documented in [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) §5 (~$5-15/month with content-hash short-circuit, ~$150/month worst case without).
- **Source paths preserved**: Google Calendar, Outlook Calendar, and ICS feeds use provider APIs that return structured data and don't need an LLM. Unchanged.

Alternatives considered:
- *Keep heuristics for the deterministic fixture test path* — rejected because confused architecture; the LLM mock in tests gives the same determinism without a parallel code path.
- *Deprecate heuristics for one release, then delete* — rejected because the deprecation window adds risk without value; the heuristics aren't earning their keep today.

### 2026-05-16 — Source-aware UI is a beta-blocker, not v1.1

The dashboard's per-block source attribution shipped in PR #119 (tooltips only) is not sufficient for a family with 4-8 active sources. A source legend, per-source toggle, and drilldown panel are required for parents to answer "why is this day blocked?" without leaving the dashboard.

Decision: include the source-aware UI work in Round 15 alongside the all-day display fix, not as a post-beta enhancement.
