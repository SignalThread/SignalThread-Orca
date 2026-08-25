import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activePlatformNavigationSection } from "./platform-navigation";

const rootPageSource = readFileSync("app/platform/page.tsx", "utf8");
const sidebarSource = readFileSync("app/platform/_components/platform-sidebar-nav.tsx", "utf8");
const tablesSource = readFileSync("app/platform/_components/platform-admin-tables.tsx", "utf8");
const accountsClientSource = readFileSync("app/platform/_components/platform-accounts-client.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("/platform redirects to the Accounts list instead of rendering a dashboard", () => {
  assert.match(rootPageSource, /import \{ redirect \} from "next\/navigation"/);
  assert.match(rootPageSource, /redirect\("\/platform\/accounts"\)/);
  assert.doesNotMatch(rootPageSource, /Platform dashboard|PlatformSearch|PageHeader/);
});

test("Platform navigation contains only Accounts and Users", () => {
  assert.match(sidebarSource, /label: "Accounts"/);
  assert.match(sidebarSource, /label: "Users"/);
  assert.doesNotMatch(sidebarSource, /Overview|LayoutDashboard/);
});

test("Platform navigation selects exactly one segment-aware section", () => {
  const cases = [
    ["/platform/accounts", "accounts"],
    ["/platform/accounts/account-123", "accounts"],
    ["/platform/accounts/account-123/events/event-123", "accounts"],
    ["/platform/users", "users"],
    ["/platform/users/user-123", "users"],
    ["/platform/users/user-123/memberships", "users"],
    ["/platform", null],
  ] as const;

  for (const [pathname, section] of cases) {
    assert.equal(activePlatformNavigationSection(pathname), section, pathname);
  }
  assert.doesNotMatch(sidebarSource, /pathname\.startsWith\(`\$\{href\}\/`\)/);
  assert.match(sidebarSource, /activeSection === \(section as PlatformNavigationSection\)/);
});

test("Accounts tables omit account slugs while Users keeps email subtitles", () => {
  const accountsTableSource = sourceBetween(tablesSource, "export async function AccountsTable", "export async function UsersTable");
  const usersTableSource = sourceBetween(tablesSource, "export async function UsersTable", "export async function PlatformSearch");
  const clientAccountsListSource = sourceBetween(accountsClientSource, "function AccountsListContent", "function DetailContent");

  assert.doesNotMatch(accountsTableSource, /account\.slug/);
  assert.doesNotMatch(clientAccountsListSource, /account\.slug/);
  assert.match(usersTableSource, /<p className="text-slate-500">\{user\.email\}<\/p>/);
});
