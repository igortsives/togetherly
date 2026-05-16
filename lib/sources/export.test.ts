import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    freeWindowResult: { update: vi.fn() }
  }
}));

vi.mock("@/lib/sources/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sources/google")>(
    "@/lib/sources/google"
  );
  return {
    ...actual,
    ensureGoogleAccessToken: vi.fn()
  };
});

vi.mock("@/lib/sources/microsoft", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/sources/microsoft")>(
      "@/lib/sources/microsoft"
    );
  return {
    ...actual,
    ensureMicrosoftAccessToken: vi.fn()
  };
});

import { prisma } from "@/lib/db/prisma";
import {
  ensureGoogleAccessToken,
  GoogleAccessError,
  type GoogleHttpClient
} from "@/lib/sources/google";
import {
  ensureMicrosoftAccessToken,
  MicrosoftAccessError,
  type MicrosoftHttpClient
} from "@/lib/sources/microsoft";
import {
  exportWindowToGoogle,
  exportWindowToOutlook,
  markFreeWindowSaved
} from "./export";

const mockEnsureGoogle = ensureGoogleAccessToken as unknown as ReturnType<
  typeof vi.fn
>;
const mockEnsureMicrosoft = ensureMicrosoftAccessToken as unknown as ReturnType<
  typeof vi.fn
>;
const mockUpdate = prisma.freeWindowResult.update as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.resetAllMocks();
  mockEnsureGoogle.mockResolvedValue("g-access-token");
  mockEnsureMicrosoft.mockResolvedValue("m-access-token");
});

describe("exportWindowToGoogle", () => {
  it("POSTs an all-day event with exclusive end date and returns the provider event id", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "g-event-xyz" })
    })) as unknown as GoogleHttpClient;

    const result = await exportWindowToGoogle(
      "user-1",
      {
        resultId: "res-1",
        startDate: new Date("2027-03-13T00:00:00Z"),
        endDate: new Date("2027-03-21T00:00:00Z")
      },
      { fetch: fetchMock }
    );

    expect(result.providerEventId).toBe("g-event-xyz");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[0]).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    );
    const body = JSON.parse(call[1].body as string);
    expect(body.start.date).toBe("2027-03-13");
    // End is exclusive in Google all-day events: Mar 21 inclusive → end=Mar 22.
    expect(body.end.date).toBe("2027-03-22");
    expect(body.summary).toBe("Togetherly trip");
    expect(body.status).toBe("tentative");
    expect(body.description).toContain("res-1");
  });

  it("sends Authorization: Bearer with the fetched access token", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "x" })
    })) as unknown as GoogleHttpClient;

    await exportWindowToGoogle(
      "user-1",
      {
        resultId: "r",
        startDate: new Date("2027-03-13T00:00:00Z"),
        endDate: new Date("2027-03-13T00:00:00Z")
      },
      { fetch: fetchMock }
    );

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[1].headers.Authorization).toBe("Bearer g-access-token");
  });

  it("throws GoogleAccessError on non-OK response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 403, message: "insufficient" } })
    })) as unknown as GoogleHttpClient;

    await expect(
      exportWindowToGoogle(
        "user-1",
        {
          resultId: "r",
          startDate: new Date("2027-03-13T00:00:00Z"),
          endDate: new Date("2027-03-13T00:00:00Z")
        },
        { fetch: fetchMock }
      )
    ).rejects.toBeInstanceOf(GoogleAccessError);
  });
});

describe("exportWindowToOutlook", () => {
  it("POSTs an all-day Graph event with exclusive end and the family timezone", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "m-event-xyz" })
    })) as unknown as MicrosoftHttpClient;

    const result = await exportWindowToOutlook(
      "user-1",
      {
        resultId: "res-1",
        startDate: new Date("2027-03-13T00:00:00Z"),
        endDate: new Date("2027-03-21T00:00:00Z"),
        timezone: "America/Los_Angeles"
      },
      { fetch: fetchMock }
    );

    expect(result.providerEventId).toBe("m-event-xyz");
    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(call[0]).toBe("https://graph.microsoft.com/v1.0/me/events");
    const body = JSON.parse(call[1].body as string);
    expect(body.isAllDay).toBe(true);
    expect(body.showAs).toBe("tentative");
    expect(body.subject).toBe("Togetherly trip");
    expect(body.start.dateTime).toBe("2027-03-13T00:00:00.0000000");
    expect(body.end.dateTime).toBe("2027-03-22T00:00:00.0000000");
    expect(body.start.timeZone).toBe("America/Los_Angeles");
    expect(body.end.timeZone).toBe("America/Los_Angeles");
    expect(body.body.content).toContain("res-1");
  });

  it("falls back to UTC when no timezone is provided", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "x" })
    })) as unknown as MicrosoftHttpClient;

    await exportWindowToOutlook(
      "user-1",
      {
        resultId: "r",
        startDate: new Date("2027-03-13T00:00:00Z"),
        endDate: new Date("2027-03-13T00:00:00Z")
      },
      { fetch: fetchMock }
    );

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.start.timeZone).toBe("UTC");
  });

  it("throws MicrosoftAccessError on non-OK response", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: "Forbidden" } })
    })) as unknown as MicrosoftHttpClient;

    await expect(
      exportWindowToOutlook(
        "user-1",
        {
          resultId: "r",
          startDate: new Date("2027-03-13T00:00:00Z"),
          endDate: new Date("2027-03-13T00:00:00Z")
        },
        { fetch: fetchMock }
      )
    ).rejects.toBeInstanceOf(MicrosoftAccessError);
  });
});

describe("markFreeWindowSaved", () => {
  it("flips saved=true on the result row", async () => {
    await markFreeWindowSaved("res-1");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "res-1" },
      data: { saved: true }
    });
  });
});
