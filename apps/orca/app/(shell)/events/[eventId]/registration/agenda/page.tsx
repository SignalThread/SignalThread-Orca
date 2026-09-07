import { RegistrationAgendaWorkspace } from "./registration-agenda-workspace";

export default async function RegistrationAgendaPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <RegistrationAgendaWorkspace eventId={eventId} />;
}
