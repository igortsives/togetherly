-- Issue #65: a User owns at most one Family.
-- Before adding the unique constraint, dedupe any existing duplicates
-- (kept the oldest, dropped the rest with cascade). Safe no-op when
-- no duplicates exist.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "ownerId"
            ORDER BY "createdAt" ASC
        ) AS rn
    FROM "Family"
)
DELETE FROM "Family"
USING ranked
WHERE "Family"."id" = ranked."id" AND ranked.rn > 1;

-- DropIndex
DROP INDEX "Family_ownerId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Family_ownerId_key" ON "Family"("ownerId");
