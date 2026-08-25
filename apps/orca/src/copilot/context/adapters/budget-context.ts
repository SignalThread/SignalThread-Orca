import { getPrisma } from "@/lib/prisma";
import { getCapabilitiesForSurfaceMode } from "@/src/copilot/capabilities/capability-registry";
import type { CopilotSurfaceAdapterResult } from "@/src/copilot/context/copilot-context";

export async function buildBudgetSurfaceContext(eventId: string): Promise<CopilotSurfaceAdapterResult> {
  const budget = await getPrisma().budget.findUnique({
    where: { eventId },
    select: {
      id: true,
      status: true,
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          category: true,
          subcategory: true,
          lineItem: true,
          vendor: true,
          forecastCents: true,
          actualCents: true,
          status: true,
          approval: true,
        },
      },
    },
  });

  const lines = budget?.lineItems ?? [];
  const categorySet = new Set(lines.map((line) => line.category.trim()).filter((value) => value.length > 0));

  return {
    pageData: {
      budgetId: budget?.id ?? null,
      budgetStatus: budget?.status ?? null,
      budgetCategories: Array.from(categorySet),
      budgetLines: lines,
    },
    availableCapabilities: getCapabilitiesForSurfaceMode("budget", "do"),
  };
}
