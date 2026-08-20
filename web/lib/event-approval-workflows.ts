import { getPrisma } from "@/lib/prisma";

export type EventApprovalWorkflows = {
  budgetApprovalsEnabled: boolean;
  documentApprovalsEnabled: boolean;
};

export async function getEventApprovalWorkflows(eventId: string): Promise<EventApprovalWorkflows | null> {
  return getPrisma().event.findUnique({
    where: { id: eventId },
    select: { budgetApprovalsEnabled: true, documentApprovalsEnabled: true },
  });
}
