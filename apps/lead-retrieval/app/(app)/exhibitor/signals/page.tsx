import { SignalLibraryClient } from "@/components/signals/signal-library-client";
import { requireRole } from "@/lib/auth/session";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";

type SearchParams = {
  eventId?: string | string[];
};

export default async function ExhibitorSignalsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const resolved = (await searchParams) ?? {};
  const rawEventId = Array.isArray(resolved.eventId) ? resolved.eventId[0] : resolved.eventId;
  const eventId = await resolveExhibitorAppActiveEventId(sessionUser.id, rawEventId ?? null);

  return (
    <SignalLibraryClient
      role={sessionUser.role ?? ""}
      userId={sessionUser.id}
      libraryBasePath="/exhibitor/signals"
      eventId={eventId}
    />
  );
}
