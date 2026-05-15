-- CreateTable
CREATE TABLE "SignInAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignInAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignInAttempt_key_attemptedAt_idx" ON "SignInAttempt"("key", "attemptedAt");

-- CreateIndex
CREATE INDEX "SignInAttempt_attemptedAt_idx" ON "SignInAttempt"("attemptedAt");
