import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  createMarketingService,
  MarketingServiceError,
  type MarketingServiceUser,
} from "@/src/server/services/marketing";
import {
  createMarketingUnsubscribeToken,
  verifyMarketingUnsubscribeToken,
} from "@/src/server/services/marketing-unsubscribe";
import type {
  EmailProvider,
  MarketingBatchResult,
  MarketingBatchSend,
} from "@/src/server/email/provider";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MARKETING_SERVICE_SOURCE = path.join(process.cwd(), "src/server/services/marketing.ts");

function readMarketingServiceSource(): string {
  return readFileSync(MARKETING_SERVICE_SOURCE, "utf8");
}

const ORG_A = uuid(1);
const EVENT_A = uuid(10);
const EVENT_OTHER = uuid(11);
const EDITOR = uuid(21);
const VIEWER = uuid(22);
const OUTSIDER = uuid(23);

const editor: MarketingServiceUser = { id: EDITOR, orgId: ORG_A, role: UserRole.MEMBER };
const viewer: MarketingServiceUser = { id: VIEWER, orgId: ORG_A, role: UserRole.MEMBER };
const outsider: MarketingServiceUser = { id: OUTSIDER, orgId: ORG_A, role: UserRole.MEMBER };

process.env.MARKETING_UNSUBSCRIBE_TOKEN_SECRET = "test-marketing-unsubscribe-secret";
process.env.MARKETING_PUBLIC_BASE_URL = "https://planner.example.com";

