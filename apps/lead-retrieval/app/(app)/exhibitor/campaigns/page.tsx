import { CampaignsList } from "@/components/campaigns/campaigns-list";
import { requireRole } from "@/lib/auth/session";

export default async function ExhibitorCampaignsPage() {
  await requireRole("exhibitor_admin");
  return <CampaignsList />;
}
