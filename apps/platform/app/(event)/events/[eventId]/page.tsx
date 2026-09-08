import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPlatformServerClient } from "@/lib/supabase/server";
import { loadEventOverview } from "@/lib/server/event-overview";
import { isPlatformAdmin } from "@/lib/server/registry";
import { EventOverview } from "./_components/event-overview";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ eventId: string }> };

async function loadForViewer(eventId: string) {
  const supabase = await createPlatformServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = await isPlatformAdmin(user.id);
  return loadEventOverview(user.id, eventId, admin);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { eventId } = await params;
  const model = await loadForViewer(eventId);
  return { title: model ? `${model.event.name} · SignalThread` : "SignalThread" };
}

/**
 * The single-event overview: one event, every enabled product, one lifecycle.
 *
 * The event id in the URL is a navigation hint. `loadEventOverview` re-derives
 * whether this user may see the event from the registry and returns nothing
 * for an id that is malformed, unknown, or owned by an organization the user
 * is not a member of — all of which render as not found.
 */
export default async function EventOverviewPage({ params }: PageProps) {
  const { eventId } = await params;
  const model = await loadForViewer(eventId);
  if (!model) notFound();
  return <EventOverview model={model} />;
}
