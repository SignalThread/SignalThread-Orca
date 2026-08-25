import { getPrisma } from "@/lib/prisma";
import { buildBudgetSurfaceContext } from "@/src/copilot/context/adapters/budget-context";
import { buildDocsSurfaceContext } from "@/src/copilot/context/adapters/docs-context";
import { buildMatrixSurfaceContext } from "@/src/copilot/context/adapters/matrix-context";
import { buildTimelineSurfaceContext } from "@/src/copilot/context/adapters/timeline-context";
import type { CopilotContext, CopilotSurfaceAdapterResult } from "@/src/copilot/context/copilot-context";

type BuildCopilotContextInput = {
  mode?: "ask" | "do";
  surface?: string;
  pagePath?: string;
  eventId?: string;
  entityId?: string;
  entityType?: string;
  selectionState?: Record<string, unknown>;
  userId?: string;
  orgId?: string;
  availableCapabilities?: string[];
  userIntentHints?: string[];
};

function toText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSurface(input: { surface?: string; pagePath?: string }): string {
  const explicit = toText(input.surface);
  if (explicit) return explicit.toLowerCase();

  const path = toText(input.pagePath);
  if (!path) return "global";
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "global";
  if (segments[0] !== "events") return segments[0]!.toLowerCase();
  if (segments.length < 3) return "event";
  return segments[2]!.toLowerCase();
}

function dedupeCapabilities(values: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const entry of values) {
    const normalized = toText(entry);
    if (normalized) set.add(normalized);
  }
  return Array.from(set.values());
}

function buildDataSizes(pageData: Record<string, unknown>): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const [key, value] of Object.entries(pageData)) {
    if (Array.isArray(value)) {
      sizes[key] = value.length;
      continue;
    }
    if (value && typeof value === "object") {
      sizes[key] = Object.keys(value).length;
      continue;
    }
    sizes[key] = value == null ? 0 : 1;
  }
  return sizes;
}

async function loadSurfaceData(surface: string, eventId: string | undefined): Promise<CopilotSurfaceAdapterResult> {
  if (!eventId) {
    return { pageData: {}, availableCapabilities: [] };
  }

  if (surface === "matrix" || surface === "matrix-2") {
    return buildMatrixSurfaceContext(eventId);
  }
  if (surface === "timeline") {
    return buildTimelineSurfaceContext(eventId);
  }
  if (surface === "budget" || surface === "budgets") {
    return buildBudgetSurfaceContext(eventId);
  }
  if (surface === "docs" || surface === "documents") {
    return buildDocsSurfaceContext(eventId);
  }

  return { pageData: {}, availableCapabilities: [] };
}

export async function buildCopilotContext(input: BuildCopilotContextInput): Promise<CopilotContext> {
  const surface = normalizeSurface({
    surface: input.surface,
    pagePath: input.pagePath,
  });

  const requestedEventId = toText(input.eventId);
  const requestedOrgId = toText(input.orgId);
  const requestedUserId = toText(input.userId);
  const inferredOrgId =
    !requestedOrgId && requestedUserId
      ? (
          await getPrisma().user.findUnique({
            where: { id: requestedUserId },
            select: { orgId: true },
          })
        )?.orgId
      : null;
  const effectiveOrgId = requestedOrgId ?? inferredOrgId ?? undefined;

  const event = requestedEventId
    ? await getPrisma().event.findFirst({
        where: {
          id: requestedEventId,
          ...(effectiveOrgId ? { orgId: effectiveOrgId } : {}),
        },
        select: {
          id: true,
          orgId: true,
          name: true,
          startDate: true,
          endDate: true,
          timezone: true,
        },
      })
    : null;

  const resolvedEventId = event?.id ?? requestedEventId;
  const surfaceData = await loadSurfaceData(surface, resolvedEventId);

  const pageData: Record<string, unknown> = {
    ...(event
      ? {
          event: {
            id: event.id,
            name: event.name,
            startDate: event.startDate.toISOString(),
            endDate: event.endDate?.toISOString() ?? null,
            timezone: event.timezone,
          },
        }
      : {}),
    ...surfaceData.pageData,
  };

  const availableCapabilities = dedupeCapabilities([
    ...(surfaceData.availableCapabilities ?? []),
    ...(input.availableCapabilities ?? []),
  ]);

  const context: CopilotContext = {
    surface,
    ...(toText(input.entityType) ? { entityType: toText(input.entityType) } : {}),
    ...(toText(input.entityId) ? { entityId: toText(input.entityId) } : {}),
    ...(resolvedEventId ? { eventId: resolvedEventId } : {}),
    ...(event?.orgId ?? effectiveOrgId ? { orgId: event?.orgId ?? effectiveOrgId } : {}),
    ...(toText(input.userId) ? { userId: toText(input.userId) } : {}),
    ...(Object.keys(pageData).length > 0 ? { pageData } : {}),
    ...(input.selectionState ? { selectionState: input.selectionState } : {}),
    ...(availableCapabilities.length > 0 ? { availableCapabilities } : {}),
    ...(Array.isArray(input.userIntentHints) ? { userIntentHints: input.userIntentHints } : {}),
  };

  console.info("copilot.context.built", {
    surface: context.surface,
    mode: input.mode ?? null,
    eventId: context.eventId ?? null,
    entityType: context.entityType ?? null,
    resolvedCapability: null,
    clarificationRequired: null,
    resultKind: null,
    capabilityCount: context.availableCapabilities?.length ?? 0,
    dataSizes: buildDataSizes(pageData),
  });

  return context;
}
