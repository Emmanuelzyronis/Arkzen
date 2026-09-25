import { NextResponse } from "next/server";
import { listRejectedSignals } from "@/lib/data/repository";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const rows = await listRejectedSignals(session.userId);
  return NextResponse.json({ rejected: rows });
}
