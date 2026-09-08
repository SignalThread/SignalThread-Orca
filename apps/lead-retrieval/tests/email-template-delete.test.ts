import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deleteEmailTemplateForAccount,
  fetchEmailTemplatesForAccount,
} from "@/lib/data/email-templates";
import { createScopedSupabase } from "./helpers/scoped-supabase";

const COMPANY_A = "company-aaaa";
const COMPANY_B = "company-bbbb";
const PRODUCT_OVERVIEW_ID = "template-product-overview";

function fixture() {
  return createScopedSupabase({
    tables: {
      email_templates: [
        {
          id: "template-follow-up",
          account_id: COMPANY_A,
          name: "Follow up resources",
          subject: "Resources from {{company_name}}",
          body: "Follow up body",
          is_default: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: PRODUCT_OVERVIEW_ID,
          account_id: COMPANY_A,
          // This is intentionally one of the migration-created names. The broken
          // implementation recreated it after delete by treating a missing name as
          // an initialization failure.
          name: "Product overview",
          subject: "Product overview",
          body: "Product body",
          is_default: false,
          created_at: "2026-01-02T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "template-company-b",
          account_id: COMPANY_B,
          name: "Company B template",
          subject: "B subject",
          body: "B body",
          is_default: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  });
}

describe("email template deletion persistence", () => {
  it("removes a built-in-name fixture from the authoritative table and every subsequent scoped list read", async () => {
    const db = fixture();

    const before = await fetchEmailTemplatesForAccount(db, COMPANY_A);
    assert.equal(before.error, null);
    assert.ok(before.templates.some((template) => template.id === PRODUCT_OVERVIEW_ID));

    const result = await deleteEmailTemplateForAccount(db, COMPANY_A, PRODUCT_OVERVIEW_ID);

    assert.equal(result.ok, true, "delete only reports success after the authoritative post-delete read");
    if (!result.ok) return;
    assert.ok(!result.templates.some((template) => template.id === PRODUCT_OVERVIEW_ID));
    assert.ok(
      !db.rows("email_templates").some((template) => template.id === PRODUCT_OVERVIEW_ID),
      "the row must be physically absent from the authoritative email_templates table"
    );

    const afterDelete = await fetchEmailTemplatesForAccount(db, COMPANY_A);
    const afterReload = await fetchEmailTemplatesForAccount(db, COMPANY_A);
    assert.ok(!afterDelete.templates.some((template) => template.id === PRODUCT_OVERVIEW_ID));
    assert.ok(!afterReload.templates.some((template) => template.id === PRODUCT_OVERVIEW_ID));
    assert.ok(
      !afterReload.templates.some((template) => template.name === "Product overview"),
      "a refresh must not recreate a deleted built-in template"
    );
  });

  it("does not allow Company A to delete Company B's row", async () => {
    const db = fixture();

    const result = await deleteEmailTemplateForAccount(db, COMPANY_A, "template-company-b");

    assert.deepEqual(result, { ok: false, status: 404, error: null });
    assert.ok(db.rows("email_templates").some((template) => template.id === "template-company-b"));
  });

  it("does not report success when the database delete fails", async () => {
    const db = createScopedSupabase({
      tables: { email_templates: fixture().rows("email_templates") },
      failOn: { table: "email_templates", action: "delete", message: "database unavailable" },
    });

    const result = await deleteEmailTemplateForAccount(db, COMPANY_A, PRODUCT_OVERVIEW_ID);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 500);
    assert.equal(result.error?.message, "database unavailable");
    assert.ok(db.rows("email_templates").some((template) => template.id === PRODUCT_OVERVIEW_ID));
  });

  it("does not report success for a scoped zero-row deletion", async () => {
    const db = fixture();

    const result = await deleteEmailTemplateForAccount(db, COMPANY_A, "missing-template");

    assert.deepEqual(result, { ok: false, status: 404, error: null });
  });
});
