/**
 * Backfill existing Speakers, SeatingAttendees, and EventPersons into the Event
 * Directory. Idempotent — safe to run repeatedly; it reuses only exact module
 * links, reports possible identity matches for review, and never mutates the
 * source module records.
 *
 * Usage:
 *   EVENT_ID=<uuid> node --import tsx scripts/backfill-event-directory.ts
 *   ALL_EVENTS=1     node --import tsx scripts/backfill-event-directory.ts
 */
import { getPrisma } from "@/lib/prisma";
import { backfillEventDirectoryForEvent } from "@/src/server/services/event-directory-backfill";

async function main() {
  const eventId = process.env.EVENT_ID?.trim();
  const allEvents = process.env.ALL_EVENTS === "1";

  if (!eventId && !allEvents) {
    console.error("Provide EVENT_ID=<uuid> or ALL_EVENTS=1");
    process.exit(1);
  }

  const eventIds = eventId
    ? [eventId]
    : (await getPrisma().event.findMany({ select: { id: true } })).map((e) => e.id);

  console.info(`Backfilling Event Directory for ${eventIds.length} event(s)…`);
  for (const id of eventIds) {
    try {
      const result = await backfillEventDirectoryForEvent(id);
      console.info(`event ${id}:`, JSON.stringify(result.total));
    } catch (error) {
      console.error(`event ${id} failed:`, error instanceof Error ? error.message : error);
    }
  }
  console.info("Done.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void getPrisma().$disconnect();
  });
