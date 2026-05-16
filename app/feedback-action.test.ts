import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    betaFeedback: { create: vi.fn() }
  }
}));

vi.mock("@/lib/family/session", () => ({
  requireUserFamily: vi.fn(),
  getCurrentUserId: vi.fn()
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
import { getCurrentUserId, requireUserFamily } from "@/lib/family/session";
import { redirect } from "next/navigation";
import { submitBetaFeedbackAction } from "./actions";

const mockCreate = prisma.betaFeedback.create as unknown as ReturnType<
  typeof vi.fn
>;
const mockRequireFamily = requireUserFamily as unknown as ReturnType<
  typeof vi.fn
>;
const mockGetUserId = getCurrentUserId as unknown as ReturnType<typeof vi.fn>;
const mockRedirect = redirect as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireFamily.mockResolvedValue({ id: "family-1", ownerId: "user-1" });
  mockGetUserId.mockResolvedValue("user-1");
  mockRedirect.mockImplementation((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  });
});

function buildFormData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.append(key, value);
  }
  return data;
}

describe("submitBetaFeedbackAction", () => {
  it("requires an authenticated user (rejects when getCurrentUserId is null)", async () => {
    mockGetUserId.mockResolvedValue(null);
    await expect(
      submitBetaFeedbackAction(
        buildFormData({
          route: "/review",
          score: "4",
          body: "great",
          allowFollowUp: "on"
        })
      )
    ).rejects.toThrow("Sign in to send feedback.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sanitizes a crafted external route to / before insert and redirect", async () => {
    await expect(
      submitBetaFeedbackAction(
        buildFormData({
          route: "//evil.com/phish",
          score: "3",
          body: "feedback body",
          allowFollowUp: "on"
        })
      )
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ route: "/" })
    });
    expect(mockRedirect).toHaveBeenCalledWith("/?feedback=sent");
  });

  it("collapses unknown in-app paths to / before insert", async () => {
    await expect(
      submitBetaFeedbackAction(
        buildFormData({
          route: "/admin/secret",
          score: "5",
          body: "feedback body",
          allowFollowUp: "on"
        })
      )
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ route: "/" })
    });
  });

  it("preserves an allowlisted route through the insert payload and the redirect", async () => {
    await expect(
      submitBetaFeedbackAction(
        buildFormData({
          route: "/windows",
          score: "4",
          body: "feedback body",
          allowFollowUp: "on"
        })
      )
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        route: "/windows",
        score: 4,
        body: "feedback body",
        allowFollowUp: true
      })
    });
    expect(mockRedirect).toHaveBeenCalledWith("/windows?feedback=sent");
  });
});
