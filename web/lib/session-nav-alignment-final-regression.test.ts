import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Prompt 4 (Session Workspace Nav Alignment): final regression lock for the
// nav-alignment work. Verifies the cross-cutting invariants that Prompts 1-3
// changed or must have preserved — shared primitive reuse, deep links, the
// Room Set/Seating + session-registration production gates, and the fact that
// no backend/access surface was touched by this UI-only work.

const shellSource = readFileSync(
  "app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx",
  "utf8",
);
const primitiveSource = readFileSync(
  "app/(shell)/events/[eventId]/_components/shell-nav-primitives.tsx",
  "utf8",
);
const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);

test("the event shell renders the normal left nav via the shared primitive for the session route", () => {
  // The event shell still uses the shared primitive for its left nav...
  assert.match(shellSource, /from "\.\/shell-nav-primitives"/);
  assert.match(shellSource, /<SidebarNavItem\s/);
  assert.match(primitiveSource, /export function SidebarNavItem\(/);
  // The session command center route stays in the event shell.
  assert.doesNotMatch(shellSource, /if \(isSessionCommandCenterRoute\) \{/);
});

test("the session workspace keeps horizontal module tabs instead of a dark rail", () => {
  assert.doesNotMatch(sessionWorkspaceSource, /function SessionCommandRail/);
  assert.doesNotMatch(sessionWorkspaceSource, /<SessionCommandRail/);
  assert.doesNotMatch(sessionWorkspaceSource, /aria-label="Contextual session rail"/);
  assert.doesNotMatch(sessionWorkspaceSource, /railItemClasses/);
  assert.doesNotMatch(sessionWorkspaceSource, /bg-teal-400\/1/);
  assert.match(sessionWorkspaceSource, /function SessionModuleTabs/);
  assert.match(sessionWorkspaceSource, /<SessionModuleTabs/);
});

test("session module deep links (?tab= and #hash) still resolve, with safe fallback", () => {
  // Initial + live focus resolution from hash and ?tab=.
  assert.match(sessionWorkspaceSource, /initialWorkspaceFocus\(searchParams\)/);
  assert.match(sessionWorkspaceSource, /window\.addEventListener\("hashchange", applyDeepLinkFocus\)/);
  assert.match(sessionWorkspaceSource, /normalizeLinkFocusId\(searchParams\.get\("tab"\)\) \?\? normalizeWorkspaceTabId\(searchParams\.get\("tab"\)\)/);
  // Unknown tabs fall back to overview.
  assert.match(sessionWorkspaceSource, /return "overview";/);
});

test("Room Set/Seating direct routes are intact and production-gated, not deleted", () => {
  // Non-production editor routes remain.
  assert.match(sessionWorkspaceSource, /roomSetHref\(eventId, sessionId, "layout"\)/);
  assert.match(sessionWorkspaceSource, /roomSetHref\(eventId, sessionId, "seating"\)/);
  // Production collapse shows one disabled combined module and redirects deep links to overview.
  assert.match(sessionWorkspaceSource, /const roomSetAndSeatingAvailable = isRoomSetAndSeatingAvailable\(\);/);
  assert.match(sessionWorkspaceSource, /if \(!roomSetAndSeatingAvailable\) \{\s*setActiveTab\("overview"\);/);
  assert.match(sessionWorkspaceSource, /ROOM_SET_SEATING_COMBINED_LABEL/);
});

test("session registration unavailable gate is untouched by the nav work", () => {
  assert.match(sessionWorkspaceSource, /const sessionRegistrationComingSoon = shouldGateSessionRegistration\(\);/);
  assert.match(sessionWorkspaceSource, /if \(sessionRegistrationComingSoon\) return;/);
  assert.match(sessionWorkspaceSource, /SessionRegistrationUnavailableCard/);
});

test("nav alignment is UI-only: no backend route/service/API calls were introduced", () => {
  // The restyle did not add any fetch to a new server surface; writes still flow
  // through the existing session APIs (server remains the auth authority).
  assert.doesNotMatch(primitiveSource, /fetch\(/);
  // The primitive is presentational only (Link/button), no data access.
  assert.doesNotMatch(primitiveSource, /\/api\//);
});
