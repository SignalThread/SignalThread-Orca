import { redirect } from "next/navigation";

type EventFnbCatalogPageProps = {
  params: Promise<{ eventId: string }>;
};

/**
 * Legacy entry point. Menus is no longer a standalone event destination; catalog and
 * source-menu management belong to the Run of Show F&B Planner. Existing links, bookmarks,
 * and exported documents keep working through this redirect.
 */
export default async function EventFnbCatalogPage({ params }: EventFnbCatalogPageProps) {
  const { eventId } = await params;
  redirect(`/events/${encodeURIComponent(eventId)}/matrix/fnb`);
}
