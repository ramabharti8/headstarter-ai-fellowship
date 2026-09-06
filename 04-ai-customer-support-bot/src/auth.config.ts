import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { googleConfigured, env } from "@/lib/env";

/**
 * Edge-safe auth config: no database, no Node-only APIs. Shared by the
 * middleware (route protection) and the full config in `auth.ts`.
 */
export const authConfig = {
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers: [
    ...(googleConfigured
      ? [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET })]
      : []),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAppRoute =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/chat") ||
        nextUrl.pathname.startsWith("/knowledge") ||
        nextUrl.pathname.startsWith("/settings");
      if (isAppRoute) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.userId && session.user) session.user.id = token.userId as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
