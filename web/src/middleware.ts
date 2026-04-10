import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ── Route classification ───────────────────────────────────────────────────────

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/pricing(.*)",
]);

// ── Middleware ─────────────────────────────────────────────────────────────────

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const url        = req.nextUrl;

  // 1. Unauthenticated + protected route → sign-in
  if (!userId && !isPublicRoute(req)) {
    const signIn = new URL("/sign-in", url);
    signIn.searchParams.set("redirect_url", url.pathname);
    return NextResponse.redirect(signIn);
  }

  // 2. Authenticated + hasn't completed onboarding → onboarding
  //    Skip if already heading there (prevents redirect loops)
  if (userId && !isPublicRoute(req)) {
    const onboarded = req.cookies.get("rehearse_onboarded")?.value;
    if (!onboarded) {
      return NextResponse.redirect(new URL("/onboarding", url));
    }
  }

  return NextResponse.next();
});

// Apply to all routes except Next.js internals and static assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
