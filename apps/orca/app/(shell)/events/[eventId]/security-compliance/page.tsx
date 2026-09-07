import { SecurityComplianceWorkspace } from "./security-compliance-workspace";

export default async function SecurityCompliancePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <SecurityComplianceWorkspace eventId={eventId} />;
}
