import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/favicon.ico"
]);

const PUBLIC_PREFIXES = ["/api/auth", "/_next", "/static"];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return NextResponse.next();
    }
  }

  if (!request.auth) {
    const signInUrl = new URL("/login", request.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
