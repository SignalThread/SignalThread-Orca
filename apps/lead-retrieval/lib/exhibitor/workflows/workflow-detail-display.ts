/**
 * Pure display helpers for workflow detail UI + tests (no I/O).
 */

const APPROVAL_REQUIRED_SUBJECT_PREFIX_RE = /^\s*approval\s+required\s*:\s*/i;
const APPROVAL_WAITING_PLACEHOLDER_RE =
  /^\s*this workflow action is waiting for approval\.?(?:\s+the action will execute only after a reviewer approves it\.?)?\s*$/i;

export function stripApprovalRequiredSubjectPrefix(subject: string): string {
  return subject.replace(APPROVAL_REQUIRED_SUBJECT_PREFIX_RE, "").trim();
}

export function isWorkflowApprovalPlaceholderBody(body: string): boolean {
  return APPROVAL_WAITING_PLACEHOLDER_RE.test(body.replace(/\s+/g, " ").trim());
}

/** Subject line preview from handler-produced `generated_drafts.content_jsonb`. */
export function extractDraftSubjectPreview(content: Record<string, unknown> | null | undefined): string | null {
  const raw = content?.subject;
  if (typeof raw !== "string") return null;
  const cleaned = stripApprovalRequiredSubjectPrefix(raw);
  return cleaned.length > 0 ? cleaned : null;
}

/** Short body preview from handler-produced `generated_drafts.content_jsonb`. */
export function extractDraftBodyPreview(content: Record<string, unknown> | null | undefined): string | null {
  const raw = content?.body_text ?? content?.body ?? content?.body_html;
  if (typeof raw !== "string") return null;
  const normalized = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (isWorkflowApprovalPlaceholderBody(normalized)) return null;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

/**
 * `workflow_runs` has no `failed_at`; surface completion/update times for terminal states.
 */
export function formatRunTerminalTimestamp(input: {
  status: string;
  completed_at: string | null;
  updated_at: string | null;
}): { label: string; iso: string | null } {
  const terminal =
    input.status === "completed" ||
    input.status === "failed" ||
    input.status === "cancelled" ||
    input.status === "awaiting_approval";

  if (!terminal) {
    return { label: "—", iso: null };
  }

  if (input.completed_at) {
    return {
      label: input.status === "failed" ? "Ended (completed_at)" : "Completed",
      iso: input.completed_at
    };
  }

  if (input.updated_at && (input.status === "failed" || input.status === "cancelled")) {
    return { label: "Ended (updated)", iso: input.updated_at };
  }

  if (input.updated_at) {
    return { label: "Updated", iso: input.updated_at };
  }

  return { label: "—", iso: null };
}