test("marketing email approvals reuse the canonical task service and marker-backed event tasks", () => {
  const source = readMarketingServiceSource();

  assert.match(source, /import \{ createTaskService \} from "@\/src\/server\/services\/tasks"/);
  assert.match(source, /MARKETING_EMAIL_APPROVAL_MARKER = "marketing-email-approval:v1"/);
  assert.match(source, /marketingEmailApprovalDescription/);
  assert.match(source, /approvalUrl/);
  assert.match(source, /\/events\/\$\{input\.eventId\}\/marketing\?emailSendId=\$\{input\.emailSendId\}/);
  assert.match(source, /taskService\.createManualTask\(user, \{/);
  assert.match(source, /assigneeUserIds: \[approverUserId\]/);
  assert.match(source, /watcherUserIds: \[user\.id\]/);
  assert.match(source, /links: \[\{ objectType: "EVENT", objectId: send\.eventId \}\]/);
  assert.match(source, /taskService\.completeTask\(user, task\.id\)/);
  assert.match(source, /taskService\.blockTask\(user, task\.id, note\)/);
  assert.match(source, /taskService\.updateTask\(user, task\.id, \{/);
});

test("marketing send and schedule paths fail closed while approval is pending", () => {
  const source = readMarketingServiceSource();

  assert.match(source, /async function requireNoActiveApproval/);
  assert.match(source, /Email send is pending approval and cannot be sent or scheduled yet\./);
  assert.match(source, /async scheduleEmailSend/);
  assert.match(source, /await requireNoActiveApproval\(send\);/);
  assert.match(source, /async sendEmailNow/);
  assert.match(source, /await requireNoActiveApproval\(send\);/);
  assert.doesNotMatch(source, /MarketingEmailSendStatus\.PENDING_APPROVAL/);
  assert.doesNotMatch(source, /MarketingEmailSendStatus\.APPROVED/);
});

let idCounter = 1000;
function nextId(): string {
  idCounter += 1;
  return uuid(idCounter);
}

type Row = Record<string, unknown>;
type ServiceDeps = Parameters<typeof createMarketingService>[0];

function uniqueViolationError(): Error & { code: string } {
  const error = new Error("Unique constraint failed") as Error & { code: string };
  error.code = "P2002";
  return error;
}

function relationId(value: unknown, action: "connect" | "disconnect"): string | null {
  if (typeof value !== "object" || value === null || !(action in value)) return null;
  const relation = value as Record<string, unknown>;
  if (action === "disconnect") return relation.disconnect ? "" : null;
  const connect = relation.connect;
  if (typeof connect !== "object" || connect === null) return null;
  const id = (connect as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

function applySelect(row: Row | null, select?: Record<string, unknown>): Row | null {
  if (!row || !select) return row ? { ...row } : null;
  const out: Row = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out;
}

class FakePrisma {
  events: Row[] = [
    { id: EVENT_A, orgId: ORG_A, clientId: null, name: "PlannerConf", startDate: new Date("2026-04-10T00:00:00.000Z"), endDate: new Date("2026-04-12T00:00:00.000Z") },
    { id: EVENT_OTHER, orgId: ORG_A, clientId: null, name: "Other Event", startDate: new Date("2026-05-10T00:00:00.000Z"), endDate: null },
  ];
  audiences: Row[] = [];
  audienceRecipients: Row[] = [];
  campaigns: Row[] = [];
  plans: Row[] = [];
  sends: Row[] = [];
  sendRecipients: Row[] = [];
  emailEvents: Row[] = [];
  suppressions: Row[] = [];
  directoryPeople: Row[] = [];
  directoryModuleLinks: Row[] = [];

  activities: Row[] = [];

  event = {
    findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) =>
      applySelect(this.events.find((e) => e.id === where.id) ?? null, select),
  };

  // Canonical event-activity audit sink (minimal stub for the marketing service).
  user = {
    findUnique: async () => ({ name: null, email: null }),
  };
  eventActivity = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: nextId(), createdAt: new Date(), ...data };
      this.activities.push(row);
      return { ...row };
    },
    upsert: async ({ create }: { create: Row }) => {
      const row = { id: nextId(), createdAt: new Date(), ...create };
      this.activities.push(row);
      return { ...row };
    },
  };

  marketingAudience = {
    findMany: async ({ where }: { where: { eventId: string } }) =>
      this.audiences.filter((a) => a.eventId === where.eventId).map((a) => ({ ...a })),
    create: async ({ data }: { data: Row }) => {
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
      this.audiences.push(row);
      return { ...row };
    },
    findUnique: async ({
      where,
      select,
      include,
    }: {
      where: { id: string };
      select?: Record<string, unknown>;
      include?: { recipients?: unknown };
    }) => {
      const row = this.audiences.find((a) => a.id === where.id) ?? null;
      if (!row) return null;
      if (include?.recipients) {
        return {
          ...row,
          recipients: this.audienceRecipients.filter((r) => r.audienceId === row.id).map((r) => ({ ...r })),
        };
      }
      return applySelect(row, select);
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.audiences.find((a) => a.id === where.id);
      if (!row) throw new Error("audience not found");
      if (
        data.recipientCount &&
        typeof data.recipientCount === "object" &&
        "increment" in data.recipientCount &&
        typeof data.recipientCount.increment === "number"
      ) {
        row.recipientCount = Number(row.recipientCount) + data.recipientCount.increment;
      } else if (
        data.recipientCount &&
        typeof data.recipientCount === "object" &&
        "decrement" in data.recipientCount &&
        typeof data.recipientCount.decrement === "number"
      ) {
        row.recipientCount = Number(row.recipientCount) - data.recipientCount.decrement;
      } else if (typeof data.recipientCount === "number") {
        row.recipientCount = data.recipientCount;
      }
      if (typeof data.name !== "undefined") row.name = data.name;
      if (typeof data.sourceLabel !== "undefined") row.sourceLabel = data.sourceLabel;
      row.updatedAt = new Date();
      return { ...row };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.audiences.findIndex((a) => a.id === where.id);
      if (index < 0) throw new Error("audience not found");
      const [row] = this.audiences.splice(index, 1);
      this.audienceRecipients = this.audienceRecipients.filter((r) => r.audienceId !== where.id);
      return { ...row };
    },
  };

  marketingAudienceRecipient = {
    create: async ({ data }: { data: Row }) => {
      const dup = this.audienceRecipients.find(
        (r) => r.audienceId === data.audienceId && r.normalizedEmail === data.normalizedEmail,
      );
      if (dup) {
        throw uniqueViolationError();
      }
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
      this.audienceRecipients.push(row);
      return { ...row };
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = this.audienceRecipients.find((r) => r.id === where.id);
      return row ? { ...row } : null;
    },
    findMany: async ({ where }: { where: { audienceId: string } }) =>
      this.audienceRecipients.filter((r) => r.audienceId === where.audienceId).map((r) => ({ ...r })),
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.audienceRecipients.find((r) => r.id === where.id);
      if (!row) throw new Error("recipient not found");
      const dup = this.audienceRecipients.find(
        (r) => r.id !== where.id && r.audienceId === row.audienceId && r.normalizedEmail === data.normalizedEmail,
      );
      if (dup) {
        throw uniqueViolationError();
      }
      Object.assign(row, data);
      row.updatedAt = new Date();
      return { ...row };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.audienceRecipients.findIndex((r) => r.id === where.id);
      if (index < 0) throw new Error("recipient not found");
      const [row] = this.audienceRecipients.splice(index, 1);
      return { ...row };
    },
  };

  eventDirectoryPerson = {
    findMany: async ({ where, select, orderBy }: { where: Row; select?: Row; orderBy?: Row[] }) => {
      let rows = this.directoryPeople.filter((person) => this.matchesDirectoryPersonWhere(person, where));
      if (orderBy) {
        rows = [...rows].sort((a, b) => {
          const updatedDiff =
            (b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0) -
            (a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0);
          if (updatedDiff !== 0) return updatedDiff;
          return String(a.id).localeCompare(String(b.id));
        });
      }
      return rows.map((row) => applySelect({ ...row, roles: row.roles }, select) as Row);
    },
  };

  eventDirectoryModuleLink = {
    create: async ({ data }: { data: Row }) => {
      if (
        this.directoryModuleLinks.some(
          (link) =>
            link.eventId === data.eventId &&
            link.module === data.module &&
            link.moduleRecordId === data.moduleRecordId,
        )
      ) {
        throw uniqueViolationError();
      }
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
      this.directoryModuleLinks.push(row);
      return { ...row };
    },
  };

  private matchesDirectoryPersonWhere(person: Row, where: Row): boolean {
    if (!where) return true;
    if (Array.isArray(where.AND) && !where.AND.every((clause) => this.matchesDirectoryPersonWhere(person, clause as Row))) {
      return false;
    }
    if (Array.isArray(where.OR) && !where.OR.some((clause) => this.matchesDirectoryPersonWhere(person, clause as Row))) {
      return false;
    }
    if (where.eventId && person.eventId !== where.eventId) return false;
    if (where.id && typeof where.id === "object" && "in" in where.id) {
      if (!(where.id.in as unknown[]).includes(person.id)) return false;
    }
    if (where.status) {
      if (typeof where.status === "object" && "notIn" in where.status) {
        if ((where.status.notIn as unknown[]).includes(person.status)) return false;
      } else if (typeof where.status === "object" && "in" in where.status) {
        if (!(where.status.in as unknown[]).includes(person.status)) return false;
      } else if (person.status !== where.status) {
        return false;
      }
    }
    if (where.roles && typeof where.roles === "object" && "some" in where.roles) {
      const some = where.roles.some as Row;
      const roles = (person.roles as Row[]) ?? [];
      const matchesRole = roles.some((role) => {
        if (!some.role) return true;
        if (typeof some.role === "object" && "in" in some.role) {
          return (some.role.in as unknown[]).includes(role.role);
        }
        return role.role === some.role;
      });
      if (!matchesRole) return false;
    }
    const searchClauses = ["displayName", "firstName", "lastName", "email", "company"] as const;
    for (const key of searchClauses) {
      const filter = where[key];
      if (filter && typeof filter === "object" && "contains" in filter) {
        const haystack = String(person[key] ?? "").toLowerCase();
        if (!haystack.includes(String(filter.contains).toLowerCase())) return false;
      }
    }
    return true;
  }

  marketingCampaign = {
    findMany: async ({ where }: { where: { eventId: string } }) =>
      this.campaigns.filter((c) => c.eventId === where.eventId).map((c) => ({ ...c })),
    create: async ({ data }: { data: Row }) => {
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
      this.campaigns.push(row);
      return { ...row };
    },
    findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) =>
      applySelect(this.campaigns.find((c) => c.id === where.id) ?? null, select),
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.campaigns.find((c) => c.id === where.id);
      if (!row) throw new Error("campaign not found");
      for (const [key, value] of Object.entries(data)) {
        if (key === "marketingPlan") {
          const connectId = relationId(value, "connect");
          if (connectId) row.marketingPlanId = connectId;
          if (relationId(value, "disconnect") === "") row.marketingPlanId = null;
          continue;
        }
        row[key] = value;
      }
      row.updatedAt = new Date();
      return { ...row };
    },
  };

  marketingPlan = {
    findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) =>
      applySelect(this.plans.find((p) => p.id === where.id) ?? null, select),
  };

  marketingEmailSend = {
    findMany: async ({ where, orderBy, include }: { where: Row; orderBy?: Row; include?: Row }) => {
      let rows = this.sends.filter((s) => s.eventId === where.eventId);
      if (where.status) rows = rows.filter((s) => s.status === where.status);
      const scheduledFilter = where.scheduledSendAt;
      if (
        scheduledFilter &&
        typeof scheduledFilter === "object" &&
        "lte" in scheduledFilter &&
        scheduledFilter.lte instanceof Date
      ) {
        const lte = scheduledFilter.lte;
        rows = rows.filter((s) => s.scheduledSendAt instanceof Date && s.scheduledSendAt <= lte);
      }
      if (orderBy && "scheduledSendAt" in orderBy) {
        rows = [...rows].sort(
          (a, b) =>
            (a.scheduledSendAt instanceof Date ? a.scheduledSendAt.getTime() : 0) -
            (b.scheduledSendAt instanceof Date ? b.scheduledSendAt.getTime() : 0),
        );
      }
      return rows.map((s) => ({
        ...s,
        ...(include?.recipients
          ? { recipients: this.sendRecipients.filter((r) => r.emailSendId === s.id).map((r) => ({ ...r })) }
          : {}),
      }));
    },
    create: async ({ data }: { data: Row }) => {
      const row = {
        id: nextId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        recipientCount: 0,
        actualSentAt: null,
        canceledAt: null,
        canceledByUserId: null,
        failureReason: null,
        sendAttemptCount: 0,
        lastAttemptedAt: null,
        sendgridBatchId: null,
        deliveredCount: 0,
        openCount: 0,
        clickCount: 0,
        bounceCount: 0,
        unsubscribeCount: 0,
        ...data,
      };
      this.sends.push(row);
      return { ...row };
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = this.sends.find((s) => s.id === where.id);
      return row ? { ...row } : null;
    },
    count: async ({ where }: { where: { audienceId: string } }) =>
      this.sends.filter((s) => s.audienceId === where.audienceId).length,
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.sends.find((s) => s.id === where.id);
      if (!row) throw new Error("send not found");
      for (const [key, value] of Object.entries(data)) {
        if (key === "audience") {
          const connectId = relationId(value, "connect");
          if (connectId) row.audienceId = connectId;
          if (relationId(value, "disconnect") === "") row.audienceId = null;
          continue;
        }
        if (key === "ownerUser") {
          const connectId = relationId(value, "connect");
          if (connectId) row.ownerUserId = connectId;
          if (relationId(value, "disconnect") === "") row.ownerUserId = null;
          continue;
        }
        if (typeof value === "object" && value && "increment" in value) {
          row[key] = Number(row[key] ?? 0) + Number(value.increment ?? 0);
          continue;
        }
        row[key] = value;
      }
      row.updatedAt = new Date();
      return { ...row };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const row of this.sends) {
        if (where.id && row.id !== where.id) continue;
        if (where.eventId && row.eventId !== where.eventId) continue;
        if (where.status) {
          if (typeof where.status === "object" && where.status && "in" in where.status) {
            const allowed = where.status.in as unknown[];
            if (!allowed.includes(row.status)) continue;
          } else if (row.status !== where.status) {
            continue;
          }
        }
        Object.entries(data).forEach(([key, value]) => {
          if (key === "sendAttemptCount" && typeof value === "object" && value && "increment" in value) {
            row.sendAttemptCount = Number(row.sendAttemptCount ?? 0) + Number(value.increment ?? 0);
          } else {
            row[key] = value;
          }
        });
        row.updatedAt = new Date();
        count += 1;
      }
      return { count };
    },
  };

  marketingEmailSendRecipient = {
    createMany: async ({ data }: { data: Row[] }) => {
      for (const item of data) {
        this.sendRecipients.push({ createdAt: new Date(), updatedAt: new Date(), ...item });
      }
      return { count: data.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.sendRecipients.find((r) => r.id === where.id);
      if (!row) throw new Error("send recipient not found");
      Object.assign(row, data);
      row.updatedAt = new Date();
      return { ...row };
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = this.sendRecipients.find((r) => r.id === where.id);
      return row ? { ...row } : null;
    },
    findFirst: async ({ where }: { where: Row }) => {
      const row = this.sendRecipients.find((r) => {
        if (where.emailSendId && r.emailSendId !== where.emailSendId) return false;
        if (where.normalizedEmail && r.normalizedEmail !== where.normalizedEmail) return false;
        if (where.sendgridMessageId && r.sendgridMessageId !== where.sendgridMessageId) return false;
        return true;
      });
      return row ? { ...row } : null;
    },
    findMany: async ({ where }: { where: Row }) =>
      this.sendRecipients
        .filter((r) => {
          if (where.emailSendId && r.emailSendId !== where.emailSendId) return false;
          if (where.sendgridMessageId && r.sendgridMessageId !== where.sendgridMessageId) return false;
          return true;
        })
        .map((r) => ({ ...r })),
  };

  marketingEmailEvent = {
    create: async ({ data }: { data: Row }) => {
      if (this.emailEvents.some((event) => event.sgEventId === data.sgEventId)) {
        throw uniqueViolationError();
      }
      const row = { id: nextId(), createdAt: new Date(), ...data };
      this.emailEvents.push(row);
      return { ...row };
    },
  };

  marketingSuppression = {
    findMany: async ({ where, select }: { where: { eventId: string }; select?: Record<string, unknown> }) =>
      this.suppressions
        .filter((s) => s.eventId === where.eventId)
        .map((s) => applySelect(s, select) as Row),
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = this.suppressions.find((s) => s.id === where.id);
      return row ? { ...row } : null;
    },
    upsert: async ({ where, update, create }: { where: { eventId_normalizedEmail: { eventId: string; normalizedEmail: string } }; update: Row; create: Row }) => {
      const key = where.eventId_normalizedEmail;
      const row = this.suppressions.find((s) => s.eventId === key.eventId && s.normalizedEmail === key.normalizedEmail);
      if (row) {
        Object.assign(row, update);
        return { ...row };
      }
      const created = { id: nextId(), createdAt: new Date(), ...create };
      this.suppressions.push(created);
      return { ...created };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.suppressions.findIndex((s) => s.id === where.id);
      if (index < 0) throw new Error("suppression not found");
      const [row] = this.suppressions.splice(index, 1);
      return { ...row };
    },
  };
}

