import { createHash } from "node:crypto";
import {
  currentUtcYmd,
  resolveEventLifecycle,
  type EventWorkspaceLifecycle
} from "@/lib/events/event-lifecycle";

export const EVENT_WORKSPACE_DEMO_SEED_VERSION = 1;
export const EVENT_WORKSPACE_DEMO_SEED_SYSTEM = "event_workspace_demo";
export const EVENT_WORKSPACE_DEMO_LEAD_COUNT = 30;
export const EVENT_WORKSPACE_DEMO_CONVERSATION_COUNT = 38;
export const EVENT_WORKSPACE_DEMO_BRIEF_COUNT = 12;
const EVENT_WORKSPACE_DEMO_POST_LEAD_COUNT = 24;
const EVENT_WORKSPACE_DEMO_POST_CONVERSATION_COUNT = 26;

export type EventWorkspaceDemoScenario = "live" | "post";
export type EventWorkspaceDemoMode = "dry-run" | "apply";
export type SeedTable = "leads" | "lead_conversations" | "lead_briefings";
export type SeedRow = Record<string, unknown> & { id: string };

export type EventWorkspaceDemoArgs = {
  eventId: string;
  scenario: EventWorkspaceDemoScenario | null;
  reset: boolean;
  mode: EventWorkspaceDemoMode;
  allowRemote: boolean;
  companyId: string | null;
  confirmEvent: string | null;
  allowLifecycleMismatch: boolean;
};

export type EventWorkspaceSeedEvent = {
  id: string;
  company_id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  container_kind: string | null;
};

export type EventWorkspaceSeedRep = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type EventWorkspaceSeedRepResolution = {
  reps: EventWorkspaceSeedRep[];
  invalidMembershipCount: number;
};

export type EventWorkspaceSeedEnvironment = {
  url: string;
  host: string;
  isLocal: boolean;
};

export type EventWorkspaceSeedRepository = {
  loadEvent(eventId: string): Promise<EventWorkspaceSeedEvent | null>;
  loadReps(companyId: string, eventId: string): Promise<EventWorkspaceSeedRepResolution>;
  loadRows(table: SeedTable, ids: readonly string[]): Promise<SeedRow[]>;
  /** Rows outside this seed that would be deleted or mutated by a lead FK action. */
  loadExternalDependencyCounts(leadIds: readonly string[]): Promise<Record<string, number>>;
  upsertRows(table: SeedTable, rows: readonly SeedRow[]): Promise<void>;
  deleteRows(table: SeedTable, ids: readonly string[]): Promise<void>;
};

export type SeedMutationCounts = {
  leads: number;
  conversations: number;
  briefs: number;
  total: number;
};

export type EventWorkspaceSeedSummary = {
  event: EventWorkspaceSeedEvent;
  environment: EventWorkspaceSeedEnvironment;
  scenario: EventWorkspaceDemoScenario | "reset";
  lifecycle: EventWorkspaceLifecycle;
  lifecycleMatches: boolean | null;
  existingReps: EventWorkspaceSeedRep[];
  planned: {
    leads: number;
    conversations: number;
    evidenceRecords: number;
    followUps: number;
    briefs: number;
  };
  created: SeedMutationCounts;
  updated: SeedMutationCounts;
  unchanged: SeedMutationCounts;
  deleted: SeedMutationCounts;
  warnings: string[];
};

