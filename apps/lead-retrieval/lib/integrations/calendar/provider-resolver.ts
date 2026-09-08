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
  eligibleCalendarsFromCandidates,
  resolveCalendarProvider
} from "@/lib/integrations/calendar/provider-resolver-core";
import { getCalendarProviderPreference } from "@/lib/integrations/email/provider-preference";
import type {
  CalendarProvider,
  CalendarProviderCandidate,
  CalendarProviderResolution,
  EligibleCalendar
} from "@/lib/integrations/calendar/types";

export function googleHealthToCalendarCandidate(
  record: GoogleWorkspaceConnectionHealthRecord
): CalendarProviderCandidate | null {
  if (!record.connectionId || !record.status.identity) return null;
  const healthy =
    record.status.connected &&
    record.status.capabilities.calendarEventsOwned &&
    record.status.capabilities.calendarFreeBusy;
  return {
    id: record.connectionId,
    provider: "google_workspace",
    accountEmail: record.status.identity.email,
    accountDisplayName: record.status.identity.displayName,
    healthy,
    reconnectRequired: !healthy
  };
}

export function microsoftHealthToCalendarCandidate(
  record: Microsoft365ConnectionHealthRecord
): CalendarProviderCandidate | null {
  if (!record.connectionId || !record.status.identity) return null;
  const healthy =
    record.status.connected && record.status.capabilities.calendarReadWrite;
  return {
    id: record.connectionId,
    provider: "microsoft_365",
    accountEmail: record.status.identity.email,
    accountDisplayName: record.status.identity.displayName,
    healthy,
    reconnectRequired: !healthy
  };
}

export async function loadCalendarProviderCandidates(input: {
  userId: string;
  companyId: string;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<CalendarProviderCandidate[]> {
  const supabase = input.supabase ?? createAdminClient();
  const [googleHealth, microsoftHealth] = await Promise.all([
    getGoogleWorkspaceConnectionHealthRecord(input.userId, input.companyId, { supabase }),
    getMicrosoft365ConnectionHealthRecord(input.userId, input.companyId, { supabase })
  ]);
  return [
    googleHealthToCalendarCandidate(googleHealth),
    microsoftHealthToCalendarCandidate(microsoftHealth)
  ].filter((candidate): candidate is CalendarProviderCandidate => candidate !== null);
}

export async function resolveCalendarProviderForUser(input: {
  userId: string;
  companyId: string;
  providerOverride?: CalendarProvider;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<CalendarProviderResolution> {
  const supabase = input.supabase ?? createAdminClient();
  const [candidates, preferredProvider] = await Promise.all([
    loadCalendarProviderCandidates({ ...input, supabase }),
    getCalendarProviderPreference({ ...input, supabase })
  ]);
  return resolveCalendarProvider({
    candidates,
    preferredProvider,
    providerOverride: input.providerOverride
  });
}

export async function listEligibleCalendars(input: {
  userId: string;
  companyId: string;
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<EligibleCalendar[]> {
  const supabase = input.supabase ?? createAdminClient();
  const [candidates, preferredProvider] = await Promise.all([
    loadCalendarProviderCandidates({ ...input, supabase }),
    getCalendarProviderPreference({ ...input, supabase })
  ]);
  return eligibleCalendarsFromCandidates({ candidates, preferredProvider });
}
