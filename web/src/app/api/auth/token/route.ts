import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { SignJWT } from "jose";
import { auth } from "@/lib/auth";

/**
 * GET /api/auth/token
 *
 * Validates the Better Auth session cookie and issues a short-lived HS256 JWT.
 * The NestJS API validates this token with the shared BETTER_AUTH_SECRET.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(process.env.BETTER_AUTH_SECRET!);

  const token = await new SignJWT({
    sub:   session.user.id,
    email: session.user.email,
    name:  session.user.name,
    image: session.user.image,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);

  return NextResponse.json({ token });
}
