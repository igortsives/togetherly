import { CalendarType, EventCategory } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  }
}));

import { resetLlmClient } from "@/lib/llm/anthropic";
import { extractWithLlm, shouldUseLlmExtractor } from "./llm";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetAllMocks();
  resetLlmClient();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
  resetLlmClient();
});

describe("shouldUseLlmExtractor", () => {
  it("returns false without an API key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(shouldUseLlmExtractor()).toBe(false);
  });

  it("returns true with an API key", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(shouldUseLlmExtractor()).toBe(true);
  });
});

describe("extractWithLlm", () => {
  const baseOptions = {
    calendarId: "cal-1",
    calendarSourceId: "src-1",
    calendarType: CalendarType.SCHOOL,
    defaultTimezone: "America/Los_Angeles"
  } as const;

  it("returns the no-op result when API key is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await extractWithLlm({
      ...baseOptions,
      sourceText: "any text"
    });
    expect(result.candidates).toEqual([]);
    expect(result.fallbackReason).toMatch(/ANTHROPIC_API_KEY/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns an empty result with a reason when source text is empty", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const result = await extractWithLlm({ ...baseOptions, sourceText: "  " });
    expect(result.candidates).toEqual([]);
    expect(result.fallbackReason).toMatch(/empty/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("maps valid LLM JSON into EventCandidate rows with the canonical shape", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            events: [
              {
                title: "Spring Break",
                startDate: "2027-03-13",
                endDate: "2027-03-21",
                allDay: true,
                category: "BREAK",
                confidence: 0.95,
                evidenceText: "Spring Break Mar 13-21"
              },
              {
                title: "Presidents' Day",
                startDate: "2027-02-15",
                endDate: "2027-02-15",
                allDay: true,
                category: "SCHOOL_CLOSED",
                confidence: 0.99,
                evidenceText: "Presidents' Day Feb 15"
              }
            ]
          })
        }
      ]
    });

    const result = await extractWithLlm({
      ...baseOptions,
      sourceText: "<html>...</html>",
      sourceLabel: "https://example.edu/cal"
    });

    expect(result.candidates).toHaveLength(2);

    const [spring, presidents] = result.candidates;
    expect(spring.rawTitle).toBe("Spring Break");
    expect(spring.category).toBe(EventCategory.BREAK);
    expect(spring.startAt).toEqual(new Date("2027-03-13T00:00:00.000Z"));
    // iCal-exclusive end: Mar 21 inclusive → Mar 22.
    expect(spring.endAt).toEqual(new Date("2027-03-22T00:00:00.000Z"));
    expect(spring.allDay).toBe(true);
    expect(spring.timezone).toBe("America/Los_Angeles");
    expect(spring.evidenceLocator).toBe("llm:https://example.edu/cal");

    expect(presidents.category).toBe(EventCategory.SCHOOL_CLOSED);
    expect(presidents.startAt).toEqual(new Date("2027-02-15T00:00:00.000Z"));
    expect(presidents.endAt).toEqual(new Date("2027-02-16T00:00:00.000Z"));
  });

  it("falls back gracefully when the LLM returns invalid JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "not json" }]
    });

    const result = await extractWithLlm({
      ...baseOptions,
      sourceText: "<html>..</html>"
    });

    expect(result.candidates).toEqual([]);
    expect(result.fallbackReason).toMatch(/JSON/i);
  });

  it("falls back gracefully when the LLM returns no events", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"events":[]}' }]
    });

    const result = await extractWithLlm({
      ...baseOptions,
      sourceText: "<html>..</html>"
    });

    expect(result.candidates).toEqual([]);
    expect(result.fallbackReason).toBeUndefined();
  });

  it("drops candidates that fail the canonical Zod schema (defensive)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            events: [
              {
                // end < start — should be dropped by the canonical schema.
                title: "Bad event",
                startDate: "2027-03-21",
                endDate: "2027-03-13",
                allDay: true,
                category: "BREAK",
                confidence: 0.9,
                evidenceText: "bad"
              },
              {
                title: "Good event",
                startDate: "2027-03-13",
                endDate: "2027-03-13",
                allDay: true,
                category: "SCHOOL_CLOSED",
                confidence: 0.95,
                evidenceText: "good"
              }
            ]
          })
        }
      ]
    });

    const result = await extractWithLlm({
      ...baseOptions,
      sourceText: "<html>..</html>"
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].rawTitle).toBe("Good event");
  });
});
