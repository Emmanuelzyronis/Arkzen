import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Signing in and signing up are the only pages a signed-out visitor may see.
 *
 * These are plain path checks rather than Clerk's `createRouteMatcher`, which
 * Clerk now deprecates: middleware path matching can diverge from how Next.js
 * resolves a request, so it is a first line of defence, not the only one.
 * Every handler that touches workspace data re-checks the session itself —
 * see `lib/api-auth.ts`.
 */
const PUBLIC_PREFIXES = ["/sign-in", "/sign-up"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return;

  const { userId } = await auth();
  if (userId) return;

  // A fetch wants a 401 it can read, not an HTML sign-in page.
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("redirect_url", request.url);
  return NextResponse.redirect(signIn);
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
