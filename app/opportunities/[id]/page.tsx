import { notFound } from "next/navigation";

import { OpportunityDetail } from "@/components/opportunities/opportunity-detail";
import { requirePageUser } from "@/lib/api-auth";
import { getOpportunity } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

/**
 * A single lead.
 *
 * The first request on a cold database runs migrations and seeds the corpus
 * (`ensureReady()`), so this route does real work before it can render anything.
 * That is what `app/loading.tsx` is for.
 */
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Scoped to the signed-in person, so this can only ever render a lead they
  // own. A lead's id is derived from the posting it came from, which means
  // someone else may well hold the same id for a different copy of the same
  // posting — what they can never reach through it is this person's row, with
  // this person's status, notes and conversation on it. An id nobody holds
  // lands on `notFound()`, the same as one that never existed.
  const opportunity = await getOpportunity(await requirePageUser(), id);
  // `notFound()` rather than a custom empty state: the route genuinely does not
  // exist, and `app/not-found.tsx` already renders it inside the shell.
  if (!opportunity) notFound();

  return <OpportunityDetail opportunity={opportunity} />;
}