type SeedDataset = {
  leads: SeedRow[];
  conversations: SeedRow[];
  briefs: SeedRow[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALUE_FLAGS = new Set(["event-id", "scenario", "company-id", "confirm-event"]);
const BOOLEAN_FLAGS = new Set([
  "dry-run",
  "apply",
  "reset",
  "allow-remote",
  "allow-lifecycle-mismatch"
]);

function requireUuid(value: string, label: string): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return normalized;
}

export function parseEventWorkspaceDemoArgs(argv: readonly string[]): EventWorkspaceDemoArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index] ?? "";
    if (!raw.startsWith("--")) throw new Error(`Unexpected argument: ${raw}`);
    const body = raw.slice(2);
    const equalsAt = body.indexOf("=");
    const name = equalsAt >= 0 ? body.slice(0, equalsAt) : body;
    if (!VALUE_FLAGS.has(name) && !BOOLEAN_FLAGS.has(name)) {
      throw new Error(`Unknown option: --${name}`);
    }
    if (BOOLEAN_FLAGS.has(name)) {
      if (equalsAt >= 0) throw new Error(`--${name} does not accept a value.`);
      flags.add(name);
      continue;
    }
    let value = equalsAt >= 0 ? body.slice(equalsAt + 1) : "";
    if (equalsAt < 0) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`--${name} requires a value.`);
      value = next;
      index += 1;
    }
    if (!value.trim()) throw new Error(`--${name} requires a non-empty value.`);
    values.set(name, value.trim());
  }

  const dryRun = flags.has("dry-run");
  const apply = flags.has("apply");
  if (dryRun === apply) {
    throw new Error("Choose exactly one of --dry-run or --apply.");
  }

  const eventIdRaw = values.get("event-id");
  if (!eventIdRaw) throw new Error("--event-id is required.");
  const eventId = requireUuid(eventIdRaw, "--event-id");
  const reset = flags.has("reset");
  const scenarioRaw = String(values.get("scenario") ?? "").trim().toLowerCase();
  if (reset && scenarioRaw) throw new Error("--reset cannot be combined with --scenario.");
  if (!reset && !scenarioRaw) throw new Error("--scenario is required unless --reset is used.");
  if (scenarioRaw && scenarioRaw !== "live" && scenarioRaw !== "post") {
    throw new Error("--scenario must be one of: live, post.");
  }

  const companyIdRaw = values.get("company-id") ?? null;
  return {
    eventId,
    scenario: reset ? null : (scenarioRaw as EventWorkspaceDemoScenario),
    reset,
    mode: apply ? "apply" : "dry-run",
    allowRemote: flags.has("allow-remote"),
    companyId: companyIdRaw ? requireUuid(companyIdRaw, "--company-id") : null,
    confirmEvent: values.get("confirm-event") ?? null,
    allowLifecycleMismatch: flags.has("allow-lifecycle-mismatch")
  };
}

export function classifySupabaseTarget(rawUrl: string): EventWorkspaceSeedEnvironment {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Configured Supabase URL is invalid.");
  }
  const hostname = parsed.hostname.toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  return { url: parsed.toString(), host: parsed.host, isLocal };
}

