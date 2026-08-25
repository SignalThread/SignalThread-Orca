import { EventFinancialReporting } from "@/app/(shell)/events/[eventId]/reports/_components/event-financial-reporting";
import { OperationalHandoffCenter } from "@/app/(shell)/events/[eventId]/reports/_components/operational-handoff-center";

type EventReportsPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventReportsPage({ params }: EventReportsPageProps) {
  const { eventId } = await params;
  return <div className="space-y-6"><OperationalHandoffCenter eventId={eventId} /><EventFinancialReporting eventId={eventId} /></div>;
}
