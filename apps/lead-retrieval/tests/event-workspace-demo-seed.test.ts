import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVENT_WORKSPACE_DEMO_BRIEF_COUNT,
  EVENT_WORKSPACE_DEMO_CONVERSATION_COUNT,
  EVENT_WORKSPACE_DEMO_LEAD_COUNT,
  buildEventWorkspaceSeedDataset,
  classifySupabaseTarget,
  eventWorkspaceSeedIdentity,
  executeEventWorkspaceDemoSeed,
  parseEventWorkspaceDemoArgs,
  type EventWorkspaceDemoArgs,
  type EventWorkspaceSeedEvent,
  type EventWorkspaceSeedRepResolution,
  type EventWorkspaceSeedRepository,
  type SeedRow,
  type SeedTable
} from "@/lib/demo/event-workspace-seed-core";
import { aggregateConversationField, type LiveConversationRow } from "@/lib/events/event-workspace-live-core";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-07-29T18:30:00.000Z");
const LOCAL = classifySupabaseTarget("http://127.0.0.1:54321");
const REMOTE = classifySupabaseTarget("https://demo-project.supabase.co");

function event(overrides: Partial<EventWorkspaceSeedEvent> = {}): EventWorkspaceSeedEvent {
  return {
    id: EVENT_ID,
    company_id: COMPANY_ID,
    name: "Signal Summit 2026",
    status: "ACTIVE",
    start_date: "2026-07-29",
    end_date: "2026-07-31",
    container_kind: "event",
    ...overrides
  };
}

function reps(count = 5): EventWorkspaceSeedRepResolution {
  return {
    reps: Array.from({ length: count }, (_, index) => ({
      id: `${String(index + 3).repeat(8)}-${String(index + 3).repeat(4)}-4${String(index + 3).repeat(3)}-8${String(index + 3).repeat(3)}-${String(index + 3).repeat(12)}`,
      full_name: `Rep ${index + 1}`,
      email: `rep${index + 1}@example.com`
    })),
    invalidMembershipCount: 0
  };
}

function args(overrides: Partial<EventWorkspaceDemoArgs> = {}): EventWorkspaceDemoArgs {
  return {
    eventId: EVENT_ID,
    scenario: "live",
    reset: false,
    mode: "dry-run",
    allowRemote: false,
    companyId: null,
    confirmEvent: null,
    allowLifecycleMismatch: false,
    ...overrides
  };
}

class MemoryRepository implements EventWorkspaceSeedRepository {
  readonly tables: Record<SeedTable, SeedRow[]> = {
    leads: [],
    lead_conversations: [],
    lead_briefings: []
  };
  writes: Array<{ op: "upsert" | "delete"; table: SeedTable; count: number }> = [];

  constructor(
    public targetEvent: EventWorkspaceSeedEvent | null = event(),
    public repResolution: EventWorkspaceSeedRepResolution = reps()
  ) {}

  async loadEvent(eventId: string) {
    if (!this.targetEvent || this.targetEvent.id !== eventId) return null;
    return structuredClone(this.targetEvent);
  }

  async loadReps(companyId: string, eventId: string) {
    assert.equal(companyId, this.targetEvent?.company_id);
    assert.equal(eventId, this.targetEvent?.id);
    return structuredClone(this.repResolution);
  }

  async loadRows(table: SeedTable, ids: readonly string[]) {
    const wanted = new Set(ids);
    return structuredClone(this.tables[table].filter((row) => wanted.has(row.id)));
  }

  externalDependencyCounts: Record<string, number> = {};

  async loadExternalDependencyCounts() {
    return structuredClone(this.externalDependencyCounts);
  }

  async upsertRows(table: SeedTable, rows: readonly SeedRow[]) {
    if (rows.length === 0) return;
    this.writes.push({ op: "upsert", table, count: rows.length });
    const byId = new Map(this.tables[table].map((row) => [row.id, row]));
    for (const row of rows) byId.set(row.id, structuredClone(row));
    this.tables[table] = [...byId.values()];
  }

  async deleteRows(table: SeedTable, ids: readonly string[]) {
    if (ids.length === 0) return;
    this.writes.push({ op: "delete", table, count: ids.length });
    const removing = new Set(ids);
    this.tables[table] = this.tables[table].filter((row) => !removing.has(row.id));
  }
}

