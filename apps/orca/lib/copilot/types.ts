export type CopilotMode = "ask" | "do";

export const COPILOT_ACTION_TYPES = [
  "session.create",
  "session.update",
  "session.move",
  "room.create",
  "room.update",
  "speaker.assign",
  "staff.assign",
  "roomSetup.set",
  "foodService.set",
  "budgetLineItem.create",
  "budgetLineItem.update",
  "note.add",
] as const;

export type CopilotActionType = (typeof COPILOT_ACTION_TYPES)[number];

export type CopilotRiskLevel = "low" | "medium" | "high";

export type ProposedAction = {
  actionType: CopilotActionType;
  scope: {
    orgId: string;
    eventId?: string;
  };
  target?: {
    entityType: string;
    entityId?: string;
    displayName?: string;
  };
  params: Record<string, unknown>;
  riskLevel: CopilotRiskLevel;
  requiresConfirmation: boolean;
  summary: string;
  validationMessages: string[];
};

export type CopilotClientContext = {
  surface?: string;
  eventId?: string;
  entityType?: string;
  entityId?: string;
  pagePath?: string;
  module?: string;
  selectionState?: Record<string, unknown>;
  availableCapabilities?: string[];
  userIntentHints?: string[];
};

export type CopilotChatRequest = {
  mode: CopilotMode;
  prompt: string;
  context?: CopilotClientContext;
};

export type CopilotAskResponse = {
  kind: "answer";
  auditLogId: string;
  message: string;
};

export type CopilotDoProposalResponse = {
  kind: "proposal";
  auditLogId: string;
  canExecute: boolean;
  proposedAction: ProposedAction;
  message?: string;
};

export type CopilotExecuteRequest = {
  auditLogId: string;
  approved: boolean;
};

export type CopilotExecuteResponse = {
  auditLogId: string;
  status: "rejected" | "executed" | "failed";
  message: string;
  resultSummary?: string;
};

export type CopilotParsedIntent = {
  actionType: CopilotActionType;
  summary: string;
  target?: ProposedAction["target"];
  params: Record<string, unknown>;
};

export const MATRIX_COPILOT_ACTION_TYPES = [
  "room.create",
  "room.update",
  "session.create",
  "session.move",
] as const;

export type MatrixCopilotActionType = (typeof MATRIX_COPILOT_ACTION_TYPES)[number];

export type MatrixCopilotResolverResult = {
  capability: MatrixCopilotActionType | null;
  confidence: number;
  params: Record<string, unknown>;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
  reasoningSummary: string;
};

export type CopilotDoClarificationResponse = {
  kind: "clarification";
  auditLogId: string;
  message: string;
  capability: MatrixCopilotActionType | null;
  confidence: number;
  reasoningSummary: string;
};

export type CopilotChatResponse = CopilotAskResponse | CopilotDoProposalResponse | CopilotDoClarificationResponse;
