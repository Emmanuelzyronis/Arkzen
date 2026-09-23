import { requirePageUser } from "@/lib/api-auth";
import { listAssistantMessages } from "@/lib/data/repository";
import { AssistantChat } from "./chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const ownerId = await requirePageUser();
  const history = await listAssistantMessages(ownerId, 40);
  return <AssistantChat initialMessages={history} />;
}
