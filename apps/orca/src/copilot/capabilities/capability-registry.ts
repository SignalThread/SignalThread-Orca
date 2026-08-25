export type CopilotCapabilityDefinition = {
  key: string;
  surface: string;
  mode?: "ask" | "do" | "both";
  description: string;
  requiredContext?: string[];
  handler?: string;
};

export const COPILOT_CAPABILITY_REGISTRY: CopilotCapabilityDefinition[] = [
  { key: "room.create", surface: "matrix", mode: "do", description: "Create a room" },
  { key: "room.update", surface: "matrix", mode: "do", description: "Update a room" },
  { key: "session.create", surface: "matrix", mode: "do", description: "Create a session" },
  { key: "session.move", surface: "matrix", mode: "do", description: "Move a session" },
  { key: "speaker.assign", surface: "matrix", mode: "do", description: "Assign a speaker to a session" },
  { key: "staff.assign", surface: "matrix", mode: "do", description: "Assign staff" },
  { key: "roomSetup.set", surface: "matrix", mode: "do", description: "Set room setup for a session" },
  { key: "foodService.set", surface: "matrix", mode: "do", description: "Set food service for a session" },
  { key: "note.add", surface: "matrix", mode: "do", description: "Add a session note" },

  { key: "timelineItem.create", surface: "timeline", mode: "do", description: "Create a timeline item" },
  { key: "timelineItem.update", surface: "timeline", mode: "do", description: "Update a timeline item" },

  { key: "budgetLine.create", surface: "budget", mode: "do", description: "Create a budget line" },
  { key: "budgetLine.update", surface: "budget", mode: "do", description: "Update a budget line" },
  { key: "budgetLineItem.create", surface: "budget", mode: "do", description: "Create a budget line item" },
  { key: "budgetLineItem.update", surface: "budget", mode: "do", description: "Update a budget line item" },

  { key: "doc.create", surface: "docs", mode: "do", description: "Create a document" },
  { key: "doc.review.request", surface: "docs", mode: "do", description: "Request document review" },
];

function normalizeSurface(surface: string): string {
  const normalized = surface.trim().toLowerCase();
  if (normalized === "matrix-2") return "matrix";
  if (normalized === "budgets") return "budget";
  if (normalized === "documents") return "docs";
  return normalized;
}

function normalizeMode(mode: "ask" | "do"): "ask" | "do" {
  return mode;
}

function supportsMode(def: CopilotCapabilityDefinition, mode: "ask" | "do"): boolean {
  const normalizedMode = normalizeMode(mode);
  if (!def.mode || def.mode === "both") return true;
  return def.mode === normalizedMode;
}

export function getCapabilityDefinitionsForSurface(surface: string): CopilotCapabilityDefinition[] {
  const normalized = normalizeSurface(surface);
  return COPILOT_CAPABILITY_REGISTRY.filter((capability) => normalizeSurface(capability.surface) === normalized);
}

export function getCapabilitiesForSurface(surface: string): string[] {
  const keys = getCapabilityDefinitionsForSurface(surface).map((capability) => capability.key);
  return Array.from(new Set(keys));
}

export function isCapabilityAllowedForSurface(surface: string, capability: string): boolean {
  const normalized = capability.trim();
  if (!normalized) return false;
  return getCapabilitiesForSurface(surface).includes(normalized);
}

export function getCapabilityDefinitionsForSurfaceMode(
  surface: string,
  mode: "ask" | "do",
): CopilotCapabilityDefinition[] {
  return getCapabilityDefinitionsForSurface(surface).filter((definition) => supportsMode(definition, mode));
}

export function getCapabilitiesForSurfaceMode(surface: string, mode: "ask" | "do"): string[] {
  const keys = getCapabilityDefinitionsForSurfaceMode(surface, mode).map((capability) => capability.key);
  return Array.from(new Set(keys));
}
