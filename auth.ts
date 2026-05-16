import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare, hashSync } from "bcryptjs";
import NextAuth, { type DefaultSession } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { AuthProvider } from "@prisma/client";
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

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

// Timing-channel defense (#86). When the submitted email does not
// belong to a registered user, we still run a full bcrypt compare
// against this dummy hash so the request takes the same wall-clock
// time as a "real user with wrong password" path. The sentinel value
// cannot be authenticated against — it's not a hash of any password
// a user could submit, and no user row carries this exact hash.
// Computed once at module load; ~250ms cold-start cost per process.
const BCRYPT_ROUNDS = 12;
const TIMING_DUMMY_HASH = hashSync(
  "togetherly-bcrypt-sentinel-never-matches",
  BCRYPT_ROUNDS
);
const appleEnabled = Boolean(
  process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
);
const microsoftEnabled = Boolean(
  process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials, request) => {
        const parsed = credentialsLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const emailKey = emailRateLimitKey(email);
        const ipKey = ipRateLimitKey(ipFromRequest(request));

        // Rate-limit defense (#64). Buckets layer: per-email blocks
        // password-spray against a single account; per-IP blocks an
        // attacker grinding across many emails from one host.
        // Limit-exceeded does NOT record a new attempt — that would
        // make the window self-extending and lock out legitimate users
        // sharing an IP (NAT, family Wi-Fi). The rolling window decays
        // as old rows age out.
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

        // Always run bcrypt — even when the user doesn't exist —
        // against `TIMING_DUMMY_HASH` so the response time doesn't
        // distinguish "no such email" from "wrong password" (#86).
        // The two failure paths then collapse into one tail.
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
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                scope:
                  "openid email profile https://www.googleapis.com/auth/calendar.readonly",
                access_type: "offline",
                prompt: "consent"
              }
            }
          })
        ]
      : []),
    ...(appleEnabled
      ? [
          Apple({
            clientId: process.env.APPLE_CLIENT_ID!,
            clientSecret: process.env.APPLE_CLIENT_SECRET!
          })
        ]
      : []),
    ...(microsoftEnabled
      ? [
          MicrosoftEntraID({
            clientId: process.env.MICROSOFT_CLIENT_ID!,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
            issuer: "https://login.microsoftonline.com/common/v2.0",
            // `allowDangerousEmailAccountLinking` intentionally omitted
            // (#76). The `common/v2.0` issuer accepts personal MSAs
            // where Microsoft does not verify the email at the
            // directory level, so the auto-link-by-email behaviour
            // would be a takeover vector. NextAuth's default
            // behaviour returns `OAuthAccountNotLinked` when the
            // email matches an existing user signed in via a
            // different provider; the user must sign in with their
            // original provider, then link Microsoft from the
            // dashboard's connect flow.
            authorization: {
              params: {
                scope:
                  "openid email profile offline_access Calendars.Read",
                prompt: "consent"
              }
            }
          })
        ]
      : [])
  ],
  callbacks: {
    signIn: async ({ account, profile }) => {
      // Defense against account-linking takeover. With
      // allowDangerousEmailAccountLinking enabled on Google and
      // Microsoft, NextAuth links by email match. Restrict that to
      // emails the provider has actually verified — closes the
      // "unverified email + matching Togetherly user" takeover path
      // from issue #38.
      //
      // Google supplies an explicit `email_verified` claim. Microsoft
      // Entra ID has no equivalent at the claim layer, but verifies
      // emails at the directory/tenant level — accept those by default.
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
    },
    redirect: async ({ url, baseUrl }) => {
      // Same-origin enforcement: defense against open-redirect via
      // crafted callbackUrl. Cross-origin destinations fall back to
      // the baseUrl root.
      if (isSameOriginUrl(url, baseUrl)) {
        try {
          return new URL(url, baseUrl).toString();
        } catch {
          return baseUrl;
        }
      }
      return baseUrl;
    },
    jwt: async ({ token, user, account }) => {
      if (user?.id) {
        token.sub = user.id;
      }
      if (account?.provider && user?.email) {
        const provider = mapAuthProvider(account.provider);
        if (provider) {
          await prisma.user
            .update({
              where: { email: user.email.toLowerCase() },
              data: { authProvider: provider }
            })
            .catch(() => undefined);
        }
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    }
  }
});

function mapAuthProvider(provider: string): AuthProvider | null {
  switch (provider) {
    case "google":
      return AuthProvider.GOOGLE;
    case "apple":
      return AuthProvider.APPLE;
    case "credentials":
      return AuthProvider.EMAIL;
    default:
      return null;
  }
}
