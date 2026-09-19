import { OpportunityScreen } from "@/components/opportunities/opportunity-screen";

export const dynamic = "force-dynamic";

export default async function InProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  return <OpportunityScreen slug="in-progress" range={range} from={from} to={to} />;
}
