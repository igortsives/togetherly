-- Issue #150: per-source ingest-window floor. When set, the ingest
-- pipeline drops any candidate whose startAt is strictly before this
-- timestamp, so historical events on a long-lived source don't clutter
-- the review queue or timeline.
ALTER TABLE "CalendarSource"
    ADD COLUMN "ingestWindowStart" TIMESTAMP(3);
