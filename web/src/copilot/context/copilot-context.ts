export type CopilotContext = {
  surface: string; // matrix | timeline | budget | docs | event | etc
  entityType?: string; // room | session | timelineItem | budgetLine | doc
  entityId?: string;

  eventId?: string;
  orgId?: string;
  userId?: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageData?: Record<string, any>; // surface-specific data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectionState?: Record<string, any>; // currently selected rows/items
  availableCapabilities?: string[]; // capabilities for resolver
  userIntentHints?: string[]; // optional hints from UI
};

export type CopilotSurfaceAdapterResult = {
  pageData: Record<string, unknown>;
  availableCapabilities: string[];
};
