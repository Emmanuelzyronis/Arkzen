import { OpportunityScreen } from "@/components/opportunities/opportunity-screen";

export const dynamic = "force-dynamic";

export default async function DonePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  return <OpportunityScreen slug="done" range={range} from={from} to={to} />;
}
