import { redirect } from "next/navigation";

type EventMatrix2PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventMatrix2Page({ params }: EventMatrix2PageProps) {
  const { eventId } = await params;
  redirect(`/events/${encodeURIComponent(eventId)}/matrix`);
}
