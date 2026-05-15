import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    signInAttempt: {
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}));

import { prisma } from "@/lib/db/prisma";
import {
  EMAIL_RATE_LIMIT,
  emailRateLimitKey,
  ipFromRequest,
  ipRateLimitKey,
  isRateLimited,
  recordFailedAttempt
} from "./rate-limit";

const mockCount = prisma.signInAttempt.count as unknown as ReturnType<
  typeof vi.fn
>;
const mockCreate = prisma.signInAttempt.create as unknown as ReturnType<
  typeof vi.fn
>;
const mockDeleteMany = prisma.signInAttempt.deleteMany as unknown as ReturnType<
  typeof vi.fn
>;

describe("isRateLimited", () => {
  beforeEach(() => {
    mockCount.mockReset();
    mockCreate.mockReset();
    mockDeleteMany.mockReset();
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("returns limited=false when count is below threshold", async () => {
    mockCount.mockResolvedValue(2);
    const result = await isRateLimited(
      "email:foo@example.com",
      EMAIL_RATE_LIMIT,
      new Date("2026-01-01T12:00:00Z")
    );
    expect(result).toEqual({ limited: false, count: 2 });
  });

  it("returns limited=true at the threshold boundary", async () => {
    mockCount.mockResolvedValue(5);
    const result = await isRateLimited(
      "email:foo@example.com",
      EMAIL_RATE_LIMIT,
      new Date("2026-01-01T12:00:00Z")
    );
    expect(result).toEqual({ limited: true, count: 5 });
  });

  it("returns limited=true above the threshold", async () => {
    mockCount.mockResolvedValue(10);
    const result = await isRateLimited(
      "email:foo@example.com",
      EMAIL_RATE_LIMIT
    );
    expect(result.limited).toBe(true);
  });

  it("prunes stale attempts before counting", async () => {
    mockCount.mockResolvedValue(0);
    const now = new Date("2026-01-01T12:00:00Z");
    const expectedWindowStart = new Date(
      now.getTime() - EMAIL_RATE_LIMIT.windowMs
    );
    await isRateLimited("email:foo@example.com", EMAIL_RATE_LIMIT, now);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        key: "email:foo@example.com",
        attemptedAt: { lt: expectedWindowStart }
      }
    });
  });

  it("counts only attempts within the window", async () => {
    mockCount.mockResolvedValue(0);
    const now = new Date("2026-01-01T12:00:00Z");
    const expectedWindowStart = new Date(
      now.getTime() - EMAIL_RATE_LIMIT.windowMs
    );
    await isRateLimited("email:foo@example.com", EMAIL_RATE_LIMIT, now);
    expect(mockCount).toHaveBeenCalledWith({
      where: {
        key: "email:foo@example.com",
        attemptedAt: { gte: expectedWindowStart }
      }
    });
  });
});

describe("recordFailedAttempt", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("inserts a row with the given key and timestamp", async () => {
    const now = new Date("2026-01-01T12:00:00Z");
    await recordFailedAttempt("ip:1.2.3.4", now);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { key: "ip:1.2.3.4", attemptedAt: now }
    });
  });
});

describe("key helpers", () => {
  it("lowercases email for stable bucketing", () => {
    expect(emailRateLimitKey("FOO@Example.COM")).toBe(
      "email:foo@example.com"
    );
  });

  it("namespaces email and ip distinctly", () => {
    expect(emailRateLimitKey("a@b")).not.toEqual(ipRateLimitKey("a@b"));
  });
});

describe("ipFromRequest", () => {
  it("returns the first hop in x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }
    });
    expect(ipFromRequest(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "9.9.9.9" }
    });
    expect(ipFromRequest(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no IP header is present", () => {
    const req = new Request("http://localhost");
    expect(ipFromRequest(req)).toBe("unknown");
  });

  it("returns 'unknown' when request is undefined", () => {
    expect(ipFromRequest(undefined)).toBe("unknown");
  });

  it("returns 'unknown' for an empty x-forwarded-for hop", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": " , 5.6.7.8" }
    });
    expect(ipFromRequest(req)).toBe("unknown");
  });
});
