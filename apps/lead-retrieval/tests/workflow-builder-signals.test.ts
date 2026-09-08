import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { filterWorkflowSelectableSignalRowsForEvent } from "../lib/signals/workflow-selectable-signal-rows";
import { workflowBuilderSignalOptionsFromRecords } from "../lib/exhibitor/workflows/workflow-builder-signal-options";
import type { SignalRecord } from "../components/signals/signal-types";

const repoRoot = process.cwd();

function read(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function signal(overrides: Partial<SignalRecord>): SignalRecord {
  return {
    id: "signal-1",
    name: "Agent",
    category: "Custom",
    default_prompt: "Prompt",
    admin_override_prompt: null,
    effective_prompt: "Prompt",
    visibility: "role",
    signal_scope: "company",
    company_id: "company-1",
    owner_user_id: null,
    role_scope: "exhibitor_admin",
    template_scope: null,
    is_active: true,
    available_in_pattern_mode: true,
    event_id: null,
    source_signal_id: null,
    created_by: "user-1",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ai_generated: false,
    override_active: false,
    is_readonly: false,
    ...overrides
  };
}

test("workflow builder lists active Campaign Agents across every supported category", () => {
  const options = workflowBuilderSignalOptionsFromRecords([
    signal({ id: "ai", name: "AI Agent", category: "AI-Powered" }),
    signal({ id: "context", name: "Context Agent", category: "Contextual" }),
    signal({ id: "custom", name: "Custom Agent", category: "Custom" }),
    signal({ id: "cta", name: "CTA Agent", category: "Call-to-Action" })
  ]);

  assert.deepEqual(
    options.map((option) => option.category).sort(),
    ["AI-Powered", "Call-to-Action", "Contextual", "Custom"].sort()
  );
  assert.deepEqual(
    options.map((option) => option.id).sort(),
    ["ai", "context", "custom", "cta"].sort()
  );
});

test("workflow builder event source includes only active Campaign Agents attached to the current event", () => {
  const rows = [
    signal({ id: "active-event", name: "Active Event Agent", company_id: "company-1", event_id: "event-1", signal_scope: "event", is_active: true }),
    signal({ id: "second-event", name: "Second Event Agent", company_id: "company-1", event_id: "event-1", signal_scope: "event", is_active: true }),
    signal({ id: "inactive-event", name: "Inactive Event Agent", company_id: "company-1", event_id: "event-1", is_active: false }),
    signal({ id: "other-event", name: "Other Event Agent", company_id: "company-1", event_id: "event-2", is_active: true }),
    signal({ id: "company", name: "Company Agent", company_id: "company-1", event_id: null, signal_scope: "company", is_active: true }),
    signal({ id: "default", name: "Default Agent", company_id: null, event_id: null, signal_scope: "default", is_active: true }),
    signal({ id: "other-company", name: "Other Company Event Agent", company_id: "company-2", event_id: "event-1", is_active: true })
  ];

  const eligible = filterWorkflowSelectableSignalRowsForEvent(rows, {
    companyId: "company-1",
    eventId: "event-1"
  });

  assert.deepEqual(eligible.map((row) => row.id), ["active-event", "second-event", "company"]);
});

test("workflow builder event source includes private agents only for the owning user", () => {
  const rows = [
    signal({ id: "owned-private", signal_scope: "private", company_id: "company-1", event_id: "event-1", owner_user_id: "user-1" }),
    signal({ id: "other-private", signal_scope: "private", company_id: "company-1", event_id: "event-1", owner_user_id: "user-2" })
  ];

  const eligible = filterWorkflowSelectableSignalRowsForEvent(rows, {
    companyId: "company-1",
    eventId: "event-1",
    userId: "user-1"
  });

  assert.deepEqual(eligible.map((row) => row.id), ["owned-private"]);
});

test("workflow builder omits deleted or disabled Campaign Agents from options", () => {
  const eligible = filterWorkflowSelectableSignalRowsForEvent(
    [
      signal({ id: "active", name: "Active Agent", event_id: "event-1", signal_scope: "event", is_active: true }),
      signal({ id: "inactive", name: "Deleted Agent", event_id: "event-1", signal_scope: "event", is_active: false })
    ],
    { companyId: "company-1", eventId: "event-1" }
  );
  const options = workflowBuilderSignalOptionsFromRecords(eligible);

  assert.deepEqual(options.map((option) => option.id), ["active"]);
});

test("workflow builder uses the same signal eligibility helper as the Campaign Agents list", () => {
  const loader = read("lib/exhibitor/workflows/load-workflow-builder-signals.ts");
  const signalData = read("lib/data/signals.ts");
  const newPage = read("app/(app)/exhibitor/workflows/new/page.tsx");
  const detailPage = read("app/(app)/exhibitor/workflows/[workflowId]/page.tsx");
  const listRoute = read("app/api/signals/route.ts");

  assert.match(listRoute, /getSignalsForUser\(normalizedSessionUser/);
  assert.match(signalData, /filterWorkflowSelectableSignalRowsForEvent/);
  assert.match(signalData, /loadSignalRowsForEventContext\(/);
  assert.match(signalData, /filterWorkflowSelectableSignalRowsForEvent\(eventRows/);
  assert.match(signalData, /filterWorkflowSelectableSignalRowsForEvent\(rows/);
  assert.doesNotMatch(signalData, /\.\.\.\(await loadApprovedGlobalStarterSignalRows\(\)\)/);
  assert.match(read("lib/signals/workflow-selectable-signal-rows.ts"), /scope === "event"/);
  assert.match(read("lib/signals/workflow-selectable-signal-rows.ts"), /scope === "company"/);
  assert.match(read("lib/signals/workflow-selectable-signal-rows.ts"), /scope === "private"/);
  assert.match(loader, /getWorkflowSelectableSignalsForEvent\(sessionUser,\s*\{ eventId \}\)/);
  assert.doesNotMatch(loader, /includeDefaults:\s*true/);
  assert.match(loader, /eventId/);
  assert.match(newPage, /loadWorkflowBuilderSignalsForUser\(sessionUser/);
  assert.match(newPage, /resolveWorkflowAuthoringEventContext/);
  assert.match(detailPage, /loadWorkflowBuilderSignalsForUser\(sessionUser/);
  assert.match(detailPage, /eventIdForSignalInventory = detail\.template\.event_id \|\| null/);
  assert.doesNotMatch(newPage, /\.from\("signals"\)/);
  assert.doesNotMatch(detailPage, /\.from\("signals"\)/);
});

test("workflow builder resolves header-selected event context before falling back to company-wide mode", () => {
  const newPage = read("app/(app)/exhibitor/workflows/new/page.tsx");
  const listPage = read("app/(app)/exhibitor/workflows/page.tsx");
  const createRoute = read("app/api/exhibitor/workflows/create/route.ts");
  const builder = read("components/exhibitor/workflows/workflow-orchestration-builder.tsx");

  assert.match(newPage, /resolveWorkflowAuthoringEventContext\(\{\s*userId: sessionUser\.id/s);
  assert.match(newPage, /scope: scopeRaw/);
  assert.match(newPage, /eventIdForSignalInventory = eventContext\.eventId/);
  assert.doesNotMatch(newPage, /No event is pinned in the URL/);
  assert.doesNotMatch(newPage, /This workflow will be pinned to the selected event/);
  assert.doesNotMatch(newPage, /Company-wide mode is selected/);
  assert.doesNotMatch(newPage, /No active event could be resolved/);

  assert.match(listPage, /resolveWorkflowAuthoringEventContext\(\{/);
  assert.match(listPage, /const activeEventId = eventContext\.eventId/);
  assert.match(listPage, /\/exhibitor\/workflows\/new\?eventId=\$\{encodeURIComponent\(activeEventId\)\}/);
  assert.match(listPage, /navigationSearchSuffix[\s\S]*activeEventId/);

  assert.match(builder, /scopeMode = "event"/);
  assert.match(builder, /payload\.workflow_scope = "company"/);
  assert.match(builder, /if \(effectiveEventId\) return `\?eventId=/);

  assert.match(createRoute, /requestedWorkflowScope = rawBody\.workflow_scope/);
  assert.match(createRoute, /resolveWorkflowAuthoringEventContext\(\{/);
  assert.match(createRoute, /scope: requestedWorkflowScope/);
});

test("workflow save and Campaign Draft execution validate selected Campaign Agents against event eligibility", () => {
  const createRoute = read("app/api/exhibitor/workflows/create/route.ts");
  const updateRoute = read("app/api/exhibitor/workflows/[workflowId]/route.ts");
  const composeHandler = read("lib/workflows/step-handlers/compose-campaign-draft.ts");
  const composeRunner = read("lib/workflows/step-handlers/compose-campaign-draft-runner.ts");
  const detailLoader = read("lib/exhibitor/workflows/load-workflow-detail.ts");

  assert.match(createRoute, /validateWorkflowSignalIdsForEvent/);
  assert.match(createRoute, /missingSignalIds/);
  assert.match(updateRoute, /validateWorkflowSignalIdsForEvent/);
  assert.match(updateRoute, /existingTemplate\.event_id/);
  assert.match(composeHandler, /filterWorkflowSelectableSignalRowsForEvent/);
  assert.match(composeHandler, /ctx\.run\.event_id/);
  assert.match(composeRunner, /Selected Campaign Agents are not available for this workflow event/);
  assert.match(detailLoader, /filterWorkflowSelectableSignalRowsForEvent/);
  assert.match(detailLoader, /composeSignals[\s\S]*filter/);
});

test("workflow edit mode preserves selected Campaign Agents after save and reload", () => {
  const builder = read("components/exhibitor/workflows/workflow-orchestration-builder.tsx");
  const detailView = read("components/exhibitor/workflows/workflow-detail-view.tsx");
  const detailPage = read("app/(app)/exhibitor/workflows/[workflowId]/page.tsx");
  const state = read("lib/exhibitor/workflows/workflow-builder-state.ts");

  assert.match(state, /orderedSignalIds:\s*stringArray\(composeParams\.selectedSignalIds\)/);
  assert.match(builder, /selected_signal_ids:\s*orderedSignalIds/);
  assert.match(builder, /if \(effectiveEventId\) payload\.event_id = effectiveEventId/);
  assert.match(builder, /if \(scopeMode === "company"\) payload\.workflow_scope = "company"/);
  assert.match(detailPage, /eventIdForSignalInventory/);
  assert.match(detailPage, /eventIdForNav/);
  assert.match(detailView, /buildDetailHref\(workflowId,\s*\{[\s\S]*?runId:\s*next,[\s\S]*?eventId:\s*eventIdForNav/);
  assert.match(detailView, /eventId=\{eventIdForBuilder\}/);
});
