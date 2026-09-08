/**
 * Authoring-only classification for the terminal `compose_campaign_draft` step.
 * Runtime workflow execution is still draft-only today; `send_email` is represented
 * explicitly for UX and validation, but remains unavailable until a canonical
 * workflow send service exists.
 */

export const WORKFLOW_COMPOSE_OUTPUT_ACTION_KINDS = [
  "campaign_draft",
  "ai_email_draft",
  "send_email"
] as const;

export type WorkflowComposeOutputActionKind = (typeof WORKFLOW_COMPOSE_OUTPUT_ACTION_KINDS)[number];

export const DEFAULT_WORKFLOW_COMPOSE_OUTPUT_ACTION_KIND: WorkflowComposeOutputActionKind = "campaign_draft";
export const UNAVAILABLE_WORKFLOW_COMPOSE_OUTPUT_ACTION_KINDS = ["send_email"] as const;

export function normalizeComposeOutputActionKind(raw: unknown): WorkflowComposeOutputActionKind {
  const s = typeof raw === "string" ? raw.trim().toLowerCase().replace(/-/g, "_") : "";
  if (s === "send_email" || s === "sendemail") return "send_email";
  if (s === "ai_email_draft" || s === "ai_email") return "ai_email_draft";
  if (s === "campaign_draft" || s === "campaign") return "campaign_draft";
  return DEFAULT_WORKFLOW_COMPOSE_OUTPUT_ACTION_KIND;
}

export function composeOutputActionKindLabel(kind: WorkflowComposeOutputActionKind): string {
  switch (kind) {
    case "send_email":
      return "Send Email";
    case "ai_email_draft":
      return "Email Draft";
    case "campaign_draft":
    default:
      return "Campaign Draft";
  }
}

export function workflowComposeOutputActionIsAvailable(kind: WorkflowComposeOutputActionKind): boolean {
  return kind !== "send_email";
}

export function workflowComposeOutputActionUnavailableMessage(
  kind: WorkflowComposeOutputActionKind
): string | null {
  if (kind === "send_email") {
    return "Send Email is not available yet. Use Email Draft or Campaign Draft.";
  }
  return null;
}

/** Draft output kinds that may skip the approval pause when `workflow_steps.requires_approval` is false. */
export function composeTerminalSupportsAutomaticDraft(kind: WorkflowComposeOutputActionKind): boolean {
  return kind === "campaign_draft" || kind === "ai_email_draft";
}
