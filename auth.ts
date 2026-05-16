import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { AuthProvider } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  credentialsAuthorize,
  redirectCallback,
  signInCallback
} from "@/lib/auth/callbacks";

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
      authorize: (credentials, request) =>
        credentialsAuthorize(credentials, request)
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                // `calendar.events` (write) replaces `calendar.readonly`
                // for issue #45 (export selected free windows). The
                // event-creation API still needs a calendar-list scope
                // for the list-calendars UI, so we keep `calendar.readonly`
                // alongside it — Google grants the union of the two.
                // Existing users must re-link before they can export.
                scope:
                  "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
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
            // would be a takeover vector.
            authorization: {
              params: {
                // `Calendars.ReadWrite` replaces `Calendars.Read` for
                // issue #45 (export selected free windows). Existing
                // users must re-link before they can export.
                scope:
                  "openid email profile offline_access Calendars.ReadWrite",
                prompt: "consent"
              }
            }
          })
        ]
      : [])
  ],
  callbacks: {
    signIn: signInCallback,
    redirect: redirectCallback,
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
    case "microsoft-entra-id":
      return AuthProvider.MICROSOFT;
    case "credentials":
      return AuthProvider.EMAIL;
    default:
      return null;
  }
}
