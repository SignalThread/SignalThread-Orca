import { redirect } from "next/navigation";

export default function LegacyExhibitorLeadRedirectPage({
  params
}: {
  params: { leadId: string };
}) {
  redirect(`/exhibitor/leads/${params.leadId}`);
}
