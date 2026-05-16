-- Issue #41: invalidate saved free-window searches when underlying sources change.
ALTER TABLE "FreeWindowSearch"
    ADD COLUMN "stale" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "FreeWindowSearch_familyId_stale_idx"
    ON "FreeWindowSearch"("familyId", "stale");
