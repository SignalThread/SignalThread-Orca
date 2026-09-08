import "server-only";

import {
  cancelGoogleMeeting,
  createGoogleMeeting,
  getGoogleAvailability,
  updateGoogleMeeting,
  type GoogleMeetingActivity
} from "@/lib/integrations/google/calendar-service";
import {
  cancelMicrosoftMeeting,
  createMicrosoftMeeting,
  getMicrosoftAvailability,
  updateMicrosoftMeeting
} from "@/lib/integrations/microsoft/calendar-service";
import { resolveCalendarProviderForUser } from "@/lib/integrations/calendar/provider-resolver";
import { claimCalendarMeetingProvider } from "@/lib/integrations/calendar/provider-claim";
import {
  isCalendarOperationKey,
  validateCalendarMeetingInput
} from "@/lib/integrations/calendar/core";
import type {
  CalendarProvider,
  CalendarProviderResolution,
  NormalizedMeeting
} from "@/lib/integrations/calendar/types";

type BaseInput = {
  userId: string;
  companyId: string;
  role: string;
  isBearer: boolean;
  leadId: string;
  providerOverride?: CalendarProvider;
};

type CalendarServiceDependencies = {
  resolveProvider(input: {
    userId: string;
    companyId: string;
    providerOverride?: CalendarProvider;
  }): Promise<CalendarProviderResolution>;
  googleAvailability: typeof getGoogleAvailability;
  microsoftAvailability: typeof getMicrosoftAvailability;
  googleCreate: typeof createGoogleMeeting;
  microsoftCreate: typeof createMicrosoftMeeting;
  googleUpdate: typeof updateGoogleMeeting;
  microsoftUpdate: typeof updateMicrosoftMeeting;
  googleCancel: typeof cancelGoogleMeeting;
  microsoftCancel: typeof cancelMicrosoftMeeting;
  claimProvider: typeof claimCalendarMeetingProvider;
};

const dependencies: CalendarServiceDependencies = {
  resolveProvider: resolveCalendarProviderForUser,
  googleAvailability: getGoogleAvailability,
  microsoftAvailability: getMicrosoftAvailability,
  googleCreate: createGoogleMeeting,
  microsoftCreate: createMicrosoftMeeting,
  googleUpdate: updateGoogleMeeting,
  microsoftUpdate: updateMicrosoftMeeting,
  googleCancel: cancelGoogleMeeting,
  microsoftCancel: cancelMicrosoftMeeting,
  claimProvider: claimCalendarMeetingProvider
};

function normalizeGoogleMeeting(activity: GoogleMeetingActivity): NormalizedMeeting {
  return {
    activityId: activity.id,
    provider: "google_workspace",
    eventId: activity.googleEventId,
    joinUrl: activity.googleMeetUri,
    start: activity.startsAt,
    end: activity.endsAt,
    timezone: activity.timezone,
    attendeeEmail: activity.attendeeEmail
  };
}

function normalizeGoogleMutationResult(result: any) {
  if (!result.ok) return { ...result, provider: "google_workspace" as const };
  return {
    ok: true as const,
    outcome: result.outcome,
    meeting: normalizeGoogleMeeting(result.activity as GoogleMeetingActivity)
  };
}

export async function getCalendarAvailabilityWithDependencies(
  input: BaseInput & {
    windowStartLocal: string;
    windowEndLocal: string;
    timezone: string;
    durationMinutes: number;
  },
  deps: CalendarServiceDependencies
) {
  const resolution = await deps.resolveProvider(input);
  if (!resolution.ok) return resolution;
  const provider = resolution.connection.provider;
  const result =
    provider === "google_workspace"
      ? await deps.googleAvailability(input)
      : await deps.microsoftAvailability(input);
  return result.ok ? { ...result, provider } : { ...result, provider };
}

export function getCalendarAvailability(
  input: Parameters<typeof getCalendarAvailabilityWithDependencies>[0]
) {
  return getCalendarAvailabilityWithDependencies(input, dependencies);
}

export async function createCalendarMeetingWithDependencies(
  input: BaseInput & {
    idempotencyKey: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    title: string;
    includeConferencing: boolean;
  },
  deps: CalendarServiceDependencies
) {
  if (!validateCalendarMeetingInput(input) || !isCalendarOperationKey(input.idempotencyKey)) {
    return { ok: false as const, outcome: "invalid_input" as const };
  }
  const resolution = await deps.resolveProvider(input);
  if (!resolution.ok) return resolution;
  const provider = resolution.connection.provider;
  const claim = await deps.claimProvider({
    idempotencyKey: input.idempotencyKey,
    companyId: input.companyId,
    leadId: input.leadId,
    userId: input.userId,
    role: input.role,
    isBearer: input.isBearer,
    provider
  });
  if (!claim.ok) return { ...claim, provider };
  if (provider === "google_workspace") {
    return normalizeGoogleMutationResult(
      await deps.googleCreate({
        ...input,
        includeMeet: input.includeConferencing
      })
    );
  }
  const microsoftResult = await deps.microsoftCreate({
    ...input,
    includeTeams: input.includeConferencing
  });
  return microsoftResult.ok
    ? microsoftResult
    : { ...microsoftResult, provider: "microsoft_365" as const };
}

export function createCalendarMeeting(
  input: Parameters<typeof createCalendarMeetingWithDependencies>[0]
) {
  return createCalendarMeetingWithDependencies(input, dependencies);
}

export async function updateCalendarMeetingWithDependencies(
  input: BaseInput & {
    activityId: string;
    operationKey: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    title: string;
  },
  deps: CalendarServiceDependencies
) {
  if (!validateCalendarMeetingInput(input) || !isCalendarOperationKey(input.operationKey)) {
    return { ok: false as const, outcome: "invalid_input" as const };
  }
  const resolution = await deps.resolveProvider(input);
  if (!resolution.ok) return resolution;
  if (resolution.connection.provider === "google_workspace") {
    return normalizeGoogleMutationResult(await deps.googleUpdate(input));
  }
  const microsoftResult = await deps.microsoftUpdate(input);
  return microsoftResult.ok
    ? microsoftResult
    : { ...microsoftResult, provider: "microsoft_365" as const };
}

export function updateCalendarMeeting(
  input: Parameters<typeof updateCalendarMeetingWithDependencies>[0]
) {
  return updateCalendarMeetingWithDependencies(input, dependencies);
}

export async function cancelCalendarMeetingWithDependencies(
  input: BaseInput & { activityId: string; operationKey: string },
  deps: CalendarServiceDependencies
) {
  if (!isCalendarOperationKey(input.operationKey)) {
    return { ok: false as const, outcome: "invalid_input" as const };
  }
  const resolution = await deps.resolveProvider(input);
  if (!resolution.ok) return resolution;
  if (resolution.connection.provider === "google_workspace") {
    return normalizeGoogleMutationResult(await deps.googleCancel(input));
  }
  const microsoftResult = await deps.microsoftCancel(input);
  return microsoftResult.ok
    ? microsoftResult
    : { ...microsoftResult, provider: "microsoft_365" as const };
}

export function cancelCalendarMeeting(
  input: Parameters<typeof cancelCalendarMeetingWithDependencies>[0]
) {
  return cancelCalendarMeetingWithDependencies(input, dependencies);
}

export type { CalendarServiceDependencies };
