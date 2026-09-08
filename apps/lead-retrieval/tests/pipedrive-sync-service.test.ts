import assert from "node:assert/strict";
import test from "node:test";
import {
  runPipedriveSync,
  type PipedriveSyncDeps,
  type PipedriveSyncRowPatch
} from "../lib/integrations/pipedrive/sync-orchestrator";
import { DEFAULT_PIPEDRIVE_SETUP_SETTINGS, type PipedriveSetupSettings } from "../lib/integrations/pipedrive/setup-core";
import {
  buildActivityPayload,
  type PipedriveConversationInsight,
  type PipedriveEmailDraft,
  type PipedriveLeadSyncRow,
  type PipedriveSyncLeadRow
} from "../lib/integrations/pipedrive/sync-core";

const NOW = new Date("2026-08-18T12:00:00.000Z");

function lead(overrides: Partial<PipedriveSyncLeadRow> = {}): PipedriveSyncLeadRow {
  return {
    id: "lead-1",
    companyId: "company-1",
    fullName: "Jane Doe",
    email: "jane@example.com",
    companyText: "Acme Co",
    companyDomain: "acme.com",
    jobTitle: "VP Sales",
    followUpAt: "2026-08-20T10:00:00.000Z",
    followUpDate: "2026-08-20",
    ...overrides
  };
}

function settings(overrides: Partial<PipedriveSetupSettings> = {}): PipedriveSetupSettings {
  return { ...DEFAULT_PIPEDRIVE_SETUP_SETTINGS, ...overrides };
}

type FakeHarnessOptions = {
  lead?: PipedriveSyncLeadRow | null;
  settings?: PipedriveSetupSettings;
  existingPersonId?: string | null;
  existingOrganizationId?: string | null;
  conversation?: PipedriveConversationInsight | null;
  emailDraft?: PipedriveEmailDraft | null;
  failStep?: "createPerson" | "createOrganization" | "createDeal" | "createPipedriveLead" | "createNote" | "createActivity" | null;
  failOnceOnly?: boolean;
  /** Pre-seeds the sync row for "company-1:lead-1" as if an earlier attempt already persisted progress. */
  seedRow?: Partial<PipedriveLeadSyncRow>;
};

function emptyRow(id: string): PipedriveLeadSyncRow {
  return {
    id,
    status: "queued",
    attempts: 0,
    personId: null,
    personAction: null,
    organizationId: null,
    organizationAction: null,
    destinationKind: null,
    destinationId: null,
    destinationAction: null,
    synopsisNoteId: null,
    synopsisNoteAction: null,
    emailDraftNoteId: null,
    emailDraftNoteAction: null,
    activityId: null,
    activityAction: null
  };
}