describe("Event Workspace demo seed arguments", () => {
  it("accepts the documented live, post, and reset interfaces", () => {
    assert.equal(
      parseEventWorkspaceDemoArgs(["--event-id", EVENT_ID, "--scenario", "live", "--dry-run"]).scenario,
      "live"
    );
    assert.equal(
      parseEventWorkspaceDemoArgs([`--event-id=${EVENT_ID}`, "--scenario=post", "--apply"]).mode,
      "apply"
    );
    const reset = parseEventWorkspaceDemoArgs(["--event-id", EVENT_ID, "--reset", "--apply"]);
    assert.equal(reset.reset, true);
    assert.equal(reset.scenario, null);
  });

  it("rejects ambiguous modes, invalid scenarios, unknown flags, and missing targets", () => {
    assert.throws(() => parseEventWorkspaceDemoArgs(["--scenario", "live", "--dry-run"]), /event-id/);
    assert.throws(
      () => parseEventWorkspaceDemoArgs(["--event-id", EVENT_ID, "--scenario", "future", "--dry-run"]),
      /live, post/
    );
    assert.throws(
      () => parseEventWorkspaceDemoArgs(["--event-id", EVENT_ID, "--scenario", "live", "--dry-run", "--apply"]),
      /exactly one/
    );
    assert.throws(
      () => parseEventWorkspaceDemoArgs(["--event-id", EVENT_ID, "--scenario", "live", "--wat"]),
      /Unknown option/
    );
  });
});

describe("Event Workspace demo scenario content", () => {
  it("is deterministic for a fixed target/time and creates the required lead/conversation mixture", () => {
    const first = buildEventWorkspaceSeedDataset({ event: event(), reps: reps().reps, scenario: "live", now: NOW });
    const second = buildEventWorkspaceSeedDataset({ event: event(), reps: reps().reps, scenario: "live", now: NOW });
    assert.deepEqual(first, second);
    assert.equal(first.leads.length, EVENT_WORKSPACE_DEMO_LEAD_COUNT);
    assert.equal(first.conversations.length, EVENT_WORKSPACE_DEMO_CONVERSATION_COUNT);
    assert.equal(first.briefs.length, EVENT_WORKSPACE_DEMO_BRIEF_COUNT);
    const leadsWithConversations = new Set(first.conversations.map((row) => row.lead_id));
    assert.equal(leadsWithConversations.size, 30);
    assert.equal(first.leads.filter((row) => !leadsWithConversations.has(row.id)).length, 0);
    assert.equal(first.leads.filter((row) => row.temperature === "hot").length, 9);
    assert.equal(first.briefs.filter((row) => row.approval_status === "approved").length, 8);
    assert.ok(first.leads.every((row) => String(row.created_at).startsWith("2026-07-29")));
  });

  it("keeps every evidence-bearing conversation linked inside the selected event", () => {
    const dataset = buildEventWorkspaceSeedDataset({ event: event(), reps: reps().reps, scenario: "post", now: NOW });
    assert.equal(dataset.leads.length, 24);
    assert.equal(dataset.conversations.length, 26);
    const leadIds = new Set(dataset.leads.map((row) => row.id));
    assert.ok(dataset.conversations.every((row) => leadIds.has(String(row.lead_id))));
    assert.ok(dataset.leads.every((row) => row.event_id === EVENT_ID && row.company_id === COMPANY_ID));
    assert.ok(dataset.conversations.every((row) => Array.isArray(row.priority_themes)));
    assert.ok(dataset.conversations.every((row) => row.synthesis_status === "completed"));
  });

  it("gives the Live workspace varied, canonical competitor and buying-signal evidence", () => {
    const dataset = buildEventWorkspaceSeedDataset({ event: event(), reps: reps().reps, scenario: "live", now: NOW });
    const conversations = dataset.conversations as unknown as LiveConversationRow[];
    const competitors = aggregateConversationField(conversations, "competitors_mentioned", conversations.length);
    assert.deepEqual(
      competitors.map((row) => [row.label, row.conversationCount]),
      [["Cvent", 10], ["Bizzabo", 6], ["Whova", 4], ["Swapcard", 3]]
    );
    assert.ok(competitors.every((row) => row.evidence.length > 0));

    const messaging = aggregateConversationField(conversations, "buying_signals", conversations.length);
    assert.deepEqual(
      messaging.map((row) => [row.label, row.conversationCount]),
      [
        ["ROI / pipeline attribution", 13],
        ["Migration support and speed", 10],
        ["Lead-capture accuracy", 7],
        ["Native lead retrieval", 4]
      ]
    );
    assert.ok(messaging.every((row) => row.evidence.length > 0));
  });

  it("intentionally populates only schema-supported Live follow-up states", () => {
    const dataset = buildEventWorkspaceSeedDataset({ event: event(), reps: reps().reps, scenario: "live", now: NOW });
    const today = "2026-07-29";
    const open = dataset.leads.filter((row) => row.status !== "closed");
    assert.equal(open.filter((row) => row.temperature === "hot" && (!row.follow_up_date || row.follow_up_date <= today)).length, 8);
    assert.equal(open.filter((row) => row.follow_up_date === today).length, 3);
    assert.equal(open.filter((row) => typeof row.follow_up_date === "string" && row.follow_up_date < today).length, 3);
  });
});

