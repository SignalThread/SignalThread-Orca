import "server-only";

import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";

export type WorkflowAuthoringScopeMode = "event" | "company";

export type WorkflowAuthoringEventContext = {
  eventId: string | null;
  scopeMode: WorkflowAuthoringScopeMode;
};

function normalizeScopeMode(value: unknown): WorkflowAuthoringScopeMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "company" || normalized === "company-wide" || normalized === "any"
    ? "company"
    : "event";
}

export function isExplicitCompanyWideWorkflowScope(value: unknown): boolean {
  return normalizeScopeMode(value) === "company";
}

export async function resolveWorkflowAuthoringEventContext(input: {
  userId: string;
  urlEventId?: string | null;
  scope?: unknown;
}): Promise<WorkflowAuthoringEventContext> {
  const scopeMode = normalizeScopeMode(input.scope);
  if (scopeMode === "company") {
    return { eventId: null, scopeMode };
  }

  const eventId = await resolveExhibitorAppActiveEventId(input.userId, input.urlEventId ?? null);
  return { eventId, scopeMode };
}
