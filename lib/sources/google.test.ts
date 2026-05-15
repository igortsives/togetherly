import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: {
      findFirst: vi.fn(),
      update: vi.fn()
    }
  }
}));

import { prisma } from "@/lib/db/prisma";
import {
  GoogleAccessError,
  GoogleAccountMissingError,
  ensureGoogleAccessToken,
  type GoogleHttpClient
} from "./google";

const findFirst = prisma.account.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.account.update as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
});

describe("ensureGoogleAccessToken", () => {
  it("throws GoogleAccountMissingError when the user has no Google account", async () => {
    findFirst.mockResolvedValue(null);
    await expect(ensureGoogleAccessToken("user-1")).rejects.toBeInstanceOf(
      GoogleAccountMissingError
    );
  });

  it("returns the current access token when it has not expired", async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    findFirst.mockResolvedValue({
      id: "account-1",
      access_token: "valid-access-token",
      refresh_token: "stored-refresh-token",
      expires_at: farFuture
    });

    const token = await ensureGoogleAccessToken("user-1");
    expect(token).toBe("valid-access-token");
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes via the refresh_token endpoint when the access token is expired", async () => {
    const expired = Math.floor(Date.now() / 1000) - 60;
    findFirst.mockResolvedValue({
      id: "account-1",
      access_token: "expired-access-token",
      refresh_token: "stored-refresh-token",
      expires_at: expired
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: "rotated-access-token",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        token_type: "Bearer"
      })
    })) as unknown as GoogleHttpClient;

    const token = await ensureGoogleAccessToken("user-1", { fetch: fetchMock });

    expect(token).toBe("rotated-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "account-1" },
        data: expect.objectContaining({
          access_token: "rotated-access-token",
          scope: "https://www.googleapis.com/auth/calendar.readonly",
          token_type: "Bearer"
        })
      })
    );
  });

  it("throws GoogleAccessError when the refresh endpoint fails", async () => {
    findFirst.mockResolvedValue({
      id: "account-1",
      access_token: "expired",
      refresh_token: "stored-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) - 60
    });

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => "invalid_grant"
    })) as unknown as GoogleHttpClient;

    await expect(
      ensureGoogleAccessToken("user-1", { fetch: fetchMock })
    ).rejects.toBeInstanceOf(GoogleAccessError);
    expect(update).not.toHaveBeenCalled();
  });

  it("throws GoogleAccessError when the access token is expired and no refresh_token is stored", async () => {
    findFirst.mockResolvedValue({
      id: "account-1",
      access_token: "expired",
      refresh_token: null,
      expires_at: Math.floor(Date.now() / 1000) - 60
    });

    await expect(ensureGoogleAccessToken("user-1")).rejects.toBeInstanceOf(
      GoogleAccessError
    );
  });
});