type AccessCall = { eventId: string; userId: string; accessType: string };

function makeService(prisma: FakePrisma, provider?: EmailProvider, now?: () => Date) {
  const accessCalls: AccessCall[] = [];
  const service = createMarketingService({
    prisma: prisma as unknown as ServiceDeps["prisma"],
    provider,
    now,
    assertEventAccess: async (eventId, user, accessType) => {
      accessCalls.push({ eventId, userId: user.id, accessType });
      if (user.id === OUTSIDER) {
        throw new MarketingServiceError("No event access", 403, "NO_EVENT_ACCESS");
      }
      if (accessType === "write" && user.id === VIEWER) {
        throw new MarketingServiceError("Read-only", 403, "EVENT_VIEWER_READ_ONLY");
      }
    },
  });
  return { service, accessCalls };
}

class RecordingProvider implements EmailProvider {
  readonly name = "recording";
  calls: MarketingBatchSend[] = [];
  private resultIndex = 0;
  constructor(private mode: "sent" | "failed" | "mixed" = "sent") {}

  async send() {
    return { status: "SKIPPED_NO_PROVIDER" as const };
  }

  async sendMarketingBatch(batch: MarketingBatchSend): Promise<MarketingBatchResult> {
    this.calls.push(batch);
    const results = batch.recipients.map((recipient) => {
      let status: "SENT" | "FAILED" = "SENT";
      if (this.mode === "failed") status = "FAILED";
      if (this.mode === "mixed") status = this.resultIndex % 2 === 0 ? "SENT" : "FAILED";
      this.resultIndex += 1;
      return {
        emailSendRecipientId: recipient.emailSendRecipientId,
        status,
        providerMessageId: status === "SENT" ? `msg-${this.resultIndex}` : undefined,
      };
    });
    const sentCount = results.filter((r) => r.status === "SENT").length;
    return {
      batchId: "batch-1",
      sentCount,
      failedCount: results.length - sentCount,
      skippedCount: 0,
      results,
    };
  }
}

async function seedAudienceWithRecipients(
  service: ReturnType<typeof makeService>["service"],
  prisma: FakePrisma,
  emails: string[],
) {
  const audience = await service.createAudience(editor, EVENT_A, { name: "List" });
  await service.importRecipients(
    editor,
    audience.id,
    emails.map((email, i) => ({ email, firstName: `First${i}`, lastName: "Last" })),
  );
  return audience;
}

function seedDirectoryPeople(prisma: FakePrisma) {
  prisma.directoryPeople.push(
    {
      id: uuid(301),
      eventId: EVENT_A,
      displayName: "Ada Attendee",
      firstName: "Ada",
      lastName: "Attendee",
      email: "ada@example.com",
      company: "Analytical",
      title: "Engineer",
      status: "ACTIVE",
      updatedAt: new Date("2026-03-01T12:00:00.000Z"),
      roles: [{ role: "ATTENDEE" }],
    },
    {
      id: uuid(302),
      eventId: EVENT_A,
      displayName: "Grace Hopper",
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.com",
      company: "Navy",
      title: "Admiral",
      status: "ACTIVE",
      updatedAt: new Date("2026-03-02T12:00:00.000Z"),
      roles: [{ role: "REGISTRANT" }],
    },
    {
      id: uuid(303),
      eventId: EVENT_A,
      displayName: "No Email",
      firstName: "No",
      lastName: "Email",
      email: null,
      company: "Missing",
      title: null,
      status: "ACTIVE",
      updatedAt: new Date("2026-03-03T12:00:00.000Z"),
      roles: [{ role: "ATTENDEE" }],
    },
    {
      id: uuid(304),
      eventId: EVENT_OTHER,
      displayName: "Other Event Person",
      firstName: "Other",
      lastName: "Person",
      email: "other@example.com",
      company: "Elsewhere",
      title: null,
      status: "ACTIVE",
      updatedAt: new Date("2026-03-04T12:00:00.000Z"),
      roles: [{ role: "ATTENDEE" }],
    },
  );
}

async function seedSentMarketingSend(prisma: FakePrisma, emails = ["one@example.com"]) {
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider, () => new Date("2026-03-01T12:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(service, prisma, emails);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "Webhook Campaign" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "Webhook test",
    bodyText: "Hello",
    fromEmail: "from@example.com",
  });
  await service.sendEmailNow(editor, send.id);
  return { service, send, provider };
}

