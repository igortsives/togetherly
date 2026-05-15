import { prisma } from "@/lib/db/prisma";

export type RateLimitWindow = {
  maxAttempts: number;
  windowMs: number;
};

/**
 * Default policy from issue #64. Tracks *failed* sign-in attempts only
 * — legitimate users are never penalized for typing their password
 * correctly. Per-email and per-IP buckets layer so a single IP can't
 * grind across many emails, and a single email can't be probed from
 * many IPs.
 */
export const EMAIL_RATE_LIMIT: RateLimitWindow = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000
};

export const IP_RATE_LIMIT: RateLimitWindow = {
  maxAttempts: 20,
  windowMs: 15 * 60 * 1000
};

export type RateLimitResult = {
  limited: boolean;
  count: number;
};

/**
 * Check whether a key is over the rate-limit threshold. Also prunes
 * stale entries for that key as a side effect, keeping the table
 * trimmed without a separate cron. Does NOT record a new attempt —
 * call `recordFailedAttempt` after a confirmed failure.
 */
export async function isRateLimited(
  key: string,
  window: RateLimitWindow,
  now: Date = new Date()
): Promise<RateLimitResult> {
  const windowStart = new Date(now.getTime() - window.windowMs);

  await prisma.signInAttempt.deleteMany({
    where: { key, attemptedAt: { lt: windowStart } }
  });

  const count = await prisma.signInAttempt.count({
    where: { key, attemptedAt: { gte: windowStart } }
  });

  return { limited: count >= window.maxAttempts, count };
}

export async function recordFailedAttempt(
  key: string,
  now: Date = new Date()
): Promise<void> {
  await prisma.signInAttempt.create({
    data: { key, attemptedAt: now }
  });
}

export function emailRateLimitKey(email: string): string {
  return `email:${email.toLowerCase()}`;
}

export function ipRateLimitKey(ip: string): string {
  return `ip:${ip}`;
}

/**
 * Extract a best-effort client IP from a Request. Trusts the first
 * hop in `x-forwarded-for` (typical for Vercel / behind a known
 * reverse proxy); falls back to `x-real-ip`; returns `"unknown"` if
 * neither is present (local dev). In the `"unknown"` fallback all
 * dev traffic shares one bucket — acceptable.
 */
export function ipFromRequest(request: Request | undefined): string {
  if (!request) return "unknown";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    return first.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
