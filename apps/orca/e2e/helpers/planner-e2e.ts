import { expect, type BrowserContext, type Page } from "@playwright/test";
import { BudgetStatus, DocumentStatus, EventMemberRole, EventPersonRole, EventStatus, SpeakerStatus, TimelineStatus, UserRole } from "@prisma/client";
import {
  buildPlannerFixture,
  type PlannerFixtureHarness,
} from "../../lib/test-harness/planner-fixtures";
import { generateSpeakerPortalToken } from "../../src/server/services/speaker-portal-tokens";
import { initializeEventSessionRequirementTemplate } from "../../lib/session-requirements";

export type PlannerP0BrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  sessionId: string;
  originalSessionTitle: string;
  updatedSessionTitle: string;
  speakerName: string;
  fnbItemName: string;
};

export type PlannerP0AccessBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  sessionId: string;
  originalSessionTitle: string;
  deniedSessionTitle: string;
  roomName: string;
  eventViewerEmail: string;
};

export type PlannerQuickDrawerBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  sessionId: string;
  sessionTitle: string;
  speakerId: string;
  speakerName: string;
  fnbItemName: string;
};

export type PlannerQuickDrawerResourcesBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  sessionId: string;
  sessionTitle: string;
  fnbItemId: string;
  fnbItemName: string;
  staffPersonId: string;
  staffPersonName: string;
};

export type PlannerRoomSetSeatingBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  sessionId: string;
  sessionTitle: string;
  seatingPlanId: string;
  tableId: string;
  tableName: string;
  attendeeId: string;
  attendeeName: string;
  expectedSeatIndex: number;
};

export type PlannerDocsBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  documentId: string;
  documentTitle: string;
  documentVersionId: string;
  documentFilename: string;
  categoryName: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewNote: string;
};

export type PlannerDocsReviewBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  categoryName: string;
  approveDocId: string;
  approveDocTitle: string;
};

export type PlannerBudgetBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  editorUserId: string;
  budgetId: string;
  budgetVersionId: string;
  lineItemId: string;
  lineItemName: string;
  categoryName: string;
  vendorName: string;
  forecastCents: number;
  actualCents: number;
  reviewerUserId: string;
  reviewerName: string;
  submissionMessage: string;
};

export type PlannerSpeakersBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  editorUserId: string;
  speakerId: string;
  speakerName: string;
  speakerEmail: string;
  initialTitle: string;
  initialCompany: string;
  updatedTitle: string;
  updatedCompany: string;
};

export type PlannerSpeakerPortalBrowserFixture = {
  harness: PlannerFixtureHarness;
  eventId: string;
  speakerId: string;
  speakerName: string;
  sessionName: string;
  validToken: string;
  revokedToken: string;
};

export type PlannerTimelineBrowserFixture = {
  harness: PlannerFixtureHarness;
  orgId: string;
  eventId: string;
  eventName: string;
  editorUserId: string;
  timelineItemId: string;
  timelineItemTitle: string;
  initialStatus: TimelineStatus;
  updatedStatus: TimelineStatus;
};

export const E2E_DEV_USER_EMAIL =
  process.env.PW_E2E_DEV_USER_EMAIL?.trim() ||
  "planner-browser-e2e@planner.test";