test("audience import succeeds and counts valid rows", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  const audience = await service.createAudience(editor, EVENT_A, { name: "VIPs", sourceLabel: "2026 list" });

  const result = await service.importRecipients(editor, audience.id, [
    { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", company: "Analytical", title: "Eng" },
    { firstName: "Alan", lastName: "Turing", email: "alan@example.com" },
  ]);

  assert.equal(result.imported, 2);
  assert.equal(result.duplicates, 0);
  assert.equal(result.invalid.length, 0);
  assert.equal(prisma.audienceRecipients.length, 2);
  assert.equal(prisma.audiences[0].recipientCount, 2);
  assert.equal(prisma.audienceRecipients[0].normalizedEmail, "ada@example.com");
});

test("audience import de-dupes by email within batch and against existing rows", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  const audience = await service.createAudience(editor, EVENT_A, { name: "List" });

  const first = await service.importRecipients(editor, audience.id, [
    { email: "dup@example.com", firstName: "A" },
    { email: "DUP@example.com", firstName: "B" }, // same normalized email in batch
    { email: "unique@example.com" },
  ]);
  assert.equal(first.imported, 2);
  assert.equal(first.duplicates, 1);

  const second = await service.importRecipients(editor, audience.id, [
    { email: "dup@example.com" }, // already in DB
    { email: "new@example.com" },
  ]);
  assert.equal(second.imported, 1);
  assert.equal(second.duplicates, 1);
  assert.equal(prisma.audienceRecipients.length, 3);
  assert.equal(prisma.audiences[0].recipientCount, 3);
});

test("audience import preserves row-level failures without aborting the whole import", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  const audience = await service.createAudience(editor, EVENT_A, { name: "List" });

  const result = await service.importRecipients(editor, audience.id, [
    { email: "good@example.com" },
    { email: "" }, // missing
    { email: "not-an-email" }, // malformed
    { firstName: "NoEmail" }, // missing email field
    { email: "good2@example.com" },
  ]);

  assert.equal(result.imported, 2);
  assert.equal(result.invalid.length, 3);
  assert.deepEqual(
    result.invalid.map((i) => i.index).sort(),
    [1, 2, 3],
  );
  assert.equal(prisma.audienceRecipients.length, 2);
});

test("directory audiences can be created from manually selected people", async () => {
  const prisma = new FakePrisma();
  seedDirectoryPeople(prisma);
  const { service, accessCalls } = makeService(prisma);

  const result = await service.createAudienceFromDirectory(editor, EVENT_A, {
    name: "Selected attendees",
    selectionMode: "manual",
    personIds: [uuid(301), uuid(302), uuid(303), uuid(304)],
  });

  assert.equal(result.selectionMode, "manual");
  assert.equal(result.selectedCount, 3);
  assert.equal(result.imported, 2);
  assert.equal(result.skippedNoEmail, 1);
  assert.equal(result.audience.sourceLabel, "Event Directory");
  assert.equal(prisma.audiences[0].recipientCount, 2);
  assert.deepEqual(
    prisma.audienceRecipients.map((recipient) => recipient.email).sort(),
    ["ada@example.com", "grace@example.com"],
  );
  assert.equal(prisma.directoryModuleLinks.length, 2);
  assert.deepEqual(
    prisma.directoryModuleLinks.map((link) => link.personId).sort(),
    [uuid(301), uuid(302)],
  );
  assert.equal(prisma.directoryPeople.length, 4);
  assert.equal(accessCalls.at(-1)?.accessType, "write");
});

test("directory audiences can be created from all people matching filtered directory attendees", async () => {
  const prisma = new FakePrisma();
  seedDirectoryPeople(prisma);
  const { service } = makeService(prisma);

  const result = await service.createAudienceFromDirectory(editor, EVENT_A, {
    name: "Filtered attendees",
    selectionMode: "filtered",
    filters: {
      summaryFilter: "attendees",
      search: "a",
    },
  });

  assert.equal(result.selectionMode, "filtered");
  assert.equal(result.selectedCount, 3);
  assert.equal(result.imported, 2);
  assert.equal(prisma.audienceRecipients.every((recipient) => recipient.eventId === EVENT_A), true);
  assert.equal(prisma.audienceRecipients.some((recipient) => recipient.email === "other@example.com"), false);
  assert.equal(prisma.directoryModuleLinks.every((link) => link.module === "MARKETING_RECIPIENT"), true);
});

test("directory audience creation preserves event scope and rejects unauthorized writers", async () => {
  const prisma = new FakePrisma();
  seedDirectoryPeople(prisma);
  const { service } = makeService(prisma);

  await assert.rejects(
    () =>
      service.createAudienceFromDirectory(viewer, EVENT_A, {
        name: "Denied",
        selectionMode: "manual",
        personIds: [uuid(301)],
      }),
    (error) => error instanceof MarketingServiceError && error.status === 403,
  );

  await assert.rejects(
    () =>
      service.createAudienceFromDirectory(editor, EVENT_A, {
        name: "Scoped",
        selectionMode: "manual",
        personIds: [uuid(304)],
      }),
    (error) => error instanceof MarketingServiceError && /No matching Event Directory people/.test(error.message),
  );

  assert.equal(prisma.audiences.length, 0);
  assert.equal(prisma.audienceRecipients.length, 0);
  assert.equal(prisma.directoryModuleLinks.length, 0);
});

test("audience and recipient management mutate only the live audience", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  const audience = await service.createAudience(editor, EVENT_A, { name: "Original", sourceLabel: "old.csv" });

  const updatedAudience = await service.updateAudience(editor, audience.id, {
    name: "Renamed",
    sourceLabel: "new.csv",
  });
  assert.equal(updatedAudience.name, "Renamed");
  assert.equal(updatedAudience.sourceLabel, "new.csv");

  const added = await service.addRecipient(editor, audience.id, {
    email: "ada@example.com",
    firstName: "Ada",
    company: "Analytical",
  });
  assert.equal(prisma.audiences[0].recipientCount, 1);

  const updatedRecipient = await service.updateRecipient(editor, audience.id, added.id, {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    title: "Founder",
    registrationType: "VIP",
    status: "Confirmed",
  });
  assert.equal(updatedRecipient.lastName, "Lovelace");
  assert.equal(updatedRecipient.status, "Confirmed");

  await service.deleteRecipient(editor, audience.id, added.id);
  assert.equal(prisma.audienceRecipients.length, 0);
  assert.equal(prisma.audiences[0].recipientCount, 0);
});

test("audience delete is allowed only before the audience is linked to a send", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);

  const deletable = await service.createAudience(editor, EVENT_A, { name: "Unused" });
  const deleted = await service.deleteAudience(editor, deletable.id);
  assert.equal(deleted.deleted, true);

  const linked = await service.createAudience(editor, EVENT_A, { name: "Linked" });
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: linked.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });

  await assert.rejects(
    () => service.deleteAudience(editor, linked.id),
    (error: unknown) =>
      error instanceof MarketingServiceError &&
      error.status === 409 &&
      error.reason === "AUDIENCE_LINKED_TO_SEND",
  );
  assert.equal(prisma.audiences.some((row) => row.id === linked.id), true);
});

test("campaign create and update transition fields and status", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);

  const campaign = await service.createCampaign(editor, EVENT_A, { name: "Spring Promo" });
  assert.equal(campaign.status, "DRAFT");
  assert.equal(campaign.ownerUserId, EDITOR);

  const updated = await service.updateCampaign(editor, campaign.id, {
    name: "Spring Promo v2",
    status: "ACTIVE",
  });
  assert.equal(updated.name, "Spring Promo v2");
  assert.equal(updated.status, "ACTIVE");

  await assert.rejects(
    () => service.updateCampaign(editor, campaign.id, { status: "NOPE" as unknown as string }),
    (error: unknown) => error instanceof MarketingServiceError && error.status === 400,
  );
});

