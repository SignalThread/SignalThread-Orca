import { notFound } from "next/navigation";
import { ROOM_SET_SEATING_ENABLED } from "@/config/features";
import { RoomSetWorkspace } from "./_components/room-set-workspace";

type RoomSetWorkspacePageProps = {
  params: Promise<{
    eventId: string;
    sessionId: string;
  }>;
};

export default async function RoomSetWorkspacePage({ params }: RoomSetWorkspacePageProps) {
  if (!ROOM_SET_SEATING_ENABLED) notFound();

  const { eventId, sessionId } = await params;
  return <RoomSetWorkspace eventId={eventId} sessionId={sessionId} />;
}
