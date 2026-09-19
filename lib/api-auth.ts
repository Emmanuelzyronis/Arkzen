import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

/**
 * Who is making this request.
 *
 * The proxy in front of the app already turns signed-out visitors away, but a
 * path matcher is a routing heuristic rather than a guarantee — it can be
 * changed, outgrown, or miss a route Next.js resolves differently. Every
 * handler that reads or writes workspace data therefore asks for the session
 * itself, so the check travels with the resource instead of depending on a
 * rule written somewhere else.
 *
 * Returns the same `{ ok, response }` shape as `lib/api.ts`, so a guard reads
 * like the body validation sitting beside it.
 */
export type SessionResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

export async function requireUser(): Promise<SessionResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Please sign in to continue." }, { status: 401 }),
    };
  }
  return { ok: true, userId };
}

/**
 * The same check for a page, which has nowhere to put a 401.
 *
 * A page cannot answer with a status — it either renders or it hands back a
 * redirect. This is the rendering half of `requireUser`, and it is the value
 * that every repository call on that page is scoped to: the owner id a page
 * reads is the id whose rows it can see, so getting it from anywhere else would
 * mean trusting a caller's claim about who they are.
 */
export async function requirePageUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}
