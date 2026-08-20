import { notFound } from "next/navigation";
import { getEventHeaderById } from "@/lib/event-loaders";
import { MarketingWorkspace } from "./_components/marketing-workspace";

type EventMarketingPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventMarketingPage({ params }: EventMarketingPageProps) {
  const { eventId } = await params;
  const event = await getEventHeaderById(eventId);

  if (!event) {
    notFound();
  }

  return <MarketingWorkspace eventId={eventId} eventName={event.name} />;
}
