import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  BudgetStatus,
  DocumentStatus,
  EventMemberRole,
  EventPersonRole,
  EventStatus,
  SpeakerStatus,
  TimelineDependencyType,
  TimelinePriority,
  TimelineStatus,
  TimelineWorkstream,
  UserRole,
  type Budget,
  type BudgetLineItem,
  type BudgetVersion,
  type Client,
  type Document,
  type DocumentCategory,
  type DocumentVersion,
  type Event,
  type EventFnbCatalogItem,
  type EventMember,
  type EventPerson,
  type MatrixRow,
  type Membership,
  type Organization,
  type Prisma,
  type PrismaClient,
  type Room,
  type SeatingAssignment,
  type SeatingAttendee,
  type SeatingPlan,
  type SeatingTable,
  type SessionFnbCatalogAssignment,
  type SessionRequirementItem,
  type SessionRequirementSection,
  type SessionRequirementSelection,
  type SessionRequirementTemplate,
  type Speaker,
  type TimelineDependency,
  type TimelineItem,
  type User,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { EventAccessUser } from "@/lib/event-access";
import { cleanupTestFixtureOrganizations } from "./fixture-cleanup";

type Db = PrismaClient;

export type PlannerFixtureUser = Pick<User, "id" | "email" | "orgId" | "role">;

export type PlannerRoleUser = Readonly<{
  user: PlannerFixtureUser;
  membership?: Membership;
  eventMember?: EventMember;
  accessUser: EventAccessUser;
}>;

export type PlannerRoleFixture = Readonly<{
  organization: Organization;
  client: Client;
  event: Event;
  owner: PlannerRoleUser;
  admin: PlannerRoleUser;
  member: PlannerRoleUser;
  viewer: PlannerRoleUser;
  eventViewer: PlannerRoleUser;
  unrelatedSameOrgMember: PlannerRoleUser;
  unrelatedOtherOrgMember: PlannerRoleUser;
  superAdmin: PlannerRoleUser;
}>;

type CompositeSessionPersonKey = Readonly<{ sessionId: string; personId: string }>;
type CompositeSessionSpeakerKey = Readonly<{ sessionId: string; speakerId: string }>;
type CompositeSessionRequirementSelectionKey = Readonly<{ sessionId: string; itemId: string }>;

type CreatedIds = {
  organizationIds: string[];
  userIds: string[];
  membershipIds: string[];
  clientIds: string[];
  eventIds: string[];
  eventMemberIds: string[];
  roomIds: string[];
  matrixRowIds: string[];
  speakerIds: string[];
  eventPersonIds: string[];
  sessionRequirementTemplateIds: string[];
  sessionRequirementSectionIds: string[];
  sessionRequirementItemIds: string[];
  sessionRequirementSelections: CompositeSessionRequirementSelectionKey[];
  sessionSpeakerAssignments: CompositeSessionSpeakerKey[];
  sessionStaffAssignments: CompositeSessionPersonKey[];
  eventFnbCatalogItemIds: string[];
  sessionFnbCatalogAssignmentIds: string[];
  seatingPlanIds: string[];
  seatingTableIds: string[];
  seatingAttendeeIds: string[];
  seatingAssignmentIds: string[];
  budgetIds: string[];
  budgetVersionIds: string[];
  budgetLineItemIds: string[];
  documentCategoryIds: string[];
  documentIds: string[];
  documentVersionIds: string[];
  timelineItemIds: string[];
  timelineDependencyIds: string[];
};

const EMPTY_IDS = (): CreatedIds => ({
  organizationIds: [],
  userIds: [],
  membershipIds: [],
  clientIds: [],
  eventIds: [],
  eventMemberIds: [],
  roomIds: [],
  matrixRowIds: [],
  speakerIds: [],
  eventPersonIds: [],
  sessionRequirementTemplateIds: [],
  sessionRequirementSectionIds: [],
  sessionRequirementItemIds: [],
  sessionRequirementSelections: [],
  sessionSpeakerAssignments: [],
  sessionStaffAssignments: [],
  eventFnbCatalogItemIds: [],
  sessionFnbCatalogAssignmentIds: [],
  seatingPlanIds: [],
  seatingTableIds: [],
  seatingAttendeeIds: [],
  seatingAssignmentIds: [],
  budgetIds: [],
  budgetVersionIds: [],
  budgetLineItemIds: [],
  documentCategoryIds: [],
  documentIds: [],
  documentVersionIds: [],
  timelineItemIds: [],
  timelineDependencyIds: [],
});