test("send-now freezes recipients from the audience and calls the provider with recipient-scoped unsubscribe content", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider);

  const audience = await seedAudienceWithRecipients(service, prisma, [
    "one@example.com",
    "two@example.com",
    "three@example.com",
  ]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "Blast" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "Hello",
    bodyHtml: "<p>Hi</p>",
    bodyText: "Hi",
    fromEmail: "from@example.com",
  });

  const result = await service.sendEmailNow(editor, send.id);

  assert.equal(provider.calls.length, 3, "provider called once per recipient so unsubscribe links stay recipient-scoped");
  assert.equal(provider.calls[0].recipients.length, 1);
  assert.equal(provider.calls[0].recipients[0].to, "one@example.com");
  assert.ok(provider.calls[0].recipients[0].emailSendRecipientId, "recipient id passed for webhook mapping");
  assert.ok(provider.calls[0].html?.includes("Unsubscribe from this event's marketing emails"));
  assert.ok(provider.calls[0].text?.includes("https://planner.example.com/marketing/unsubscribe/"));

  assert.equal(result.summary.recipientCount, 3);
  assert.equal(result.summary.sentCount, 3);
  assert.equal(result.send.status, "SENT");
  assert.equal(prisma.sendRecipients.length, 3);
  for (const frozen of prisma.sendRecipients) {
    assert.equal(frozen.providerStatus, "SENT");
    assert.ok(frozen.sourceAudienceRecipientId, "snapshot keeps provenance pointer");
    assert.ok(frozen.processedAt instanceof Date);
  }
});

test("send-now renders merge fields for each frozen recipient", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider);

  const audience = await service.createAudience(editor, EVENT_A, { name: "List" });
  await service.importRecipients(editor, audience.id, [
    {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical",
      title: "Founder",
      registrationType: "VIP",
      status: "Confirmed",
    },
    { email: "blank@example.com" },
  ]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "Blast" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "Hi {{firstName}} from {{eventName}}",
    bodyHtml: "<p>{{firstName}} {{lastName}} {{company}} {{eventStartDate}}</p>",
    bodyText: "{{title}} {{registrationType}} {{status}} {{eventEndDate}}",
    fromEmail: "from@example.com",
  });

  await service.sendEmailNow(editor, send.id);

  assert.equal(provider.calls.length, 2, "merge sends render one provider call per recipient");
  assert.equal(provider.calls[0].subject, "Hi Ada from PlannerConf");
  assert.ok(provider.calls[0].html?.startsWith("<p>Ada Lovelace Analytical 2026-04-10</p>"));
  assert.ok(provider.calls[0].html?.includes("Unsubscribe from this event's marketing emails"));
  assert.ok(provider.calls[0].text?.startsWith("Founder VIP Confirmed 2026-04-12"));
  assert.ok(provider.calls[0].text?.includes("https://planner.example.com/marketing/unsubscribe/"));
  assert.equal(provider.calls[1].subject, "Hi  from PlannerConf");
  assert.ok(provider.calls[1].html?.startsWith("<p>   2026-04-10</p>"));
});

test("preview email renders recipient and event merge fields with blanks for missing values", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);

  const audience = await service.createAudience(editor, EVENT_A, { name: "List" });
  await service.importRecipients(editor, audience.id, [
    {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical",
      title: "Founder",
      registrationType: "VIP",
      status: "Confirmed",
    },
    { email: "blank@example.com" },
  ]);

  const preview = await service.previewEmail(viewer, EVENT_A, {
    audienceId: audience.id,
    subject: "Hi {{firstName}} from {{eventName}}",
    previewText: "{{registrationType}} {{status}}",
    bodyText: "{{email}} {{title}} {{company}} {{eventStartDate}} {{eventEndDate}}",
  });

  assert.equal(preview.recipient.email, "ada@example.com");
  assert.equal(preview.rendered.subject, "Hi Ada from PlannerConf");
  assert.equal(preview.rendered.previewText, "VIP Confirmed");
  assert.ok(preview.rendered.bodyText?.startsWith("ada@example.com Founder Analytical 2026-04-10 2026-04-12"));
  assert.ok(preview.rendered.bodyText?.includes("https://example.com/marketing/unsubscribe/preview"));

  const blankPreview = await service.previewEmail(editor, EVENT_A, {
    audienceId: audience.id,
    recipientId: prisma.audienceRecipients[1].id,
    subject: "Hi {{firstName}}",
    bodyText: "{{company}} {{title}} {{eventName}}",
  });
  assert.equal(blankPreview.rendered.subject, "Hi ");
  assert.ok(blankPreview.rendered.bodyText?.startsWith("  PlannerConf"));
});

test("send-now freeze is immune to later audience edits", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider);

  const audience = await seedAudienceWithRecipients(service, prisma, ["a@example.com", "b@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "Blast" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "Hello",
    bodyText: "Hi",
    fromEmail: "from@example.com",
  });
  await service.sendEmailNow(editor, send.id);
  assert.equal(prisma.sendRecipients.length, 2);

  // Add more recipients after the send; frozen snapshot must not change.
  await service.importRecipients(editor, audience.id, [{ email: "c@example.com" }]);
  assert.equal(prisma.sendRecipients.length, 2);
});

test("send-now excludes suppressed recipients", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider);

  const audience = await seedAudienceWithRecipients(service, prisma, ["keep@example.com", "blocked@example.com"]);
  prisma.suppressions.push({ id: nextId(), eventId: EVENT_A, normalizedEmail: "blocked@example.com" });

  const campaign = await service.createCampaign(editor, EVENT_A, { name: "Blast" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "Hello",
    bodyText: "Hi",
    fromEmail: "from@example.com",
  });
  const result = await service.sendEmailNow(editor, send.id);

  assert.equal(result.summary.recipientCount, 1);
  assert.equal(result.summary.skippedSuppressedCount, 1);
  assert.equal(provider.calls[0].recipients[0].to, "keep@example.com");
  assert.equal(prisma.sendRecipients.find((row) => row.normalizedEmail === "blocked@example.com")?.providerStatus, "SUPPRESSED");
});

test("marketing unsubscribe token verifies payload and rejects tampering", () => {
  const token = createMarketingUnsubscribeToken({
    v: 1,
    eventId: EVENT_A,
    emailSendId: uuid(120),
    emailSendRecipientId: uuid(121),
    email: "person@example.com",
  });

  assert.deepEqual(verifyMarketingUnsubscribeToken(token), {
    v: 1,
    eventId: EVENT_A,
    emailSendId: uuid(120),
    emailSendRecipientId: uuid(121),
    email: "person@example.com",
  });

  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.throws(() => verifyMarketingUnsubscribeToken(tampered));
});

test("public unsubscribe service creates suppression and marks recipient unsubscribed once", async () => {
  const prisma = new FakePrisma();
  const { service, send } = await seedSentMarketingSend(prisma, ["unsubscribe-me@example.com"]);
  const recipient = prisma.sendRecipients[0];
  const token = createMarketingUnsubscribeToken({
    v: 1,
    eventId: EVENT_A,
    emailSendId: send.id,
    emailSendRecipientId: String(recipient.id),
    email: "unsubscribe-me@example.com",
  });

  const first = await service.unsubscribeMarketingRecipient(token);
  const second = await service.unsubscribeMarketingRecipient(token);

  assert.equal(first.unsubscribed, true);
  assert.equal(second.unsubscribed, true);
  assert.equal(prisma.suppressions.length, 1);
  assert.equal(prisma.suppressions[0].reason, "UNSUBSCRIBE");
  assert.equal(prisma.suppressions[0].source, "MANUAL");
  assert.equal(prisma.sendRecipients[0].providerStatus, "UNSUBSCRIBED");
  assert.ok(prisma.sendRecipients[0].unsubscribedAt instanceof Date);
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.unsubscribeCount, 1);
});

