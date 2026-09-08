import { redirect } from "next/navigation";

export default async function ExhibitorCampaignDetailRedirect({
  params
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  if (!campaignId?.trim()) {
    redirect("/exhibitor/campaigns");
  }
  redirect(`/campaigns/${encodeURIComponent(campaignId.trim())}`);
}
