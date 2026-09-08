import { SignalEditPage } from "@/components/signals/signal-edit-page";
import { requireRole } from "@/lib/auth/session";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";

type SearchParams = {
  eventId?: string | string[];
};

export default async function ExhibitorEditSignalPage({
  params,
  searchParams
}: {
  params: Promise<{ signalId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const { signalId } = await params;
  const resolved = (await searchParams) ?? {};
  const rawEventId = Array.isArray(resolved.eventId) ? resolved.eventId[0] : resolved.eventId;
  const eventId = await resolveExhibitorAppActiveEventId(sessionUser.id, rawEventId ?? null);

  return (
    <SignalEditPage
      signalId={signalId}
      role={sessionUser.role ?? ""}
      userId={sessionUser.id}
      libraryBasePath="/exhibitor/signals"
      eventId={eventId}
    />
  );
}