function parseAllowedCompanyIds(raw: string | undefined): Set<string> {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function assertEventWorkspaceRemoteSafety(input: {
  args: EventWorkspaceDemoArgs;
  environment: EventWorkspaceSeedEnvironment;
  event: EventWorkspaceSeedEvent;
  allowedCompanyIds: string | undefined;
}): void {
  const { args, environment, event } = input;
  if (args.companyId && args.companyId !== event.company_id.toLowerCase()) {
    throw new Error("The selected event does not belong to --company-id.");
  }
  if (args.mode !== "apply" || environment.isLocal) return;
  if (!args.allowRemote) throw new Error("Remote writes require --allow-remote.");
  if (!args.companyId) throw new Error("Remote writes require --company-id.");
  if (!args.confirmEvent) throw new Error("Remote writes require --confirm-event with the exact event name.");
  if (args.confirmEvent !== event.name) throw new Error("--confirm-event does not exactly match the event name.");
  const allowed = parseAllowedCompanyIds(input.allowedCompanyIds);
  if (allowed.size === 0) throw new Error("Remote writes require DEMO_SEED_ALLOWED_COMPANY_IDS.");
  if (!allowed.has(event.company_id.toLowerCase())) {
    throw new Error("The event company is not allowlisted by DEMO_SEED_ALLOWED_COMPANY_IDS.");
  }
}

function deterministicUuid(name: string): string {
  const bytes = createHash("sha1")
    .update(`signal-thread:${EVENT_WORKSPACE_DEMO_SEED_SYSTEM}:${name}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function identityId(eventId: string, kind: "lead" | "conversation" | "brief", index: number): string {
  return deterministicUuid(`${eventId}:${kind}:${String(index + 1).padStart(2, "0")}`);
}

export function eventWorkspaceSeedIdentity(eventId: string): {
  leadIds: string[];
  conversationIds: string[];
  briefIds: string[];
} {
  const id = requireUuid(eventId, "event id");
  return {
    leadIds: Array.from({ length: EVENT_WORKSPACE_DEMO_LEAD_COUNT }, (_, index) =>
      identityId(id, "lead", index)
    ),
    conversationIds: Array.from({ length: EVENT_WORKSPACE_DEMO_CONVERSATION_COUNT }, (_, index) =>
      identityId(id, "conversation", index)
    ),
    briefIds: Array.from({ length: EVENT_WORKSPACE_DEMO_BRIEF_COUNT }, (_, index) =>
      identityId(id, "brief", index)
    )
  };
}

const PEOPLE = [
  ["Maya Patel", "VP, Revenue Operations", "Northstar Systems", "maya.patel@northstar.example"],
  ["Ethan Brooks", "Director of IT", "Lumen Financial", "ethan.brooks@lumen.example"],
  ["Sofia Ramirez", "Head of Events", "Meridian Cloud", "sofia.ramirez@meridian.example"],
  ["Noah Kim", "Sales Operations Lead", "Altitude Health", "noah.kim@altitude.example"],
  ["Priya Shah", "Identity Architect", "Vertex Labs", "priya.shah@vertex.example"],
  ["Lucas Martin", "Field Marketing Director", "HarborWorks", "lucas.martin@harborworks.example"],
  ["Ava Thompson", "Chief Revenue Officer", "Atlas Commerce", "ava.thompson@atlas.example"],
  ["Mateo Silva", "Enterprise Applications VP", "Beacon Logistics", "mateo.silva@beacon.example"],
  ["Emma Chen", "Demand Generation VP", "Cedar Analytics", "emma.chen@cedar.example"],
  ["Oliver Davis", "Event Technology Manager", "Delta Manufacturing", "oliver.davis@delta.example"],
  ["Isabella Moore", "Director, Sales Enablement", "Evergreen Media", "isabella.moore@evergreen.example"],
  ["Liam Wilson", "Security Engineering Lead", "Forge Security", "liam.wilson@forge.example"],
  ["Amelia Jackson", "Global Events VP", "Granite Software", "amelia.jackson@granite.example"],
  ["James Anderson", "CRM Product Owner", "Helix Energy", "james.anderson@helix.example"],
  ["Mia Taylor", "Regional Sales Director", "Ion Mobility", "mia.taylor@ion.example"],
  ["Benjamin White", "Marketing Operations Lead", "Juniper Retail", "benjamin.white@juniper.example"],
  ["Charlotte Harris", "VP, Enterprise Systems", "Keystone Foods", "charlotte.harris@keystone.example"],
  ["Henry Clark", "Revenue Technology Director", "Lakeview Capital", "henry.clark@lakeview.example"],
  ["Evelyn Lewis", "Senior Events Manager", "Monarch Bio", "evelyn.lewis@monarch.example"],
  ["Alexander Walker", "Procurement Director", "Noble Aerospace", "alexander.walker@noble.example"],
  ["Harper Hall", "Customer Marketing VP", "Orbit Telecom", "harper.hall@orbit.example"],
  ["Daniel Allen", "Solutions Architecture Lead", "Pioneer Data", "daniel.allen@pioneer.example"],
  ["Ella Young", "Growth Operations Director", "Quartz Networks", "ella.young@quartz.example"],
  ["Sebastian King", "Event Operations Director", "Redwood Robotics", "sebastian.king@redwood.example"],
  ["Grace Turner", "VP, Demand Generation", "Summit Foods", "grace.turner@summit.example"],
  ["Samuel Reed", "Director, Revenue Systems", "Tandem Health", "samuel.reed@tandem.example"],
  ["Nora Bennett", "Events Technology Lead", "Union Analytics", "nora.bennett@union.example"],
  ["Victor Flores", "Enterprise Applications Director", "Valley Transit", "victor.flores@valley.example"],
  ["Zoe Morgan", "Head of Field Marketing", "Willow Commerce", "zoe.morgan@willow.example"],
  ["Caleb Wright", "IT Transformation Lead", "Xenon Manufacturing", "caleb.wright@xenon.example"]
] as const;

const TOPICS = [
  "SSO / SAML provisioning",
  "Migration planning",
  "Lead-retrieval accuracy",
  "Onsite badge printing",
  "ROI and pipeline attribution",
  "Enterprise pricing"
] as const;
const OBJECTIONS = [
  "Pricing for larger deployments",
  "Migration risk and implementation effort",
  "Onsite badge printer reliability"
] as const;
const COMPETITORS = ["Cvent", "Bizzabo", "iCapture"] as const;
const REP_PATTERNS = [
  "Connects ROI messaging to pipeline attribution",
  "Uses deployment specifics to answer technical concerns"
] as const;
const BUYING_SIGNALS = [
  "Requested an implementation plan",
  "Confirmed an active evaluation timeline",
  "Asked to include security and RevOps stakeholders",
  "Requested enterprise pricing"
] as const;

type LiveConversationSignals = {
  topic: string;
  objection: string | null;
  competitor: string | null;
  buyingSignal: string | null;
};

/**
 * The Live workspace reads these persisted synthesis arrays directly. The
 * unequal ranges intentionally produce useful, non-mechanical evidence bars
 * without introducing a dashboard-only fixture or aggregate.
 */
function liveConversationSignals(index: number): LiveConversationSignals {
  const topic =
    index < 13
      ? "Lead-retrieval accuracy"
      : index < 23
        ? "Migration planning"
        : index < 30
          ? "Onsite badge printing"
          : index < 35
            ? "SSO / SAML provisioning"
            : "Enterprise pricing";
  const objection =
    index < 10
      ? "Migration risk and implementation effort"
      : index < 18
        ? "Pricing for larger deployments"
        : index < 24
          ? "Onsite badge printer reliability"
          : index < 29
            ? "Contract or incumbent-platform concerns"
            : null;
  const competitor =
    index < 10 ? "Cvent" : index < 16 ? "Bizzabo" : index < 20 ? "Whova" : index < 23 ? "Swapcard" : null;
  const buyingSignal =
    index < 13
      ? "ROI / pipeline attribution"
      : index < 23
        ? "Migration support and speed"
        : index < 30
          ? "Lead-capture accuracy"
          : index < 34
            ? "Native lead retrieval"
            : null;
  return { topic, objection, competitor, buyingSignal };
}

function dateAtUtc(ymd: string, hours: number, minutes: number): string {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function addUtcDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function postAnchorYmd(event: EventWorkspaceSeedEvent, now: Date): string {
  const candidate = String(event.end_date ?? event.start_date ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  return addUtcDays(currentUtcYmd(now), -1);
}

function leadFollowUp(input: {
  scenario: EventWorkspaceDemoScenario;
  index: number;
  todayYmd: string;
}): { status: "new" | "follow_up" | "closed"; followUpDate: string | null } {
  const { scenario, index, todayYmd } = input;
  if (scenario === "live") {
    if ([10, 15, 20].includes(index)) return { status: "closed", followUpDate: addUtcDays(todayYmd, -1) };
    if ([3, 4, 12].includes(index)) return { status: "follow_up", followUpDate: addUtcDays(todayYmd, -1 - (index % 2)) };
    if ([5, 6, 13].includes(index)) return { status: "follow_up", followUpDate: todayYmd };
    if ([7, 11, 14, 17].includes(index)) return { status: "follow_up", followUpDate: addUtcDays(todayYmd, 1 + (index % 3)) };
    return { status: "new", followUpDate: null };
  }
  if ([10, 11, 16, 17, 21, 22].includes(index)) {
    return { status: "closed", followUpDate: addUtcDays(todayYmd, -2 - (index % 3)) };
  }
  if ([3, 4, 5, 12].includes(index)) {
    return { status: "follow_up", followUpDate: addUtcDays(todayYmd, -1 - (index % 3)) };
  }
  if ([6, 7, 8, 13, 14, 18].includes(index)) {
    return { status: "follow_up", followUpDate: addUtcDays(todayYmd, 1 + (index % 4)) };
  }
  return { status: "new", followUpDate: null };
}

function temperatureFor(index: number): "hot" | "warm" | "cold" {
  if (index < 9) return "hot";
  if (index < 18) return "warm";
  return "cold";
}

function leadCreatedAt(
  scenario: EventWorkspaceDemoScenario,
  index: number,
  todayYmd: string,
  event: EventWorkspaceSeedEvent,
  now: Date
): string {
  if (scenario === "live") return dateAtUtc(todayYmd, 8 + Math.floor(index / 4), (index % 4) * 11);
  const anchor = postAnchorYmd(event, now);
  return dateAtUtc(addUtcDays(anchor, -2 + Math.floor(index / 8)), 9 + (index % 8), (index % 3) * 13);
}

function conversationLeadIndex(index: number): number {
  return index < 16 ? Math.floor(index / 2) : 8 + (index - 16);
}

function markerFor(event: EventWorkspaceSeedEvent, key: string, scenario: EventWorkspaceDemoScenario) {
  return {
    demo_seed: {
      system: EVENT_WORKSPACE_DEMO_SEED_SYSTEM,
      version: EVENT_WORKSPACE_DEMO_SEED_VERSION,
      event_id: event.id,
      company_id: event.company_id,
      scenario,
      key
    }
  };
}

function briefingContent(leadId: string, person: (typeof PEOPLE)[number], scenario: EventWorkspaceDemoScenario) {
  return {
    linkage: { published_lead_id: leadId },
    headline: `${person[0]} is evaluating event lead capture with a focus on ${scenario === "post" ? "post-event follow-up readiness" : "live operational accuracy"}.`,
    whyHere: [
      `${person[1]} at ${person[2]} with influence over event technology and revenue workflows.`,
      "The evaluation connects lead-retrieval accuracy, CRM handoff, and measurable pipeline attribution."
    ],
    questionsToAsk: [
      "Where does the current badge-to-CRM workflow lose accuracy or time?",
      "Which security, migration, and attribution requirements determine a successful rollout?"
    ],
    talkingPoints: [
      {
        title: "Make event capture operationally reliable",
        detail: "Connect accurate onsite capture to governed CRM handoff and clear follow-up ownership."
      },
      {
        title: "Prove value with an attribution-ready workflow",
        detail: "Frame ROI around faster first touch, cleaner records, and campaign-ready cohorts."
      }
    ],
    signalsToWatch: ["Requests implementation timing", "Brings security or RevOps into the evaluation"],
    competitorContext: "The buyer is comparing integrated event platforms and point lead-capture tools."
  };
}

export function buildEventWorkspaceSeedDataset(input: {
  event: EventWorkspaceSeedEvent;
  reps: readonly EventWorkspaceSeedRep[];
  scenario: EventWorkspaceDemoScenario;
  now: Date;
}): SeedDataset {
  const { event, scenario, now } = input;
  const todayYmd = currentUtcYmd(now);
  const ids = eventWorkspaceSeedIdentity(event.id);
  const leadIds = scenario === "live" ? ids.leadIds : ids.leadIds.slice(0, EVENT_WORKSPACE_DEMO_POST_LEAD_COUNT);
  const conversationIds =
    scenario === "live"
      ? ids.conversationIds
      : ids.conversationIds.slice(0, EVENT_WORKSPACE_DEMO_POST_CONVERSATION_COUNT);
  const reps = input.reps.slice(0, 5);

  const leads = leadIds.map((id, index): SeedRow => {
    const person = PEOPLE[index]!;
    const temperature = temperatureFor(index);
    const followUp = leadFollowUp({ scenario, index, todayYmd });
    const createdAt = leadCreatedAt(scenario, index, todayYmd, event, now);
    return {
      id,
      company_id: event.company_id,
      event_id: event.id,
      owner_user_id: reps.length > 0 ? reps[index % reps.length]!.id : null,
      full_name: person[0],
      job_title: person[1],
      company_text: person[2],
      email: person[3],
      temperature,
      priority_score: temperature === "hot" ? 88 - (index % 5) : temperature === "warm" ? 55 : 24,
      rating: temperature === "hot" ? 5 : temperature === "warm" ? 4 : 3,
      status: followUp.status,
      follow_up_date: followUp.followUpDate,
      industry: index % 3 === 0 ? "Technology" : index % 3 === 1 ? "Financial Services" : "Manufacturing",
      seniority: index % 4 === 0 ? "VP" : "Director",
      intent_signals: temperature === "hot" ? [BUYING_SIGNALS[index % BUYING_SIGNALS.length]] : [],
      metadata: markerFor(event, `lead-${String(index + 1).padStart(2, "0")}`, scenario),
      created_at: createdAt
    };
  });

  const conversations = conversationIds.map((id, index): SeedRow => {
    const leadIndex = conversationLeadIndex(index);
    const lead = leads[leadIndex]!;
    const liveSignals = scenario === "live" ? liveConversationSignals(index) : null;
    const primaryTopic = liveSignals?.topic ?? TOPICS[index % TOPICS.length];
    const secondaryTopic = liveSignals ? null : TOPICS[(index + 2) % TOPICS.length];
    const objection = liveSignals?.objection ?? OBJECTIONS[index % OBJECTIONS.length];
    const competitor = liveSignals?.competitor
      ? [liveSignals.competitor]
      : scenario === "live"
        ? []
        : index % 3 === 0
          ? [COMPETITORS[index % COMPETITORS.length]]
          : [];
    const buyingSignal = liveSignals?.buyingSignal ?? BUYING_SIGNALS[index % BUYING_SIGNALS.length];
    const anchor = scenario === "live" ? todayYmd : postAnchorYmd(event, now);
    const createdAt =
      scenario === "live"
        ? dateAtUtc(anchor, 9 + Math.floor(index / 5), (index % 5) * 9)
        : dateAtUtc(addUtcDays(anchor, -2 + Math.floor(index / 10)), 9 + (index % 9), (index % 4) * 7);
    const version = index < 16 && index % 2 === 1 ? 2 : 1;
    return {
      id,
      lead_id: lead.id,
      storage_path: `demo/event-workspace/${event.id}/${id}.txt`,
      content_type: "text/plain",
      conversation_version: version,
      transcription_status: "completed",
      transcription_error: null,
      transcript: `Rep discussed ${primaryTopic} with ${String(lead.full_name)}.${objection ? ` The buyer raised ${objection.toLowerCase()}.` : ""}${competitor[0] ? ` They compared the rollout with ${competitor[0]}.` : ""}${buyingSignal ? ` They responded positively to ${buyingSignal.toLowerCase()} and asked for supporting details.` : ""}`,
      transcribed_at: createdAt,
      synthesis_status: "completed",
      synthesis_error: null,
      synthesized_at: createdAt,
      summary: `${String(lead.full_name)} discussed ${primaryTopic.toLowerCase()}${secondaryTopic ? ` alongside ${secondaryTopic.toLowerCase()}` : ""}.${objection ? ` They raised ${objection.toLowerCase()}.` : ""}${competitor[0] ? ` ${competitor[0]} came up in the evaluation.` : ""}${buyingSignal ? ` They showed positive interest in ${buyingSignal.toLowerCase()}.` : ""}`,
      sentiment: "Engaged and commercially specific",
      problem_severity: index % 4 === 0 ? "high" : "moderate",
      buying_intent: index % 3 === 0 ? "active evaluation" : "qualified interest",
      objections: objection ? [objection] : [],
      next_steps: [
        `Send the ${primaryTopic.toLowerCase()} implementation brief.`,
        "Confirm the follow-up owner and evaluation timeline."
      ],
      competitors_mentioned: competitor,
      pain_points: ["Inaccurate or delayed lead handoff", "Manual post-event reconciliation"],
      feature_requests: index % 4 === 0 ? ["Configurable enterprise provisioning"] : [],
      buying_signals: buyingSignal ? [buyingSignal] : [],
      operational_pains: ["Badge scans require manual cleanup before CRM import"],
      workflow_constraints: ["Follow-up ownership must remain visible to RevOps"],
      technical_constraints: index % 2 === 0 ? ["SAML and SCIM are required for rollout"] : [],
      desired_outcomes: ["Accurate leads and faster first follow-up"],
      adoption_risks: ["Floor teams cannot absorb a complex capture workflow"],
      management_visibility_needs: ["Show ROI and pipeline attribution by event"],
      business_process_concerns: objection ? [objection] : [],
      product_objections: index % 3 === 0 ? ["Needs proof of onsite reliability"] : [],
      rep_behavior_patterns: [REP_PATTERNS[index % REP_PATTERNS.length]],
      priority_themes: [primaryTopic, secondaryTopic],
      created_at: createdAt
    };
  });

  const briefs = ids.briefIds.map((id, index): SeedRow => {
    const lead = leads[index]!;
    const approved = index < 8;
    const reviewer = reps.length > 0 ? reps[index % reps.length]!.id : null;
    return {
      id,
      lead_id: lead.id,
      company_id: event.company_id,
      content: briefingContent(lead.id, PEOPLE[index]!, scenario),
      approval_status: approved ? "approved" : "pending",
      reviewed_by: approved ? reviewer : null,
      reviewed_at: approved ? String(lead.created_at) : null,
      created_at: String(lead.created_at)
    };
  });

  return { leads, conversations, briefs };
}

function emptyCounts(): SeedMutationCounts {
  return { leads: 0, conversations: 0, briefs: 0, total: 0 };
}

function counts(leads: number, conversations: number, briefs: number): SeedMutationCounts {
  return { leads, conversations, briefs, total: leads + conversations + briefs };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

function rowMatches(existing: SeedRow, desired: SeedRow): boolean {
  const comparable = Object.fromEntries(Object.keys(desired).map((key) => [key, existing[key]]));
  return JSON.stringify(stableValue(comparable)) === JSON.stringify(stableValue(desired));
}

function markerIsValid(row: SeedRow, event: EventWorkspaceSeedEvent): boolean {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const marker = (metadata as Record<string, unknown>).demo_seed;
  if (!marker || typeof marker !== "object") return false;
  const value = marker as Record<string, unknown>;
  return (
    value.system === EVENT_WORKSPACE_DEMO_SEED_SYSTEM &&
    value.version === EVENT_WORKSPACE_DEMO_SEED_VERSION &&
    value.event_id === event.id &&
    value.company_id === event.company_id
  );
}

function assertNoIdentityCollisions(input: {
  event: EventWorkspaceSeedEvent;
  leads: readonly SeedRow[];
  conversations: readonly SeedRow[];
  briefs: readonly SeedRow[];
  expectedLeadIds: ReadonlySet<string>;
}): void {
  for (const row of input.leads) {
    if (
      String(row.company_id ?? "") !== input.event.company_id ||
      String(row.event_id ?? "") !== input.event.id ||
      !markerIsValid(row, input.event)
    ) {
      throw new Error(`Refusing to touch lead ${row.id}: deterministic ID collision or missing seed marker.`);
    }
  }
  for (const row of [...input.conversations, ...input.briefs]) {
    if (!input.expectedLeadIds.has(String(row.lead_id ?? ""))) {
      throw new Error(`Refusing to touch ${row.id}: child row is not linked to a seeded lead.`);
    }
  }
}

function splitRows(desired: readonly SeedRow[], existing: readonly SeedRow[]) {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const created: SeedRow[] = [];
  const updated: SeedRow[] = [];
  let unchanged = 0;
  for (const row of desired) {
    const current = byId.get(row.id);
    if (!current) created.push(row);
    else if (rowMatches(current, row)) unchanged += 1;
    else updated.push(row);
  }
  return { created, updated, unchanged, writes: [...created, ...updated] };
}

function lifecycleForScenario(scenario: EventWorkspaceDemoScenario): EventWorkspaceLifecycle {
  return scenario === "live" ? "live" : "completed";
}

function followUpCount(leads: readonly SeedRow[]): number {
  return leads.filter((row) => row.follow_up_date != null || row.status === "closed").length;
}

export async function executeEventWorkspaceDemoSeed(input: {
  args: EventWorkspaceDemoArgs;
  environment: EventWorkspaceSeedEnvironment;
  repository: EventWorkspaceSeedRepository;
  allowedCompanyIds?: string;
  now?: Date;
}): Promise<EventWorkspaceSeedSummary> {
  const now = input.now ?? new Date();
  const event = await input.repository.loadEvent(input.args.eventId);
  if (!event) throw new Error(`Event not found: ${input.args.eventId}`);
  event.id = requireUuid(event.id, "event.id");
  event.company_id = requireUuid(event.company_id, "event.company_id");
  assertEventWorkspaceRemoteSafety({
    args: input.args,
    environment: input.environment,
    event,
    allowedCompanyIds: input.allowedCompanyIds
  });

  const lifecycle = resolveEventLifecycle(event, currentUtcYmd(now)).state;
  const repsResolution = await input.repository.loadReps(event.company_id, event.id);
  const warnings: string[] = [];
  if (repsResolution.invalidMembershipCount > 0) {
    warnings.push(
      `${repsResolution.invalidMembershipCount} event membership record(s) were ignored because their user/company relationship was invalid.`
    );
  }
  if (repsResolution.reps.length === 0) {
    warnings.push("No valid assigned reps were found; seeded leads will have no owner_user_id.");
  } else if (repsResolution.reps.length < 4) {
    warnings.push(
      `Only ${repsResolution.reps.length} valid assigned rep(s) were found; records will be distributed among them.`
    );
  }

  const identity = eventWorkspaceSeedIdentity(event.id);
  const [existingLeads, existingConversations, existingBriefs] = await Promise.all([
    input.repository.loadRows("leads", identity.leadIds),
    input.repository.loadRows("lead_conversations", identity.conversationIds),
    input.repository.loadRows("lead_briefings", identity.briefIds)
  ]);
  const expectedLeadIds = new Set(identity.leadIds);
  assertNoIdentityCollisions({
    event,
    leads: existingLeads,
    conversations: existingConversations,
    briefs: existingBriefs,
    expectedLeadIds
  });

  if (input.args.reset) {
    const externalDependencies = await input.repository.loadExternalDependencyCounts(
      existingLeads.map((row) => row.id)
    );
    const blockingDependencies = Object.entries(externalDependencies).filter(([, count]) => count > 0);
    if (blockingDependencies.length > 0) {
      throw new Error(
        `Refusing reset because seeded leads have non-seed dependent records: ${blockingDependencies
          .map(([table, count]) => `${table}=${count}`)
          .join(", ")}. Remove or preserve those records explicitly before retrying.`
      );
    }
    const deleted = counts(existingLeads.length, existingConversations.length, existingBriefs.length);
    if (input.args.mode === "apply") {
      await input.repository.deleteRows("lead_briefings", existingBriefs.map((row) => row.id));
      await input.repository.deleteRows(
        "lead_conversations",
        existingConversations.map((row) => row.id)
      );
      await input.repository.deleteRows("leads", existingLeads.map((row) => row.id));
    }
    return {
      event,
      environment: input.environment,
      scenario: "reset",
      lifecycle,
      lifecycleMatches: null,
      existingReps: repsResolution.reps.slice(0, 5),
      planned: {
        leads: existingLeads.length,
        conversations: existingConversations.length,
        evidenceRecords: existingConversations.length,
        followUps: 0,
        briefs: existingBriefs.length
      },
      created: emptyCounts(),
      updated: emptyCounts(),
      unchanged: emptyCounts(),
      deleted,
      warnings
    };
  }

  const scenario = input.args.scenario!;
  const lifecycleMatches = lifecycle === lifecycleForScenario(scenario);
  if (!lifecycleMatches) {
    warnings.push(`Scenario '${scenario}' does not match the event lifecycle '${lifecycle}'.`);
    if (input.args.mode === "apply" && !input.args.allowLifecycleMismatch) {
      throw new Error(
        `Scenario '${scenario}' does not match lifecycle '${lifecycle}'. Re-run with --allow-lifecycle-mismatch to apply intentionally.`
      );
    }
  }

  const dataset = buildEventWorkspaceSeedDataset({
    event,
    reps: repsResolution.reps,
    scenario,
    now
  });
  const leadSplit = splitRows(dataset.leads, existingLeads);
  const conversationSplit = splitRows(dataset.conversations, existingConversations);
  const briefSplit = splitRows(dataset.briefs, existingBriefs);
  const created = counts(leadSplit.created.length, conversationSplit.created.length, briefSplit.created.length);
  const updated = counts(leadSplit.updated.length, conversationSplit.updated.length, briefSplit.updated.length);
  const unchanged = counts(leadSplit.unchanged, conversationSplit.unchanged, briefSplit.unchanged);

  if (input.args.mode === "apply") {
    await input.repository.upsertRows("leads", leadSplit.writes);
    await input.repository.upsertRows("lead_conversations", conversationSplit.writes);
    await input.repository.upsertRows("lead_briefings", briefSplit.writes);
  }

  return {
    event,
    environment: input.environment,
    scenario,
    lifecycle,
    lifecycleMatches,
    existingReps: repsResolution.reps.slice(0, 5),
    planned: {
      leads: dataset.leads.length,
      conversations: dataset.conversations.length,
      evidenceRecords: dataset.conversations.length,
      followUps: followUpCount(dataset.leads),
      briefs: dataset.briefs.length
    },
    created,
    updated,
    unchanged,
    deleted: emptyCounts(),
    warnings
  };
}
