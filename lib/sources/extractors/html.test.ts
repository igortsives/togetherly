import { readFile } from "node:fs/promises";
import path from "node:path";
import { CalendarType, EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { extractHtmlEvents } from "./html";

const fixturesDir = path.join(process.cwd(), "fixtures", "sources", "html");

async function loadFixture(name: string) {
  return readFile(path.join(fixturesDir, name), "utf8");
}

const baseOptions = {
  calendarId: "calendar-1",
  calendarSourceId: "source-1",
  calendarType: CalendarType.UNIVERSITY,
  defaultTimezone: "America/Los_Angeles"
};

describe("extractHtmlEvents — UCLA table pattern", () => {
  it("emits candidates from quarter-section tables", async () => {
    const html = await loadFixture("ucla-academic-calendar-2026-2027.html");
    const result = extractHtmlEvents(html, baseOptions);

    expect(result.errors).toEqual([]);
    expect(result.candidates.length).toBeGreaterThanOrEqual(20);

    for (const candidate of result.candidates) {
      expect(candidate.rawTitle.length).toBeGreaterThan(0);
      expect(candidate.timezone).toBe("America/Los_Angeles");
      expect(candidate.allDay).toBe(true);
      expect(candidate.confidence).toBeLessThan(0.9);
      expect(candidate.endAt.getTime()).toBeGreaterThan(candidate.startAt.getTime());
      expect(candidate.evidenceLocator).toBeTruthy();
    }
  });

  it("parses single-day holidays anchored to the section year", async () => {
    const html = await loadFixture("ucla-academic-calendar-2026-2027.html");
    const result = extractHtmlEvents(html, baseOptions);

    const veteransDay = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("veterans day")
    );

    expect(veteransDay).toBeDefined();
    expect(veteransDay?.startAt.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    expect(veteransDay?.endAt.toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(veteransDay?.category).toBe(EventCategory.BREAK);
  });

  it("parses multi-day holiday ranges as inclusive spans", async () => {
    const html = await loadFixture("ucla-academic-calendar-2026-2027.html");
    const result = extractHtmlEvents(html, baseOptions);

    const thanksgiving = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("thanksgiving holiday")
    );

    expect(thanksgiving).toBeDefined();
    expect(thanksgiving?.allDay).toBe(true);
    expect(thanksgiving?.startAt.toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect(thanksgiving?.endAt.toISOString()).toBe("2026-11-28T00:00:00.000Z");
    expect(thanksgiving?.category).toBe(EventCategory.BREAK);
  });

  it("classifies exam periods and instruction markers", async () => {
    const html = await loadFixture("ucla-academic-calendar-2026-2027.html");
    const result = extractHtmlEvents(html, baseOptions);

    const finals = result.candidates.find(
      (candidate) =>
        candidate.rawTitle.toLowerCase().includes("final examinations") &&
        candidate.startAt.toISOString().startsWith("2026-12")
    );
    expect(finals?.category).toBe(EventCategory.EXAM_PERIOD);
    expect(finals?.startAt.toISOString()).toBe("2026-12-05T00:00:00.000Z");
    expect(finals?.endAt.toISOString()).toBe("2026-12-12T00:00:00.000Z");

    const instructionBegins = result.candidates.find(
      (candidate) =>
        candidate.rawTitle.toLowerCase().includes("instruction begins") &&
        candidate.startAt.toISOString().startsWith("2026-09")
    );
    expect(instructionBegins?.category).toBe(EventCategory.CLASS_IN_SESSION);
  });
});

describe("extractHtmlEvents — Vanderbilt definition-list pattern", () => {
  it("pairs dt labels with dd dates", async () => {
    const html = await loadFixture("vanderbilt-academic-calendar-2026-2027.html");
    const result = extractHtmlEvents(html, baseOptions);

    expect(result.errors).toEqual([]);
    expect(result.candidates.length).toBeGreaterThanOrEqual(15);

    const winterBreak = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("winter break")
    );
    expect(winterBreak).toBeDefined();
    expect(winterBreak?.startAt.toISOString()).toBe("2026-12-17T00:00:00.000Z");
    expect(winterBreak?.endAt.toISOString()).toBe("2027-01-11T00:00:00.000Z");
    expect(winterBreak?.category).toBe(EventCategory.BREAK);
    expect(winterBreak?.evidenceLocator).toContain("dt");
  });

  it("parses ranges that span months and years", async () => {
    const html = await loadFixture("vanderbilt-academic-calendar-2026-2027.html");
    const result = extractHtmlEvents(html, baseOptions);

    const springBreak = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("spring break")
    );
    expect(springBreak).toBeDefined();
    expect(springBreak?.startAt.toISOString()).toBe("2027-03-06T00:00:00.000Z");
    expect(springBreak?.endAt.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(springBreak?.category).toBe(EventCategory.BREAK);
  });
});

describe("extractHtmlEvents — Saratoga list + table pattern", () => {
  it("extracts items from the important-dates list and the grading table", async () => {
    const html = await loadFixture("saratoga-high-2026-2027.html");
    const result = extractHtmlEvents(html, {
      ...baseOptions,
      calendarType: CalendarType.SCHOOL
    });

    expect(result.errors).toEqual([]);
    expect(result.candidates.length).toBeGreaterThanOrEqual(15);

    const firstDay = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("first day of school")
    );
    expect(firstDay).toBeDefined();
    expect(firstDay?.startAt.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(firstDay?.endAt.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(firstDay?.category).toBe(EventCategory.CLASS_IN_SESSION);
    expect(firstDay?.evidenceLocator).toContain("li");

    const quarter1 = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().startsWith("quarter 1")
    );
    expect(quarter1).toBeDefined();
    expect(quarter1?.startAt.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(quarter1?.endAt.toISOString()).toBe("2026-10-17T00:00:00.000Z");
    expect(quarter1?.evidenceLocator).toContain("table");
  });

  it("identifies winter break crossing the year boundary as a multi-day range", async () => {
    const html = await loadFixture("saratoga-high-2026-2027.html");
    const result = extractHtmlEvents(html, {
      ...baseOptions,
      calendarType: CalendarType.SCHOOL
    });

    const winterBreak = result.candidates.find(
      (candidate) =>
        candidate.rawTitle.toLowerCase() === "winter break" &&
        candidate.startAt.toISOString().startsWith("2026-12")
    );
    expect(winterBreak).toBeDefined();
    expect(winterBreak?.startAt.toISOString()).toBe("2026-12-21T00:00:00.000Z");
    expect(winterBreak?.endAt.toISOString()).toBe("2027-01-02T00:00:00.000Z");
    expect(winterBreak?.category).toBe(EventCategory.BREAK);
  });
});

describe("extractHtmlEvents — defaults", () => {
  it("defaults unknown categories to low confidence for parent review", async () => {
    const html = await loadFixture("ucla-academic-calendar-2026-2027.html");
    const result = extractHtmlEvents(html, baseOptions);

    const commencement = result.candidates.find((candidate) =>
      candidate.rawTitle.toLowerCase().includes("commencement")
    );
    expect(commencement?.category).toBe(EventCategory.UNKNOWN);
    expect(commencement?.confidence).toBeLessThan(0.5);
  });
});
