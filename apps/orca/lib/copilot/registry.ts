import type { CopilotActionType, CopilotRiskLevel } from "@/lib/copilot/types";

export type CopilotActionDefinition = {
  actionType: CopilotActionType;
  label: string;
  description: string;
  riskLevel: CopilotRiskLevel;
  requiresEvent: boolean;
};

export const COPILOT_ACTION_REGISTRY: Record<CopilotActionType, CopilotActionDefinition> = {
  "session.create": {
    actionType: "session.create",
    label: "Create Session",
    description: "Creates a new session in the event matrix.",
    riskLevel: "medium",
    requiresEvent: true,
  },
  "session.update": {
    actionType: "session.update",
    label: "Update Session",
    description: "Updates session timing, title, room, or logistics fields.",
    riskLevel: "medium",
    requiresEvent: true,
  },
  "session.move": {
    actionType: "session.move",
    label: "Move Session",
    description: "Moves a session to another room/time.",
    riskLevel: "medium",
    requiresEvent: true,
  },
  "room.create": {
    actionType: "room.create",
    label: "Create Room",
    description: "Adds a new room lane for this event.",
    riskLevel: "low",
    requiresEvent: true,
  },
  "room.update": {
    actionType: "room.update",
    label: "Update Room",
    description: "Updates room details such as name or capacity.",
    riskLevel: "low",
    requiresEvent: true,
  },
  "speaker.assign": {
    actionType: "speaker.assign",
    label: "Assign Speaker",
    description: "Assigns one or more speakers to a session.",
    riskLevel: "medium",
    requiresEvent: true,
  },
  "staff.assign": {
    actionType: "staff.assign",
    label: "Assign Staff",
    description: "Assigns one or more staff members to a session.",
    riskLevel: "medium",
    requiresEvent: true,
  },
  "roomSetup.set": {
    actionType: "roomSetup.set",
    label: "Set Room Setup",
    description: "Changes session room setup type.",
    riskLevel: "low",
    requiresEvent: true,
  },
  "foodService.set": {
    actionType: "foodService.set",
    label: "Set Food Service",
    description: "Sets session food and beverage service details.",
    riskLevel: "low",
    requiresEvent: true,
  },
  "budgetLineItem.create": {
    actionType: "budgetLineItem.create",
    label: "Create Budget Line Item",
    description: "Creates a new budget line item for the event budget.",
    riskLevel: "medium",
    requiresEvent: true,
  },
  "budgetLineItem.update": {
    actionType: "budgetLineItem.update",
    label: "Update Budget Line Item",
    description: "Updates an existing budget line item.",
    riskLevel: "medium",
    requiresEvent: true,
  },
  "note.add": {
    actionType: "note.add",
    label: "Add Session Note",
    description: "Appends a note to a session.",
    riskLevel: "low",
    requiresEvent: true,
  },
};
