import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function read(relPath: string) {
  return readFileSync(join(root, relPath), "utf8");
}

describe("exhibitor lead detail delete action", () => {
  const profileCardSource = read("components/leads/exhibitor-lead-profile-card.tsx");
  const deleteRouteSource = read("app/api/exhibitor/leads/[leadId]/route.ts");

  it("exposes Delete Lead from the lead detail actions menu with confirmation", () => {
    assert.match(profileCardSource, /data-testid="lead-detail-actions-trigger"/);
    assert.match(profileCardSource, /data-testid="lead-detail-delete-action"/);
    assert.match(profileCardSource, /Delete Lead/);
    assert.match(profileCardSource, /data-testid="lead-delete-confirm-dialog"/);
    assert.match(profileCardSource, /Delete this lead\?/);
    assert.match(profileCardSource, /This action cannot be undone/);
    assert.match(profileCardSource, /Keep lead/);
    assert.match(profileCardSource, /data-testid="lead-delete-confirm-submit"/);
  });

  it("uses the authorized single-lead DELETE endpoint and returns to the leads list", () => {
    assert.match(
      profileCardSource,
      /fetch\(`\/api\/exhibitor\/leads\/\$\{encodeURIComponent\(leadId\)\}`,\s*\{[\s\S]*method:\s*"DELETE"/
    );
    assert.match(profileCardSource, /credentials:\s*"include"/);
    assert.match(profileCardSource, /router\.push\("\/exhibitor\/leads"\)/);
    assert.match(profileCardSource, /Failed to delete lead/);
  });

  it("server route keeps company scope and mutation authorization for deletion", () => {
    assert.match(deleteRouteSource, /export async function DELETE/);
    assert.match(deleteRouteSource, /\.eq\("id", leadId\)/);
    assert.match(deleteRouteSource, /\.eq\("company_id", accountId\)/);
    assert.match(deleteRouteSource, /canMutateExhibitorLeadsInContext\(/);
    assert.match(deleteRouteSource, /deleteExhibitorLeadForCompany\(\{ leadId, companyId: accountId \}\)/);
  });
});
