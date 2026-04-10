import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing(.*)",
  "/onboarding(.*)",
]);

// Routes that authenticated users can access without onboarding
const isOnboardingExempt = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Unauthenticated — protect non-public routes
  if (!userId) {
    if (!isPublic(req)) {
      await auth.protect();
    }
    return;
  }

  // Authenticated — check onboarding completion
  if (!isOnboardingExempt(req)) {
    const onboarded = req.cookies.get("rehearse_onboarded")?.value === "1";
    if (!onboarded) {
      const onboardingUrl = new URL("/onboarding", req.url);
      return NextResponse.redirect(onboardingUrl);
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
