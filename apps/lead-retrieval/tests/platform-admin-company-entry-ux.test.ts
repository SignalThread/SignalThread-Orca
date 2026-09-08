import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Platform Admin company entry UX", () => {
  const companiesPage = read("app/admin/company-licenses/companies/page.tsx");
  const accountContextRoute = read("app/api/admin/account-context/route.ts");
  const appShell = read("components/layout/app-shell.tsx");

  it("makes the company name and final action column visibly enter the canonical account context", () => {
    assert.match(companiesPage, /cursor-pointer/);
    assert.match(companiesPage, /hover:bg-violet-50/);
    assert.match(companiesPage, /<th[^>]*>Actions<\/th>/);
    assert.match(companiesPage, /action="\/api\/admin\/account-context" method="post"/);
    assert.match(companiesPage, /name="companyId" value=\{row\.companyId\}/);
    assert.match(companiesPage, /aria-label=\{`Enter \$\{row\.companyName\}`\}/);
    assert.match(companiesPage, /Enter company <span aria-hidden="true">→<\/span>/);
  });

  it("keeps account switching server-authorized and enters the exhibitor account surface", () => {
    assert.match(accountContextRoute, /principal\?\.role !== "platform_admin"/);
    assert.match(accountContextRoute, /resolvePlatformAdminAccountContext/);
    assert.match(accountContextRoute, /redirectTo\(request, "\/app\/events", authResponse\)/);
    assert.match(accountContextRoute, /PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE/);
    assert.match(accountContextRoute, /authResponse\.cookies\.set/);
    assert.match(accountContextRoute, /copyCookies\(authResponse, response\)/);
    assert.match(accountContextRoute, /buildBrowserFacingUrl\(request, path\)/);
  });

  it("shows a persistent scoped-admin indicator with the canonical exit action", () => {
    assert.match(appShell, /Platform Admin · Viewing \{platformAdminAccountContext\.companyName\}/);
    assert.match(appShell, /data-testid="platform-admin-account-context-banner"/);
    assert.match(appShell, /name="action" value="exit"/);
    assert.match(appShell, /Exit company/);
  });
});
