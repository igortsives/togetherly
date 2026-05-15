-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "CalendarType" AS ENUM ('SCHOOL', 'UNIVERSITY', 'CAMP', 'SPORT', 'MUSIC', 'ACTIVITY', 'PARENT', 'CUSTODY', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('URL', 'PDF_UPLOAD', 'ICS', 'GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR');

-- CreateEnum
CREATE TYPE "ParserType" AS ENUM ('HTML', 'PDF_TEXT', 'PDF_OCR', 'ICS', 'GOOGLE', 'OUTLOOK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RefreshStatus" AS ENUM ('OK', 'FAILED', 'CHANGED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('SCHOOL_CLOSED', 'BREAK', 'CLASS_IN_SESSION', 'EXAM_PERIOD', 'ACTIVITY_BUSY', 'OPTIONAL', 'UNKNOWN', 'MANUAL_BLOCK');

-- CreateEnum
CREATE TYPE "BusyStatus" AS ENUM ('BUSY', 'FREE', 'CONFIGURABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventCreator" AS ENUM ('USER', 'EXTRACTOR', 'PROVIDER_SYNC');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT,
    "name" TEXT NOT NULL,
    "type" "CalendarType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSource" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceUrl" TEXT,
    "uploadedFileKey" TEXT,
    "providerCalendarId" TEXT,
    "contentHash" TEXT,
    "parserType" "ParserType" NOT NULL DEFAULT 'UNKNOWN',
    "refreshStatus" "RefreshStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "lastFetchedAt" TIMESTAMP(3),
    "lastParsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCandidate" (
    "id" TEXT NOT NULL,
    "calendarSourceId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "normalizedTitle" TEXT,
    "category" "EventCategory" NOT NULL DEFAULT 'UNKNOWN',
    "suggestedBusyStatus" "BusyStatus" NOT NULL DEFAULT 'UNKNOWN',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "evidenceText" TEXT,
    "evidenceLocator" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventCandidateId" TEXT,
    "title" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "busyStatus" "BusyStatus" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL,
    "sourceConfidence" DECIMAL(3,2),
    "createdBy" "EventCreator" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeWindowSearch" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "minimumDays" INTEGER NOT NULL,
    "includeUnknownAsBusy" BOOLEAN NOT NULL DEFAULT true,
    "includeExamAsBusy" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeWindowSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeWindowResult" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "score" DECIMAL(5,2),
    "explanation" JSONB,
    "saved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FreeWindowResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Family_ownerId_idx" ON "Family"("ownerId");

-- CreateIndex
CREATE INDEX "Child_familyId_idx" ON "Child"("familyId");

-- CreateIndex
CREATE INDEX "Calendar_familyId_idx" ON "Calendar"("familyId");

-- CreateIndex
CREATE INDEX "Calendar_childId_idx" ON "Calendar"("childId");

-- CreateIndex
CREATE INDEX "CalendarSource_calendarId_idx" ON "CalendarSource"("calendarId");

-- CreateIndex
CREATE INDEX "CalendarSource_sourceType_idx" ON "CalendarSource"("sourceType");

-- CreateIndex
CREATE INDEX "CalendarSource_refreshStatus_idx" ON "CalendarSource"("refreshStatus");

-- CreateIndex
CREATE INDEX "EventCandidate_calendarId_idx" ON "EventCandidate"("calendarId");

-- CreateIndex
CREATE INDEX "EventCandidate_calendarSourceId_idx" ON "EventCandidate"("calendarSourceId");

-- CreateIndex
CREATE INDEX "EventCandidate_reviewStatus_idx" ON "EventCandidate"("reviewStatus");

-- CreateIndex
CREATE INDEX "EventCandidate_startAt_endAt_idx" ON "EventCandidate"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_eventCandidateId_key" ON "CalendarEvent"("eventCandidateId");

-- CreateIndex
CREATE INDEX "CalendarEvent_calendarId_idx" ON "CalendarEvent"("calendarId");

-- CreateIndex
CREATE INDEX "CalendarEvent_busyStatus_idx" ON "CalendarEvent"("busyStatus");

-- CreateIndex
CREATE INDEX "CalendarEvent_startAt_endAt_idx" ON "CalendarEvent"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "FreeWindowSearch_familyId_idx" ON "FreeWindowSearch"("familyId");

-- CreateIndex
CREATE INDEX "FreeWindowResult_searchId_idx" ON "FreeWindowResult"("searchId");

-- CreateIndex
CREATE INDEX "FreeWindowResult_saved_idx" ON "FreeWindowResult"("saved");

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCandidate" ADD CONSTRAINT "EventCandidate_calendarSourceId_fkey" FOREIGN KEY ("calendarSourceId") REFERENCES "CalendarSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCandidate" ADD CONSTRAINT "EventCandidate_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeWindowSearch" ADD CONSTRAINT "FreeWindowSearch_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeWindowResult" ADD CONSTRAINT "FreeWindowResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "FreeWindowSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
