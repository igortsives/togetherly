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
  MicrosoftAccessError,
  MicrosoftAccountMissingError,
  ensureMicrosoftAccessToken,
  type MicrosoftHttpClient
} from "./microsoft";

const findFirst = prisma.account.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.account.update as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MICROSOFT_CLIENT_ID = "test-client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "test-client-secret";
});

describe("ensureMicrosoftAccessToken", () => {
  it("throws MicrosoftAccountMissingError when the user has no Microsoft account", async () => {
    findFirst.mockResolvedValue(null);
    await expect(ensureMicrosoftAccessToken("user-1")).rejects.toBeInstanceOf(
      MicrosoftAccountMissingError
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

    const token = await ensureMicrosoftAccessToken("user-1");
    expect(token).toBe("valid-access-token");
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes via the Microsoft token endpoint when the access token is expired", async () => {
    findFirst.mockResolvedValue({
      id: "account-1",
      access_token: "expired-access-token",
      refresh_token: "stored-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) - 60
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: "rotated-access-token",
        expires_in: 3600,
        scope: "openid email profile offline_access Calendars.Read",
        token_type: "Bearer",
        refresh_token: "rotated-refresh-token"
      })
    })) as unknown as MicrosoftHttpClient;

    const token = await ensureMicrosoftAccessToken("user-1", { fetch: fetchMock });

    expect(token).toBe("rotated-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "account-1" },
        data: expect.objectContaining({
          access_token: "rotated-access-token",
          refresh_token: "rotated-refresh-token",
          scope: "openid email profile offline_access Calendars.Read",
          token_type: "Bearer"
        })
      })
    );
  });

  it("throws MicrosoftAccessError when the refresh endpoint fails", async () => {
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
    })) as unknown as MicrosoftHttpClient;

    await expect(
      ensureMicrosoftAccessToken("user-1", { fetch: fetchMock })
    ).rejects.toBeInstanceOf(MicrosoftAccessError);
    expect(update).not.toHaveBeenCalled();
  });

  it("throws MicrosoftAccessError when the access token is expired and no refresh_token is stored", async () => {
    findFirst.mockResolvedValue({
      id: "account-1",
      access_token: "expired",
      refresh_token: null,
      expires_at: Math.floor(Date.now() / 1000) - 60
    });

    await expect(ensureMicrosoftAccessToken("user-1")).rejects.toBeInstanceOf(
      MicrosoftAccessError
    );
  });
});
