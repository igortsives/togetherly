import { compare, hashSync } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { credentialsLoginSchema } from "@/lib/auth/schemas";
import { isSameOriginUrl } from "@/lib/auth/redirects";
import {
  EMAIL_RATE_LIMIT,
  emailRateLimitKey,
  IP_RATE_LIMIT,
  ipFromRequest,
  ipRateLimitKey,
  isRateLimited,
  recordFailedAttempt
} from "@/lib/auth/rate-limit";

/**
 * Extracted from `auth.ts`'s `callbacks` so the logic can be
 * unit-tested without spinning up the full NextAuth handler chain.
 * `vitest.config.ts` already declares `server.deps.inline` for
 * next-auth and the prisma adapter, but the inline callback closures
 * in `auth.ts` aren't exported. Issue #78.
 */

/** Closes the issue-#38 takeover path: only allow Google sign-ins
 * whose provider has actually verified the email. */
export async function signInCallback(params: {
  account?: {
    provider?: string;
    providerAccountId?: string;
  } | null;
  profile?: unknown;
}): Promise<boolean> {
  const { account, profile } = params;
  if (account?.provider === "google") {
    const emailVerified =
      (profile as { email_verified?: boolean } | null | undefined)
        ?.email_verified;
    if (emailVerified !== true) {
      console.warn(
        "Blocked Google sign-in: profile.email_verified is not true",
        { providerAccountId: account.providerAccountId }
      );
      return false;
    }
  }
  return true;
}

/** Closes the issue-#63 open-redirect surface: any cross-origin
 * destination falls back to the base URL. The login-page allowlist
 * narrows further (the four user-facing routes); this callback is
 * the catch-all backstop for every other NextAuth redirect path. */
export async function redirectCallback(params: {
  url: string;
  baseUrl: string;
}): Promise<string> {
  const { url, baseUrl } = params;
  if (isSameOriginUrl(url, baseUrl)) {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return baseUrl;
    }
  }
  return baseUrl;
}

/** Timing-channel sentinel for issue #86. Precomputed at module load
 * so the cold-start cost is paid once per process. Exported only for
 * `vi.spyOn` in tests; treat as private otherwise. */
export const BCRYPT_ROUNDS = 12;
export const TIMING_DUMMY_HASH = hashSync(
  "togetherly-bcrypt-sentinel-never-matches",
  BCRYPT_ROUNDS
);

export type AuthorizeUser = {
  id: string;
  email: string;
  name?: string;
  image?: string;
};

/**
 * The Credentials provider's `authorize` body, extracted so the
 * timing-channel close (#86), the rate-limit gating (#64), and the
 * input validation can all be unit-tested. Returns `null` on every
 * failure tail; returns the user shape on success.
 */
export async function credentialsAuthorize(
  rawCredentials: unknown,
  request: Request | undefined
): Promise<AuthorizeUser | null> {
  const parsed = credentialsLoginSchema.safeParse(rawCredentials);
  if (!parsed.success) return null;

  const email = parsed.data.email.toLowerCase();
  const emailKey = emailRateLimitKey(email);
  const ipKey = ipRateLimitKey(ipFromRequest(request));

  // Rate-limit defense (#64). The two buckets are independent: the
  // per-email bucket blocks password-spray against a single account,
  // the per-IP bucket blocks grinding across many emails. A
  // limit-exceeded branch does NOT record a new attempt — that would
  // make the window self-extending and lock out users who share an
  // IP (NAT, family Wi-Fi). The rolling 15-min window decays
  // naturally as old rows age out.
  const emailLimit = await isRateLimited(emailKey, EMAIL_RATE_LIMIT);
  if (emailLimit.limited) {
    console.info("Sign-in rate-limited", {
      bucket: "email",
      count: emailLimit.count
    });
    return null;
  }

  const ipLimit = await isRateLimited(ipKey, IP_RATE_LIMIT);
  if (ipLimit.limited) {
    console.info("Sign-in rate-limited", {
      bucket: "ip",
      count: ipLimit.count
    });
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always run bcrypt (#86). The "no such email" branch uses the
  // sentinel hash so the response time matches the "wrong password"
  // branch. Both failure paths collapse into a single tail.
  const hashToCompare = user?.passwordHash ?? TIMING_DUMMY_HASH;
  const valid = await compare(parsed.data.password, hashToCompare);

  if (!user?.passwordHash || !valid) {
    await Promise.all([
      recordFailedAttempt(emailKey),
      recordFailedAttempt(ipKey)
    ]);
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
    image: user.image ?? undefined
  };
}
