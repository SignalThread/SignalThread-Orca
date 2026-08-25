import { notFound } from "next/navigation";
import { getEventHeaderById } from "@/lib/event-loaders";
import { EventAttentionWorkspace } from "./_components/event-attention-workspace";

type EventAttentionWorkspacePageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventAttentionWorkspacePage({ params }: EventAttentionWorkspacePageProps) {
  const { eventId } = await params;
  const event = await getEventHeaderById(eventId);
  if (!event) notFound();

  return (
    <section className="h-full min-h-0 overflow-y-auto">
      <EventAttentionWorkspace
        eventId={event.id}
        eventName={event.name}
        startDate={event.startDate.toISOString()}
        endDate={event.endDate?.toISOString() ?? null}
      />
    </section>
  );
}
