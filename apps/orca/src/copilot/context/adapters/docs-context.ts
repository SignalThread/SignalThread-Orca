import { getPrisma } from "@/lib/prisma";
import { getCapabilitiesForSurfaceMode } from "@/src/copilot/capabilities/capability-registry";
import type { CopilotSurfaceAdapterResult } from "@/src/copilot/context/copilot-context";

export async function buildDocsSurfaceContext(eventId: string): Promise<CopilotSurfaceAdapterResult> {
  const documents = await getPrisma().document.findMany({
    where: { eventId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      visibility: true,
      updatedAt: true,
      approvals: {
        orderBy: { actedAt: "desc" },
        select: {
          recipients: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const reviewerMap = new Map<string, { id: string; name: string | null; email: string }>();
  for (const doc of documents) {
    for (const approval of doc.approvals) {
      for (const recipient of approval.recipients) {
        reviewerMap.set(recipient.user.id, {
          id: recipient.user.id,
          name: recipient.user.name,
          email: recipient.user.email,
        });
      }
    }
  }

  return {
    pageData: {
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        status: doc.status,
        visibility: doc.visibility,
        updatedAt: doc.updatedAt.toISOString(),
      })),
      reviewers: Array.from(reviewerMap.values()),
    },
    availableCapabilities: getCapabilitiesForSurfaceMode("docs", "do"),
  };
}
