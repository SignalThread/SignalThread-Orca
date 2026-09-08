import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getGoogleWorkspaceConnectionHealthRecord,
  type GoogleWorkspaceConnectionHealthRecord
} from "@/lib/integrations/google/connection-status";
import {
  getMicrosoft365ConnectionHealthRecord,
  type Microsoft365ConnectionHealthRecord
} from "@/lib/integrations/microsoft/connection-status";
import {
  eligibleEmailSendersFromCandidates,
  resolveEmailProvider,
  type EmailProviderCandidate
} from "@/lib/integrations/email/provider-resolver-core";
import {
  EMAIL_SEND_CAPABILITY,
  isEmailProvider,
  type EmailProvider,
  type EmailProviderResolution,
  type EligibleEmailSender
} from "@/lib/integrations/email/types";
import { CALENDAR_CAPABILITY } from "@/lib/integrations/calendar/types";

async function getProviderPreference(input: {
  userId: string;
  companyId: string;
  capability: typeof EMAIL_SEND_CAPABILITY | typeof CALENDAR_CAPABILITY;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<EmailProvider | null> {
  const supabase = (input.supabase ?? createAdminClient()) as any;
  const { data, error } = await supabase
    .from("integration_provider_preferences")
    .select("provider")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("capability", input.capability)
    .maybeSingle();
  if (error) throw new Error("Unable to load the provider preference.");
  return isEmailProvider(data?.provider) ? data.provider : null;
}

export async function getEmailProviderPreference(input: {
  userId: string;
  companyId: string;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<EmailProvider | null> {
  return getProviderPreference({ ...input, capability: EMAIL_SEND_CAPABILITY });
}

export async function getCalendarProviderPreference(input: {
  userId: string;
  companyId: string;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<EmailProvider | null> {
  return getProviderPreference({ ...input, capability: CALENDAR_CAPABILITY });
}

export function googleHealthToEmailProviderCandidate(
  record: GoogleWorkspaceConnectionHealthRecord
): EmailProviderCandidate | null {
  if (!record.connectionId || !record.status.identity) return null;
  const healthy = record.status.connected && record.status.capabilities.gmailSend;
  return {
    id: record.connectionId,
    provider: "google_workspace",
    senderEmail: record.status.identity.email,
    senderName: record.status.identity.displayName,
    healthy,
    reconnectRequired: !healthy
  };
}

export function microsoftHealthToEmailProviderCandidate(
  record: Microsoft365ConnectionHealthRecord
): EmailProviderCandidate | null {
  if (!record.connectionId || !record.status.identity) return null;
  const healthy = record.status.connected && record.status.capabilities.mailSend;
  return {
    id: record.connectionId,
    provider: "microsoft_365",
    senderEmail: record.status.identity.email,
    senderName: record.status.identity.displayName,
    healthy,
    reconnectRequired: !healthy
  };
}

export async function loadEmailProviderCandidates(input: {
  userId: string;
  companyId: string;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<EmailProviderCandidate[]> {
  const supabase = input.supabase ?? createAdminClient();
  const [googleHealth, microsoftHealth] = await Promise.all([
    getGoogleWorkspaceConnectionHealthRecord(input.userId, input.companyId, { supabase }),
    getMicrosoft365ConnectionHealthRecord(input.userId, input.companyId, { supabase })
  ]);
  return [
    googleHealthToEmailProviderCandidate(googleHealth),
    microsoftHealthToEmailProviderCandidate(microsoftHealth)
  ].filter((candidate): candidate is EmailProviderCandidate => candidate !== null);
}

export async function resolveEmailProviderForUser(input: {
  userId: string;
  companyId: string;
  providerOverride?: EmailProvider;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<EmailProviderResolution> {
  const supabase = input.supabase ?? createAdminClient();
  const [candidates, preferredProvider] = await Promise.all([
    loadEmailProviderCandidates({ ...input, supabase }),
    getEmailProviderPreference({ ...input, supabase })
  ]);
  return resolveEmailProvider({
    candidates,
    preferredProvider,
    providerOverride: input.providerOverride
  });
}

/** Safe, provider-neutral sender choices for clients. */
export async function listEligibleEmailSenders(input: {
  userId: string;
  companyId: string;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<EligibleEmailSender[]> {
  const supabase = input.supabase ?? createAdminClient();
  const [candidates, preferredProvider] = await Promise.all([
    loadEmailProviderCandidates({ ...input, supabase }),
    getEmailProviderPreference({ ...input, supabase })
  ]);
  return eligibleEmailSendersFromCandidates({ candidates, preferredProvider });
}

export async function setEmailProviderPreference(input: {
  userId: string;
  companyId: string;
  provider: EmailProvider;
  supabase?: ReturnType<typeof createAdminClient>;
}) {
  const supabase = (input.supabase ?? createAdminClient()) as any;
  const candidates = await loadEmailProviderCandidates({ ...input, supabase });
  const selected = candidates.find((candidate) => candidate.provider === input.provider);
  if (!selected?.healthy) {
    return { ok: false as const, outcome: "reconnect_required" as const };
  }
  // One Default action owns both capabilities. A single multi-row upsert keeps
  // them synchronized atomically without changing either one-time override path.
  const { error } = await supabase.from("integration_provider_preferences").upsert(
    [EMAIL_SEND_CAPABILITY, CALENDAR_CAPABILITY].map((capability) => ({
      user_id: input.userId,
      company_id: input.companyId,
      capability,
      provider: input.provider
    })),
    { onConflict: "user_id,company_id,capability" }
  );
  if (error) throw new Error("Unable to save the email provider preference.");
  return { ok: true as const, provider: input.provider };
}
