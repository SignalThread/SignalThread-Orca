import { EventDirectory } from "./_components/event-directory";

type EventDirectoryPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventDirectoryPage({ params }: EventDirectoryPageProps) {
  const { eventId } = await params;
  return (
    <section className="h-full min-h-0 overflow-y-auto">
      <EventDirectory eventId={eventId} />
    </section>
  );
}
