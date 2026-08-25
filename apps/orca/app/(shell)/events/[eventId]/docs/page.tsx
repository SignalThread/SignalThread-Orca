import EventDocsPageContent from "./_components/event-docs-page";

type EventDocsPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventDocsPage({ params }: EventDocsPageProps) {
  const { eventId } = await params;
  return <EventDocsPageContent eventIdOverride={eventId} hideEventSelector />;
}
