import type { EmailProvider } from "@/lib/integrations/email/types";

export type DefaultSenderControlsState = {
  visible: boolean;
  googleWorkspaceSelected: boolean;
  microsoft365Selected: boolean;
};

/**
 * This is display-only. The server-side resolver remains the authority for
 * choosing a sender when an email is actually sent.
 */
export function getDefaultSenderControlsState({
  googleWorkspaceHealthy,
  microsoft365Healthy,
  preference,
}: {
  googleWorkspaceHealthy: boolean;
  microsoft365Healthy: boolean;
  preference: EmailProvider | null;
}): DefaultSenderControlsState {
  const visible = googleWorkspaceHealthy && microsoft365Healthy;
  return {
    visible,
    googleWorkspaceSelected: visible && preference === "google_workspace",
    microsoft365Selected: visible && preference === "microsoft_365",
  };
}