describe("Event Workspace demo reconciliation", () => {
  it("dry-run validates and plans without performing writes", async () => {
    const repository = new MemoryRepository();
    const result = await executeEventWorkspaceDemoSeed({
      args: args(),
      environment: LOCAL,
      repository,
      now: NOW
    });
    assert.equal(result.created.total, 80);
    assert.equal(result.lifecycleMatches, true);
    assert.deepEqual(repository.writes, []);
    assert.equal(repository.tables.leads.length, 0);
  });

  it("local apply writes canonical rows and a second run is idempotent", async () => {
    const repository = new MemoryRepository();
    const applyArgs = args({ mode: "apply" });
    const first = await executeEventWorkspaceDemoSeed({ args: applyArgs, environment: LOCAL, repository, now: NOW });
    assert.equal(first.created.total, 80);
    assert.equal(repository.tables.leads.length, 30);
    assert.equal(repository.tables.lead_conversations.length, 38);
    assert.equal(repository.tables.lead_briefings.length, 12);
    const writesAfterFirst = repository.writes.length;

    const second = await executeEventWorkspaceDemoSeed({ args: applyArgs, environment: LOCAL, repository, now: NOW });
    assert.equal(second.created.total, 0);
    assert.equal(second.updated.total, 0);
    assert.equal(second.unchanged.total, 80);
    assert.equal(repository.writes.length, writesAfterFirst);
  });

  it("reset deletes only verified seeded rows and preserves pre-existing event data", async () => {
    const repository = new MemoryRepository();
    const preexisting: SeedRow = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      company_id: COMPANY_ID,
      event_id: EVENT_ID,
      full_name: "Real Customer Lead"
    };
    repository.tables.leads.push(preexisting);
    await executeEventWorkspaceDemoSeed({
      args: args({ mode: "apply" }),
      environment: LOCAL,
      repository,
      now: NOW
    });
    const result = await executeEventWorkspaceDemoSeed({
      args: args({ scenario: null, reset: true, mode: "apply" }),
      environment: LOCAL,
      repository,
      now: NOW
    });
    assert.equal(result.deleted.total, 80);
    assert.deepEqual(repository.tables.leads, [preexisting]);
    assert.equal(repository.tables.lead_conversations.length, 0);
    assert.equal(repository.tables.lead_briefings.length, 0);
    assert.deepEqual(repository.writes.slice(-3).map((write) => write.table), [
      "lead_briefings",
      "lead_conversations",
      "leads"
    ]);
  });

  it("refuses a deterministic lead ID collision without the private marker", async () => {
    const repository = new MemoryRepository();
    repository.tables.leads.push({
      id: eventWorkspaceSeedIdentity(EVENT_ID).leadIds[0]!,
      company_id: COMPANY_ID,
      event_id: EVENT_ID,
      full_name: "Pre-existing"
    });
    await assert.rejects(
      executeEventWorkspaceDemoSeed({ args: args(), environment: LOCAL, repository, now: NOW }),
      /collision or missing seed marker/
    );
    assert.deepEqual(repository.writes, []);
  });

  it("refuses reset when a seeded lead has non-seed dependent records", async () => {
    const repository = new MemoryRepository();
    await executeEventWorkspaceDemoSeed({
      args: args({ mode: "apply" }),
      environment: LOCAL,
      repository,
      now: NOW
    });
    repository.externalDependencyCounts = { campaign_recipients: 1 };
    await assert.rejects(
      executeEventWorkspaceDemoSeed({
        args: args({ scenario: null, reset: true, mode: "apply" }),
        environment: LOCAL,
        repository,
        now: NOW
      }),
      /non-seed dependent records: campaign_recipients=1/
    );
    assert.equal(repository.tables.leads.length, 30);
  });

  it("reports lifecycle mismatch and requires an explicit apply override", async () => {
    const completed = event({ status: "COMPLETED", start_date: "2026-07-20", end_date: "2026-07-22" });
    const repository = new MemoryRepository(completed);
    const dryRun = await executeEventWorkspaceDemoSeed({ args: args(), environment: LOCAL, repository, now: NOW });
    assert.equal(dryRun.lifecycle, "completed");
    assert.equal(dryRun.lifecycleMatches, false);
    assert.match(dryRun.warnings.join(" "), /does not match/);
    await assert.rejects(
      executeEventWorkspaceDemoSeed({ args: args({ mode: "apply" }), environment: LOCAL, repository, now: NOW }),
      /allow-lifecycle-mismatch/
    );
    const overridden = await executeEventWorkspaceDemoSeed({
      args: args({ mode: "apply", allowLifecycleMismatch: true }),
      environment: LOCAL,
      repository,
      now: NOW
    });
    assert.equal(overridden.created.total, 80);
  });

  it("rejects a missing event and surfaces invalid or absent rep relationships safely", async () => {
    await assert.rejects(
      executeEventWorkspaceDemoSeed({ args: args(), environment: LOCAL, repository: new MemoryRepository(null), now: NOW }),
      /Event not found/
    );
    const repository = new MemoryRepository(event(), { reps: [], invalidMembershipCount: 2 });
    const result = await executeEventWorkspaceDemoSeed({ args: args(), environment: LOCAL, repository, now: NOW });
    assert.match(result.warnings.join(" "), /ignored/);
    assert.match(result.warnings.join(" "), /no owner_user_id/i);
    const dataset = buildEventWorkspaceSeedDataset({ event: event(), reps: [], scenario: "live", now: NOW });
    assert.ok(dataset.leads.every((row) => row.owner_user_id === null));
  });
});

