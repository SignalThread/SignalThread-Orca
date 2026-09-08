import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  eligibleCalendarsFromCandidates,
  resolveCalendarProvider
} from "../lib/integrations/calendar/provider-resolver-core";
import { toMobileCalendarProviderStatus } from "../lib/integrations/mobile-oauth/status-core";
import type { CalendarProviderCandidate } from "../lib/integrations/calendar/types";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, NodeJS.Module | undefined>)[serverOnlyPath] = {
  id: serverOnlyPath,
  path: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {},
  isPreloading: false,
  require,
  parent: null
} as unknown as NodeJS.Module;

const google: CalendarProviderCandidate = {
  id: "google-1",
  provider: "google_workspace",
  accountEmail: "google@example.test",
  accountDisplayName: "Google Sender",
  healthy: true,
  reconnectRequired: false
};
const microsoft: CalendarProviderCandidate = {
  id: "microsoft-1",
  provider: "microsoft_365",
  accountEmail: "microsoft@example.test",
  accountDisplayName: "Microsoft Sender",
  healthy: true,
  reconnectRequired: false
};

test("mobile calendar status returns both safe eligible calendars when both are healthy", () => {
  const candidates = [google, microsoft];
  const resolution = resolveCalendarProvider({
    candidates,
    preferredProvider: null
  });
  const eligible = eligibleCalendarsFromCandidates({
    candidates,
    preferredProvider: null
  });
  const status = toMobileCalendarProviderStatus(resolution, eligible);
  assert.deepEqual(status, {
    state: "provider_selection_required",
    provider: null,
    accountEmail: null,
    accountDisplayName: null,
    eligibleCalendars: [
      {
        provider: "google_workspace",
        accountEmail: "google@example.test",
        isDefault: false
      },
      {
        provider: "microsoft_365",
        accountEmail: "microsoft@example.test",
        isDefault: false
      }
    ]
  });
  assert.deepEqual(Object.keys(status.eligibleCalendars[0]).sort(), [
    "accountEmail",
    "isDefault",
    "provider"
  ]);
  assert.doesNotMatch(
    JSON.stringify(status),
    /token|secret|credential|connectionId|scope|refresh/i
  );
});

test("mobile calendar status initializes each persisted Default and retains both eligible calendars", () => {
  for (const preferredProvider of ["google_workspace", "microsoft_365"] as const) {
    const candidates = [microsoft, google];
    const resolution = resolveCalendarProvider({ candidates, preferredProvider });
    const eligible = eligibleCalendarsFromCandidates({ candidates, preferredProvider });
    const status = toMobileCalendarProviderStatus(resolution, eligible);
    assert.equal(status.state, "ready");
    assert.equal(status.provider, preferredProvider);
    assert.equal(
      status.accountEmail,
      preferredProvider === "google_workspace" ? "google@example.test" : "microsoft@example.test"
    );
    assert.deepEqual(status.eligibleCalendars, [
      {
        provider: "google_workspace",
        accountEmail: "google@example.test",
        isDefault: preferredProvider === "google_workspace"
      },
      {
        provider: "microsoft_365",
        accountEmail: "microsoft@example.test",
        isDefault: preferredProvider === "microsoft_365"
      }
    ]);
  }
});

test("calendar health candidates require the complete scheduler capability", async () => {
  const {
    googleHealthToCalendarCandidate,
    microsoftHealthToCalendarCandidate
  } = await import("../lib/integrations/calendar/provider-resolver");
  const noGoogleFreeBusy = googleHealthToCalendarCandidate({
    connectionId: "google-1",
    status: {
      connected: true,
      status: "connected",
      identity: { email: "google@example.test", displayName: null },
      grantedScopes: [],
      capabilities: {
        gmailSend: true,
        calendarEventsOwned: true,
        calendarFreeBusy: false
      },
      isPartialGrant: true,
      expiresAt: null,
      connectedAt: null,
      lastRefreshAt: null,
      lastErrorCode: null
    }
  });
  const noMicrosoftCalendar = microsoftHealthToCalendarCandidate({
    connectionId: "microsoft-1",
    status: {
      connected: true,
      status: "connected",
      identity: { email: "microsoft@example.test", displayName: null },
      grantedScopes: [],
      capabilities: { mailSend: true, calendarReadWrite: false },
      isPartialGrant: true,
      expiresAt: null,
      connectedAt: null,
      lastRefreshAt: null,
      lastErrorCode: null
    }
  });
  assert.equal(noGoogleFreeBusy?.healthy, false);
  assert.equal(noMicrosoftCalendar?.healthy, false);
  assert.deepEqual(
    eligibleCalendarsFromCandidates({
      candidates: [noGoogleFreeBusy!, noMicrosoftCalendar!],
      preferredProvider: null
    }),
    []
  );
});