test("resubscribe removes an event-scoped suppression through the service", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  prisma.suppressions.push({
    id: uuid(555),
    eventId: EVENT_A,
    email: "resubscribe@example.com",
    normalizedEmail: "resubscribe@example.com",
    reason: "UNSUBSCRIBE",
    source: "MANUAL",
    createdAt: new Date(),
  });

  const result = await service.resubscribeSuppression(editor, EVENT_A, uuid(555));

  assert.equal(result.resubscribed, true);
  assert.equal(result.email, "resubscribe@example.com");
  assert.equal(prisma.suppressions.length, 0);
});

test("send-now fails closed when unsubscribe config is missing", async () => {
  const prevSecret = process.env.MARKETING_UNSUBSCRIBE_TOKEN_SECRET;
  const prevBaseUrl = process.env.MARKETING_PUBLIC_BASE_URL;
  delete process.env.MARKETING_UNSUBSCRIBE_TOKEN_SECRET;
  delete process.env.MARKETING_PUBLIC_BASE_URL;
  try {
    const prisma = new FakePrisma();
    const provider = new RecordingProvider("sent");
    const { service } = makeService(prisma, provider);
    const audience = await seedAudienceWithRecipients(service, prisma, ["a@example.com"]);
    const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
    const send = await service.createEmailSend(editor, EVENT_A, {
      campaignId: campaign.id,
      audienceId: audience.id,
      subject: "S",
      bodyText: "B",
      fromEmail: "from@example.com",
    });

    await assert.rejects(
      () => service.sendEmailNow(editor, send.id),
      (error: unknown) =>
        error instanceof MarketingServiceError &&
        error.status === 500 &&
        error.message.includes("unsubscribe"),
    );
    assert.equal(provider.calls.length, 0);
    assert.equal(prisma.sendRecipients.length, 0, "send fails before freezing recipients");
    assert.equal(prisma.sends.find((row) => row.id === send.id)?.status, "DRAFT");
  } finally {
    if (prevSecret === undefined) delete process.env.MARKETING_UNSUBSCRIBE_TOKEN_SECRET;
    else process.env.MARKETING_UNSUBSCRIBE_TOKEN_SECRET = prevSecret;
    if (prevBaseUrl === undefined) delete process.env.MARKETING_PUBLIC_BASE_URL;
    else process.env.MARKETING_PUBLIC_BASE_URL = prevBaseUrl;
  }
});

test("send-now status reflects provider success, failure, and partial outcomes", async () => {
  // All failed
  {
    const prisma = new FakePrisma();
    const provider = new RecordingProvider("failed");
    const { service } = makeService(prisma, provider);
    const audience = await seedAudienceWithRecipients(service, prisma, ["x@example.com", "y@example.com"]);
    const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
    const send = await service.createEmailSend(editor, EVENT_A, {
      campaignId: campaign.id,
      audienceId: audience.id,
      subject: "S",
      bodyText: "B",
      fromEmail: "from@example.com",
    });
    const result = await service.sendEmailNow(editor, send.id);
    assert.equal(result.send.status, "FAILED");
    assert.equal(result.send.actualSentAt, null);
    assert.ok(prisma.sendRecipients.every((r) => r.providerStatus === "FAILED"));
  }

  // Partial
  {
    const prisma = new FakePrisma();
    const provider = new RecordingProvider("mixed");
    const { service } = makeService(prisma, provider);
    const audience = await seedAudienceWithRecipients(service, prisma, [
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
    const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
    const send = await service.createEmailSend(editor, EVENT_A, {
      campaignId: campaign.id,
      audienceId: audience.id,
      subject: "S",
      bodyText: "B",
      fromEmail: "from@example.com",
    });
    const result = await service.sendEmailNow(editor, send.id);
    assert.equal(result.send.status, "PARTIALLY_SENT");
    assert.equal(result.summary.sentCount, 2);
    assert.ok(result.send.actualSentAt instanceof Date);
  }
});

test("SendGrid webhook delivered events increment delivered once per recipient", async () => {
  const prisma = new FakePrisma();
  const { service, send } = await seedSentMarketingSend(prisma);
  const recipient = prisma.sendRecipients[0];

  const first = await service.ingestSendGridWebhookEvents([
    {
      event: "delivered",
      sg_event_id: "sg-delivered-1",
      timestamp: 1770000000,
      email: recipient.email,
      eventId: EVENT_A,
      emailSendId: send.id,
      emailSendRecipientId: recipient.id,
    },
  ]);
  const duplicate = await service.ingestSendGridWebhookEvents([
    {
      event: "delivered",
      sg_event_id: "sg-delivered-1",
      timestamp: 1770000000,
      email: recipient.email,
      eventId: EVENT_A,
      emailSendId: send.id,
      emailSendRecipientId: recipient.id,
    },
  ]);

  assert.equal(first.processed, 1);
  assert.equal(duplicate.duplicates, 1);
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.deliveredCount, 1);
  assert.equal(prisma.sendRecipients[0].providerStatus, "DELIVERED");
  assert.ok(prisma.sendRecipients[0].deliveredAt instanceof Date);
});

test("SendGrid webhook open and click events store unique engagement counts", async () => {
  const prisma = new FakePrisma();
  const { service, send } = await seedSentMarketingSend(prisma);
  const recipient = prisma.sendRecipients[0];

  const result = await service.ingestSendGridWebhookEvents([
    {
      event: "open",
      sg_event_id: "sg-open-1",
      timestamp: 1770000001,
      emailSendId: send.id,
      emailSendRecipientId: recipient.id,
    },
    {
      event: "open",
      sg_event_id: "sg-open-2",
      timestamp: 1770000002,
      emailSendId: send.id,
      emailSendRecipientId: recipient.id,
    },
    {
      event: "click",
      sg_event_id: "sg-click-1",
      timestamp: 1770000003,
      url: "https://example.com/register",
      emailSendId: send.id,
      emailSendRecipientId: recipient.id,
    },
  ]);

  assert.equal(result.processed, 3);
  assert.equal(prisma.emailEvents.length, 3);
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.openCount, 1);
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.clickCount, 1);
  assert.equal(prisma.sendRecipients[0].providerStatus, "CLICKED");
  assert.equal(prisma.emailEvents.find((event) => event.type === "CLICK")?.url, "https://example.com/register");
});

test("SendGrid webhook bounce and unsubscribe events update counters and suppress future sends", async () => {
  const prisma = new FakePrisma();
  const { service, send } = await seedSentMarketingSend(prisma, ["bounce@example.com", "unsubscribe@example.com"]);
  const [bounced, unsubscribed] = prisma.sendRecipients;

  const result = await service.ingestSendGridWebhookEvents([
    {
      event: "bounce",
      sg_event_id: "sg-bounce-1",
      timestamp: 1770000004,
      reason: "550 mailbox unavailable",
      email: bounced.email,
      emailSendId: send.id,
      emailSendRecipientId: bounced.id,
    },
    {
      event: "group_unsubscribe",
      sg_event_id: "sg-unsubscribe-1",
      timestamp: 1770000005,
      email: unsubscribed.email,
      emailSendId: send.id,
      emailSendRecipientId: unsubscribed.id,
    },
  ]);

  assert.equal(result.processed, 2);
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.bounceCount, 1);
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.unsubscribeCount, 1);
  assert.equal(prisma.sendRecipients.find((row) => row.id === bounced.id)?.providerStatus, "BOUNCED");
  assert.equal(prisma.sendRecipients.find((row) => row.id === unsubscribed.id)?.providerStatus, "UNSUBSCRIBED");
  assert.deepEqual(
    prisma.suppressions.map((row) => row.normalizedEmail).sort(),
    ["bounce@example.com", "unsubscribe@example.com"],
  );
  assert.ok(prisma.suppressions.every((row) => row.source === "SENDGRID_WEBHOOK"));
});

