-- Issue #100: track per-source consecutive failures so the scheduler
-- can skip chronically broken sources after a threshold.
ALTER TABLE "CalendarSource"
    ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;
