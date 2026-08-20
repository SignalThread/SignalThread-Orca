import { COPILOT_ACTION_REGISTRY } from "@/lib/copilot/registry";
import { getCopilotProvider } from "@/lib/copilot/provider";
import type { CopilotContext } from "@/src/copilot/context/copilot-context";
import type { CopilotActionType, ProposedAction } from "@/lib/copilot/types";

export class CopilotParseError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateForAction(actionType: CopilotActionType, params: Record<string, unknown>): string[] {
  const messages: string[] = [];

  if (actionType.startsWith("session.")) {
    const hasSessionName = isNonEmptyString(params.sessionName);
    const hasSessionId = isNonEmptyString(params.sessionId);
    if (actionType !== "session.create" && !hasSessionName && !hasSessionId) {
      messages.push("Session target is required (session name or session id).");
    }
  }

  if (actionType === "session.create") {
    if (!isNonEmptyString(params.sessionName)) {
      messages.push("Session title is required.");
    }
    if (!isNonEmptyString(params.startTime)) {
      messages.push("Session start time is required.");
    }
  }

  if (actionType === "session.move") {
    if (!isNonEmptyString(params.roomName) && !isNonEmptyString(params.roomId)) {
      messages.push("Target room is required for session move.");
    }
    if (!isNonEmptyString(params.startTime)) {
      messages.push("Target start time is required for session move.");
    }
  }

  if (actionType === "session.update") {
    const hasMutation =
      isNonEmptyString(params.newTitle) ||
      isNonEmptyString(params.startTime) ||
      isNonEmptyString(params.endTime) ||
      isNonEmptyString(params.roomName) ||
      isNonEmptyString(params.roomId) ||
      isNonEmptyString(params.roomSetupType) ||
      typeof params.expectedAttendance === "number";

    if (!hasMutation) {
      messages.push("Provide at least one session field to update.");
    }
  }

  if (actionType === "room.create") {
    if (!isNonEmptyString(params.roomName)) {
      messages.push("Room name is required.");
    }
  }

  if (actionType === "room.update") {
    if (!isNonEmptyString(params.roomName) && !isNonEmptyString(params.roomId)) {
      messages.push("Room target is required for room update.");
    }
    if (!isNonEmptyString(params.newName) && typeof params.capacity !== "number") {
      messages.push("Provide at least one room field to update (new name or capacity).");
    }
  }

  if (actionType === "speaker.assign" && !isNonEmptyString(params.speakerName)) {
    messages.push("Speaker name is required.");
  }

  if (actionType === "staff.assign" && !isNonEmptyString(params.staffName)) {
    messages.push("Staff name is required.");
  }

  if (actionType === "roomSetup.set" && !isNonEmptyString(params.roomSetupType)) {
    messages.push("Room setup type is required.");
  }

  if (actionType === "foodService.set" && !isNonEmptyString(params.serviceType)) {
    messages.push("Food service type is required.");
  }

  if (actionType === "budgetLineItem.create" && !isNonEmptyString(params.lineItem)) {
    messages.push("Budget line item name is required.");
  }

  if (actionType === "budgetLineItem.update") {
    if (!isNonEmptyString(params.lineItem) && !isNonEmptyString(params.lineItemId)) {
      messages.push("Budget line item target is required.");
    }
    if (typeof params.forecastCents !== "number" && typeof params.actualCents !== "number" && !isNonEmptyString(params.vendor)) {
      messages.push("Provide at least one field to update for budget line item.");
    }
  }

  if (actionType === "note.add" && !isNonEmptyString(params.noteText)) {
    messages.push("Note text is required.");
  }

  return messages;
}

function inferTarget(actionType: CopilotActionType, params: Record<string, unknown>): ProposedAction["target"] {
  if (actionType.startsWith("session.") || actionType === "speaker.assign" || actionType === "staff.assign" || actionType === "roomSetup.set" || actionType === "foodService.set" || actionType === "note.add") {
    const entityId = isNonEmptyString(params.sessionId) ? params.sessionId : undefined;
    const displayName = isNonEmptyString(params.sessionName) ? params.sessionName : undefined;
    return {
      entityType: "session",
      entityId,
      displayName,
    };
  }

  if (actionType.startsWith("room.")) {
    return {
      entityType: "room",
      entityId: isNonEmptyString(params.roomId) ? params.roomId : undefined,
      displayName: isNonEmptyString(params.roomName) ? params.roomName : undefined,
    };
  }

  if (actionType.startsWith("budgetLineItem.")) {
    return {
      entityType: "budgetLineItem",
      entityId: isNonEmptyString(params.lineItemId) ? params.lineItemId : undefined,
      displayName: isNonEmptyString(params.lineItem) ? params.lineItem : undefined,
    };
  }

  return undefined;
}

type BuildActionInput = {
  extracted: {
    actionType: CopilotActionType | null;
    params: Record<string, unknown>;
    summary: string;
  };
  orgId: string;
  eventId?: string;
};

export function buildProposedActionFromExtraction(input: BuildActionInput): ProposedAction {
  const { extracted } = input;
  if (!extracted.actionType) {
    throw new CopilotParseError("Unsupported Do action. Supported actions: session.create, session.update, session.move, room.create, room.update, speaker.assign, staff.assign, roomSetup.set, foodService.set, budgetLineItem.create, budgetLineItem.update, note.add.", 400);
  }

  const definition = COPILOT_ACTION_REGISTRY[extracted.actionType];
  if (!definition) {
    throw new CopilotParseError("Unsupported Do action.", 400);
  }

  const validationMessages = validateForAction(extracted.actionType, extracted.params);

  return {
    actionType: extracted.actionType,
    scope: {
      orgId: input.orgId,
      ...(input.eventId ? { eventId: input.eventId } : {}),
    },
    target: inferTarget(extracted.actionType, extracted.params),
    params: extracted.params,
    riskLevel: definition.riskLevel,
    requiresConfirmation: true,
    summary: extracted.summary || definition.label,
    validationMessages,
  };
}

export async function parseDoPromptToAction(input: {
  prompt: string;
  orgId: string;
  eventId?: string;
  context?: CopilotContext;
}): Promise<ProposedAction> {
  const provider = getCopilotProvider();
  const extracted = await provider.parseDoIntent(input.prompt, input.context);
  return buildProposedActionFromExtraction({
    extracted,
    orgId: input.orgId,
    eventId: input.eventId,
  });
}
