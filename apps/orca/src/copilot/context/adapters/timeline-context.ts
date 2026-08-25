import { getPrisma } from "@/lib/prisma";
import { getCapabilitiesForSurfaceMode } from "@/src/copilot/capabilities/capability-registry";
import type { CopilotSurfaceAdapterResult } from "@/src/copilot/context/copilot-context";

export async function buildTimelineSurfaceContext(eventId: string): Promise<CopilotSurfaceAdapterResult> {
  const timelineItems = await getPrisma().timelineItem.findMany({
    where: { eventId },
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      startDate: true,
      endDate: true,
      ownerUserId: true,
    },
  });

  return {
    pageData: {
      timelineItems: timelineItems.map((item) => ({
        ...item,
        startDate: item.startDate?.toISOString() ?? null,
        endDate: item.endDate?.toISOString() ?? null,
      })),
    },
    availableCapabilities: getCapabilitiesForSurfaceMode("timeline", "do"),
  };
}
