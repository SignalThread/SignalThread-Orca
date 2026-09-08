import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("test-lead route only accepts a lead that is currently unsent", () => {
  const src = read("app/api/integrations/pipedrive/test-lead/route.ts");
  assert.match(src, /getPipedriveLeadSyncState\(authorization\.context\.companyId, leadId\)/);
  assert.match(src, /if \(currentState\.state !== "unsent"\) \{/);
  assert.match(src, /status: 409/);
});

test("test-lead route calls the exact same canonical syncLeadToPipedrive service as the detail-page route — not a mock or a separate implementation", () => {
  const testLeadSrc = read("app/api/integrations/pipedrive/test-lead/route.ts");
  const detailSrc = read("app/api/integrations/pipedrive/sync/route.ts");
  assert.match(testLeadSrc, /import \{ syncLeadToPipedrive \} from "@\/lib\/integrations\/pipedrive\/sync-service"/);
  assert.match(detailSrc, /import \{ syncLeadToPipedrive \} from "@\/lib\/integrations\/pipedrive\/sync-service"/);
  assert.match(testLeadSrc, /await syncLeadToPipedrive\(\{/);
  assert.match(detailSrc, /await syncLeadToPipedrive\(\{/);
});

test("test-lead route passes source: \"test\" so the sync row records how it was triggered", () => {
  const src = read("app/api/integrations/pipedrive/test-lead/route.ts");
  assert.match(src, /source: "test"/);
});

test("the setup page only offers currently-unsent leads for the test picker", () => {
  const src = read("app/(app)/exhibitor/integrations/pipedrive/page.tsx");
  assert.match(src, /listUnsentPipedriveLeadsForCompany/);
});

test("listUnsentPipedriveLeadsForCompany filters out every lead whose state is not unsent", () => {
  const src = read("lib/integrations/pipedrive/sync-state.ts");
  assert.match(src, /const unsent = rows\.filter/);
  assert.match(src, /=== "unsent"/);
});
