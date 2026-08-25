import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readAppFile(pathname: string): string {
  return readFileSync(new URL(`../app/${pathname}`, import.meta.url), "utf8");
}

test("account navigation no longer exposes Docs Hub", () => {
  const sidebarSource = readAppFile("(shell)/_components/sidebar-nav.tsx");

  assert.equal(sidebarSource.includes("/docs-hub"), false);
  assert.equal(sidebarSource.includes("Docs Hub"), false);
});

test("account navigation only exposes account destinations", () => {
  const sidebarSource = readAppFile("(shell)/_components/sidebar-nav.tsx");

  for (const expected of [
    'label: "Account"',
    'label: "Settings"',
    'ariaLabel: "Workspace and organization settings"',
  ]) {
    assert.equal(sidebarSource.includes(expected), true, expected);
  }

  assert.equal(sidebarSource.includes('label: "Organization"'), false);
  assert.equal((sidebarSource.match(/label: "Command Center"/g) ?? []).length, 1);
  assert.equal(sidebarSource.includes('href: "/dashboard"'), true);
  assert.equal(sidebarSource.includes('href: "/settings/integrations"'), false);
  assert.equal(sidebarSource.includes('label: "Integrations"'), false);
  assert.equal(sidebarSource.includes('label: "Resources"'), false);
  assert.equal(sidebarSource.includes('label: "Help Center"'), false);
  assert.equal(sidebarSource.includes('href: "/help"'), false);
  assert.equal(sidebarSource.includes("Portfolio Reports"), false);
  assert.equal(sidebarSource.includes('aria-current={active ? "page" : undefined}'), true);
});

test("account-level docs routes are not reachable while event docs stays wired", () => {
  const accountDocsSource = readAppFile("(shell)/docs/page.tsx");
  const eventDocsPageSource = readAppFile("(shell)/events/[eventId]/docs/page.tsx");
  const eventDocsComponentSource = readAppFile(
    "(shell)/events/[eventId]/docs/_components/event-docs-page.tsx",
  );

  assert.equal(
    existsSync(new URL("../app/(shell)/docs-hub/page.tsx", import.meta.url)),
    false,
  );
  assert.equal(accountDocsSource.includes("notFound()"), true);
  assert.equal(accountDocsSource.includes("use client"), false);
  assert.equal(accountDocsSource.includes("DocsPageContent"), false);
  assert.equal(eventDocsPageSource.includes('./_components/event-docs-page'), true);
  assert.equal(eventDocsPageSource.includes('@/app/(shell)/docs/page'), false);
  assert.equal(eventDocsComponentSource.includes("Event-scoped documentation and approvals"), true);
  assert.equal(eventDocsComponentSource.includes("Account-level documentation"), false);
});

test("account-level docs links are removed from account pages", () => {
  const budgetsSource = readAppFile("(shell)/budgets/_components/full-budget-grid.tsx");

  assert.equal(budgetsSource.includes('pathname: "/docs"'), false);
  assert.equal(budgetsSource.includes("`/events/${selectedEventId}/docs`"), true);
});
