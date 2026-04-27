import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication.
// /quiz/* must remain public — weekly contest is open to anyone.
// /api/v1/* is proxied to NestJS which has its own auth guard.
function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/quiz") ||  // public weekly quiz/contest
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/v1") ||  // proxied to NestJS which has its own auth guard
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf)$/.test(pathname)
  );
}

// Routes that authenticated users can access without finishing onboarding
function isOnboardingExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/admin")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Better Auth sets either a plain or Secure-prefixed session cookie
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie) {
    // Non-GET requests (API calls) should get 401, not a page redirect
    if (request.method !== "GET") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("redirect_url", pathname);
    return NextResponse.redirect(signIn);
  }

  // Onboarding gate — skip for exempt routes and non-GET requests
  if (!isOnboardingExempt(pathname) && request.method === "GET") {
    const onboarded = request.cookies.get("rehearse_onboarded")?.value;
    if (!onboarded) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude static files, images, AND /api/v1/* (proxied to NestJS — has its own auth)
    "/((?!_next/static|_next/image|favicon.ico|api/v1|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
