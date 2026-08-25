import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  ROOM_SET_SEATING_COMING_SOON_BADGE,
  ROOM_SET_SEATING_COMBINED_LABEL,
  ROOM_SET_SEATING_UNAVAILABLE_COPY,
  SESSION_REGISTRATION_COMING_SOON_BADGE,
  SESSION_REGISTRATION_COMING_SOON_COPY,
  SESSION_REGISTRATION_ENABLED,
  ROOM_SET_SEATING_ENABLED,
  isProductionRuntime,
  isSessionRegistrationAvailable,
  shouldGateComingSoonFeatures,
  shouldGateSessionRegistration,
} from "../src/config/features";

const featuresSource = readFileSync("src/config/features.ts", "utf8");
const matrix2PageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const matrix2BoardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const matrix2DrawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const matrix2QuickModulesSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-quick-modules.tsx", "utf8");
const roomSetPageSource = readFileSync("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/page.tsx", "utf8");
const roomSetAvailabilitySource = readFileSync("lib/room-set/availability.ts", "utf8");
const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const attendeeDrawerSource = readFileSync("app/(shell)/events/[eventId]/attendees/_components/attendee-detail-drawer.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function roomSetAvailabilityInFreshRuntime(env: Record<string, string | undefined>): {
  enabled: boolean;
  roomSet: boolean;
  seating: boolean;
  speakers: boolean;
} {
  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => (
      value !== undefined && key !== "NODE_ENV" && key !== "VERCEL_ENV" && key !== "NEXT_PUBLIC_VERCEL_ENV"
    )),
  ) as Record<string, string>;
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      "import { ROOM_SET_SEATING_ENABLED, isRoomSetAndSeatingAvailable, isSessionModuleAvailable } from './src/config/features.ts'; console.log(JSON.stringify({ enabled: ROOM_SET_SEATING_ENABLED, roomSet: isRoomSetAndSeatingAvailable(), seating: isSessionModuleAvailable('seating'), speakers: isSessionModuleAvailable('speakers') }));",
    ],
    { cwd: process.cwd(), env: childEnv as NodeJS.ProcessEnv, encoding: "utf8" },
  );
  return JSON.parse(output) as ReturnType<typeof roomSetAvailabilityInFreshRuntime>;
}