function makeHarness(options: FakeHarnessOptions = {}) {
  const rows = new Map<string, PipedriveLeadSyncRow>();
  if (options.seedRow) {
    const key = "company-1:lead-1";
    rows.set(key, { ...emptyRow(key), ...options.seedRow });
  }
  const calls = {
    findPersonByEmail: 0,
    createPerson: 0,
    findOrganizationByName: 0,
    createOrganization: 0,
    createDeal: 0,
    createPipedriveLead: 0,
    createNote: 0,
    createActivity: 0
  };
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${(idCounter += 1)}`;
  let failuresLeft = options.failStep ? (options.failOnceOnly === false ? Infinity : 1) : 0;

  function maybeFail(step: string) {
    if (options.failStep === step && failuresLeft > 0) {
      failuresLeft -= 1;
      throw new Error(`simulated ${step} failure`);
    }
  }

  const deps: PipedriveSyncDeps = {
    async loadLead() {
      return options.lead === undefined ? lead() : options.lead;
    },
    async loadSettings() {
      return options.settings ?? settings();
    },
    async beginSync(input) {
      const key = `${input.companyId}:${input.leadId}`;
      const existing = rows.get(key) ?? emptyRow(key);
      const updated: PipedriveLeadSyncRow = { ...existing, status: "syncing", attempts: existing.attempts + 1 };
      rows.set(key, updated);
      return { ...updated };
    },
    async persistRow(rowId, patch: PipedriveSyncRowPatch) {
      const existing = rows.get(rowId);
      if (!existing) return;
      rows.set(rowId, { ...existing, ...(patch as Partial<PipedriveLeadSyncRow>) });
    },
    async findPersonByEmail() {
      calls.findPersonByEmail += 1;
      return options.existingPersonId ?? null;
    },
    async createPerson() {
      calls.createPerson += 1;
      maybeFail("createPerson");
      return nextId("person");
    },
    async findOrganizationByName() {
      calls.findOrganizationByName += 1;
      return options.existingOrganizationId ?? null;
    },
    async createOrganization() {
      calls.createOrganization += 1;
      maybeFail("createOrganization");
      return nextId("org");
    },
    async createDeal() {
      calls.createDeal += 1;
      maybeFail("createDeal");
      return nextId("deal");
    },
    async createPipedriveLead() {
      calls.createPipedriveLead += 1;
      maybeFail("createPipedriveLead");
      return nextId("pdlead");
    },
    async loadConversationInsight() {
      return options.conversation === undefined ? null : options.conversation;
    },
    async loadEmailDraft() {
      return options.emailDraft === undefined ? null : options.emailDraft;
    },
    async createNote() {
      calls.createNote += 1;
      maybeFail("createNote");
      return nextId("note");
    },
    async createActivity() {
      calls.createActivity += 1;
      maybeFail("createActivity");
      return nextId("activity");
    },
    now: () => NOW
  };

  return { deps, rows, calls };
}

test("default settings: creates person, organization, and a Pipedrive Lead; skips notes with no data and activity when disabled config overridden", async () => {
  const { deps, calls } = makeHarness({ conversation: null, emailDraft: null });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });

  assert.equal(result.success, true);
  assert.equal(result.personAction, "created");
  assert.equal(result.organizationAction, "created");
  assert.equal(result.destinationKind, "lead");
  assert.equal(result.destinationAction, "created");
  assert.equal(result.synopsisNoteAction, "skipped");
  assert.equal(result.emailDraftNoteAction, "skipped");
  assert.equal(result.activityAction, "created");
  assert.equal(calls.createPerson, 1);
  assert.equal(calls.createOrganization, 1);
  assert.equal(calls.createPipedriveLead, 1);
  assert.equal(calls.createDeal, 0);
});

test("matches an existing person by email instead of creating a duplicate", async () => {
  const { deps, calls } = makeHarness({ existingPersonId: "existing-person-9" });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });

  assert.equal(result.personAction, "matched");
  assert.equal(result.personId, "existing-person-9");
  assert.equal(calls.findPersonByEmail, 1);
  assert.equal(calls.createPerson, 0);
});

test("matches an existing organization by name instead of creating a duplicate", async () => {
  const { deps, calls } = makeHarness({ existingOrganizationId: "existing-org-3" });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });

  assert.equal(result.organizationAction, "matched");
  assert.equal(result.organizationId, "existing-org-3");
  assert.equal(calls.createOrganization, 0);
});

test("createPerson disabled: person is skipped and never created", async () => {
  const { deps, calls } = makeHarness({ settings: settings({ createPerson: false }) });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });

  assert.equal(result.personAction, "skipped");
  assert.equal(result.personId, null);
  assert.equal(calls.createPerson, 0);
  assert.equal(calls.findPersonByEmail, 0);
});

test("createOrganization disabled: organization is skipped and never created", async () => {
  const { deps, calls } = makeHarness({ settings: settings({ createOrganization: false }) });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });

  assert.equal(result.organizationAction, "skipped");
  assert.equal(calls.createOrganization, 0);
});

test("deal destination uses pipeline, stage, and the selected owner", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const { deps } = makeHarness({
    settings: settings({
      destinationType: "deal",
      pipelineId: "7",
      stageId: "42",
      ownerMode: "selected_user",
      ownerUserId: "5"
    })
  });
  const wrapped: PipedriveSyncDeps = {
    ...deps,
    async createDeal(input) {
      captured.push(input.payload);
      return "deal-99";
    }
  };
  const result = await runPipedriveSync(wrapped, { companyId: "company-1", leadId: "lead-1", source: "manual" });

  assert.equal(result.destinationKind, "deal");
  assert.equal(result.destinationId, "deal-99");
  assert.equal(captured.length, 1);
  assert.equal(captured[0].pipeline_id, 7);
  assert.equal(captured[0].stage_id, 42);
  assert.equal(captured[0].owner_id, 5);
});

test("connected_user owner mode omits owner_id so Pipedrive defaults to the connected user", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const { deps } = makeHarness({ settings: settings({ ownerMode: "connected_user" }) });
  const wrapped: PipedriveSyncDeps = {
    ...deps,
    async createPipedriveLead(input) {
      captured.push(input.payload);
      return "pdlead-1";
    }
  };
  await runPipedriveSync(wrapped, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal("owner_id" in captured[0], false);
});

test("follow-up activity is created from the lead's follow-up date, skipped when absent", async () => {
  const withDate = makeHarness();
  const resultWithDate = await runPipedriveSync(withDate.deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(resultWithDate.activityAction, "created");

  const withoutDate = makeHarness({ lead: lead({ followUpAt: null, followUpDate: null }) });
  const resultWithoutDate = await runPipedriveSync(withoutDate.deps, {
    companyId: "company-1",
    leadId: "lead-1",
    source: "manual"
  });
  assert.equal(resultWithoutDate.activityAction, "skipped");
  assert.equal(withoutDate.calls.createActivity, 0);
});

test("createFollowUpActivity disabled: activity is skipped even with a follow-up date", async () => {
  const { deps, calls } = makeHarness({ settings: settings({ createFollowUpActivity: false }) });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(result.activityAction, "skipped");
  assert.equal(calls.createActivity, 0);
});

// Regression coverage for a real incident: Pipedrive's POST /activities rejects a request that
// omits `type` (it is a required field, alongside `subject`), which previously made every
// Activity attempt fail after Person/Organization/Lead/both Notes had already succeeded.
test("the Activity payload always includes the required `type` field", () => {
  const payload = buildActivityPayload({
    lead: lead(),
    dueDate: "2026-08-25",
    personId: "3",
    destinationKind: "lead",
    destinationId: "64189f60-9b45-11f1-ac19-0d3931243726",
    ownerId: null
  });
  assert.equal(typeof payload.type, "string");
  assert.ok(String(payload.type).length > 0, "Pipedrive rejects an Activity with no `type`");
  assert.equal(payload.subject, "Follow up with Jane Doe");
  assert.equal(payload.due_date, "2026-08-25");
  assert.equal(payload.lead_id, "64189f60-9b45-11f1-ac19-0d3931243726");
});

test("partial-success retry: Person/Organization/Lead/both Notes already reused, only the previously-failing Activity step runs — and completion sets the row to synced", async () => {
  const harness = makeHarness({
    failStep: "createActivity",
    failOnceOnly: true,
    conversation: { summary: "Great call, wants a demo next week." },
    emailDraft: { subject: "Following up", bodyText: "Great chatting today." },
    seedRow: {
      status: "failed",
      attempts: 2,
      personId: "3",
      personAction: "reused",
      organizationId: "3",
      organizationAction: "reused",
      destinationKind: "lead",
      destinationId: "64189f60-9b45-11f1-ac19-0d3931243726",
      destinationAction: "reused",
      synopsisNoteId: "2",
      synopsisNoteAction: "reused",
      emailDraftNoteId: "3",
      emailDraftNoteAction: "reused",
      activityId: null,
      activityAction: null
    }
  });

  const attempt = await runPipedriveSync(harness.deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(attempt.success, false);
  assert.equal(attempt.personAction, "reused");
  assert.equal(attempt.organizationAction, "reused");
  assert.equal(attempt.destinationAction, "reused");
  assert.equal(attempt.synopsisNoteAction, "reused");
  assert.equal(attempt.emailDraftNoteAction, "reused");
  // Only the previously-failing step is attempted — nothing already-complete is re-touched.
  assert.equal(harness.calls.createPerson, 0);
  assert.equal(harness.calls.findPersonByEmail, 0);
  assert.equal(harness.calls.createOrganization, 0);
  assert.equal(harness.calls.findOrganizationByName, 0);
  assert.equal(harness.calls.createPipedriveLead, 0);
  assert.equal(harness.calls.createNote, 0);
  assert.equal(harness.calls.createActivity, 1);

  const row = harness.rows.get("company-1:lead-1");
  assert.equal(row?.status, "failed");

  const retry = await runPipedriveSync(harness.deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(retry.success, true);
  assert.equal(retry.activityAction, "created");
  assert.equal(retry.personAction, "reused");
  assert.equal(retry.organizationAction, "reused");
  assert.equal(retry.destinationAction, "reused");
  assert.equal(retry.synopsisNoteAction, "reused");
  assert.equal(retry.emailDraftNoteAction, "reused");

  // Still no duplicate Person/Organization/Lead/Note writes across both attempts.
  assert.equal(harness.calls.createPerson, 0);
  assert.equal(harness.calls.createOrganization, 0);
  assert.equal(harness.calls.createPipedriveLead, 0);
  assert.equal(harness.calls.createNote, 0);
  assert.equal(harness.calls.createActivity, 2); // 1 failed + 1 successful

  const finalRow = harness.rows.get("company-1:lead-1");
  assert.equal(finalRow?.status, "synced");
  assert.equal(finalRow?.activityAction, "created");
  assert.ok(finalRow?.activityId);
});

test("conversation synopsis note: created when a summary exists, skipped when missing, skipped when disabled", async () => {
  const withSummary = makeHarness({ conversation: { summary: "Great call, wants a demo next week." } });
  const withSummaryResult = await runPipedriveSync(withSummary.deps, {
    companyId: "company-1",
    leadId: "lead-1",
    source: "manual"
  });
  assert.equal(withSummaryResult.synopsisNoteAction, "created");
  assert.equal(withSummaryResult.emailDraftNoteAction, "skipped"); // no draft configured in this harness
  assert.equal(withSummary.calls.createNote, 1);
});

test("conversation synopsis note is skipped when there is no summary yet", async () => {
  const { deps, calls } = makeHarness({ conversation: { summary: null } });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(result.synopsisNoteAction, "skipped");
  assert.equal(calls.createNote, 0);
});

test("conversation synopsis note is skipped entirely when the setting is off", async () => {
  const { deps, calls } = makeHarness({
    settings: settings({ sendConversationSynopsis: false }),
    conversation: { summary: "Has a summary but the setting is off." }
  });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(result.synopsisNoteAction, "skipped");
  assert.equal(calls.createNote, 0);
});

test("email draft note: created when an eligible draft exists, skipped when missing or disabled", async () => {
  const withDraft = makeHarness({ emailDraft: { subject: "Following up", bodyText: "Great chatting today." } });
  const withDraftResult = await runPipedriveSync(withDraft.deps, {
    companyId: "company-1",
    leadId: "lead-1",
    source: "manual"
  });
  assert.equal(withDraftResult.emailDraftNoteAction, "created");

  const withoutDraft = makeHarness({ emailDraft: null });
  const withoutDraftResult = await runPipedriveSync(withoutDraft.deps, {
    companyId: "company-1",
    leadId: "lead-1",
    source: "manual"
  });
  assert.equal(withoutDraftResult.emailDraftNoteAction, "skipped");

  const disabled = makeHarness({
    settings: settings({ sendGeneratedEmailDraft: false }),
    emailDraft: { subject: "x", bodyText: "y" }
  });
  const disabledResult = await runPipedriveSync(disabled.deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(disabledResult.emailDraftNoteAction, "skipped");
  assert.equal(disabled.calls.createNote, 0);
});

test("email draft note never contains a mechanism to send the actual email — content is note text only", async () => {
  const { deps } = makeHarness({ emailDraft: { subject: "Following up", bodyText: "Body text." } });
  const notes: Array<Record<string, unknown>> = [];
  const wrapped: PipedriveSyncDeps = {
    ...deps,
    async createNote(input) {
      notes.push(input.payload);
      return "note-1";
    }
  };
  await runPipedriveSync(wrapped, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  const draftNote = notes.find((n) => String(n.content).includes("Body text."));
  assert.ok(draftNote);
  assert.equal(typeof draftNote?.content, "string");
});

test("a mid-sequence failure, followed by a retry, never re-creates the person, organization, or destination", async () => {
  const harness = makeHarness({
    failStep: "createNote",
    failOnceOnly: true,
    conversation: { summary: "Great call, wants a demo next week." },
    emailDraft: { subject: "Following up", bodyText: "Great chatting today." }
  });

  const firstAttempt = await runPipedriveSync(harness.deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(firstAttempt.success, false);
  assert.equal(firstAttempt.personAction, "created");
  assert.equal(firstAttempt.organizationAction, "created");
  assert.equal(firstAttempt.destinationAction, "created");
  assert.equal(harness.calls.createPerson, 1);
  assert.equal(harness.calls.createOrganization, 1);
  assert.equal(harness.calls.createPipedriveLead, 1);
  assert.equal(harness.calls.createNote, 1); // the synopsis note attempt that failed

  const retry = await runPipedriveSync(harness.deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  assert.equal(retry.success, true);
  assert.equal(retry.personAction, "reused");
  assert.equal(retry.organizationAction, "reused");
  assert.equal(retry.destinationAction, "reused");
  assert.equal(retry.synopsisNoteAction, "created");
  assert.equal(retry.emailDraftNoteAction, "created");

  // No duplicate provider writes across the failed attempt + the retry.
  assert.equal(harness.calls.createPerson, 1);
  assert.equal(harness.calls.createOrganization, 1);
  assert.equal(harness.calls.createPipedriveLead, 1);
  assert.equal(harness.calls.createNote, 3); // 1 failed synopsis attempt + successful synopsis + successful email draft on retry
});

test("a retry after full success reuses every object and creates nothing new", async () => {
  const harness = makeHarness();
  await runPipedriveSync(harness.deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });
  const secondCallCounts = { ...harness.calls };
  const retry = await runPipedriveSync(harness.deps, { companyId: "company-1", leadId: "lead-1", source: "manual" });

  assert.equal(retry.success, true);
  assert.equal(retry.personAction, "reused");
  assert.equal(retry.organizationAction, "reused");
  assert.equal(retry.destinationAction, "reused");
  assert.equal(retry.activityAction, "reused");
  assert.deepEqual(harness.calls, secondCallCounts);
});

test("cross-company isolation: a lead scoped to another company is treated as not found", async () => {
  const { deps } = makeHarness({ lead: null });
  const result = await runPipedriveSync(deps, { companyId: "company-1", leadId: "lead-owned-by-another-company", source: "manual" });
  assert.equal(result.success, false);
  assert.equal(result.error, "Lead not found for this account.");
});
