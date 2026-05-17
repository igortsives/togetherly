import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    child: { findMany: vi.fn() },
    calendarSource: { findMany: vi.fn() }
  }
}));

vi.mock("@/lib/family/session", () => ({
  requireUserFamily: vi.fn(),
  getCurrentUserId: vi.fn()
}));

vi.mock("@/lib/matching/nl-search", () => ({
  parseNaturalLanguageSearch: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  })
}));

vi.mock("@/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn()
}));

import { prisma } from "@/lib/db/prisma";
import { requireUserFamily } from "@/lib/family/session";
import { parseNaturalLanguageSearch } from "@/lib/matching/nl-search";
import { redirect } from "next/navigation";
import { parseNaturalLanguageSearchAction } from "./actions";

const mockChildFindMany = prisma.child.findMany as unknown as ReturnType<typeof vi.fn>;
const mockSourceFindMany = prisma.calendarSource.findMany as unknown as ReturnType<typeof vi.fn>;
const mockRequireFamily = requireUserFamily as unknown as ReturnType<typeof vi.fn>;
const mockParse = parseNaturalLanguageSearch as unknown as ReturnType<typeof vi.fn>;
const mockRedirect = redirect as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireFamily.mockResolvedValue({
    id: "family-1",
    ownerId: "user-1",
    name: null,
    timezone: "America/Los_Angeles",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  mockChildFindMany.mockResolvedValue([{ nickname: "Ava" }]);
  mockSourceFindMany.mockResolvedValue([]);
  mockRedirect.mockImplementation((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  });
});

function formDataWith(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.append(key, value);
  }
  return data;
}

function lastRedirectUrl(): string {
  const calls = mockRedirect.mock.calls;
  return calls[calls.length - 1][0] as string;
}

describe("parseNaturalLanguageSearchAction", () => {
  it("redirects with nlError=empty when the query is whitespace-only", async () => {
    await expect(
      parseNaturalLanguageSearchAction(formDataWith({ nlQuery: "   " }))
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(lastRedirectUrl()).toBe("/windows?nlError=empty");
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("redirects with nlError=unavailable when the LLM key is unset", async () => {
    mockParse.mockResolvedValue({ kind: "unavailable" });
    await expect(
      parseNaturalLanguageSearchAction(
        formDataWith({ nlQuery: "a free week around Christmas" })
      )
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(lastRedirectUrl()).toMatch(
      /^\/windows\?nlError=unavailable&nlQuery=a\+free\+week\+around\+Christmas$/
    );
  });

  it("redirects with nlError=parse-failed and echoes the query when the LLM call fails", async () => {
    mockParse.mockResolvedValue({ kind: "parse_failed", reason: "timeout" });
    await expect(
      parseNaturalLanguageSearchAction(formDataWith({ nlQuery: "spring break" }))
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(lastRedirectUrl()).toMatch(
      /^\/windows\?nlError=parse-failed&nlQuery=spring\+break$/
    );
  });

  it("redirects with nlError=out-of-scope when intent is out_of_scope", async () => {
    mockParse.mockResolvedValue({
      kind: "parsed",
      parse: {
        intent: "out_of_scope",
        parsedStartDate: null,
        parsedEndDate: null,
        minimumDays: null,
        explanation: "I can only help find free time.",
        confidence: 0
      }
    });
    await expect(
      parseNaturalLanguageSearchAction(
        formDataWith({ nlQuery: "delete my account" })
      )
    ).rejects.toThrow(/NEXT_REDIRECT/);
    const url = lastRedirectUrl();
    expect(url).toContain("nlError=out-of-scope");
    expect(url).toContain(
      "nlExplanation=I+can+only+help+find+free+time."
    );
    expect(url).toContain("nlQuery=delete+my+account");
  });

  it("redirects with parsed query params on a successful find_free_window verdict", async () => {
    mockParse.mockResolvedValue({
      kind: "parsed",
      parse: {
        intent: "find_free_window",
        parsedStartDate: "2026-12-15",
        parsedEndDate: "2027-01-10",
        minimumDays: 7,
        explanation: "I'm looking for a week around Christmas.",
        confidence: 0.85
      }
    });
    await expect(
      parseNaturalLanguageSearchAction(
        formDataWith({ nlQuery: "a free week around Christmas" })
      )
    ).rejects.toThrow(/NEXT_REDIRECT/);
    const url = lastRedirectUrl();
    expect(url).toContain("parsedStartDate=2026-12-15");
    expect(url).toContain("parsedEndDate=2027-01-10");
    expect(url).toContain("parsedMinimumDays=7");
    expect(url).toContain("nlConfidence=0.85");
    expect(url).toContain("nlExplanation=I%27m+looking+for+a+week+around+Christmas.");
  });

  it("scopes calendar source lookups to the current family", async () => {
    mockParse.mockResolvedValue({
      kind: "parsed",
      parse: {
        intent: "find_free_window",
        parsedStartDate: "2027-03-15",
        parsedEndDate: "2027-03-22",
        minimumDays: 5,
        explanation: "I'm looking for spring break.",
        confidence: 0.9
      }
    });
    await expect(
      parseNaturalLanguageSearchAction(formDataWith({ nlQuery: "spring break" }))
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockSourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { calendar: { familyId: "family-1" } }
      })
    );
  });

  it("clamps the query to 280 chars before parsing", async () => {
    mockParse.mockResolvedValue({
      kind: "parsed",
      parse: {
        intent: "find_free_window",
        parsedStartDate: "2026-12-15",
        parsedEndDate: "2027-01-10",
        minimumDays: 7,
        explanation: "...",
        confidence: 0.85
      }
    });
    const longQuery = "a free week around Christmas ".repeat(50);
    await expect(
      parseNaturalLanguageSearchAction(formDataWith({ nlQuery: longQuery }))
    ).rejects.toThrow(/NEXT_REDIRECT/);
    const passed = mockParse.mock.calls[0][0].query as string;
    expect(passed.length).toBeLessThanOrEqual(280);
  });
});