test("SendGrid webhook ignores unknown and unmatched events safely", async () => {
  const prisma = new FakePrisma();
  const { service } = await seedSentMarketingSend(prisma);

  const result = await service.ingestSendGridWebhookEvents([
    { event: "group_resubscribe", sg_event_id: "sg-resubscribe-1", timestamp: 1770000006 },
    {
      event: "delivered",
      sg_event_id: "sg-unmatched-1",
      timestamp: 1770000007,
      emailSendRecipientId: uuid(999999),
    },
  ]);

  assert.equal(result.ignored, 1);
  assert.equal(result.unmatched, 1);
  assert.equal(prisma.emailEvents.length, 0);
  assert.equal(prisma.sends[0].deliveredCount, 0);
});

test("email send list hydrates frozen recipient delivery status for the detail surface", async () => {
  const prisma = new FakePrisma();
  const { service, send } = await seedSentMarketingSend(prisma);
  const recipient = prisma.sendRecipients[0];
  await service.ingestSendGridWebhookEvents([
    {
      event: "delivered",
      sg_event_id: "sg-list-delivered-1",
      timestamp: 1770000008,
      emailSendId: send.id,
      emailSendRecipientId: recipient.id,
    },
  ]);

  const sends = await service.listEmailSends(editor, EVENT_A);
  assert.equal((sends[0] as Row).recipients instanceof Array, true);
  assert.equal(((sends[0] as Row).recipients as Row[])[0].providerStatus, "DELIVERED");
});

test("send-now is rejected when already processed", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider);
  const audience = await seedAudienceWithRecipients(service, prisma, ["a@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await service.sendEmailNow(editor, send.id);
  await assert.rejects(
    () => service.sendEmailNow(editor, send.id),
    (error: unknown) => error instanceof MarketingServiceError && error.status === 409,
  );
});

test("event access is enforced for reads, writes, and cross-tenant outsiders", async () => {
  const prisma = new FakePrisma();
  const { service, accessCalls } = makeService(prisma);

  await service.listAudiences(editor, EVENT_A);
  assert.deepEqual(accessCalls.at(-1), { eventId: EVENT_A, userId: EDITOR, accessType: "read" });

  await assert.rejects(
    () => service.createAudience(viewer, EVENT_A, { name: "X" }),
    (error: unknown) => error instanceof MarketingServiceError && error.status === 403,
  );

  await assert.rejects(
    () => service.listAudiences(outsider, EVENT_A),
    (error: unknown) => error instanceof MarketingServiceError && error.status === 403,
  );
});

test("email defaults come from environment with read-only access", async () => {
  const prevFrom = process.env.EMAIL_FROM;
  const prevReplyTo = process.env.EMAIL_REPLY_TO;
  const prevWebhookSecret = process.env.SENDGRID_WEBHOOK_SECRET;
  process.env.EMAIL_FROM = "marketing@example.com";
  process.env.EMAIL_REPLY_TO = "reply@example.com";
  delete process.env.SENDGRID_WEBHOOK_SECRET;
  try {
    const prisma = new FakePrisma();
    const { service } = makeService(prisma);
    const defaults = await service.getEmailDefaults(viewer, EVENT_A);
    assert.deepEqual(defaults, {
      fromEmail: "marketing@example.com",
      replyTo: "reply@example.com",
      trackingConfigured: false,
    });
    process.env.SENDGRID_WEBHOOK_SECRET = "configured";
    assert.equal((await service.getEmailDefaults(viewer, EVENT_A)).trackingConfigured, true);
  } finally {
    if (prevFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevFrom;
    if (prevReplyTo === undefined) delete process.env.EMAIL_REPLY_TO;
    else process.env.EMAIL_REPLY_TO = prevReplyTo;
    if (prevWebhookSecret === undefined) delete process.env.SENDGRID_WEBHOOK_SECRET;
    else process.env.SENDGRID_WEBHOOK_SECRET = prevWebhookSecret;
  }
});

test("create email send rejects audience/campaign from another event", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  // Campaign in EVENT_A, but we will create the send under EVENT_OTHER.
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  await assert.rejects(
    () =>
      service.createEmailSend(editor, EVENT_OTHER, {
        campaignId: campaign.id,
        subject: "S",
        bodyText: "B",
        fromEmail: "from@example.com",
      }),
    (error: unknown) => error instanceof MarketingServiceError && error.status === 400,
  );
});

test("campaign create and update persist start/end dates", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);

  const created = await service.createCampaign(editor, EVENT_A, {
    name: "Dated",
    startDate: "2026-02-06T00:00:00.000Z",
    endDate: "2026-03-01T00:00:00.000Z",
  });
  assert.ok(created.startDate instanceof Date);
  assert.ok(created.endDate instanceof Date);

  const updated = await service.updateCampaign(editor, created.id, { endDate: "2026-03-15T00:00:00.000Z" });
  assert.equal((updated.endDate as Date).toISOString(), "2026-03-15T00:00:00.000Z");

  const cleared = await service.updateCampaign(editor, created.id, { startDate: null });
  assert.equal(cleared.startDate, null);
});

test("create email send persists scheduledSendAt as planning data", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
    scheduledSendAt: "2026-02-20T00:00:00.000Z",
  });
  assert.ok(send.scheduledSendAt instanceof Date);
  // Creation can store a target timestamp, but the lifecycle stays DRAFT until scheduleEmailSend is called.
  assert.equal(send.status, "DRAFT");
});

test("draft can be scheduled and snapshots recipients", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma, undefined, () => new Date("2026-02-01T00:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(service, prisma, ["one@example.com", "two@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });

  const scheduled = await service.scheduleEmailSend(editor, send.id, {
    scheduledSendAt: "2026-02-20T15:30:00.000Z",
  });

  assert.equal(scheduled.status, "SCHEDULED");
  assert.equal((scheduled.scheduledSendAt as Date).toISOString(), "2026-02-20T15:30:00.000Z");
  assert.equal(scheduled.recipientCount, 2);
  assert.equal(prisma.sendRecipients.length, 2);
  assert.deepEqual(
    prisma.sendRecipients.map((row) => row.email),
    ["one@example.com", "two@example.com"],
  );
});

test("audience edits after scheduling do not change the frozen snapshot", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma, undefined, () => new Date("2026-02-01T00:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(service, prisma, ["one@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await service.scheduleEmailSend(editor, send.id, { scheduledSendAt: "2026-02-20T15:30:00.000Z" });
  await service.importRecipients(editor, audience.id, [{ email: "two@example.com" }]);

  assert.equal(prisma.audienceRecipients.length, 2);
  assert.equal(prisma.sendRecipients.length, 1);
  assert.equal(prisma.sendRecipients[0].email, "one@example.com");
});

test("scheduled send can be cancelled and is not executed by due runner", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider, () => new Date("2026-02-01T00:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(service, prisma, ["one@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await service.scheduleEmailSend(editor, send.id, { scheduledSendAt: "2026-02-20T15:30:00.000Z" });
  const cancelled = await service.cancelScheduledEmailSend(editor, send.id);

  assert.equal(cancelled.status, "CANCELED");
  assert.ok(cancelled.canceledAt instanceof Date);
  assert.equal(cancelled.canceledByUserId, EDITOR);

  const runner = createMarketingService({
    prisma: prisma as unknown as ServiceDeps["prisma"],
    provider,
    now: () => new Date("2026-02-21T00:00:00.000Z"),
  });
  const result = await runner.runDueScheduledEmailSends(EVENT_A);
  assert.equal(result.processedCount, 0);
  assert.equal(provider.calls.length, 0);
});

test("scheduled send can be rescheduled without changing its snapshot", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma, undefined, () => new Date("2026-02-01T00:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(service, prisma, ["one@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await service.scheduleEmailSend(editor, send.id, { scheduledSendAt: "2026-02-20T15:30:00.000Z" });
  const rescheduled = await service.rescheduleEmailSend(editor, send.id, {
    scheduledSendAt: "2026-03-01T12:00:00.000Z",
  });

  assert.equal(rescheduled.status, "SCHEDULED");
  assert.equal((rescheduled.scheduledSendAt as Date).toISOString(), "2026-03-01T12:00:00.000Z");
  assert.equal(prisma.sendRecipients.length, 1);
});