test("Room Set and Seating are Coming soon everywhere unless explicitly previewed", () => {
  for (const { name, env, expected } of [
    // Local development alone is no longer enough: the module is unfinished, so it stays
    // Coming soon until a developer explicitly opts this session in.
    { name: "local development", env: { NODE_ENV: "development" }, expected: false },
    {
      name: "local development with explicit preview opt-in",
      env: { NODE_ENV: "development", NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW: "true" },
      expected: true,
    },
    {
      name: "production-availability browser harness",
      env: {
        NODE_ENV: "development",
        NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW: "true",
        NEXT_PUBLIC_PW_E2E_PRODUCTION_AVAILABILITY: "true",
      },
      expected: false,
    },
    { name: "previewed development ignores Vercel production", env: { NODE_ENV: "development", NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW: "true", VERCEL_ENV: "production" }, expected: true },
    { name: "preview opt-in cannot enable a production build", env: { NODE_ENV: "production", NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW: "true" }, expected: false },
    { name: "production", env: { NODE_ENV: "production" }, expected: false },
    { name: "Vercel Preview", env: { NODE_ENV: "production", VERCEL_ENV: "preview" }, expected: false },
    { name: "ambiguous runtime", env: {}, expected: false },
    { name: "test runtime", env: { NODE_ENV: "test" }, expected: false },
  ]) {
    const availability = roomSetAvailabilityInFreshRuntime(env);
    assert.equal(availability.enabled, expected, name);
    assert.equal(availability.roomSet, expected, name);
    assert.equal(availability.seating, expected, name);
    assert.equal(availability.speakers, true, name);
  }

  assert.equal(
    ROOM_SET_SEATING_ENABLED,
    process.env.NODE_ENV === "development"
      && process.env.NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW === "true"
      && process.env.NEXT_PUBLIC_PW_E2E_PRODUCTION_AVAILABILITY !== "true",
  );
  assert.equal(isProductionRuntime({ NODE_ENV: "production" }), true);
  assert.equal(shouldGateComingSoonFeatures({ NODE_ENV: "development" }), false);
  assert.equal(SESSION_REGISTRATION_ENABLED, false);
  assert.equal(isSessionRegistrationAvailable(), false);
  assert.equal(shouldGateSessionRegistration({ NODE_ENV: "development" }), true);
  assert.equal(ROOM_SET_SEATING_COMBINED_LABEL, "Room Set & Seating");
  assert.equal(ROOM_SET_SEATING_COMING_SOON_BADGE, "Coming soon");
  assert.equal(ROOM_SET_SEATING_UNAVAILABLE_COPY, "Room Set and Seating are coming soon.");
  assert.equal(SESSION_REGISTRATION_COMING_SOON_BADGE, "Coming soon");
  assert.equal(SESSION_REGISTRATION_COMING_SOON_COPY, "Session registration is coming soon.");
  // Coming soon is the default in every runtime, including local development. Only an explicit
  // per-session opt-in reveals the in-progress module, and the production lockout still wins.
  assert.match(
    featuresSource,
    /export const ROOM_SET_SEATING_ENABLED\s*=\s*process\.env\.NODE_ENV === "development"\s*&&\s*process\.env\.NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW === "true"\s*&&\s*process\.env\.NEXT_PUBLIC_PW_E2E_PRODUCTION_AVAILABILITY !== "true"/,
  );
  assert.match(featuresSource, /export function shouldGateComingSoonFeatures/);
  assert.match(featuresSource, /export function shouldGateSessionRegistration/);
  assert.match(featuresSource, /export function isRoomSetAndSeatingAvailable/);
  assert.match(featuresSource, /export function isSessionModuleAvailable/);
  const roomSetAvailabilitySource = sourceBetween(featuresSource, "export function isRoomSetAndSeatingAvailable", "/** @deprecated");
  assert.doesNotMatch(roomSetAvailabilitySource, /VERCEL_ENV|NEXT_PUBLIC_VERCEL_ENV/);
});

