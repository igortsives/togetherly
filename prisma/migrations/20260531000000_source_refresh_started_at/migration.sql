-- Issue #170: move the LLM call outside the source-refresh transaction.
-- A nullable claim timestamp lets a refresher mark a source as
-- "refresh in progress" in a brief transaction, run the LLM with no
-- DB transaction held, then clear the claim in a second brief
-- transaction. A concurrent refresher that sees a recent claim bails
-- so only one runs the LLM; a stale claim (older than the recovery
-- TTL in lib/sources/refresh.ts) is reclaimable after a crash.
ALTER TABLE "CalendarSource"
    ADD COLUMN "refreshStartedAt" TIMESTAMP(3);