test("due runner sends due scheduled emails and does not double-send", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const setup = makeService(prisma, provider, () => new Date("2026-02-01T00:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(setup.service, prisma, ["one@example.com", "two@example.com"]);
  const campaign = await setup.service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await setup.service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await setup.service.scheduleEmailSend(editor, send.id, { scheduledSendAt: "2026-02-20T15:30:00.000Z" });

  const runner = createMarketingService({
    prisma: prisma as unknown as ServiceDeps["prisma"],
    provider,
    now: () => new Date("2026-02-20T15:31:00.000Z"),
  });
  const firstRun = await runner.runDueScheduledEmailSends(EVENT_A);
  const secondRun = await runner.runDueScheduledEmailSends(EVENT_A);

  assert.equal(firstRun.processedCount, 1);
  assert.equal(secondRun.processedCount, 0);
  assert.equal(provider.calls.length, 2);
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.status, "SENT");
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.sendAttemptCount, 1);
});

test("due runner rechecks suppressions and skips recipients suppressed after scheduling", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const setup = makeService(prisma, provider, () => new Date("2026-02-01T00:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(setup.service, prisma, [
    "send@example.com",
    "late-suppressed@example.com",
  ]);
  const campaign = await setup.service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await setup.service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await setup.service.scheduleEmailSend(editor, send.id, { scheduledSendAt: "2026-02-20T15:30:00.000Z" });
  prisma.suppressions.push({
    id: nextId(),
    eventId: EVENT_A,
    email: "late-suppressed@example.com",
    normalizedEmail: "late-suppressed@example.com",
    reason: "UNSUBSCRIBE",
    source: "MANUAL",
    createdAt: new Date(),
  });

  const runner = createMarketingService({
    prisma: prisma as unknown as ServiceDeps["prisma"],
    provider,
    now: () => new Date("2026-02-20T15:31:00.000Z"),
  });
  const result = await runner.runDueScheduledEmailSends(EVENT_A);

  assert.equal(result.processedCount, 1);
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].recipients[0].to, "send@example.com");
  assert.equal(
    prisma.sendRecipients.find((row) => row.normalizedEmail === "late-suppressed@example.com")?.providerStatus,
    "SUPPRESSED",
  );
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.recipientCount, 1);
});

test("provider failure marks scheduled send failed and retry uses frozen snapshot", async () => {
  const prisma = new FakePrisma();
  const failedProvider = new RecordingProvider("failed");
  const setup = makeService(prisma, failedProvider, () => new Date("2026-02-01T00:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(setup.service, prisma, ["one@example.com"]);
  const campaign = await setup.service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await setup.service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await setup.service.scheduleEmailSend(editor, send.id, { scheduledSendAt: "2026-02-20T15:30:00.000Z" });

  const failedRunner = createMarketingService({
    prisma: prisma as unknown as ServiceDeps["prisma"],
    provider: failedProvider,
    now: () => new Date("2026-02-20T15:31:00.000Z"),
  });
  await failedRunner.runDueScheduledEmailSends(EVENT_A);
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.status, "FAILED");
  assert.ok(prisma.sends.find((row) => row.id === send.id)?.failureReason);

  await setup.service.importRecipients(editor, audience.id, [{ email: "late@example.com" }]);
  const retryProvider = new RecordingProvider("sent");
  const retryService = makeService(prisma, retryProvider, () => new Date("2026-02-21T00:00:00.000Z")).service;
  const retry = await retryService.retryFailedEmailSend(editor, send.id);

  assert.equal(retry.send.status, "SENT");
  assert.equal(retryProvider.calls[0].recipients.length, 1);
  assert.equal(retryProvider.calls[0].recipients[0].to, "one@example.com");
  assert.equal(prisma.sends.find((row) => row.id === send.id)?.sendAttemptCount, 2);
});

test("EVENT_VIEWER write attempts are rejected for scheduled email lifecycle", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma, undefined, () => new Date("2026-02-01T00:00:00.000Z"));
  const audience = await seedAudienceWithRecipients(service, prisma, ["one@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });

  await assert.rejects(
    () => service.scheduleEmailSend(viewer, send.id, { scheduledSendAt: "2026-02-20T15:30:00.000Z" }),
    (error: unknown) => error instanceof MarketingServiceError && error.status === 403,
  );
});

test("update email send edits editable fields on a draft send", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const audience = await service.createAudience(editor, EVENT_A, { name: "List" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    subject: "Original",
    bodyText: "B",
    fromEmail: "from@example.com",
  });

  const updated = await service.updateEmailSend(editor, send.id, {
    subject: "Revised",
    audienceId: audience.id,
    scheduledSendAt: "2026-02-20T00:00:00.000Z",
  });
  assert.equal(updated.subject, "Revised");
  assert.equal(updated.audienceId, audience.id);
  assert.ok(updated.scheduledSendAt instanceof Date);
});

test("reply-to accepts plain email, normalizes mailbox strings, and rejects invalid values clearly", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });

  const plain = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    subject: "Plain reply-to",
    bodyText: "B",
    fromEmail: "from@example.com",
    replyTo: "reply@example.com",
  });
  assert.equal(plain.replyTo, "reply@example.com");

  const normalized = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    subject: "Mailbox reply-to",
    bodyText: "B",
    fromEmail: "from@example.com",
    replyTo: "SignalThread <no-reply@signalthread.ai>",
  });
  assert.equal(normalized.replyTo, "no-reply@signalthread.ai");

  await assert.rejects(
    () =>
      service.createEmailSend(editor, EVENT_A, {
        campaignId: campaign.id,
        subject: "Bad reply-to",
        bodyText: "B",
        fromEmail: "from@example.com",
        replyTo: "not-an-email",
      }),
    (error: unknown) =>
      error instanceof MarketingServiceError &&
      error.status === 400 &&
      error.message === "Reply-to must be a valid email address.",
  );
});

test("dispatch normalizes legacy reply-to mailbox strings before provider send", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider);
  const audience = await seedAudienceWithRecipients(service, prisma, ["a@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
    replyTo: "reply@example.com",
  });

  prisma.sends.find((row) => row.id === send.id)!.replyTo = "SignalThread <no-reply@signalthread.ai>";
  await service.sendEmailNow(editor, send.id);

  assert.equal(provider.calls[0].replyTo, "no-reply@signalthread.ai");
});

test("update email send allows CANCELED but rejects other manual statuses", async () => {
  const prisma = new FakePrisma();
  const { service } = makeService(prisma);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });

  const canceled = await service.updateEmailSend(editor, send.id, { status: "CANCELED" });
  assert.equal(canceled.status, "CANCELED");

  const fresh = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    subject: "S2",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await assert.rejects(
    () => service.updateEmailSend(editor, fresh.id, { status: "SENT" as unknown as string }),
    (error: unknown) => error instanceof MarketingServiceError && error.status === 400,
  );
});

test("update email send is rejected after the send has been dispatched", async () => {
  const prisma = new FakePrisma();
  const provider = new RecordingProvider("sent");
  const { service } = makeService(prisma, provider);
  const audience = await seedAudienceWithRecipients(service, prisma, ["a@example.com"]);
  const campaign = await service.createCampaign(editor, EVENT_A, { name: "C" });
  const send = await service.createEmailSend(editor, EVENT_A, {
    campaignId: campaign.id,
    audienceId: audience.id,
    subject: "S",
    bodyText: "B",
    fromEmail: "from@example.com",
  });
  await service.sendEmailNow(editor, send.id);

  await assert.rejects(
    () => service.updateEmailSend(editor, send.id, { subject: "too late" }),
    (error: unknown) => error instanceof MarketingServiceError && error.status === 409,
  );
});
