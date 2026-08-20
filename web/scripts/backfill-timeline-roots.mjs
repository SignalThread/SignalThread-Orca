import "dotenv/config";
import { TimelinePriority, TimelineStatus } from "@prisma/client";
import { getPrisma } from "../src/server/db/prisma.ts";

const prisma = getPrisma();

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
  };
}

function toIsoDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      timelineItems: {
        select: {
          id: true,
          title: true,
          parentId: true,
          sortOrder: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let skipped = 0;

  for (const event of events) {
    const hasRoot = event.timelineItems.some(
      (item) => item.parentId === null && item.title.trim().toLowerCase() === "event timeline",
    );

    if (hasRoot) {
      skipped += 1;
      continue;
    }

    const minSortOrder = event.timelineItems.reduce(
      (min, item) => (item.sortOrder < min ? item.sortOrder : min),
      Number.POSITIVE_INFINITY,
    );
    const sortOrder = Number.isFinite(minSortOrder) ? minSortOrder - 1 : 0;

    if (!dryRun) {
      await prisma.timelineItem.create({
        data: {
          eventId: event.id,
          title: "Event Timeline",
          department: "General",
          status: TimelineStatus.IN_PROGRESS,
          priority: TimelinePriority.MEDIUM,
          parentId: null,
          startDate: event.startDate,
          endDate: event.endDate ?? event.startDate,
          sortOrder,
        },
      });
    }

    created += 1;
    const startLabel = toIsoDate(event.startDate);
    const endLabel = toIsoDate(event.endDate ?? event.startDate);
    console.log(
      `${dryRun ? "[dry-run] " : ""}created root timeline item for event ${event.id} (${event.name}) start=${startLabel} end=${endLabel}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        totalEvents: events.length,
        created,
        skipped,
        dryRun,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to backfill root timeline items:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
