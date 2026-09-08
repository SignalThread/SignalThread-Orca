import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * Source contract: lead-capture paths and the workflow emitter must NEVER import
 * enrichment, OpenAI, or provider clients. The only code allowed to invoke the
 * enrichment pipeline is the `enrich_lead` step handler, which is called by the
 * cron-driven worker — never by the request lifecycle of lead capture.
 *
 * This is a static-source guard: it does not run the route, it reads the file. If a
 * future change accidentally pulls enrichment into the capture path, this test fails.
 */
describe("Lead capture path: no inline enrichment / no provider calls", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..");
  const filesThatMustNotImportEnrichment = [
    "app/api/exhibitor/leads/create/route.ts",
    "app/api/exhibitor/leads/route.ts",
    "lib/server/import-wizard/publish-leads-materialization.ts",
    "lib/workflows/emit/non-fatal-lead-captured-emit.ts",
    "lib/workflows/emit/lead-captured-emit.ts",
    "lib/workflows/emit/trigger-resolver.ts",
    "lib/workflows/emit/internal-tick-kick.ts",
    "lib/workflows/runner/create-run.ts",
    "lib/workflows/runner/build-run-rows.ts",
    "lib/workflows/runner/claim-next-step.ts",
    "lib/workflows/runner/schedule-next-step.ts",
    "lib/workflows/contracts/workflow-types.ts",
    "lib/workflows/contracts/step-handler.ts"
  ];

  const DISALLOWED_IMPORT_PATTERNS = [
    /from\s+["']@\/lib\/enrichment(?:\/|["'])/,
    /from\s+["']openai["']/,
    /from\s+["']@\/lib\/integrations\/apollo/,
    /from\s+["']@\/lib\/integrations\/zoominfo/,
    /from\s+["']@\/lib\/integrations\/hubspot/,
    /from\s+["']@\/lib\/integrations\/salesforce/
  ];

  function listSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        out.push(...listSourceFiles(full));
        continue;
      }
      if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  for (const relPath of filesThatMustNotImportEnrichment) {
    it(`${relPath} does not import enrichment / provider clients / OpenAI`, () => {
      const source = readFileSync(join(repoRoot, relPath), "utf8");
      for (const pattern of DISALLOWED_IMPORT_PATTERNS) {
        assert.equal(
          pattern.test(source),
          false,
          `${relPath} matched disallowed import ${pattern}`
        );
      }
    });
  }

  it("enrich_lead handler is the only workflow module that imports enrichLead", () => {
    const handlerSource = readFileSync(
      join(repoRoot, "lib/workflows/step-handlers/enrich-lead.ts"),
      "utf8"
    );
    assert.match(handlerSource, /from\s+["']@\/lib\/enrichment["']/);
  });

  it("lead insert paths avoid inline enrichment and only safe create paths emit workflows immediately", () => {
    const leadCreateSource = readFileSync(
      join(repoRoot, "app/api/exhibitor/leads/create/route.ts"),
      "utf8"
    );
    const importPublishSource = readFileSync(
      join(repoRoot, "lib/server/import-wizard/publish-leads-materialization.ts"),
      "utf8"
    );
    const legacyLeadRouteSource = readFileSync(
      join(repoRoot, "app/api/exhibitor/leads/route.ts"),
      "utf8"
    );

    assert.match(leadCreateSource, /attemptLeadCapturedWorkflowEmit/);
    assert.match(leadCreateSource, /const workflowSource = isBearer \? "mobile_capture" : "manual_create"/);
    assert.match(leadCreateSource, /if \(isBearer\)[\s\S]*deferred_until_qualification_save/);
    assert.match(leadCreateSource, /leadHasWorkflowQualificationSignal\(inserted\)/);
    assert.match(leadCreateSource, /source:\s*"mobile_capture_qualified_create"/);
    assert.match(leadCreateSource, /workflowEmitAttempted:\s*false/);
    assert.match(leadCreateSource, /source:\s*workflowSource/);
    assert.match(leadCreateSource, /workflowEmitAttempted:\s*true/);
    assert.match(importPublishSource, /attemptLeadCapturedWorkflowEmit/);
    assert.match(importPublishSource, /source:\s*"csv_publish"/);
    assert.match(importPublishSource, /workflowEmitAttempted:\s*true/);
    assert.match(legacyLeadRouteSource, /return createLeadPOST\(request\)/);

    const helperSource = readFileSync(
      join(repoRoot, "lib/workflows/emit/non-fatal-lead-captured-emit.ts"),
      "utf8"
    );
    assert.match(helperSource, /try\s*\{[\s\S]*await emitFn\(emitInput\)[\s\S]*\}\s*catch\s*\(emitError\)/);
    assert.match(helperSource, /non-fatal/);
    assert.doesNotMatch(helperSource, /WORKFLOWS_EMIT_ENABLED/);
    assert.doesNotMatch(leadCreateSource, /WORKFLOWS_EMIT_ENABLED/);
    assert.doesNotMatch(importPublishSource, /WORKFLOWS_EMIT_ENABLED/);
    assert.doesNotMatch(legacyLeadRouteSource, /WORKFLOWS_EMIT_ENABLED/);
  });

  it("mobile app create flow posts to the canonical lead create endpoint with bearer auth", () => {
    const mobileApiSource = readFileSync(
      join(repoRoot, "mobile/src/data/remoteLeadApi.ts"),
      "utf8"
    );
    const leadCreateSource = readFileSync(
      join(repoRoot, "app/api/exhibitor/leads/create/route.ts"),
      "utf8"
    );

    assert.match(mobileApiSource, /fetch\(`\$\{base\}\/api\/exhibitor\/leads\/create`/);
    assert.match(mobileApiSource, /headers:\s*await authHeaders\(true\)/);
    assert.match(mobileApiSource, /headers\.Authorization = `Bearer \$\{token\}`/);
    assert.match(leadCreateSource, /const workflowSource = isBearer \? "mobile_capture" : "manual_create"/);
    assert.match(leadCreateSource, /if \(isBearer\)[\s\S]*workflowEmitAttempted:\s*false/);
    assert.match(leadCreateSource, /deferred_until_qualification_save/);
  });

  it("all runtime leads.insert sites are known and wired to workflow diagnostics", () => {
    const runtimeRoots = ["app", "lib", "components", "mobile"].map((name) => join(repoRoot, name));
    const matches: string[] = [];
    for (const root of runtimeRoots) {
      for (const file of listSourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        if (/\.from\(["']leads["']\)[\s\S]{0,180}\.insert\(/.test(source)) {
          matches.push(file.replace(`${repoRoot}/`, ""));
        }
      }
    }

    assert.deepEqual(matches.sort(), [
      "app/api/exhibitor/leads/create/route.ts",
      "app/api/exhibitor/leads/route.ts",
      "lib/server/import-wizard/publish-leads-materialization.ts"
    ]);
  });

  it("lead create route stores unassessed defaults and defers mobile workflow emit until qualification save", () => {
    const source = readFileSync(
      join(repoRoot, "app/api/exhibitor/leads/create/route.ts"),
      "utf8"
    );

    assert.match(source, /from\s+["']@\/lib\/workflows\/emit\/non-fatal-lead-captured-emit["']/);
    assert.match(source, /let temperature:\s*LeadTemperature\s*\|\s*null\s*=\s*null/);
    assert.match(source, /let rating\s*=\s*0/);
    assert.match(source, /let status:\s*LeadStatus\s*=\s*"new"/);
    assert.match(source, /\[lead-create\] inserted raw mobile lead row; workflow emit deferred until qualification save/);
    assert.match(source, /leadHasWorkflowQualificationSignal\(inserted\)/);
    assert.match(source, /source:\s*"mobile_capture_qualified_create"/);
    assert.match(source, /deferred_until_qualification_save/);
    assert.match(source, /workflowEmitAttempted:\s*false/);
    assert.match(source, /\[lead-create\] inserted lead row/);
    assert.match(source, /const workflowSource = isBearer \? "mobile_capture" : "manual_create"/);
    assert.match(source, /await attemptLeadCapturedWorkflowEmit\(/);
    assert.match(source, /source:\s*workflowSource/);
    assert.match(source, /workflowEmitAttempted:\s*true/);

    const replayBranchIndex = source.indexOf('if (code === "23505" && clientId)');
    const replayIndex = source.indexOf("idempotentReplay: true");
    assert.ok(replayBranchIndex > 0, "idempotent replay branch not found");
    assert.ok(replayIndex > replayBranchIndex, "idempotent replay response not found inside replay branch");
    assert.match(source.slice(replayBranchIndex), /leadHasWorkflowQualificationSignal\(existing\)/);
    assert.match(source.slice(replayBranchIndex), /source:\s*"mobile_capture_idempotent_replay"/);
  });

  it("legacy POST /api/exhibitor/leads delegates to canonical create route so create semantics stay aligned", () => {
    const source = readFileSync(
      join(repoRoot, "app/api/exhibitor/leads/route.ts"),
      "utf8"
    );

    assert.match(source, /import\s+\{\s*POST\s+as\s+createLeadPOST\s*\}\s+from\s+["']@\/app\/api\/exhibitor\/leads\/create\/route["']/);
    assert.match(source, /export async function POST\(request: Request\)[\s\S]*return createLeadPOST\(request\)/);
    assert.match(source, /\[lead-create\] legacy POST delegated to canonical create route/);
    assert.match(source, /temperature:\s*null/);
    assert.match(source, /rating:\s*0/);
    assert.match(source, /status:\s*"new"/);
    assert.match(source, /attemptLeadCapturedWorkflowEmit/);
    assert.match(source, /source:\s*"dev_bypass_lead_seed"/);
    assert.match(source, /workflowEmitAttempted:\s*true/);
  });

  it("workflow run creation orders steps by production column step_index, never step_order", () => {
    const createRunSource = readFileSync(
      join(repoRoot, "lib/workflows/runner/create-run.ts"),
      "utf8"
    );
    const buildRunRowsSource = readFileSync(
      join(repoRoot, "lib/workflows/runner/build-run-rows.ts"),
      "utf8"
    );

    assert.match(createRunSource, /select\("id, step_index, step_key"\)/);
    assert.match(createRunSource, /\.order\("step_index",\s*\{\s*ascending:\s*true\s*\}\)/);
    assert.doesNotMatch(createRunSource, /step_order/);
    assert.doesNotMatch(buildRunRowsSource, /step_order/);
  });

  it("lead_captured trigger key is consistent across create, emit, and workflow persistence", () => {
    const workflowTypesSource = readFileSync(
      join(repoRoot, "lib/workflows/contracts/workflow-types.ts"),
      "utf8"
    );
    const createWorkflowSource = readFileSync(
      join(repoRoot, "lib/exhibitor/workflows/create-workflow-core.ts"),
      "utf8"
    );
    const emitSource = readFileSync(
      join(repoRoot, "lib/workflows/emit/lead-captured-emit.ts"),
      "utf8"
    );
    const createRouteSource = readFileSync(
      join(repoRoot, "app/api/exhibitor/leads/create/route.ts"),
      "utf8"
    );

    assert.match(workflowTypesSource, /WORKFLOW_TRIGGER_EVENTS = \["lead_captured"\] as const/);
    assert.match(createWorkflowSource, /trigger_event:\s*"lead_captured"/);
    assert.match(emitSource, /\.eq\("company_id",\s*companyId\)/);
    assert.match(emitSource, /\.eq\("trigger_event",\s*"lead_captured"\)/);
    assert.match(emitSource, /\.eq\("is_enabled",\s*true\)/);
    assert.match(emitSource, /trigger_event:\s*"lead_captured"/);
    for (const source of [workflowTypesSource, createWorkflowSource, emitSource, createRouteSource]) {
      assert.doesNotMatch(source, /captured_lead/);
      assert.doesNotMatch(source, /Lead captured(?!" : triggerEvent)/);
    }
  });

  it("lead qualification PATCH is the workflow evaluation boundary", () => {
    const source = readFileSync(
      join(repoRoot, "app/api/exhibitor/leads/[leadId]/route.ts"),
      "utf8"
    );

    assert.match(source, /attemptLeadCapturedWorkflowEmit/);
    assert.match(source, /leadQualificationChanged\([\s\S]*patch,[\s\S]*existingLead as ExistingLeadForPatch,[\s\S]*updatedLead as LeadRow[\s\S]*\)/);
    assert.match(source, /const workflowEmitResult = qualificationChanged[\s\S]*\? await attemptLeadCapturedWorkflowEmit/);
    assert.match(source, /source:\s*"qualification_save"/);
    assert.match(source, /logContext:\s*"app\/api\/exhibitor\/leads\/\[leadId\]:qualification_patch"/);
    assert.match(source, /skipped_non_qualification_patch/);
    assert.doesNotMatch(source, /lead_profile_save/);
    assert.match(source, /\[lead-update\] workflow re-evaluation completed/);
    assert.match(source, /\.select\("id, event_id, rating, temperature, status"\)/);
  });

  it("conversation save paths re-evaluate lead workflows server-side", () => {
    const finalizeSource = readFileSync(
      join(repoRoot, "app/api/conversations/upload/finalize/route.ts"),
      "utf8"
    );
    const multipartSource = readFileSync(
      join(repoRoot, "app/api/conversations/upload/route.ts"),
      "utf8"
    );
    const chunkedSource = readFileSync(
      join(repoRoot, "app/api/conversations/upload/chunked/complete/route.ts"),
      "utf8"
    );

    for (const source of [finalizeSource, multipartSource, chunkedSource]) {
      assert.match(source, /attemptLeadCapturedWorkflowEmitForLeadId/);
      assert.match(source, /workflowEmitAttempted/);
      assert.match(source, /workflowEmitStatus/);
    }
    assert.match(finalizeSource, /"conversation_finalize"/);
    assert.match(multipartSource, /source:\s*"conversation_upload"/);
    assert.match(chunkedSource, /"conversation_chunked_complete"/);
  });

  it("non-fatal workflow emit helper logs status without blocking callers", () => {
    const helperSource = readFileSync(
      join(repoRoot, "lib/workflows/emit/non-fatal-lead-captured-emit.ts"),
      "utf8"
    );
    assert.match(helperSource, /const emitResult = await emitFn\(emitInput\)/);
    assert.match(helperSource, /\[workflows\/emit\] lead_captured emit attempt/);
    assert.match(helperSource, /\[workflows\/emit\] lead_captured emit result/);
    assert.match(helperSource, /status:\s*emitResult\.status/);
    assert.match(helperSource, /catch\s*\(emitError\)[\s\S]*lead_captured emit failed \(non-fatal\)/);
  });

  it("import wizard publish route resolves active event and emits workflows for materialized lead creation", () => {
    const completeRouteSource = readFileSync(
      join(repoRoot, "app/api/exhibitor/import-wizard/batches/[batchId]/complete/route.ts"),
      "utf8"
    );
    const batchServiceSource = readFileSync(
      join(repoRoot, "lib/server/import-wizard/import-batch-service.ts"),
      "utf8"
    );
    const materializationSource = readFileSync(
      join(repoRoot, "lib/server/import-wizard/publish-leads-materialization.ts"),
      "utf8"
    );

    assert.match(completeRouteSource, /resolveExhibitorAppActiveEventId\(session\.userId,\s*requestedEventId\)/);
    assert.match(completeRouteSource, /eventId:\s*activeEventId/);
    assert.match(batchServiceSource, /eventId:\s*opts\?\.eventId\s*\?\?\s*null/);
    assert.match(materializationSource, /const eventId = String\(params\.eventId \?\? ""\)\.trim\(\) \|\| null/);
    assert.match(materializationSource, /event_id:\s*eventId/);
    assert.match(materializationSource, /\[lead-create\] inserted lead row/);
    assert.match(materializationSource, /eventId,\s*\n\s*source:\s*"csv_publish"/);
    assert.match(materializationSource, /attemptLeadCapturedWorkflowEmit/);
    assert.match(materializationSource, /workflowEmitAttempted:\s*true/);
    assert.doesNotMatch(materializationSource, /eventId:\s*null,\s*\n\s*source:\s*"csv_publish"/);
  });

  it("workflow emit and run creation log candidate, eligible, success, failure, and duplicate states", () => {
    const emitSource = readFileSync(
      join(repoRoot, "lib/workflows/emit/lead-captured-emit.ts"),
      "utf8"
    );
    const createRunSource = readFileSync(
      join(repoRoot, "lib/workflows/runner/create-run.ts"),
      "utf8"
    );

    assert.match(emitSource, /\[workflows\/emit\] lead_captured template candidates resolved/);
    assert.match(emitSource, /candidateTemplateCount:\s*candidates\.length/);
    assert.match(emitSource, /\[workflows\/emit\] lead_captured eligibility resolved/);
    assert.match(emitSource, /eligibleTemplateCount:\s*eligible\.length/);
    assert.match(emitSource, /WORKFLOW_EMIT_DEBUG_LOGGING/);
    assert.match(emitSource, /\[workflows\/emit\]\[debug\] \$\{event\}/);
    assert.match(emitSource, /lead_captured trigger received/);
    assert.match(emitSource, /workflow condition matched/);
    assert.match(emitSource, /workflow condition skipped/);
    assert.match(emitSource, /rating:\s*leadRuleFields\?\.rating \?\? null/);
    assert.match(emitSource, /temperature:\s*leadRuleFields\?\.temperature \?\? null/);
    assert.match(emitSource, /status:\s*leadRuleFields\?\.status \?\? null/);
    assert.match(createRunSource, /\[workflows\/runner\] create run started/);
    assert.match(createRunSource, /\[workflows\/runner\] inserted workflow_run/);
    assert.match(createRunSource, /\[workflows\/runner\] failed inserting workflow_run/);
    assert.match(createRunSource, /\[workflows\/runner\] skipped duplicate active workflow_run/);
  });

  it("workflow emit persists trigger decisions so skipped leads are explainable", () => {
    const emitSource = readFileSync(
      join(repoRoot, "lib/workflows/emit/lead-captured-emit.ts"),
      "utf8"
    );
    const migrationSource = readFileSync(
      join(repoRoot, "test-fixtures/legacy-lr-migrations/0088_workflow_trigger_decisions.sql"),
      "utf8"
    );

    assert.match(emitSource, /workflow_trigger_decisions/);
    assert.match(emitSource, /status:\s*"matched"/);
    assert.match(emitSource, /status:\s*"skipped"/);
    assert.match(emitSource, /reason:\s*scopeSkipReason/);
    assert.match(emitSource, /reason:\s*ruleMatch\.reasonSkipped/);
    assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS public\.workflow_trigger_decisions/);
    assert.match(migrationSource, /workflow_trigger_decisions_select_scope/);
  });
});
