import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import NextAuth, { type DefaultSession } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { AuthProvider } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { credentialsLoginSchema } from "@/lib/auth/schemas";
import { isSameOriginUrl } from "@/lib/auth/redirects";

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
      authorize: async (credentials) => {
        const parsed = credentialsLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() }
        });

        if (!user?.passwordHash) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

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
            issuer:
              "https://login.microsoftonline.com/common/v2.0",
            allowDangerousEmailAccountLinking: true,
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
