import type { GoogleWorkspaceConnectionStatus } from "@/lib/integrations/google/connection-status";
import type { Microsoft365ConnectionStatus } from "@/lib/integrations/microsoft/connection-status";
import {
  MICROSOFT_365_DISPLAY_NAME,
  MICROSOFT_365_PROVIDER
} from "@/lib/integrations/microsoft/provider";
import type {
  EligibleEmailSender,
  EmailProviderResolution
} from "@/lib/integrations/email/types";
import type {
  CalendarProviderResolution,
  EligibleCalendar
} from "@/lib/integrations/calendar/types";

export function toMobileEligibleEmailSender(sender: EligibleEmailSender) {
  return {
    provider: sender.provider,
    accountEmail: sender.accountEmail,
    isDefault: sender.isDefault
  };
}

export function toMobileEmailSenderStatus(
  resolution: EmailProviderResolution,
  eligibleSenders: EligibleEmailSender[]
) {
  const safeEligibleSenders = eligibleSenders.map(toMobileEligibleEmailSender);
  return resolution.ok
    ? {
        state: "ready" as const,
        provider: resolution.connection.provider,
        accountEmail: resolution.connection.senderEmail,
        accountDisplayName: resolution.connection.senderName,
        eligibleSenders: safeEligibleSenders
      }
    : {
        state: resolution.outcome,
        provider: null,
        accountEmail: null,
        accountDisplayName: null,
        eligibleSenders: safeEligibleSenders
      };
}

export function toMobileCalendarProviderStatus(
  resolution: CalendarProviderResolution,
  eligibleCalendars: EligibleCalendar[]
) {
  const safeEligibleCalendars = eligibleCalendars.map((calendar) => ({
    provider: calendar.provider,
    accountEmail: calendar.accountEmail,
    isDefault: calendar.isDefault
  }));
  return resolution.ok
    ? {
        state: "ready" as const,
        provider: resolution.connection.provider,
        accountEmail: resolution.connection.accountEmail,
        accountDisplayName: resolution.connection.accountDisplayName,
        eligibleCalendars: safeEligibleCalendars
      }
    : {
        state: resolution.outcome,
        provider: null,
        accountEmail: null,
        accountDisplayName: null,
        eligibleCalendars: safeEligibleCalendars
      };
}

export function toMobileGoogleWorkspaceConnection(status: GoogleWorkspaceConnectionStatus) {
  const state =
    status.status === "disconnected"
      ? "disconnected"
      : status.status === "connected" && status.isPartialGrant
        ? "permission_required"
        : status.connected
          ? "connected"
          : "reconnect_required";
  return {
    provider: "google_workspace" as const,
    displayName: "Google Workspace",
    state,
    account: status.identity ? { email: status.identity.email } : null,
    capabilities: {
      email: status.capabilities.gmailSend,
      calendar:
        status.capabilities.calendarEventsOwned && status.capabilities.calendarFreeBusy
    }
  };
}

export function toMobileMicrosoft365Connection(status: Microsoft365ConnectionStatus) {
  const state =
    status.status === "disconnected"
      ? "disconnected"
      : status.status === "connected" && status.isPartialGrant
        ? "permission_required"
        : status.connected
          ? "connected"
          : "reconnect_required";
  return {
    provider: MICROSOFT_365_PROVIDER,
    displayName: MICROSOFT_365_DISPLAY_NAME,
    state,
    account: status.identity ? { email: status.identity.email } : null,
    capabilities: {
      email: status.capabilities.mailSend,
      calendar: status.capabilities.calendarReadWrite
    }
  };
}
