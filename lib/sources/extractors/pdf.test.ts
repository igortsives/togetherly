import { readFile } from "node:fs/promises";
import path from "node:path";
import { CalendarType, EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { extractPdfTextEvents } from "./pdf";

const fixturesDir = path.join(process.cwd(), "fixtures", "sources", "pdf");

async function loadFixture(name: string) {
  return readFile(path.join(fixturesDir, name), "utf8");
}

const baseOptions = {
  calendarId: "calendar-1",
  calendarSourceId: "source-1",
  defaultTimezone: "America/Los_Angeles"
};

describe("extractPdfTextEvents — UCLA quarter calendar", () => {
  it("extracts a reasonable set of candidates with no errors", async () => {
    const text = await loadFixture("ucla-academic-calendar-2026-2027.pdf.txt");

    const result = extractPdfTextEvents(text, {
      ...baseOptions,
      calendarType: CalendarType.UNIVERSITY
    });

    expect(result.errors).toEqual([]);
    expect(result.candidates.length).toBeGreaterThanOrEqual(15);
    expect(result.candidates.length).toBeLessThanOrEqual(40);

    for (const candidate of result.candidates) {
      expect(candidate.allDay).toBe(true);
      expect(candidate.timezone).toBe("America/Los_Angeles");
      expect(candidate.confidence).toBeLessThan(0.9);
      expect(candidate.evidenceLocator).toMatch(/^line:\d+$/);
      expect(candidate.evidenceText).toBeTruthy();
    }
  });

  it("parses a same-month multi-day final exam range as a single all-day span", async () => {
    const text = await loadFixture("ucla-academic-calendar-2026-2027.pdf.txt");

    const result = extractPdfTextEvents(text, {
      ...baseOptions,
      calendarType: CalendarType.UNIVERSITY
    });

    const finals = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("final examinations") &&
      candidate.startAt.toISOString().startsWith("2026-12-05")
    );

    expect(finals).toBeDefined();
    expect(finals?.startAt.toISOString()).toBe("2026-12-05T00:00:00.000Z");
    expect(finals?.endAt.toISOString()).toBe("2026-12-12T00:00:00.000Z");
    expect(finals?.category).toBe(EventCategory.EXAM_PERIOD);
  });

  it("classifies instruction-bearing rows as CLASS_IN_SESSION", async () => {
    const text = await loadFixture("ucla-academic-calendar-2026-2027.pdf.txt");

    const result = extractPdfTextEvents(text, {
      ...baseOptions,
      calendarType: CalendarType.UNIVERSITY
    });

    const instructionBegins = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("instruction begins") &&
      candidate.startAt.toISOString().startsWith("2026-09-24")
    );

    expect(instructionBegins).toBeDefined();
    expect(instructionBegins?.category).toBe(EventCategory.CLASS_IN_SESSION);
    expect(instructionBegins?.confidence).toBeCloseTo(0.65, 5);
  });
});

describe("extractPdfTextEvents — Vanderbilt semester calendar", () => {
  it("parses a cross-year date range as a single all-day span", async () => {
    const text = await loadFixture("vanderbilt-academic-calendar-2026-2027.pdf.txt");

    const result = extractPdfTextEvents(text, {
      ...baseOptions,
      calendarType: CalendarType.UNIVERSITY
    });

    const winterBreak = result.candidates.find(
      (candidate) => candidate.rawTitle === "Winter Break"
    );

    expect(winterBreak).toBeDefined();
    expect(winterBreak?.startAt.toISOString()).toBe("2026-12-17T00:00:00.000Z");
    expect(winterBreak?.endAt.toISOString()).toBe("2027-01-11T00:00:00.000Z");
    expect(winterBreak?.category).toBe(EventCategory.BREAK);
  });

  it("parses a cross-month date range with the year only at the end", async () => {
    const text = await loadFixture("vanderbilt-academic-calendar-2026-2027.pdf.txt");

    const result = extractPdfTextEvents(text, {
      ...baseOptions,
      calendarType: CalendarType.UNIVERSITY
    });

    const springBreak = result.candidates.find(
      (candidate) => candidate.rawTitle === "Spring Break"
    );

    expect(springBreak).toBeDefined();
    expect(springBreak?.startAt.toISOString()).toBe("2027-03-06T00:00:00.000Z");
    expect(springBreak?.endAt.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(springBreak?.category).toBe(EventCategory.BREAK);
  });
});

describe("extractPdfTextEvents — Saratoga high-school grid calendar", () => {
  it("uses section headers to resolve the year for numeric short dates", async () => {
    const text = await loadFixture("saratoga-high-2026-2027.pdf.txt");

    const result = extractPdfTextEvents(text, {
      ...baseOptions,
      calendarType: CalendarType.SCHOOL
    });

    expect(result.candidates.length).toBeGreaterThanOrEqual(15);

    const firstDay = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("first day of school")
    );

    expect(firstDay).toBeDefined();
    expect(firstDay?.startAt.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(firstDay?.evidenceLocator).toMatch(/^line:\d+$/);
    expect(firstDay?.category).toBe(EventCategory.CLASS_IN_SESSION);

    const mlk = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("martin luther king")
    );

    expect(mlk).toBeDefined();
    expect(mlk?.startAt.toISOString()).toBe("2027-01-18T00:00:00.000Z");
  });

  it("flags break/holiday rows as BREAK with sub-0.9 confidence", async () => {
    const text = await loadFixture("saratoga-high-2026-2027.pdf.txt");

    const result = extractPdfTextEvents(text, {
      ...baseOptions,
      calendarType: CalendarType.SCHOOL
    });

    const thanksgiving = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("thanksgiving break begins")
    );

    expect(thanksgiving).toBeDefined();
    expect(thanksgiving?.category).toBe(EventCategory.BREAK);
    expect(thanksgiving?.confidence).toBeLessThan(0.9);
  });
});

describe("extractPdfTextEvents — activity calendar classification", () => {
  it("treats an activity calendar's rows as ACTIVITY_BUSY instead of school categories", async () => {
    const text = await loadFixture("saratoga-high-2026-2027.pdf.txt");

    const result = extractPdfTextEvents(text, {
      ...baseOptions,
      calendarType: CalendarType.SPORT
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      expect(candidate.category).toBe(EventCategory.ACTIVITY_BUSY);
      expect(candidate.confidence).toBeLessThan(0.9);
    }
  });
});
