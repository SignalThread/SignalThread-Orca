import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("Leads Intelligence manual lead create contract", () => {
  it("renders an Add lead action in the Leads Intelligence header for authorized users", () => {
    const page = read("app/(app)/exhibitor/leads/page.tsx");

    assert.match(page, /import \{ ExhibitorAddLeadButton \}/);
    assert.match(page, /actions=\{[\s\S]*<ExhibitorAddLeadButton/);
    assert.match(page, /canEdit && scopedCompanyId/);
    assert.match(page, /eventId=\{eventId\}/);
    assert.match(page, /companyId=\{scopedCompanyId\}/);
  });

  it("clicking Add lead opens a form with the supported fields", () => {
    const component = read("components/leads/exhibitor-add-lead-button.tsx");

    assert.match(component, />\s*Add lead\s*</);
    assert.match(component, /onClick=\{\(\) => setOpen\(true\)\}/);
    assert.match(component, /role="dialog"/);
    assert.match(component, /name="full_name"[\s\S]*required=\{required\}/);
    for (const field of ["email", "company_text", "job_title", "rating", "temperature", "follow_up_date"] as const) {
      assert.match(component, new RegExp(`name="${field}"`));
    }
    assert.match(component, /Full name/);
    assert.match(component, /Email/);
    assert.match(component, /Company/);
    assert.match(component, /Title/);
    assert.match(component, /Rating/);
    assert.match(component, /Temperature/);
    assert.match(component, /Follow-up date/);
  });

  it("creates through the canonical lead create API and refreshes the visible list", () => {
    const component = read("components/leads/exhibitor-add-lead-button.tsx");

    assert.match(component, /fetch\("\/api\/exhibitor\/leads\/create"/);
    assert.match(component, /method:\s*"POST"/);
    assert.match(component, /event_id:\s*eventId/);
    assert.match(component, /full_name:\s*fullName/);
    assert.match(component, /company_text:\s*optionalText\(data\.get\("company_text"\)\)/);
    assert.match(component, /job_title:\s*optionalText\(data\.get\("job_title"\)\)/);
    assert.match(component, /pushToast\("success",\s*"Lead created\."\)/);
    assert.match(component, /pushToast\("error"/);
    assert.match(component, /setOpen\(false\)/);
    assert.match(component, /router\.replace/);
    assert.match(component, /router\.refresh\(\)/);
  });

  it("canonical manual/mobile create route scopes writes and emits workflows for fresh creates", () => {
    const route = read("app/api/exhibitor/leads/create/route.ts");

    assert.match(route, /resolveApiSession/);
    assert.match(route, /companyId = String\(sessionUser\.companyId/);
    assert.match(route, /platformAdminBrowserCreate/);
    assert.match(route, /canMutateExhibitorLeadsInContext/);
    assert.match(route, /assertEventIdAccessibleForUser\(sessionUser\.userId,\s*eventId\)/);
    assert.match(route, /company_id:\s*companyId/);
    assert.match(route, /event_id:\s*eventId/);
    assert.match(route, /const workflowSource = isBearer \? "mobile_capture" : "manual_create"/);
    assert.match(route, /await attemptLeadCapturedWorkflowEmit\(/);
    assert.match(route, /source:\s*workflowSource/);
    assert.match(route, /workflowEmitAttempted:\s*true/);
  });

  it("route rejects unauthorized users and cross-event creates through server-side guards", () => {
    const route = read("app/api/exhibitor/leads/create/route.ts");

    assert.match(route, /return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\)/);
    assert.match(route, /EventAccessDeniedError/);
    assert.match(route, /return NextResponse\.json\(\{ error: "Event access denied" \}, \{ status: 403 \}\)/);
    assert.match(route, /canMutateExhibitorLeadsInContext\(\{[\s\S]*role,[\s\S]*isBearer,[\s\S]*leadEventId:\s*eventId/);
  });
});
