import { requirePageUser } from "@/lib/api-auth";
import { getServiceProfile } from "@/lib/data/repository";
import { defaultServiceProfile } from "@/lib/domain/service-profile";
import { ProfileEditor } from "./profile-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ownerId = await requirePageUser();
  const saved = await getServiceProfile(ownerId);
  const profile = saved ?? defaultServiceProfile;

  return (
    <ProfileEditor
      initialProfile={{
        name: profile.name,
        description: profile.description,
        capabilities: profile.capabilities,
        keywords: profile.keywords,
        negativeSignals: profile.negativeSignals,
        locations: profile.locations,
        minimumEngagement: profile.minimumEngagement ?? "",
      }}
    />
  );
}
