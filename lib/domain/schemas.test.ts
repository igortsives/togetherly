import { BusyStatus, EventCategory, SourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getDefaultBusyStatus, requiresParentReview } from "./event-taxonomy";
import {
  betaFeedbackInputSchema,
  calendarEventInputSchema,
  calendarSourceInputSchema,
  eventCandidateInputSchema
} from "./schemas";

describe("event taxonomy", () => {
  it("maps MVP categories to default busy/free behavior", () => {
    expect(getDefaultBusyStatus(EventCategory.BREAK)).toBe(BusyStatus.FREE);
    expect(getDefaultBusyStatus(EventCategory.CLASS_IN_SESSION)).toBe(
      BusyStatus.BUSY
    );
    expect(getDefaultBusyStatus(EventCategory.EXAM_PERIOD)).toBe(
      BusyStatus.CONFIGURABLE
    );
    expect(getDefaultBusyStatus(EventCategory.UNKNOWN)).toBe(BusyStatus.UNKNOWN);
  });

  it("requires review for unknown or lower-confidence events", () => {
    expect(requiresParentReview(EventCategory.UNKNOWN, 0.99)).toBe(true);
    expect(requiresParentReview(EventCategory.BREAK, 0.72)).toBe(true);
    expect(requiresParentReview(EventCategory.BREAK, 0.94)).toBe(false);
  });
});

describe("calendar source schema", () => {
  it("requires URL for URL and ICS source types", () => {
    expect(
      calendarSourceInputSchema.safeParse({
        calendarId: "calendar-1",
        sourceType: SourceType.URL
      }).success
    ).toBe(false);
  });
});

describe("event schemas", () => {
  it("defaults event candidate busy status from category", () => {
    const result = eventCandidateInputSchema.parse({
      calendarSourceId: "source-1",
      calendarId: "calendar-1",
      rawTitle: "Winter Break",
      category: EventCategory.BREAK,
      startAt: "2027-12-20T00:00:00.000Z",
      endAt: "2028-01-03T00:00:00.000Z",
      timezone: "America/Los_Angeles",
      confidence: 0.95
    });

    expect(result.suggestedBusyStatus).toBe(BusyStatus.FREE);
  });

  it("rejects inverted date ranges", () => {
    const result = calendarEventInputSchema.safeParse({
      calendarId: "calendar-1",
      title: "Practice",
      category: EventCategory.ACTIVITY_BUSY,
      startAt: "2027-02-02T00:00:00.000Z",
      endAt: "2027-02-01T00:00:00.000Z",
      timezone: "America/Los_Angeles"
    });

    expect(result.success).toBe(false);
  });
});

describe("beta feedback schema", () => {
  const validPayload = {
    route: "/",
    score: "4",
    body: "Imports worked, free-window confidence felt trustworthy.",
    allowFollowUp: "on"
  };

  it("accepts a valid full payload", () => {
    const result = betaFeedbackInputSchema.parse(validPayload);
    expect(result.route).toBe("/");
    expect(result.score).toBe(4);
    expect(result.allowFollowUp).toBe(true);
    expect(result.body).toContain("Imports worked");
  });

  it("rejects empty body", () => {
    const result = betaFeedbackInputSchema.safeParse({
      ...validPayload,
      body: "   "
    });
    expect(result.success).toBe(false);
  });

  it("rejects body over 4000 characters", () => {
    const result = betaFeedbackInputSchema.safeParse({
      ...validPayload,
      body: "x".repeat(4001)
    });
    expect(result.success).toBe(false);
  });

  it("rejects score out of range", () => {
    const tooHigh = betaFeedbackInputSchema.safeParse({
      ...validPayload,
      score: "6"
    });
    const tooLow = betaFeedbackInputSchema.safeParse({
      ...validPayload,
      score: "0"
    });
    expect(tooHigh.success).toBe(false);
    expect(tooLow.success).toBe(false);
  });

  it("rejects missing route", () => {
    const result = betaFeedbackInputSchema.safeParse({
      ...validPayload,
      route: ""
    });
    expect(result.success).toBe(false);
  });

  it("treats missing allowFollowUp as false and missing score as undefined", () => {
    const result = betaFeedbackInputSchema.parse({
      route: "/review",
      body: "Just a quick note."
    });
    expect(result.allowFollowUp).toBe(false);
    expect(result.score).toBeUndefined();
  });

  it("coerces checkbox 'on' to true", () => {
    const result = betaFeedbackInputSchema.parse({
      route: "/",
      body: "Useful.",
      allowFollowUp: "on"
    });
    expect(result.allowFollowUp).toBe(true);
  });
});
