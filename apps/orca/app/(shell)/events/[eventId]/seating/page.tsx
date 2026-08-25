import { notFound, redirect } from "next/navigation";
import { ROOM_SET_SEATING_ENABLED } from "@/config/features";

type RetiredEventAssignmentsPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function RetiredEventAssignmentsPage({ params }: RetiredEventAssignmentsPageProps) {
  if (!ROOM_SET_SEATING_ENABLED) notFound();

  const { eventId } = await params;
  redirect(`/events/${eventId}/matrix`);
}