export function createRunLabel(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildBrowserFixture<T>(
  runLabel: string,
  build: (harness: PlannerFixtureHarness) => Promise<T>,
): Promise<T> {
  return buildPlannerFixture({ runLabel }, async (harness) => {
    const fixture = await build(harness);
    if (
      typeof fixture === "object" &&
      fixture !== null &&
      "eventId" in fixture &&
      typeof fixture.eventId === "string"
    ) {
      await initializeEventSessionRequirementTemplate(fixture.eventId);
    }
    return fixture;
  });
}

export async function createPlannerP0BrowserFixture(): Promise<PlannerP0BrowserFixture> {
  const runLabel = createRunLabel("browser-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser E2E Org ${runLabel}`,
  });
  const owner = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser E2E Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: owner.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser E2E Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: owner.id,
    name: `Browser E2E Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  const room = await harness.createRoom({
    eventId: event.id,
    name: `Browser Ballroom ${runLabel}`,
    capacity: 250,
  });
  const originalSessionTitle = `Browser P0 Session ${runLabel}`;
  const updatedSessionTitle = `Browser P0 Updated ${runLabel}`;
  const session = await harness.createMatrixRow({
    eventId: event.id,
    roomId: room.id,
    sessionName: originalSessionTitle,
    attendance: 120,
  });
  const speaker = await harness.createSpeaker({
    eventId: event.id,
    name: `Browser Speaker ${runLabel}`,
    email: `speaker-${runLabel}@planner.test`,
  });
  await harness.createSessionSpeakerAssignment({
    sessionId: session.id,
    speakerId: speaker.id,
  });
  const fnbItem = await harness.createEventFnbCatalogItem({
    eventId: event.id,
    itemName: `Browser Coffee ${runLabel}`,
    category: "Beverage",
  });
  await harness.createSessionFnbCatalogAssignment({
    sessionId: session.id,
    eventFnbCatalogItemId: fnbItem.id,
    quantity: 120,
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    sessionId: session.id,
    originalSessionTitle,
    updatedSessionTitle,
    speakerName: speaker.name,
    fnbItemName: fnbItem.itemName,
  };
  });
}

export async function createPlannerP0AccessBrowserFixture(): Promise<PlannerP0AccessBrowserFixture> {
  const runLabel = createRunLabel("browser-access-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Access E2E Org ${runLabel}`,
  });
  const owner = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    name: "Browser Access Owner",
  });
  await harness.createMembership({ orgId: organization.id, userId: owner.id });
  const admin = await harness.createUser({
    orgId: organization.id,
    role: UserRole.ADMIN,
    name: "Browser Access Admin",
  });
  await harness.createMembership({ orgId: organization.id, userId: admin.id });
  const eventViewer = await harness.createUser({
    orgId: organization.id,
    role: UserRole.MEMBER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Access Event Viewer",
  });
  await harness.createMembership({ orgId: organization.id, userId: eventViewer.id });

  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Access Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: owner.id,
    name: `Browser Access Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  await harness.createEventMember({
    eventId: event.id,
    userId: eventViewer.id,
    eventRole: EventMemberRole.EVENT_VIEWER,
  });

  const room = await harness.createRoom({
    eventId: event.id,
    name: `Viewer Ballroom ${runLabel}`,
    capacity: 180,
  });
  const originalSessionTitle = `Viewer Read Only Session ${runLabel}`;
  const deniedSessionTitle = `Viewer Should Not Save ${runLabel}`;
  const session = await harness.createMatrixRow({
    eventId: event.id,
    roomId: room.id,
    sessionName: originalSessionTitle,
    attendance: 90,
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    sessionId: session.id,
    originalSessionTitle,
    deniedSessionTitle,
    roomName: room.name,
    eventViewerEmail: eventViewer.email,
  };
  });
}

export async function createPlannerQuickDrawerBrowserFixture(): Promise<PlannerQuickDrawerBrowserFixture> {
  const runLabel = createRunLabel("browser-quick-drawer-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Quick Drawer Org ${runLabel}`,
  });
  const editor = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Quick Drawer Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: editor.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Quick Drawer Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: editor.id,
    name: `Browser Quick Drawer Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  const room = await harness.createRoom({
    eventId: event.id,
    name: `Quick Drawer Room ${runLabel}`,
    capacity: 200,
  });
  const sessionTitle = `Quick Drawer Assignment ${runLabel}`;
  const session = await harness.createMatrixRow({
    eventId: event.id,
    roomId: room.id,
    sessionName: sessionTitle,
    attendance: 110,
  });
  const speaker = await harness.createSpeaker({
    eventId: event.id,
    name: `Quick Drawer Speaker ${runLabel}`,
    email: `quick-speaker-${runLabel}@planner.test`,
  });
  const fnbItem = await harness.createEventFnbCatalogItem({
    eventId: event.id,
    itemName: `Quick Drawer Coffee ${runLabel}`,
    category: "Beverage",
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    sessionId: session.id,
    sessionTitle,
    speakerId: speaker.id,
    speakerName: speaker.name,
    fnbItemName: fnbItem.itemName,
  };
  });
}

export async function createPlannerQuickDrawerResourcesBrowserFixture(): Promise<PlannerQuickDrawerResourcesBrowserFixture> {
  const runLabel = createRunLabel("browser-quick-drawer-resources-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Quick Resources Org ${runLabel}`,
  });
  const editor = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Quick Resources Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: editor.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Quick Resources Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: editor.id,
    name: `Browser Quick Resources Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  const room = await harness.createRoom({
    eventId: event.id,
    name: `Quick Resources Room ${runLabel}`,
    capacity: 200,
  });
  const sessionTitle = `Quick Resources Session ${runLabel}`;
  const session = await harness.createMatrixRow({
    eventId: event.id,
    roomId: room.id,
    sessionName: sessionTitle,
    attendance: 130,
  });

  // F&B: an event-scoped catalog item the F&B quick panel can assign.
  const fnbItem = await harness.createEventFnbCatalogItem({
    eventId: event.id,
    itemName: `Quick Resources Espresso ${runLabel}`,
    category: "Beverage",
  });

  // Staffing: an EventPerson (STAFF role) the Staffing quick panel can assign.
  const staffPersonName = `Quick Resources Producer ${runLabel}`;
  const staffPerson = await harness.createEventPerson({
    eventId: event.id,
    name: staffPersonName,
    role: EventPersonRole.STAFF,
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    sessionId: session.id,
    sessionTitle,
    fnbItemId: fnbItem.id,
    fnbItemName: fnbItem.itemName,
    staffPersonId: staffPerson.id,
    staffPersonName,
  };
  });
}

export async function createPlannerRoomSetSeatingBrowserFixture(): Promise<PlannerRoomSetSeatingBrowserFixture> {
  const runLabel = createRunLabel("browser-room-set-seating-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Room Set Org ${runLabel}`,
  });
  const editor = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Room Set Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: editor.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Room Set Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: editor.id,
    name: `Browser Room Set Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  const room = await harness.createRoom({
    eventId: event.id,
    name: `Room Set Ballroom ${runLabel}`,
    capacity: 160,
  });
  const sessionTitle = `Room Set Seating Session ${runLabel}`;
  const session = await harness.createMatrixRow({
    eventId: event.id,
    roomId: room.id,
    sessionName: sessionTitle,
    attendance: 72,
  });
  const seatingPlan = await harness.createSeatingPlan({
    eventId: event.id,
    matrixRowId: session.id,
    name: `Session Seating ${runLabel}`,
  });
  const table = await harness.createSeatingTable({
    eventId: event.id,
    seatingPlanId: seatingPlan.id,
    name: `Table Alpha ${runLabel}`,
    capacity: 4,
  });
  const attendee = await harness.createSeatingAttendee({
    eventId: event.id,
    firstName: "Seating",
    lastName: `Guest ${runLabel}`,
    email: `seating-guest-${runLabel}@planner.test`,
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    sessionId: session.id,
    sessionTitle,
    seatingPlanId: seatingPlan.id,
    tableId: table.id,
    tableName: table.name,
    attendeeId: attendee.id,
    attendeeName: `${attendee.firstName} ${attendee.lastName}`,
    expectedSeatIndex: 0,
  };
  });
}

export async function createPlannerRoomSetSeatingAdvancedBrowserFixture(): Promise<PlannerRoomSetSeatingBrowserFixture> {
  // Reuse the base Room Set / Seating fixture, then pre-seat the attendee so the
  // advanced journey can exercise unassign from an already-assigned state.
  const fixture = await createPlannerRoomSetSeatingBrowserFixture();
  try {
    await fixture.harness.createSeatingAssignment({
      eventId: fixture.eventId,
      tableId: fixture.tableId,
      attendeeId: fixture.attendeeId,
      seatingPlanId: fixture.seatingPlanId,
      seatIndex: fixture.expectedSeatIndex,
    });
    return fixture;
  } catch (error) {
    await fixture.harness.cleanup();
    throw error;
  }
}

export async function createPlannerDocsBrowserFixture(): Promise<PlannerDocsBrowserFixture> {
  const runLabel = createRunLabel("browser-docs-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Docs Org ${runLabel}`,
  });
  const editor = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Docs Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: editor.id });
  const reviewerName = `Docs Reviewer ${runLabel}`;
  const reviewer = await harness.createUser({
    orgId: organization.id,
    role: UserRole.ADMIN,
    email: `docs-reviewer-${runLabel}@planner.test`,
    name: reviewerName,
  });
  await harness.createMembership({ orgId: organization.id, userId: reviewer.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Docs Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: editor.id,
    name: `Browser Docs Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  const category = await harness.createDocumentCategory({
    eventId: event.id,
    name: `Contracts ${runLabel}`,
    slug: `contracts-${runLabel}`,
  });
  const documentTitle = `Docs Review Contract ${runLabel}`;
  const document = await harness.createDocument({
    orgId: organization.id,
    eventId: event.id,
    categoryId: category.id,
    title: documentTitle,
    status: DocumentStatus.DRAFT,
  });
  const documentVersion = await harness.createDocumentVersion({
    documentId: document.id,
    uploadedByUserId: editor.id,
    originalFilename: `docs-review-contract-${runLabel}.pdf`,
    objectKey: `test-fixtures/${runLabel}/${document.id}.pdf`,
    mimeType: "application/pdf",
    fileSizeBytes: 2048,
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    documentId: document.id,
    documentTitle,
    documentVersionId: documentVersion.id,
    documentFilename: documentVersion.originalFilename,
    categoryName: category.name,
    reviewerUserId: reviewer.id,
    reviewerName,
    reviewNote: `Please review ${runLabel}`,
  };
  });
}

export async function createPlannerDocsReviewBrowserFixture(): Promise<PlannerDocsReviewBrowserFixture> {
  const runLabel = createRunLabel("browser-docs-review-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Docs Review Org ${runLabel}`,
  });
  const editor = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Docs Review Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: editor.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Docs Review Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: editor.id,
    name: `Browser Docs Review Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  const category = await harness.createDocumentCategory({
    eventId: event.id,
    name: `Contracts ${runLabel}`,
    slug: `contracts-${runLabel}`,
  });

  async function seedInReviewDocument(kind: string): Promise<{ id: string; title: string }> {
    const title = `Docs Review ${kind} ${runLabel}`;
    const document = await harness.createDocument({
      orgId: organization.id,
      eventId: event.id,
      categoryId: category.id,
      title,
      status: DocumentStatus.IN_REVIEW,
    });
    await harness.createDocumentVersion({
      documentId: document.id,
      uploadedByUserId: editor.id,
      originalFilename: `docs-review-${kind.toLowerCase()}-${runLabel}.pdf`,
      objectKey: `test-fixtures/${runLabel}/${document.id}.pdf`,
    });
    return { id: document.id, title };
  }

  const approveDoc = await seedInReviewDocument("Approve");

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    categoryName: category.name,
    approveDocId: approveDoc.id,
    approveDocTitle: approveDoc.title,
  };
  });
}

export async function createPlannerBudgetBrowserFixture(): Promise<PlannerBudgetBrowserFixture> {
  const runLabel = createRunLabel("browser-budget-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Budget Org ${runLabel}`,
  });
  const editor = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Budget Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: editor.id });
  const reviewerName = `Budget Reviewer ${runLabel}`;
  const reviewer = await harness.createUser({
    orgId: organization.id,
    role: UserRole.ADMIN,
    email: `budget-reviewer-${runLabel}@planner.test`,
    name: reviewerName,
  });
  await harness.createMembership({ orgId: organization.id, userId: reviewer.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Budget Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: editor.id,
    name: `Browser Budget Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  await harness.createEventMember({
    eventId: event.id,
    userId: editor.id,
    eventRole: EventMemberRole.EVENT_EDITOR,
  });
  await harness.createEventMember({
    eventId: event.id,
    userId: reviewer.id,
    eventRole: EventMemberRole.EVENT_EDITOR,
  });
  const budget = await harness.createBudget({
    eventId: event.id,
    status: BudgetStatus.DRAFT,
  });
  const budgetVersion = await harness.createBudgetVersion({
    budgetId: budget.id,
    createdByUserId: editor.id,
  });
  const lineItemName = `Budget Audio Package ${runLabel}`;
  const vendorName = `Budget Vendor ${runLabel}`;
  const lineItem = await harness.createBudgetLineItem({
    budgetId: budget.id,
    category: "AV",
    subcategory: "Audio",
    lineItem: lineItemName,
    vendor: vendorName,
    forecastCents: 125000,
    actualCents: 25000,
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    editorUserId: editor.id,
    budgetId: budget.id,
    budgetVersionId: budgetVersion.id,
    lineItemId: lineItem.id,
    lineItemName,
    categoryName: "AV",
    vendorName,
    forecastCents: lineItem.forecastCents,
    actualCents: lineItem.actualCents,
    reviewerUserId: reviewer.id,
    reviewerName,
    submissionMessage: `Ready for browser budget review ${runLabel}`,
  };
  });
}

export async function createPlannerSpeakersBrowserFixture(): Promise<PlannerSpeakersBrowserFixture> {
  const runLabel = createRunLabel("browser-speakers-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Speakers Org ${runLabel}`,
  });
  const editor = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Speakers Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: editor.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Speakers Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: editor.id,
    name: `Browser Speakers Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  await harness.createEventMember({
    eventId: event.id,
    userId: editor.id,
    eventRole: EventMemberRole.EVENT_EDITOR,
  });
  const speakerName = `Speakers UI Speaker ${runLabel}`;
  const speakerEmail = `speakers-ui-${runLabel}@planner.test`;
  const initialTitle = `Principal Strategist ${runLabel}`;
  const initialCompany = `Original Co ${runLabel}`;
  const updatedTitle = `Keynote Strategist ${runLabel}`;
  const updatedCompany = `Updated Co ${runLabel}`;
  const speaker = await harness.createSpeaker({
    eventId: event.id,
    name: speakerName,
    email: speakerEmail,
    title: initialTitle,
    company: initialCompany,
    status: SpeakerStatus.INVITED,
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    editorUserId: editor.id,
    speakerId: speaker.id,
    speakerName,
    speakerEmail,
    initialTitle,
    initialCompany,
    updatedTitle,
    updatedCompany,
  };
  });
}

export async function createPlannerSpeakerPortalBrowserFixture(): Promise<PlannerSpeakerPortalBrowserFixture> {
  const runLabel = createRunLabel("browser-speaker-portal-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const roles = await harness.createRoleAccessFixture();
  const room = await harness.createRoom({
    eventId: roles.event.id,
    name: `Portal Room ${runLabel}`,
  });
  const sessionName = `Portal Session ${runLabel}`;
  const session = await harness.createMatrixRow({
    eventId: roles.event.id,
    roomId: room.id,
    sessionName,
  });
  const speakerName = `Portal Speaker ${runLabel}`;
  const speaker = await harness.createSpeaker({
    eventId: roles.event.id,
    name: speakerName,
    email: `portal-${runLabel}@planner.test`,
  });
  await harness.createSessionSpeakerAssignment({
    sessionId: session.id,
    speakerId: speaker.id,
  });

  // Mint the to-be-revoked token first, revoke it, then mint the active token
  // last (generateSpeakerPortalToken revokes prior active tokens on each mint).
  const revokedGrant = await generateSpeakerPortalToken(roles.event.id, speaker.id, roles.owner.accessUser, {
    origin: "http://127.0.0.1",
  });
  await harness.db.speakerIntakeToken.update({
    where: { id: revokedGrant.tokenId },
    data: { revokedAt: new Date() },
  });
  const grant = await generateSpeakerPortalToken(roles.event.id, speaker.id, roles.owner.accessUser, {
    origin: "http://127.0.0.1",
  });

  return {
    harness,
    eventId: roles.event.id,
    speakerId: speaker.id,
    speakerName,
    sessionName,
    validToken: grant.token,
    revokedToken: revokedGrant.token,
  };
  });
}

export async function createPlannerTimelineBrowserFixture(): Promise<PlannerTimelineBrowserFixture> {
  const runLabel = createRunLabel("browser-timeline-p0");
  return buildBrowserFixture(runLabel, async (harness) => {

  const organization = await harness.createOrganization({
    name: `Browser Timeline Org ${runLabel}`,
  });
  const editor = await harness.createUser({
    orgId: organization.id,
    role: UserRole.OWNER,
    email: E2E_DEV_USER_EMAIL,
    name: "Browser Timeline Planner",
  });
  await harness.createMembership({ orgId: organization.id, userId: editor.id });
  const client = await harness.createClient({
    orgId: organization.id,
    name: `Browser Timeline Client ${runLabel}`,
  });
  const event = await harness.createEvent({
    orgId: organization.id,
    clientId: client.id,
    createdByUserId: editor.id,
    name: `Browser Timeline Event ${runLabel}`,
    status: EventStatus.ACTIVE,
  });
  await harness.createEventMember({
    eventId: event.id,
    userId: editor.id,
    eventRole: EventMemberRole.EVENT_EDITOR,
  });
  const timelineItemTitle = `Timeline Status Item ${runLabel}`;
  const timelineItem = await harness.createTimelineItem({
    eventId: event.id,
    ownerUserId: editor.id,
    title: timelineItemTitle,
    sortOrder: 1,
  });

  return {
    harness,
    orgId: organization.id,
    eventId: event.id,
    eventName: event.name,
    editorUserId: editor.id,
    timelineItemId: timelineItem.id,
    timelineItemTitle,
    initialStatus: TimelineStatus.NOT_STARTED,
    updatedStatus: TimelineStatus.IN_PROGRESS,
  };
  });
}

export async function usePlannerOrgContext(
  context: BrowserContext,
  baseURL: string | undefined,
  orgId: string,
): Promise<void> {
  const url = new URL(baseURL ?? "http://127.0.0.1:3100");
  await context.addCookies([
    {
      name: "activeOrgId",
      value: orgId,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: url.protocol === "https:",
    },
    {
      name: "activeOrgSelectionId",
      value: orgId,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: url.protocol === "https:",
    },
  ]);
}

export async function openEventsList(page: Page): Promise<void> {
  await page.goto("/events");
  // `/events` intentionally resolves to the portfolio Command Center. Keep the
  // shared browser helper aligned with that stable product entry point.
  await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
}

export async function openEventWorkspace(page: Page, eventName: string): Promise<void> {
  await page.getByRole("link").filter({ hasText: eventName }).first().click();
  await expect(page.getByRole("navigation", { name: "Event navigation" }).getByRole("link", { name: /Run of Show/i })).toBeVisible();
}

export async function openRunOfShow(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Event navigation" }).getByRole("link", { name: /Run of Show/i }).click();
  await expect(page.getByRole("heading", { name: "Run of Show" })).toBeVisible();
}

export async function openDocsHub(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Event navigation" })
    .getByRole("link", { name: "Documents hub and approvals" })
    .click();
  await expect(page.getByRole("heading", { name: "Docs Hub" })).toBeVisible();
}

export async function openBudget(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Event navigation" })
    .getByRole("link", { name: "Budget forecast versus actual" })
    .click();
  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
}

export async function openSpeakers(page: Page): Promise<void> {
  const eventNavigation = page.getByRole("navigation", { name: "Event navigation" });
  const speakersLink = eventNavigation.getByRole("link", { name: "Speakers" });
  if (!(await speakersLink.isVisible())) {
    await eventNavigation.getByRole("button", { name: "Expand Event Directory" }).click();
  }
  await speakersLink.click();
  await expect(page.getByRole("heading", { name: "Speaker Directory" })).toBeVisible();
}

export async function openTimeline(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Event navigation" })
    .getByRole("link", { name: "Roadmap master task list and critical path" })
    .click();
  await expect(page.getByRole("heading", { name: "Roadmap", exact: true })).toBeVisible();
}

export async function switchRunOfShowToList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("columnheader", { name: "Drag to reorder Session column", exact: true })).toBeVisible();
}

export async function openSessionSpeakersQuickPanel(page: Page, sessionId: string, sessionTitle: string) {
  const sessionCard = page.locator(`[data-matrix2-session-card-id="${sessionId}"]`);
  await expect(sessionCard).toBeVisible();
  await sessionCard.click();
  await page.getByRole("group", { name: `Quick actions for ${sessionTitle}` }).getByRole("button", { name: "Speakers" }).click();
  const panel = page.getByRole("region", { name: "Speakers quick panel" });
  await expect(panel).toBeVisible();
  return panel;
}

export async function openSessionQuickPanel(
  page: Page,
  sessionId: string,
  sessionTitle: string,
  actionName: "Speakers" | "AV" | "F&B" | "Staffing",
  panelTitle: string,
) {
  const sessionCard = page.locator(`[data-matrix2-session-card-id="${sessionId}"]`);
  await expect(sessionCard).toBeVisible();
  await sessionCard.click();
  await page
    .getByRole("group", { name: `Quick actions for ${sessionTitle}` })
    .getByRole("button", { name: actionName })
    .click();
  const panel = page.getByRole("region", { name: `${panelTitle} quick panel` });
  await expect(panel).toBeVisible();
  return panel;
}

export async function openSessionSeatingWorkspace(page: Page, sessionId: string, sessionTitle: string) {
  const sessionCard = page.locator(`[data-matrix2-session-card-id="${sessionId}"]`);
  await expect(sessionCard).toBeVisible();
  await sessionCard.click();
  await page
    .getByRole("group", { name: `Quick actions for ${sessionTitle}` })
    .getByRole("button", { name: "Seating", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/events/[^/]+/matrix/sessions/${sessionId}/room-set\\?mode=seating`));
  await ensureRoomSetSeatingMode(page);
}

export async function ensureRoomSetSeatingMode(page: Page): Promise<void> {
  if ((await page.getByText("Seating Mode").count()) === 0) {
    await page.locator("main").getByRole("button", { name: "Seating" }).click();
  }
  await expect(page.getByText("Seating Mode")).toBeVisible();
  await expect(page.getByText("Session-scoped seating plan active. Chair assignments persist for this Run of Show session.")).toBeVisible();
}

export function overviewSessionRow(page: Page, sessionTitle: string) {
  return page.locator("tbody tr").filter({ hasText: sessionTitle }).first();
}

export function overviewSessionRowById(page: Page, sessionId: string) {
  return page.getByTestId(`matrix-overview-session-row-${sessionId}`);
}
