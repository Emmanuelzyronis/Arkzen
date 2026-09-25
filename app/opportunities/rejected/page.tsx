import { requirePageUser } from "@/lib/api-auth";
import { listRejectedSignals } from "@/lib/data/repository";
import { RejectedView } from "@/components/opportunities/rejected-view";

export const dynamic = "force-dynamic";

export default async function RejectedPage() {
  const userId = await requirePageUser();
  const rejected = await listRejectedSignals(userId);
  return <RejectedView rejected={rejected} />;
}
