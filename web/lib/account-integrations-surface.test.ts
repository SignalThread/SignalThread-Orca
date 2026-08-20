import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readAppFile(pathname: string): string {
  return readFileSync(new URL(`../app/${pathname}`, import.meta.url), "utf8");
}

test("account navigation keeps Command Center above settings without exposing integrations", () => {
  const sidebarSource = readAppFile("(shell)/_components/sidebar-nav.tsx");
  const accountReportsSource = readAppFile("(shell)/reports/page.tsx");
  const eventReportsSource = readAppFile("(shell)/events/[eventId]/reports/page.tsx");
  const eventSettingsSource = readAppFile("(shell)/events/[eventId]/settings/page.tsx");
  const eventWorkspaceSource = readAppFile("(shell)/events/[eventId]/_components/event-workspace-shell.tsx");

  assert.equal(sidebarSource.includes('label: "Account"'), true);
  assert.equal((sidebarSource.match(/label: "Command Center"/g) ?? []).length, 1);
  assert.equal(sidebarSource.includes('href: "/dashboard"'), true);
  assert.equal(sidebarSource.includes('ariaLabel: "Account Command Center"'), true);
  assert.equal(sidebarSource.includes("LayoutGrid"), true);
  assert.equal(sidebarSource.includes('label: "Organization"'), false);
  assert.equal(sidebarSource.includes('href: "/settings"'), true);
  assert.equal(sidebarSource.includes('href: "/settings/integrations"'), false);
  assert.equal(sidebarSource.includes('label: "Integrations"'), false);
  assert.equal(sidebarSource.includes('label: "Resources"'), false);
  assert.equal(sidebarSource.includes('label: "Help Center"'), false);
  assert.equal(sidebarSource.includes("PlugZap"), false);
  assert.equal(sidebarSource.includes("exact: true"), true);
  assert.equal(sidebarSource.includes("Portfolio Reports"), false);
  assert.equal(sidebarSource.includes('pathname.startsWith(`${href}/`)'), true);
  assert.ok(sidebarSource.indexOf('label: "Command Center"') < sidebarSource.indexOf('label: "Settings"'));
  const commandCenterItem = sidebarSource.slice(
    sidebarSource.indexOf('label: "Command Center"'),
    sidebarSource.indexOf('label: "Settings"'),
  );
  assert.equal(commandCenterItem.includes("exact: true"), false);
  assert.equal(sidebarSource.includes('const active = exact ? pathname === href : isActive(pathname, href);'), true);
  assert.equal(sidebarSource.includes('return pathname === href || pathname.startsWith(`${href}/`);'), true);
  assert.equal(accountReportsSource.includes('redirect("/dashboard")'), true);
  assert.equal(eventReportsSource.includes("EventReportsPage"), true);
  assert.equal(eventSettingsSource.includes("EventSettingsHub"), true);
  assert.equal((eventWorkspaceSource.match(/label: "Command Center"/g) ?? []).length, 1);
  assert.equal(eventWorkspaceSource.includes('ariaLabel: "Event Command Center"'), true);
  assert.equal(eventWorkspaceSource.includes('aria-label="Go to all events"'), true);
  assert.equal(eventWorkspaceSource.includes('aria-label="Go to Command Center"'), false);
});

test("customer-facing integration routes are intentionally hidden", () => {
  const legacyRouteSource = readAppFile("(shell)/integrations/page.tsx");
  const integrationsRouteSource = readAppFile("(shell)/settings/integrations/page.tsx");
  const settingsLayoutSource = readAppFile("(shell)/settings/layout.tsx");
  const shellSource = readAppFile("(shell)/layout.tsx");

  assert.equal(existsSync(new URL("../app/(shell)/integrations/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(shell)/settings/integrations/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(shell)/settings/_components/account-settings-nav.tsx", import.meta.url)), false);
  assert.equal(shellSource.includes("<ShellScaffold"), true);
  assert.equal(settingsLayoutSource.includes("AccountSettingsNav"), false);
  assert.equal(settingsLayoutSource.includes('href="/events"'), true);
  assert.equal(settingsLayoutSource.includes('aria-label="Go to all events"'), true);
  assert.equal(settingsLayoutSource.includes("All events"), true);
  assert.equal(integrationsRouteSource.includes("notFound()"), true);
  assert.equal(legacyRouteSource.includes("notFound()"), true);
  assert.equal(existsSync(new URL("../app/(shell)/settings/_components/integrations-catalog.tsx", import.meta.url)), false);
});