test("Room Set and Seating quick launchers use the shared production gate and render static coming-soon tiles", () => {
  assert.doesNotMatch(matrix2PageSource, /Open layout/);
  assert.doesNotMatch(matrix2PageSource, /Assign seating/);
  assert.doesNotMatch(matrix2PageSource, /Room Set · Coming soon/);
  assert.doesNotMatch(matrix2PageSource, /Seating · Coming soon/);
  assert.match(matrix2PageSource, /const quickModule = matrix2QuickModule\(action\);[\s\S]*if \(quickModule && !quickModule\.enabled\) return;/);
  assert.match(matrix2PageSource, /router\.push\(roomSetHref\(selectedEventId, sessionId, "layout"\)\)/);
  assert.match(matrix2PageSource, /router\.push\(roomSetHref\(selectedEventId, sessionId, "seating"\)\)/);

  assert.match(matrix2BoardSource, /MATRIX2_QUICK_MODULES\.map/);
  assert.match(matrix2QuickModulesSource, /import \{ isSessionModuleAvailable \} from "@\/config\/features"/);
  assert.match(matrix2QuickModulesSource, /const MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED = isSessionModuleAvailable\("room-set"\);/);
  assert.match(matrix2QuickModulesSource, /action: "room-set"[\s\S]*label: "Room Set"[\s\S]*enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.match(matrix2QuickModulesSource, /action: "seating"[\s\S]*label: "Seating"[\s\S]*enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.doesNotMatch(matrix2QuickModulesSource, /action: "room-set"[\s\S]*unavailableLabel: "Coming soon"/);
  assert.doesNotMatch(matrix2QuickModulesSource, /action: "seating"[\s\S]*unavailableLabel: "Coming soon"/);
  assert.match(matrix2BoardSource, /const isComingSoonModule = item\.disabled\s*&& \(item\.action === "room-set" \|\| item\.action === "seating"\);/);
  const comingSoonTileSource = sourceBetween(matrix2BoardSource, "if (isComingSoonModule) {", "if (item.disabled) {");
  assert.match(comingSoonTileSource, /data-matrix2-coming-soon-action=\{item\.action\}/);
  assert.match(comingSoonTileSource, /\{item\.label\}/);
  assert.match(comingSoonTileSource, /Coming soon/);
  assert.doesNotMatch(comingSoonTileSource, /<button|<Link|onClick|onKeyDown|href=|tabIndex=|cursor-pointer|hover:|active:|opacity-/);
  assert.match(matrix2BoardSource, /return \(\n            <button[\s\S]*onSessionAction\(session\.id, item\.action\)/);
  assert.doesNotMatch(matrix2BoardSource, /item\.unavailableLabel/);
});

test("session command center renders one disabled Room Set & Seating module in production", () => {
  assert.match(sessionWorkspaceSource, /const roomSetAndSeatingAvailable = isRoomSetAndSeatingAvailable\(\);/);
  assert.match(sessionWorkspaceSource, /if \(!roomSetAndSeatingAvailable\) \{[\s\S]*setActiveTab\("overview"\)/);
  assert.match(sessionWorkspaceSource, /id: "room-set-seating"/);
  assert.match(sessionWorkspaceSource, /label: ROOM_SET_SEATING_COMBINED_LABEL/);
  assert.match(sessionWorkspaceSource, /description: ROOM_SET_SEATING_UNAVAILABLE_COPY/);
  assert.match(sessionWorkspaceSource, /facts: roomSetAndSeatingAvailable[\s\S]*ROOM_SET_SEATING_UNAVAILABLE_COPY/);
  assert.match(sessionWorkspaceSource, /countInReadiness: false/);
  assert.doesNotMatch(sessionWorkspaceSource, /title=\{`\$\{item\.label\} is not available in production\.`\}/);
  assert.match(sessionWorkspaceSource, /if \(isRoomSetAndSeatingAvailable\(\)\) \{[\s\S]*roomSetHref\(eventId, targetSessionId, "layout"\)/);
  assert.match(sessionWorkspaceSource, /\{item\.badge\}/);
  assert.match(sessionWorkspaceSource, /item\.disabled \? item\.actionLabel : \(/);
  assert.match(sessionWorkspaceSource, /data-session-module-unavailable=\{item\.id\}/);
  assert.match(sessionWorkspaceSource, /return item\.disabled \? \([\s\S]*?<span[\s\S]*?data-session-module-unavailable=\{item\.id\}/);
  assert.doesNotMatch(
    sourceBetween(sessionWorkspaceSource, "return item.disabled ? (", ") : (\n            <Link"),
    /<button|<Link|onClick|onKeyDown|href=|tabIndex=|hover:|active:|focus:/,
  );
  assert.match(sessionWorkspaceSource, /item\.disabled\s*\? "border-slate-200 border-l-slate-300 border-dashed bg-slate-50 text-slate-500"/);
  assert.match(sessionWorkspaceSource, /item\.disabled\s*\? "bg-slate-100 text-slate-500"/);
  assert.doesNotMatch(sourceBetween(sessionWorkspaceSource, "function SessionModuleTabs", "return (\n    <div className=\"flex w-full"), /cursor-not-allowed/);
  assert.match(sessionWorkspaceSource, /href: roomSetLink/);
  assert.match(sessionWorkspaceSource, /router\.push\(roomSetLink\)/);
  assert.match(sessionWorkspaceSource, /router\.push\(seatingLink\)/);
  assert.doesNotMatch(sessionWorkspaceSource, /disabled: productionComingSoonGate/);
});

test("Room Set production routes are unavailable before the workspace renders", () => {
  assert.match(roomSetPageSource, /!ROOM_SET_SEATING_ENABLED\) notFound\(\)/);
  assert.ok(roomSetPageSource.indexOf("!ROOM_SET_SEATING_ENABLED") < roomSetPageSource.indexOf("<RoomSetWorkspace"));
});

test("all Room Set and Seating APIs use the shared production route guard", () => {
  assert.match(roomSetAvailabilitySource, /isRoomSetAndSeatingAvailable/);
  assert.match(roomSetAvailabilitySource, /ROOM_SET_SEATING_UNAVAILABLE_COPY/);
  assert.match(roomSetAvailabilitySource, /status: 404/);
  for (const path of [
    "app/api/events/[eventId]/seating/route.ts",
    "app/api/events/[eventId]/seating/assign/route.ts",
    "app/api/events/[eventId]/seating/unassign/route.ts",
    "app/api/events/[eventId]/seating/tables/route.ts",
    "app/api/events/[eventId]/seating/tables/[tableId]/route.ts",
    "app/api/events/[eventId]/seating/attendees/route.ts",
    "app/api/room-set/interpret-intent/route.ts",
    "app/api/room-set/plan-layout/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /roomSetAndSeatingUnavailableResponse/);
  }
});

test("session registration is unavailable across its UI entry points", () => {
  for (const source of [matrix2DrawerSource, sessionWorkspaceSource, attendeeDrawerSource]) {
    assert.match(source, /const sessionRegistrationComingSoon = shouldGateSessionRegistration\(\)/);
    assert.match(source, /SessionRegistrationUnavailableCard/);
  }

  assert.match(matrix2DrawerSource, /if \(sessionRegistrationComingSoon\) return;[\s\S]*Failed to register attendee/);
  assert.match(sessionWorkspaceSource, /if \(sessionRegistrationComingSoon\) return;[\s\S]*Failed to add attendee/);
  assert.match(attendeeDrawerSource, /if \(sessionRegistrationComingSoon\) return;[\s\S]*Failed to add session/);

});

test("session registration blocked branches render no active attendee controls", () => {
  const drawerProductionBranch = sourceBetween(
    matrix2DrawerSource,
    "{sessionRegistrationComingSoon ? <SessionRegistrationUnavailableCard compact /> : <section",
    "className={[\"rounded-2xl border p-3 shadow-sm\"",
  );
  assert.match(drawerProductionBranch, /SessionRegistrationUnavailableCard/);
  assert.doesNotMatch(drawerProductionBranch, /Search event attendees/);
  assert.doesNotMatch(drawerProductionBranch, /Add attendee/);

  const workspaceBlockedBranch = sourceBetween(
    sessionWorkspaceSource,
    "return sessionRegistrationComingSoon ? (",
    ") : (\n    <SectionCard",
  );
  assert.match(workspaceBlockedBranch, /SessionRegistrationUnavailableCard/);
  assert.doesNotMatch(workspaceBlockedBranch, /Search event attendees/);
  assert.doesNotMatch(workspaceBlockedBranch, /Add attendee/);
});

test("all session-registration APIs use the canonical unavailable guard before authorization", () => {
  const availabilitySource = readFileSync("lib/session-registration/availability.ts", "utf8");
  assert.match(availabilitySource, /isSessionRegistrationAvailable/);
  assert.match(availabilitySource, /SESSION_REGISTRATION_UNAVAILABLE/);
  assert.match(availabilitySource, /status: 404/);

  for (const path of [
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/attendees/route.ts",
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/attendees/[enrollmentId]/cancel/route.ts",
    "app/api/events/[eventId]/attendees/[attendeeId]/agenda/route.ts",
    "app/api/events/[eventId]/attendees/[attendeeId]/agenda/[enrollmentId]/cancel/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /sessionRegistrationUnavailableResponse/);
    assert.ok(source.indexOf("const unavailableResponse = sessionRegistrationUnavailableResponse()") < source.indexOf("await assertEnrollmentEventAccess"));
  }
});

test("backend Room Set, Seating, attendee, and session enrollment APIs remain present", () => {
  for (const path of [
    "app/api/room-set/plan-layout/route.ts",
    "app/api/room-set/interpret-intent/route.ts",
    "app/api/events/[eventId]/attendees/route.ts",
    "app/api/events/[eventId]/attendees/[attendeeId]/agenda/route.ts",
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/attendees/route.ts",
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/attendees/[enrollmentId]/cancel/route.ts",
  ]) {
    assert.equal(existsSync(path), true, `${path} should remain available`);
  }
});
