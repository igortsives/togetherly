import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => {
  const prismaStub = {
    account: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn()
    },
    $executeRaw: vi.fn()
  } as {
    account: {
      findFirst: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $executeRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
  };
  prismaStub.$transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: typeof prismaStub) => unknown) =>
      cb(prismaStub)
    );
  return { prisma: prismaStub };
});

import { prisma } from "@/lib/db/prisma";
import {
  GoogleAccessError,
  GoogleAccountMissingError,
  ensureGoogleAccessToken,
  type GoogleHttpClient
} from "./google";

const findFirst = prisma.account.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const findUniqueOrThrow =
  prisma.account.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const update = prisma.account.update as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm $transaction since vi.resetAllMocks clears the implementation.
  const txMock = (
    prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }
  ).$transaction;
  txMock.mockImplementation(async (cb: (tx: typeof prisma) => unknown) =>
    cb(prisma)
  );
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
    const expiredAccount = {
      id: "account-1",
      access_token: "expired-access-token",
      refresh_token: "stored-refresh-token",
      expires_at: expired
    };
    findFirst.mockResolvedValue(expiredAccount);
    findUniqueOrThrow.mockResolvedValue(expiredAccount);

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

  it("skips the HTTP refresh when a concurrent caller already rotated the token", async () => {
    const expired = Math.floor(Date.now() / 1000) - 60;
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    findFirst.mockResolvedValue({
      id: "account-1",
      access_token: "expired-access-token",
      refresh_token: "stored-refresh-token",
      expires_at: expired
    });
    // Inside the lock, the row has already been refreshed by a winner.
    findUniqueOrThrow.mockResolvedValue({
      id: "account-1",
      access_token: "winner-rotated-token",
      refresh_token: "stored-refresh-token",
      expires_at: farFuture
    });

    const fetchMock = vi.fn();
    const token = await ensureGoogleAccessToken("user-1", {
      fetch: fetchMock as unknown as GoogleHttpClient
    });

    expect(token).toBe("winner-rotated-token");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("nulls refresh_token on invalid_grant and throws GoogleAccessError", async () => {
    const expired = Math.floor(Date.now() / 1000) - 60;
    const expiredAccount = {
      id: "account-1",
      access_token: "expired",
      refresh_token: "stored-refresh-token",
      expires_at: expired
    };
    findFirst.mockResolvedValue(expiredAccount);
    findUniqueOrThrow.mockResolvedValue(expiredAccount);

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      clone() {
        return this;
      },
      json: async () => ({ error: "invalid_grant" }),
      text: async () => '{"error":"invalid_grant"}'
    })) as unknown as GoogleHttpClient;

    await expect(
      ensureGoogleAccessToken("user-1", { fetch: fetchMock })
    ).rejects.toBeInstanceOf(GoogleAccessError);
    expect(update).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: { refresh_token: null }
    });
  });

  it("throws GoogleAccessError on other non-OK responses without touching refresh_token", async () => {
    const expired = Math.floor(Date.now() / 1000) - 60;
    const expiredAccount = {
      id: "account-1",
      access_token: "expired",
      refresh_token: "stored-refresh-token",
      expires_at: expired
    };
    findFirst.mockResolvedValue(expiredAccount);
    findUniqueOrThrow.mockResolvedValue(expiredAccount);

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      clone() {
        return this;
      },
      json: async () => ({ error: "temporarily_unavailable" }),
      text: async () => '{"error":"temporarily_unavailable"}'
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
