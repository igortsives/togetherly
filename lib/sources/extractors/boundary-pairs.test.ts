import { EventCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { eventCandidateInputSchema } from "@/lib/domain/schemas";
import {
  matchBoundary,
  synthesizeBoundaryIntervals
} from "./boundary-pairs";

const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function makeCandidate(opts: {
  title: string;
  startAt: Date;
  endAt: Date;
  confidence?: number;
}) {
  return eventCandidateInputSchema.parse({
    calendarSourceId: "src-1",
    calendarId: "cal-1",
    rawTitle: opts.title,
    category: EventCategory.UNKNOWN,
    startAt: opts.startAt,
    endAt: opts.endAt,
    allDay: true,
    timezone: "America/Los_Angeles",
    confidence: opts.confidence ?? 0.6
  });
}

describe("matchBoundary — synonym-slot recognizer", () => {
  // The point of these cases is to demonstrate the recognizer works
  // ACROSS academic vocabularies, not just for one institution.

  it("matches UCLA quarter-system phrasing", () => {
    expect(matchBoundary("Fall Quarter Begins")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("Fall Quarter Ends")).toEqual({
      kind: "class",
      side: "end"
    });
    expect(matchBoundary("Instruction Begins")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("Instruction Ends")).toEqual({
      kind: "class",
      side: "end"
    });
  });

  it("matches Vanderbilt / standard-semester phrasing", () => {
    expect(matchBoundary("Fall Semester Begins")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("Spring Semester Ends")).toEqual({
      kind: "class",
      side: "end"
    });
    expect(matchBoundary("Classes Begin")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("Classes End")).toEqual({
      kind: "class",
      side: "end"
    });
  });

  it("matches K-12 phrasing", () => {
    expect(matchBoundary("First Day of School")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("Last Day of School")).toEqual({
      kind: "class",
      side: "end"
    });
    expect(matchBoundary("School Begins")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("School Ends")).toEqual({
      kind: "class",
      side: "end"
    });
  });

  it("matches trimester / independent-school phrasing", () => {
    expect(matchBoundary("Fall Trimester Begins")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("Winter Term Begins")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("Winter Term Ends")).toEqual({
      kind: "class",
      side: "end"
    });
    expect(matchBoundary("End of Fall Trimester")).toEqual({
      kind: "class",
      side: "end"
    });
  });

  it("matches noun-phrase forms with optional 'the' / 'of' prefixes", () => {
    expect(matchBoundary("Beginning of the Fall Quarter")).toEqual({
      kind: "class",
      side: "begin"
    });
    expect(matchBoundary("End of Spring Term")).toEqual({
      kind: "class",
      side: "end"
    });
  });

  it("classifies exam-period markers under 'exam', not 'class'", () => {
    expect(matchBoundary("Final Examinations Begin")).toEqual({
      kind: "exam",
      side: "begin"
    });
    expect(matchBoundary("End of Final Examinations")).toEqual({
      kind: "exam",
      side: "end"
    });
    expect(matchBoundary("Finals Week Starts")).toEqual({
      kind: "exam",
      side: "begin"
    });
    expect(matchBoundary("Midterms Begin")).toEqual({
      kind: "exam",
      side: "begin"
    });
    expect(matchBoundary("Reading Days Begin")).toEqual({
      kind: "exam",
      side: "begin"
    });
  });

  it("returns null for unrelated event titles", () => {
    expect(matchBoundary("Presidents' Day")).toBeNull();
    expect(matchBoundary("Spring Break")).toBeNull();
    expect(matchBoundary("Thanksgiving Holiday")).toBeNull();
    expect(matchBoundary("Town Hall Meeting")).toBeNull();
  });

  it("does NOT match single-day 'School Resumes' / 'Classes Resume' markers", () => {
    // The recognizer omits "resumes" intentionally — those markers
    // have no natural end counterpart so pairing would generate
    // runaway intervals.
    expect(matchBoundary("School Resumes")).toBeNull();
    expect(matchBoundary("Classes Resume")).toBeNull();
  });
});

describe("synthesizeBoundaryIntervals — across vocabularies", () => {
  it("UCLA quarter system: Fall Quarter Begins (Sep) ↔ Fall Quarter Ends (Dec)", () => {
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "Fall Quarter Begins",
        startAt: date("2026-09-28"),
        endAt: date("2026-09-29")
      }),
      makeCandidate({
        title: "Fall Quarter Ends",
        startAt: date("2026-12-11"),
        endAt: date("2026-12-12")
      })
    ]);

    expect(synthesized).toHaveLength(1);
    expect(synthesized[0].rawTitle).toBe("Fall term in session");
    expect(synthesized[0].category).toBe(EventCategory.CLASS_IN_SESSION);
    expect(synthesized[0].startAt).toEqual(date("2026-09-28"));
    expect(synthesized[0].endAt).toEqual(date("2026-12-12"));
  });

  it("Vanderbilt semester system: Fall Semester Begins ↔ Fall Semester Ends", () => {
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "Fall Semester Begins",
        startAt: date("2026-08-21"),
        endAt: date("2026-08-22")
      }),
      makeCandidate({
        title: "Fall Semester Ends",
        startAt: date("2026-12-15"),
        endAt: date("2026-12-16")
      })
    ]);

    expect(synthesized).toHaveLength(1);
    expect(synthesized[0].category).toBe(EventCategory.CLASS_IN_SESSION);
    expect(synthesized[0].rawTitle).toContain("Fall");
  });

  it("K-12 district: First Day of School ↔ Last Day of School", () => {
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "First Day of School",
        startAt: date("2026-08-20"),
        endAt: date("2026-08-21")
      }),
      makeCandidate({
        title: "Last Day of School",
        startAt: date("2027-06-12"),
        endAt: date("2027-06-13")
      })
    ]);

    expect(synthesized).toHaveLength(1);
    expect(synthesized[0].category).toBe(EventCategory.CLASS_IN_SESSION);
    expect(synthesized[0].startAt).toEqual(date("2026-08-20"));
    expect(synthesized[0].endAt).toEqual(date("2027-06-13"));
  });

  it("Trimester school: Winter Term Begins ↔ Winter Term Ends", () => {
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "Winter Term Begins",
        startAt: date("2027-01-04"),
        endAt: date("2027-01-05")
      }),
      makeCandidate({
        title: "Winter Term Ends",
        startAt: date("2027-03-15"),
        endAt: date("2027-03-16")
      })
    ]);

    expect(synthesized).toHaveLength(1);
    expect(synthesized[0].category).toBe(EventCategory.CLASS_IN_SESSION);
    expect(synthesized[0].rawTitle).toContain("Winter");
  });

  it("Pairs multiple terms within the same source by chronological proximity", () => {
    // Fall Q (Sep-Dec), Winter Q (Jan-Mar), Spring Q (Apr-Jun)
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "Fall Quarter Begins",
        startAt: date("2026-09-28"),
        endAt: date("2026-09-29")
      }),
      makeCandidate({
        title: "Fall Quarter Ends",
        startAt: date("2026-12-11"),
        endAt: date("2026-12-12")
      }),
      makeCandidate({
        title: "Winter Quarter Begins",
        startAt: date("2027-01-05"),
        endAt: date("2027-01-06")
      }),
      makeCandidate({
        title: "Winter Quarter Ends",
        startAt: date("2027-03-20"),
        endAt: date("2027-03-21")
      })
    ]);

    expect(synthesized).toHaveLength(2);
    const titles = synthesized.map((s) => s.rawTitle);
    expect(titles).toContain("Fall term in session");
    expect(titles).toContain("Winter term in session");
  });

  it("Synthesizes EXAM_PERIOD from Final Examinations begin/end", () => {
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "Final Examinations Begin",
        startAt: date("2026-12-07"),
        endAt: date("2026-12-08")
      }),
      makeCandidate({
        title: "Final Examinations End",
        startAt: date("2026-12-11"),
        endAt: date("2026-12-12")
      })
    ]);

    expect(synthesized).toHaveLength(1);
    expect(synthesized[0].category).toBe(EventCategory.EXAM_PERIOD);
  });

  it("Does NOT pair a begin marker beyond the configured gap", () => {
    // Sep → Jul is ~320 days. Force a tight cap to exercise the
    // rejection logic regardless of the default.
    const synthesized = synthesizeBoundaryIntervals(
      [
        makeCandidate({
          title: "Fall Semester Begins",
          startAt: date("2026-09-01"),
          endAt: date("2026-09-02")
        }),
        makeCandidate({
          title: "Summer Term Ends",
          startAt: date("2027-07-15"),
          endAt: date("2027-07-16")
        })
      ],
      { maxPairGapDays: 200 }
    );

    expect(synthesized).toHaveLength(0);
  });

  it("Does NOT cross-pair exam markers with class markers", () => {
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "Final Examinations Begin",
        startAt: date("2026-12-07"),
        endAt: date("2026-12-08")
      }),
      makeCandidate({
        title: "Winter Quarter Ends",
        startAt: date("2026-12-15"),
        endAt: date("2026-12-16")
      })
    ]);

    // No matching exam-end, no matching class-begin → 0 pairs.
    expect(synthesized).toHaveLength(0);
  });

  it("Returns empty when no boundary markers are present", () => {
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "Presidents' Day",
        startAt: date("2027-02-15"),
        endAt: date("2027-02-16")
      }),
      makeCandidate({
        title: "Spring Break",
        startAt: date("2027-03-22"),
        endAt: date("2027-03-29")
      })
    ]);

    expect(synthesized).toEqual([]);
  });

  it("Caps synthesized confidence at 0.85 (never bulk-confirms)", () => {
    const synthesized = synthesizeBoundaryIntervals([
      makeCandidate({
        title: "Fall Quarter Begins",
        startAt: date("2026-09-28"),
        endAt: date("2026-09-29"),
        confidence: 0.95
      }),
      makeCandidate({
        title: "Fall Quarter Ends",
        startAt: date("2026-12-11"),
        endAt: date("2026-12-12"),
        confidence: 0.95
      })
    ]);

    expect(synthesized[0].confidence).toBe(0.85);
  });
});
