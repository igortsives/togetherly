import { describe, expect, it } from "vitest";
import {
  buildNlSearchPromptForTest,
  nlSearchParseSchemaForTest
} from "./nl-search";

describe("buildNlSearchPromptForTest", () => {
  const context = {
    query: "  a free week around Christmas  ",
    today: new Date("2026-09-15T12:34:56.000Z"),
    familyTimezone: "America/Los_Angeles",
    childNicknames: ["Ava", "Noah"],
    sourceLabels: ["UCLA academic", "Saratoga HS PDF"]
  };

  it("emits today as ISO yyyy-mm-dd", () => {
    const { userContent } = buildNlSearchPromptForTest(context);
    expect(userContent).toContain("Today: 2026-09-15");
  });

  it("lists children and source labels", () => {
    const { userContent } = buildNlSearchPromptForTest(context);
    expect(userContent).toContain("Children: Ava, Noah");
    expect(userContent).toContain(
      "Active calendar sources: UCLA academic, Saratoga HS PDF"
    );
  });

  it("emits a placeholder when no children or sources are registered", () => {
    const { userContent } = buildNlSearchPromptForTest({
      ...context,
      childNicknames: [],
      sourceLabels: []
    });
    expect(userContent).toContain("Children: (no children registered yet)");
    expect(userContent).toContain(
      "Active calendar sources: (no calendar sources connected yet)"
    );
  });

  it("includes the parent query trimmed at the end of the user content", () => {
    const { userContent } = buildNlSearchPromptForTest(context);
    expect(userContent.endsWith("a free week around Christmas")).toBe(true);
  });

  it("constrains the system prompt to the find_free_window intent", () => {
    const { systemPrompt } = buildNlSearchPromptForTest(context);
    expect(systemPrompt).toMatch(/"find_free_window" \| "out_of_scope"/);
    expect(systemPrompt).toMatch(/intent to out_of_scope/i);
  });
});

describe("nlSearchParseSchema", () => {
  const baseSuccessPayload = {
    intent: "find_free_window" as const,
    parsedStartDate: "2026-12-15",
    parsedEndDate: "2027-01-10",
    minimumDays: 7,
    explanation: "I'm looking for a week-long break around Christmas.",
    confidence: 0.85
  };

  it("accepts a well-formed parse", () => {
    expect(nlSearchParseSchemaForTest.safeParse(baseSuccessPayload).success).toBe(
      true
    );
  });

  it("rejects a non-ISO start date", () => {
    const result = nlSearchParseSchemaForTest.safeParse({
      ...baseSuccessPayload,
      parsedStartDate: "Dec 15, 2026"
    });
    expect(result.success).toBe(false);
  });

  it("rejects find_free_window with null dates and high confidence", () => {
    const result = nlSearchParseSchemaForTest.safeParse({
      ...baseSuccessPayload,
      parsedStartDate: null,
      parsedEndDate: null,
      confidence: 0.9
    });
    expect(result.success).toBe(false);
  });

  it("allows find_free_window with null dates when confidence is low", () => {
    const result = nlSearchParseSchemaForTest.safeParse({
      ...baseSuccessPayload,
      parsedStartDate: null,
      parsedEndDate: null,
      minimumDays: null,
      confidence: 0.2
    });
    expect(result.success).toBe(true);
  });

  it("rejects a startDate after the endDate", () => {
    const result = nlSearchParseSchemaForTest.safeParse({
      ...baseSuccessPayload,
      parsedStartDate: "2027-01-10",
      parsedEndDate: "2026-12-15"
    });
    expect(result.success).toBe(false);
  });

  it("accepts an out_of_scope verdict with null dates and zero confidence", () => {
    const result = nlSearchParseSchemaForTest.safeParse({
      intent: "out_of_scope",
      parsedStartDate: null,
      parsedEndDate: null,
      minimumDays: null,
      explanation: "I can only help find free time.",
      confidence: 0
    });
    expect(result.success).toBe(true);
  });

  it("rejects minimumDays out of bounds", () => {
    expect(
      nlSearchParseSchemaForTest.safeParse({
        ...baseSuccessPayload,
        minimumDays: 0
      }).success
    ).toBe(false);
    expect(
      nlSearchParseSchemaForTest.safeParse({
        ...baseSuccessPayload,
        minimumDays: 400
      }).success
    ).toBe(false);
  });
});