function loadLocalEnvFile(path: string): void {
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const equalsIndex = line.indexOf("=");
    const key = line.slice(0, equalsIndex).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function loadPlannerTestEnv(): void {
  const webRoot = resolve(process.cwd());
  const repoRoot = resolve(webRoot, "..");
  loadLocalEnvFile(join(repoRoot, ".env.local"));
  loadLocalEnvFile(join(webRoot, ".env.local"));
}

export function hasPlannerTestDatabaseUrl(): boolean {
  loadPlannerTestEnv();
  return Boolean(process.env.DATABASE_URL?.trim());
}

function uniqueSuffix(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function slugFor(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function timeOnly(value: string): Date {
  return new Date(`1970-01-01T${value}.000Z`);
}

function asAccessUser(user: PlannerFixtureUser): EventAccessUser {
  return {
    id: user.id,
    orgId: user.orgId,
    role: user.role,
  };
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function isMissingEventPersonRoleType(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('type "public.EventPersonRole" does not exist');
}

function isMissingTable(error: unknown, tableName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes(`table \`public.${tableName}\` does not exist`) ||
    message.includes(`relation "${tableName}" does not exist`)
  );
}

export type PlannerFixtureHarnessOptions = Readonly<{
  db?: Db;
  runLabel?: string;
}>;

export class PlannerFixtureHarness {
  readonly db: Db;
  readonly runLabel: string;
  readonly ids: CreatedIds;

  constructor(options: PlannerFixtureHarnessOptions = {}) {
    loadPlannerTestEnv();
    this.db = options.db ?? getPrisma();
    this.runLabel = slugFor(options.runLabel ?? uniqueSuffix("planner-fixture"));
    this.ids = EMPTY_IDS();
  }

  async createOrganization(input: Partial<Prisma.OrganizationCreateInput> = {}): Promise<Organization> {
    const name = input.name ?? `Fixture Org ${this.runLabel}`;
    const organization = await this.db.organization.create({
      data: {
        name,
        slug: input.slug ?? slugFor(name),
      },
    });
    pushUnique(this.ids.organizationIds, organization.id);
    return organization;
  }

  async createClient(input: {
    orgId: string;
    name?: string;
    slug?: string;
  }): Promise<Client> {
    const name = input.name ?? `Fixture Client ${this.runLabel}`;
    const client = await this.db.client.create({
      data: {
        orgId: input.orgId,
        name,
        slug: input.slug ?? slugFor(name),
      },
    });
    pushUnique(this.ids.clientIds, client.id);
    return client;
  }

  async createUser(input: {
    orgId: string;
    role?: UserRole;
    email?: string;
    name?: string | null;
  }): Promise<PlannerFixtureUser> {
    const email = input.email ?? `${uniqueSuffix(this.runLabel)}@planner.test`;
    const user = await this.db.user.create({
      data: {
        orgId: input.orgId,
        email,
        name: input.name ?? email.split("@")[0],
        role: input.role ?? UserRole.MEMBER,
      },
      select: { id: true, email: true, orgId: true, role: true },
    });
    pushUnique(this.ids.userIds, user.id);
    return user;
  }

  async createMembership(input: { orgId: string; userId: string }): Promise<Membership> {
    const membership = await this.db.membership.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
      },
    });
    pushUnique(this.ids.membershipIds, membership.id);
    return membership;
  }

  async createEvent(input: {
    orgId: string;
    createdByUserId: string;
    clientId?: string | null;
    name?: string;
    startDate?: Date;
    endDate?: Date | null;
    timezone?: string;
    status?: EventStatus;
  }): Promise<Event> {
    const event = await this.db.event.create({
      data: {
        orgId: input.orgId,
        clientId: input.clientId ?? null,
        name: input.name ?? `Fixture Event ${this.runLabel}`,
        startDate: input.startDate ?? dateOnly("2026-01-15"),
        endDate: input.endDate ?? dateOnly("2026-01-16"),
        timezone: input.timezone ?? "America/New_York",
        venueName: "Fixture Venue",
        city: "New York",
        state: "NY",
        status: input.status ?? EventStatus.ACTIVE,
        createdByUserId: input.createdByUserId,
      },
    });
    pushUnique(this.ids.eventIds, event.id);
    return event;
  }

  async createEventMember(input: {
    eventId: string;
    userId: string;
    eventRole?: EventMemberRole;
  }): Promise<EventMember> {
    const eventMember = await this.db.eventMember.create({
      data: {
        eventId: input.eventId,
        userId: input.userId,
        eventRole: input.eventRole ?? EventMemberRole.EVENT_EDITOR,
      },
    });
    pushUnique(this.ids.eventMemberIds, eventMember.id);
    return eventMember;
  }

  async createRoom(input: { eventId: string; name?: string; capacity?: number | null }): Promise<Room> {
    const room = await this.db.room.create({
      data: {
        eventId: input.eventId,
        name: input.name ?? `Room ${this.runLabel}`,
        capacity: input.capacity ?? 120,
      },
    });
    pushUnique(this.ids.roomIds, room.id);
    return room;
  }

  async createMatrixRow(input: {
    eventId: string;
    roomId?: string | null;
    sessionName?: string | null;
    dayDate?: Date;
    startTime?: Date | null;
    endTime?: Date | null;
    attendance?: number | null;
    setupType?: string | null;
  }): Promise<MatrixRow> {
    const row = await this.db.matrixRow.create({
      data: {
        eventId: input.eventId,
        roomId: input.roomId ?? null,
        dayDate: input.dayDate ?? dateOnly("2026-01-15"),
        startTime: input.startTime ?? timeOnly("09:00:00"),
        endTime: input.endTime ?? timeOnly("10:00:00"),
        sessionName: input.sessionName ?? `Fixture Session ${this.runLabel}`,
        setupType: input.setupType ?? "Theater",
        attendance: input.attendance ?? 100,
        sortOrder: 1,
      },
    });
    pushUnique(this.ids.matrixRowIds, row.id);
    return row;
  }

  async createSpeaker(input: {
    eventId: string;
    name?: string;
    email?: string | null;
    title?: string | null;
    company?: string | null;
    bio?: string | null;
    status?: SpeakerStatus;
  }): Promise<Speaker> {
    const speaker = await this.db.speaker.create({
      data: {
        eventId: input.eventId,
        name: input.name ?? `Fixture Speaker ${this.runLabel}`,
        email: input.email ?? `${uniqueSuffix(this.runLabel)}-speaker@planner.test`,
        title: input.title ?? null,
        company: input.company ?? null,
        bio: input.bio ?? null,
        status: input.status ?? SpeakerStatus.CONFIRMED,
      },
    });
    pushUnique(this.ids.speakerIds, speaker.id);
    return speaker;
  }

  async createSessionSpeakerAssignment(input: {
    sessionId: string;
    speakerId: string;
  }): Promise<void> {
    await this.db.sessionSpeakerAssignment.create({
      data: {
        sessionId: input.sessionId,
        speakerId: input.speakerId,
      },
    });
    this.ids.sessionSpeakerAssignments.push({ sessionId: input.sessionId, speakerId: input.speakerId });
  }

  async createEventPerson(input: {
    eventId: string;
    name?: string;
    role?: EventPersonRole;
    email?: string | null;
  }): Promise<EventPerson> {
    const name = input.name ?? `Fixture Person ${this.runLabel}`;
    const role = input.role ?? EventPersonRole.STAFF;
    const email = input.email ?? `${uniqueSuffix(this.runLabel)}-person@planner.test`;
    let person: EventPerson;
    try {
      person = await this.db.eventPerson.create({
        data: {
          eventId: input.eventId,
          name,
          role,
          email,
        },
      });
    } catch (error) {
      if (!isMissingEventPersonRoleType(error)) throw error;
      const id = randomUUID();
      const now = new Date();
      await this.db.$executeRawUnsafe(
        `INSERT INTO "EventPerson" ("id", "eventId", "name", "role", "email", "createdAt", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
        id,
        input.eventId,
        name,
        role.toLowerCase(),
        email,
        now,
        now,
      );
      person = {
        id,
        eventId: input.eventId,
        name,
        role,
        company: null,
        email,
        // Live-only columns recovered by the clean-database baseline reconciliation.
        phone: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };
    }
    pushUnique(this.ids.eventPersonIds, person.id);
    return person;
  }

  async createSessionStaffAssignment(input: {
    sessionId: string;
    personId: string;
    role?: string | null;
  }): Promise<void> {
    try {
      await this.db.sessionStaffAssignment.create({
        data: {
          sessionId: input.sessionId,
          personId: input.personId,
          role: input.role ?? "Producer",
        },
      });
    } catch (error) {
      if (!isMissingTable(error, "SessionStaffAssignment")) throw error;
      await this.db.$executeRawUnsafe(
        `INSERT INTO "MatrixRowStaffAssignment" ("matrixRowId", "eventPersonId", "assignmentrole")
         VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT ("matrixRowId", "eventPersonId") DO UPDATE SET
           "assignmentrole" = EXCLUDED."assignmentrole"`,
        input.sessionId,
        input.personId,
        input.role ?? "Producer",
      );
    }
    this.ids.sessionStaffAssignments.push({ sessionId: input.sessionId, personId: input.personId });
  }

  async createSessionRequirementTemplate(input: {
    eventId: string;
    name?: string;
    assignToEvent?: boolean;
  }): Promise<SessionRequirementTemplate> {
    const template = await this.db.sessionRequirementTemplate.create({
      data: {
        eventId: input.eventId,
        name: input.name ?? `Fixture Requirements ${this.runLabel}`,
      },
    });
    pushUnique(this.ids.sessionRequirementTemplateIds, template.id);
    if (input.assignToEvent ?? true) {
      await this.db.event.update({
        where: { id: input.eventId },
        data: { sessionRequirementTemplateId: template.id },
      });
    }
    return template;
  }

  async createSessionRequirementSection(input: {
    templateId: string;
    key?: string;
    label?: string;
    icon?: string;
    sortOrder?: number;
  }): Promise<SessionRequirementSection> {
    const key = input.key ?? `section-${this.ids.sessionRequirementSectionIds.length + 1}`;
    const section = await this.db.sessionRequirementSection.create({
      data: {
        templateId: input.templateId,
        key,
        label: input.label ?? "Fixture Section",
        icon: input.icon ?? "ClipboardList",
        sortOrder: input.sortOrder ?? this.ids.sessionRequirementSectionIds.length + 1,
      },
    });
    pushUnique(this.ids.sessionRequirementSectionIds, section.id);
    return section;
  }

  async createSessionRequirementItem(input: {
    sectionId: string;
    key?: string;
    label?: string;
    hasQuantity?: boolean;
    sortOrder?: number;
  }): Promise<SessionRequirementItem> {
    const key = input.key ?? `item-${this.ids.sessionRequirementItemIds.length + 1}`;
    const item = await this.db.sessionRequirementItem.create({
      data: {
        sectionId: input.sectionId,
        key,
        label: input.label ?? "Fixture Requirement",
        hasQuantity: input.hasQuantity ?? true,
        sortOrder: input.sortOrder ?? this.ids.sessionRequirementItemIds.length + 1,
      },
    });
    pushUnique(this.ids.sessionRequirementItemIds, item.id);
    return item;
  }

  async createSessionRequirementSelection(input: {
    sessionId: string;
    itemId: string;
    budgetLineItemId?: string | null;
    quantity?: number | null;
  }): Promise<SessionRequirementSelection> {
    const selection = await this.db.sessionRequirementSelection.create({
      data: {
        sessionId: input.sessionId,
        itemId: input.itemId,
        budgetLineItemId: input.budgetLineItemId ?? null,
        quantity: input.quantity ?? 1,
      },
    });
    this.ids.sessionRequirementSelections.push({ sessionId: input.sessionId, itemId: input.itemId });
    return selection;
  }

  async createEventFnbCatalogItem(input: {
    eventId: string;
    itemName?: string;
    price?: string | null;
    category?: string | null;
  }): Promise<EventFnbCatalogItem> {
    const item = await this.db.eventFnbCatalogItem.create({
      data: {
        eventId: input.eventId,
        itemName: input.itemName ?? `Fixture Coffee ${this.runLabel}`,
        description: "Fixture F&B item",
        price: input.price ?? "12.00",
        unit: "person",
        category: input.category ?? "Beverage",
      },
    });
    pushUnique(this.ids.eventFnbCatalogItemIds, item.id);
    return item;
  }

  async createSessionFnbCatalogAssignment(input: {
    sessionId: string;
    eventFnbCatalogItemId: string;
    budgetLineItemId?: string | null;
    quantity?: number | null;
  }): Promise<SessionFnbCatalogAssignment> {
    const assignment = await this.db.sessionFnbCatalogAssignment.create({
      data: {
        sessionId: input.sessionId,
        eventFnbCatalogItemId: input.eventFnbCatalogItemId,
        budgetLineItemId: input.budgetLineItemId ?? null,
        quantity: input.quantity ?? 100,
        serviceTiming: "Before session",
      },
    });
    pushUnique(this.ids.sessionFnbCatalogAssignmentIds, assignment.id);
    return assignment;
  }

  async createSeatingPlan(input: {
    eventId: string;
    matrixRowId?: string | null;
    name?: string;
  }): Promise<SeatingPlan> {
    const plan = await this.db.seatingPlan.create({
      data: {
        eventId: input.eventId,
        matrixRowId: input.matrixRowId ?? null,
        name: input.name ?? `Fixture Seating ${this.runLabel}`,
      },
    });
    pushUnique(this.ids.seatingPlanIds, plan.id);
    return plan;
  }

  async createSeatingTable(input: {
    eventId: string;
    seatingPlanId?: string | null;
    name?: string;
    capacity?: number;
    sortOrder?: number;
  }): Promise<SeatingTable> {
    const table = await this.db.seatingTable.create({
      data: {
        eventId: input.eventId,
        seatingPlanId: input.seatingPlanId ?? null,
        name: input.name ?? `Table ${this.ids.seatingTableIds.length + 1}`,
        capacity: input.capacity ?? 8,
        sortOrder: input.sortOrder ?? this.ids.seatingTableIds.length + 1,
      },
    });
    pushUnique(this.ids.seatingTableIds, table.id);
    return table;
  }

  async createSeatingAttendee(input: {
    eventId: string;
    firstName?: string;
    lastName?: string;
    email?: string | null;
  }): Promise<SeatingAttendee> {
    const attendee = await this.db.seatingAttendee.create({
      data: {
        eventId: input.eventId,
        firstName: input.firstName ?? "Fixture",
        lastName: input.lastName ?? `Attendee ${this.ids.seatingAttendeeIds.length + 1}`,
        email: input.email ?? `${uniqueSuffix(this.runLabel)}-attendee@planner.test`,
      },
    });
    pushUnique(this.ids.seatingAttendeeIds, attendee.id);
    return attendee;
  }

  async createSeatingAssignment(input: {
    eventId: string;
    tableId: string;
    attendeeId: string;
    seatingPlanId?: string | null;
    seatIndex?: number | null;
  }): Promise<SeatingAssignment> {
    const assignment = await this.db.seatingAssignment.create({
      data: {
        eventId: input.eventId,
        tableId: input.tableId,
        attendeeId: input.attendeeId,
        seatingPlanId: input.seatingPlanId ?? null,
        seatIndex: input.seatIndex ?? 0,
      },
    });
    pushUnique(this.ids.seatingAssignmentIds, assignment.id);
    return assignment;
  }

  async createBudget(input: {
    eventId: string;
    status?: BudgetStatus;
  }): Promise<Budget> {
    const budget = await this.db.budget.create({
      data: {
        eventId: input.eventId,
        status: input.status ?? BudgetStatus.DRAFT,
      },
    });
    pushUnique(this.ids.budgetIds, budget.id);
    return budget;
  }

  async createBudgetVersion(input: {
    budgetId: string;
    createdByUserId: string;
    versionNumber?: number;
    makeCurrent?: boolean;
  }): Promise<BudgetVersion> {
    const version = await this.db.budgetVersion.create({
      data: {
        budgetId: input.budgetId,
        versionNumber: input.versionNumber ?? 1,
        createdByUserId: input.createdByUserId,
      },
    });
    pushUnique(this.ids.budgetVersionIds, version.id);
    if (input.makeCurrent ?? true) {
      await this.db.budget.update({
        where: { id: input.budgetId },
        data: { currentVersionId: version.id },
      });
    }
    return version;
  }

  async createBudgetLineItem(input: {
    budgetId: string;
    matrixRowId?: string | null;
    category?: string;
    subcategory?: string;
    lineItem?: string;
    vendor?: string | null;
    forecastCents?: number;
    actualCents?: number;
  }): Promise<BudgetLineItem> {
    const lineItem = await this.db.budgetLineItem.create({
      data: {
        budgetId: input.budgetId,
        matrixRowId: input.matrixRowId ?? null,
        category: input.category ?? "Food & Beverage",
        subcategory: input.subcategory ?? "Coffee",
        lineItem: input.lineItem ?? `Fixture Budget Line ${this.runLabel}`,
        vendor: input.vendor ?? null,
        forecastCents: input.forecastCents ?? 10000,
        actualCents: input.actualCents ?? 0,
        sortOrder: this.ids.budgetLineItemIds.length + 1,
      },
    });
    pushUnique(this.ids.budgetLineItemIds, lineItem.id);
    return lineItem;
  }

  async createDocumentCategory(input: {
    eventId: string;
    name?: string;
    slug?: string;
    color?: string | null;
  }): Promise<DocumentCategory> {
    const name = input.name ?? "Fixture Docs";
    const category = await this.db.documentCategory.create({
      data: {
        eventId: input.eventId,
        name,
        slug: input.slug ?? slugFor(`${name}-${this.runLabel}`),
        color: input.color ?? "#64748b",
      },
    });
    pushUnique(this.ids.documentCategoryIds, category.id);
    return category;
  }

  async createDocument(input: {
    orgId: string;
    eventId: string;
    categoryId: string;
    title?: string;
    status?: DocumentStatus;
  }): Promise<Document> {
    const document = await this.db.document.create({
      data: {
        orgId: input.orgId,
        eventId: input.eventId,
        categoryId: input.categoryId,
        title: input.title ?? `Fixture Document ${this.runLabel}`,
        status: input.status ?? DocumentStatus.DRAFT,
      },
    });
    pushUnique(this.ids.documentIds, document.id);
    return document;
  }

  async createDocumentVersion(input: {
    documentId: string;
    uploadedByUserId: string;
    versionNumber?: number;
    originalFilename?: string;
    objectKey?: string;
    mimeType?: string;
    fileSizeBytes?: number;
  }): Promise<DocumentVersion> {
    const version = await this.db.documentVersion.create({
      data: {
        documentId: input.documentId,
        uploadedByUserId: input.uploadedByUserId,
        versionNumber: input.versionNumber ?? 1,
        originalFilename: input.originalFilename ?? "fixture-contract.pdf",
        objectKey: input.objectKey ?? `test-fixtures/${this.runLabel}/${randomUUID()}.pdf`,
        mimeType: input.mimeType ?? "application/pdf",
        fileSizeBytes: input.fileSizeBytes ?? 1024,
      },
    });
    pushUnique(this.ids.documentVersionIds, version.id);
    return version;
  }

  async createTimelineItem(input: {
    eventId: string;
    title?: string;
    ownerUserId?: string | null;
    parentId?: string | null;
    sortOrder?: number;
  }): Promise<TimelineItem> {
    const item = await this.db.timelineItem.create({
      data: {
        eventId: input.eventId,
        title: input.title ?? `Fixture Timeline Item ${this.ids.timelineItemIds.length + 1}`,
        ownerUserId: input.ownerUserId ?? null,
        parentId: input.parentId ?? null,
        status: TimelineStatus.NOT_STARTED,
        priority: TimelinePriority.MEDIUM,
        workstream: TimelineWorkstream.PRODUCTION,
        sortOrder: input.sortOrder ?? this.ids.timelineItemIds.length + 1,
      },
    });
    pushUnique(this.ids.timelineItemIds, item.id);
    return item;
  }

  async createTimelineDependency(input: {
    eventId: string;
    predecessorItemId: string;
    successorItemId: string;
    type?: TimelineDependencyType;
  }): Promise<TimelineDependency> {
    const dependency = await this.db.timelineDependency.create({
      data: {
        eventId: input.eventId,
        predecessorItemId: input.predecessorItemId,
        successorItemId: input.successorItemId,
        type: input.type ?? TimelineDependencyType.FINISH_TO_START,
      },
    });
    pushUnique(this.ids.timelineDependencyIds, dependency.id);
    return dependency;
  }

  async createRoleAccessFixture(): Promise<PlannerRoleFixture> {
    const organization = await this.createOrganization();
    const owner = await this.createUser({ orgId: organization.id, role: UserRole.OWNER, name: "Fixture Owner" });
    const ownerMembership = await this.createMembership({ orgId: organization.id, userId: owner.id });
    const client = await this.createClient({ orgId: organization.id });
    const event = await this.createEvent({
      orgId: organization.id,
      clientId: client.id,
      createdByUserId: owner.id,
    });

    const admin = await this.createUser({ orgId: organization.id, role: UserRole.ADMIN, name: "Fixture Admin" });
    const member = await this.createUser({ orgId: organization.id, role: UserRole.MEMBER, name: "Fixture Member" });
    const viewer = await this.createUser({ orgId: organization.id, role: UserRole.VIEWER, name: "Fixture Viewer" });
    const eventViewer = await this.createUser({ orgId: organization.id, role: UserRole.MEMBER, name: "Fixture Event Viewer" });
    const unrelatedSameOrgMember = await this.createUser({
      orgId: organization.id,
      role: UserRole.MEMBER,
      name: "Fixture Same Org No Event",
    });

    const adminMembership = await this.createMembership({ orgId: organization.id, userId: admin.id });
    const memberMembership = await this.createMembership({ orgId: organization.id, userId: member.id });
    const viewerMembership = await this.createMembership({ orgId: organization.id, userId: viewer.id });
    const eventViewerMembership = await this.createMembership({ orgId: organization.id, userId: eventViewer.id });
    const unrelatedSameOrgMembership = await this.createMembership({ orgId: organization.id, userId: unrelatedSameOrgMember.id });

    const memberEventMember = await this.createEventMember({
      eventId: event.id,
      userId: member.id,
      eventRole: EventMemberRole.EVENT_EDITOR,
    });
    const viewerEventMember = await this.createEventMember({
      eventId: event.id,
      userId: viewer.id,
      eventRole: EventMemberRole.EVENT_EDITOR,
    });
    const eventViewerEventMember = await this.createEventMember({
      eventId: event.id,
      userId: eventViewer.id,
      eventRole: EventMemberRole.EVENT_VIEWER,
    });

    const otherOrganization = await this.createOrganization({
      name: `Fixture Other Org ${this.runLabel}`,
      slug: slugFor(`fixture-other-org-${this.runLabel}`),
    });
    const unrelatedOtherOrgMember = await this.createUser({
      orgId: otherOrganization.id,
      role: UserRole.MEMBER,
      name: "Fixture Other Org Member",
    });
    const unrelatedOtherOrgMembership = await this.createMembership({
      orgId: otherOrganization.id,
      userId: unrelatedOtherOrgMember.id,
    });
    const superAdmin = await this.createUser({
      orgId: otherOrganization.id,
      role: UserRole.SUPER_ADMIN,
      name: "Fixture Super Admin",
    });
    const superAdminMembership = await this.createMembership({
      orgId: otherOrganization.id,
      userId: superAdmin.id,
    });

    return {
      organization,
      client,
      event,
      owner: { user: owner, membership: ownerMembership, accessUser: asAccessUser(owner) },
      admin: { user: admin, membership: adminMembership, accessUser: asAccessUser(admin) },
      member: {
        user: member,
        membership: memberMembership,
        eventMember: memberEventMember,
        accessUser: asAccessUser(member),
      },
      viewer: {
        user: viewer,
        membership: viewerMembership,
        eventMember: viewerEventMember,
        accessUser: asAccessUser(viewer),
      },
      eventViewer: {
        user: eventViewer,
        membership: eventViewerMembership,
        eventMember: eventViewerEventMember,
        accessUser: asAccessUser(eventViewer),
      },
      unrelatedSameOrgMember: {
        user: unrelatedSameOrgMember,
        membership: unrelatedSameOrgMembership,
        accessUser: asAccessUser(unrelatedSameOrgMember),
      },
      unrelatedOtherOrgMember: {
        user: unrelatedOtherOrgMember,
        membership: unrelatedOtherOrgMembership,
        accessUser: asAccessUser(unrelatedOtherOrgMember),
      },
      superAdmin: {
        user: superAdmin,
        membership: superAdminMembership,
        accessUser: asAccessUser(superAdmin),
      },
    };
  }

  async cleanup(): Promise<void> {
    await cleanupTestFixtureOrganizations({
      db: this.db,
      orgIds: this.ids.organizationIds,
      testRunId: this.runLabel,
    });
  }
}

export function createPlannerFixtureHarness(options: PlannerFixtureHarnessOptions = {}): PlannerFixtureHarness {
  return new PlannerFixtureHarness(options);
}

/**
 * Builds a fixture while guaranteeing that records already written during a
 * failed setup are removed. Callers own cleanup after a successful build.
 */
export async function buildPlannerFixture<T>(
  options: PlannerFixtureHarnessOptions,
  build: (harness: PlannerFixtureHarness) => Promise<T>,
): Promise<T> {
  const harness = createPlannerFixtureHarness(options);
  try {
    return await build(harness);
  } catch (error) {
    await harness.cleanup();
    throw error;
  }
}
