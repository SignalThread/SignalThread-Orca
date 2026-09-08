import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { getDefaultEmailTemplatePayloads } from "@/lib/data/email-templates";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assertHasAccountScopedIdFilter(source: string) {
  assert.match(source, /\.eq\("id",\s*[^)]+\)/);
  assert.match(source, /\.eq\("account_id",\s*accountId\)/);
}

describe("Documents & Links account isolation regressions", () => {
  it("Company A cannot list Company B documents or links", () => {
    const route = read("app/api/exhibitor/documents/route.ts");

    assert.match(route, /const accountId = String\(sessionUser\.companyId/);
    assert.match(route, /\.from\("documents"\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
    assert.match(route, /\.eq\("is_archived",\s*false\)/);
    assert.doesNotMatch(route, /\.eq\("account_id",\s*requestedCompanyId\)/);
    assert.doesNotMatch(route, /\.eq\("account_id",\s*searchParams\.get\("companyId"\)\)/);
  });

  it("Company A cannot preview Company B files or links", () => {
    const route = read("app/api/exhibitor/documents/[documentId]/preview/route.ts");

    assert.match(route, /getCurrentSessionUser/);
    assert.match(route, /const accountId = String\(sessionUser\.company_id/);
    assertHasAccountScopedIdFilter(route);
    assert.match(route, /\.eq\("is_archived",\s*false\)/);
    assert.match(route, /r2Client\.send\(/);
  });

  it("Company A cannot update or delete Company B documents or links", () => {
    const route = read("app/api/exhibitor/documents/[documentId]/route.ts");

    assert.match(route, /function isDocumentAdminRole/);
    assert.match(route, /if \(!isDocumentAdminRole\(role\)\)/);
    assert.match(route, /\.from\("documents"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id",\s*documentId\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
    assert.match(route, /\.from\("documents"\)[\s\S]*?\.update\(patch\)[\s\S]*?\.eq\("id",\s*documentId\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
  });

  it("create ignores client supplied account/company and writes authenticated session account", () => {
    const route = read("app/api/exhibitor/documents/route.ts");

    assert.match(route, /const accountId = String\(sessionUser\.companyId/);
    assert.match(route, /const payload = \{[\s\S]*?account_id:\s*accountId/);
    assert.doesNotMatch(route, /formData\.get\("accountId"\)/);
    assert.doesNotMatch(route, /formData\.get\("account_id"\)/);
    assert.doesNotMatch(route, /formData\.get\("companyId"\)/);
    assert.doesNotMatch(route, /formData\.get\("company_id"\)/);
    assert.match(route, /storagePath = `documents\/\$\{accountId\}\//);
  });

  it("create rejects an eventId from another company", () => {
    const route = read("app/api/exhibitor/documents/route.ts");

    assert.match(route, /async function assertEventBelongsToAccount/);
    assert.match(route, /\.from\("events"\)[\s\S]*?\.eq\("id",\s*input\.eventId\)[\s\S]*?\.eq\("company_id",\s*input\.accountId\)/);
    assert.match(route, /return respond\(NextResponse\.json\(\{ error: "Event access denied\." \}, \{ status: 403 \}\)\)/);
  });

  it("Send Resources rejects another account's documentId or templateId", () => {
    const route = read("app/api/exhibitor/documents/send/route.ts");

    assert.match(route, /const accountId = String\(sessionUser\.companyId/);
    assert.match(route, /\.from\("documents"\)[\s\S]*?\.eq\("id",\s*documentId\)[\s\S]*?\.eq\("account_id",\s*accountId\)[\s\S]*?\.eq\("is_archived",\s*false\)/);
    assert.match(route, /\.from\("email_templates"\)[\s\S]*?\.eq\("id",\s*templateId\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
    assert.match(route, /\.from\("documents"\)[\s\S]*?\.update\(\{[\s\S]*?sent_count[\s\S]*?\}\)[\s\S]*?\.eq\("id",\s*documentRow\.id\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
  });

  it("viewer/read-only roles get 403 for create, update, delete, and send", () => {
    const collectionRoute = read("app/api/exhibitor/documents/route.ts");
    const itemRoute = read("app/api/exhibitor/documents/[documentId]/route.ts");
    const sendRoute = read("app/api/exhibitor/documents/send/route.ts");
    const page = read("app/(app)/exhibitor/documents/page.tsx");

    assert.match(collectionRoute, /role === "exhibitor_admin" \|\| role === "platform_admin"/);
    assert.match(collectionRoute, /if \(!isDocumentAdminRole\(role\)\)[\s\S]*?status: 403/);
    assert.match(itemRoute, /role === "exhibitor_admin" \|\| role === "platform_admin"/);
    assert.match(itemRoute, /if \(!isDocumentAdminRole\(role\)\)[\s\S]*?status: 403/);
    assert.match(sendRoute, /if \(role !== "exhibitor_admin" && role !== "platform_admin"\)[\s\S]*?status: 403/);
    assert.match(page, /requireRole\("exhibitor_admin"\)/);
    assert.doesNotMatch(collectionRoute, /exhibitor_viewer/);
    assert.doesNotMatch(itemRoute, /exhibitor_viewer/);
    assert.doesNotMatch(sendRoute, /exhibitor_viewer/);
  });

  it("direct Supabase access is not left openly readable/writable by documents RLS", () => {
    const migration = read("test-fixtures/legacy-lr-migrations/0021_documents_hub.sql");
    const allMigrations = read("test-fixtures/legacy-lr-migrations/0021_documents_hub.sql") + "\n" + read("test-fixtures/legacy-lr-migrations/0082_documents_asset_kind.sql");

    assert.match(migration, /alter table public\.documents enable row level security/);
    assert.match(migration, /alter table public\.document_sends enable row level security/);

    const policyBlocks = Array.from(
      allMigrations.matchAll(/create policy[\s\S]*?on public\.(documents|document_sends)[\s\S]*?;/g),
      (match) => match[0]
    );
    for (const policy of policyBlocks) {
      assert.match(
        policy,
        /current_company_id\(\)|account_id|document_id/,
        `document RLS policy must include account/document scoping:\n${policy}`
      );
      assert.doesNotMatch(policy, /using\s*\(\s*true\s*\)/i);
      assert.doesNotMatch(policy, /with check\s*\(\s*true\s*\)/i);
    }
  });
});

describe("Email Templates account isolation regressions", () => {
  it("Company A cannot list Company B email templates", () => {
    const data = read("lib/data/email-templates.ts");
    const route = read("app/api/exhibitor/email-templates/route.ts");

    assert.match(route, /const accountId = String\(sessionUser\.company_id/);
    assert.match(route, /fetchEmailTemplatesForAccount\(supabase,\s*accountId\)/);
    assert.match(data, /fetchEmailTemplatesForAccount\(supabase: any, accountId: string\)/);
    assert.match(data, /\.from\("email_templates"\)[\s\S]*?\.select\(EMAIL_TEMPLATE_COLUMNS\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
  });

  it("Company A cannot patch or delete Company B template IDs", () => {
    const route = read("app/api/exhibitor/email-templates/[templateId]/route.ts");

    assert.match(route, /isCompanyAccountAdminSession\(sessionUser\)/);
    assert.match(route, /\.from\("email_templates"\)[\s\S]*?\.update\(\{[\s\S]*?\}\)[\s\S]*?\.eq\("id",\s*templateId\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
    assert.match(route, /deleteEmailTemplateForAccount\(supabase,\s*accountId,\s*templateId\)/);
    const data = read("lib/data/email-templates.ts");
    assert.match(data, /\.from\("email_templates"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id",\s*templateId\)[\s\S]*?\.eq\("account_id",\s*accountId\)[\s\S]*?\.select\("id, account_id, is_default"\)/);
  });

  it("Company A cannot duplicate Company B template IDs", () => {
    const route = read("app/api/exhibitor/email-templates/[templateId]/duplicate/route.ts");

    assert.match(route, /isCompanyAccountAdminSession\(sessionUser\)/);
    assert.match(route, /\.from\("email_templates"\)[\s\S]*?\.select\(emailTemplateColumns\)[\s\S]*?\.eq\("id",\s*templateId\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
    assert.match(route, /\.insert\(\{[\s\S]*?account_id:\s*accountId/);
  });

  it("creating a template always writes account_id from authenticated session", () => {
    const route = read("app/api/exhibitor/email-templates/route.ts");

    assert.match(route, /type CreateTemplateBody = \{[\s\S]*?name\?: string;[\s\S]*?subject\?: string;[\s\S]*?body\?: string;[\s\S]*?isDefault\?: boolean;[\s\S]*?\}/);
    assert.doesNotMatch(route, /account_id\?:/);
    assert.doesNotMatch(route, /company_id\?:/);
    assert.match(route, /const accountId = String\(sessionUser\.company_id/);
    assert.match(route, /\.insert\(\{[\s\S]*?account_id:\s*accountId/);
  });

  it("editing a seeded default for Company A cannot change Company B's seeded default", () => {
    const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const defaultsA = getDefaultEmailTemplatePayloads(companyA);
    const defaultsB = getDefaultEmailTemplatePayloads(companyB);
    const patchRoute = read("app/api/exhibitor/email-templates/[templateId]/route.ts");
    const data = read("lib/data/email-templates.ts");

    assert.equal(defaultsA.length, defaultsB.length);
    assert.notEqual(defaultsA[0]?.account_id, defaultsB[0]?.account_id);
    assert.deepEqual(
      defaultsA.map(({ name, subject, body, is_default }) => ({ name, subject, body, is_default })),
      defaultsB.map(({ name, subject, body, is_default }) => ({ name, subject, body, is_default }))
    );
    assert.match(patchRoute, /\.eq\("id",\s*templateId\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
    assert.match(data, /\.update\(\{ is_default: false,[\s\S]*?\}\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
    assert.match(data, /\.update\(\{ is_default: true,[\s\S]*?\}\)[\s\S]*?\.eq\("account_id",\s*accountId\)[\s\S]*?\.eq\("id",\s*templateId\)/);
  });

  it("Send Resources rejects a templateId from another account", () => {
    const sendRoute = read("app/api/exhibitor/documents/send/route.ts");

    assert.match(sendRoute, /\.from\("email_templates"\)[\s\S]*?\.select\("id, account_id, name, subject, body"\)[\s\S]*?\.eq\("id",\s*templateId\)[\s\S]*?\.eq\("account_id",\s*accountId\)/);
    assert.match(sendRoute, /Selected email template was not found/);
  });

  it("viewer/read-only role cannot create, edit, delete, or duplicate templates", () => {
    const collectionRoute = read("app/api/exhibitor/email-templates/route.ts");
    const itemRoute = read("app/api/exhibitor/email-templates/[templateId]/route.ts");
    const duplicateRoute = read("app/api/exhibitor/email-templates/[templateId]/duplicate/route.ts");

    assert.match(collectionRoute, /if \(!isCompanyAccountAdminSession\(sessionUser\)\)[\s\S]*?status: 403/);
    assert.match(itemRoute, /if \(!isCompanyAccountAdminSession\(sessionUser\)\)[\s\S]*?status: 403/);
    assert.match(duplicateRoute, /if \(!isCompanyAccountAdminSession\(sessionUser\)\)[\s\S]*?status: 403/);
    assert.doesNotMatch(collectionRoute, /exhibitor_viewer/);
    assert.doesNotMatch(itemRoute, /exhibitor_viewer/);
    assert.doesNotMatch(duplicateRoute, /exhibitor_viewer/);
  });
});