describe("Event Workspace remote safety", () => {
  const remoteBase = args({
    mode: "apply",
    allowRemote: true,
    companyId: COMPANY_ID,
    confirmEvent: "Signal Summit 2026"
  });

  it("blocks remote writes by default", async () => {
    await assert.rejects(
      executeEventWorkspaceDemoSeed({
        args: args({ mode: "apply" }),
        environment: REMOTE,
        repository: new MemoryRepository(),
        now: NOW
      }),
      /allow-remote/
    );
  });

  it("requires every explicit remote-write safety condition", async () => {
    const cases: Array<[Partial<EventWorkspaceDemoArgs>, RegExp, string | undefined]> = [
      [{ companyId: null }, /company-id/, COMPANY_ID],
      [{ confirmEvent: null }, /confirm-event/, COMPANY_ID],
      [{ confirmEvent: "signal summit 2026" }, /exactly match/, COMPANY_ID],
      [{}, /DEMO_SEED_ALLOWED_COMPANY_IDS/, undefined]
    ];
    for (const [override, expected, allowlist] of cases) {
      await assert.rejects(
        executeEventWorkspaceDemoSeed({
          args: { ...remoteBase, ...override },
          environment: REMOTE,
          repository: new MemoryRepository(),
          allowedCompanyIds: allowlist,
          now: NOW
        }),
        expected
      );
    }
  });

  it("rejects event/company mismatch and a non-allowlisted company", async () => {
    await assert.rejects(
      executeEventWorkspaceDemoSeed({
        args: { ...remoteBase, companyId: "99999999-9999-4999-8999-999999999999" },
        environment: REMOTE,
        repository: new MemoryRepository(),
        allowedCompanyIds: COMPANY_ID,
        now: NOW
      }),
      /does not belong/
    );
    await assert.rejects(
      executeEventWorkspaceDemoSeed({
        args: remoteBase,
        environment: REMOTE,
        repository: new MemoryRepository(),
        allowedCompanyIds: "99999999-9999-4999-8999-999999999999",
        now: NOW
      }),
      /not allowlisted/
    );
  });

  it("allows a fully confirmed remote target and keeps remote dry-run write-free", async () => {
    const applyRepository = new MemoryRepository();
    const applied = await executeEventWorkspaceDemoSeed({
      args: remoteBase,
      environment: REMOTE,
      repository: applyRepository,
      allowedCompanyIds: ` ${COMPANY_ID} `,
      now: NOW
    });
    assert.equal(applied.created.total, 80);

    const dryRepository = new MemoryRepository();
    const dry = await executeEventWorkspaceDemoSeed({
      args: args(),
      environment: REMOTE,
      repository: dryRepository,
      now: NOW
    });
    assert.equal(dry.created.total, 80);
    assert.deepEqual(dryRepository.writes, []);
  });
});
