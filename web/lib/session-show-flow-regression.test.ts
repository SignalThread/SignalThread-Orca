import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const workspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-show-flow-workspace.tsx",
  "utf8",
);
const shellSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const routeSource = readFileSync(
  "app/api/events/[eventId]/sessions/[sessionId]/show-flow/route.ts",
  "utf8",
);
const publicationRouteSource = readFileSync(
  "app/api/events/[eventId]/sessions/[sessionId]/show-flow/publication/route.ts",
  "utf8",
);
const publicRouteSource = readFileSync("app/api/public/events/[eventId]/agenda/route.ts", "utf8");
const exportRouteSource = readFileSync("app/api/events/[eventId]/sessions/[sessionId]/show-flow/export/route.ts", "utf8");
const serviceSource = readFileSync("lib/session-show-flow.ts", "utf8");
const authSource = readFileSync("app/api/events/[eventId]/_lib/event-route-auth.ts", "utf8");
const prismaSource = readFileSync("src/server/db/prisma.ts", "utf8");
const schemaSource = readFileSync("prisma/schema.prisma", "utf8");
const rootSchemaSource = readFileSync("../prisma/schema.prisma", "utf8");
const packageSource = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};

test("session workspace exposes the minute-by-minute Show Flow module", () => {
  assert.equal(shellSource.includes('id: "show-flow", label: "Show Flow"'), true);
  assert.equal(shellSource.includes("<SessionShowFlowWorkspace"), true);
  assert.equal(shellSource.includes('activeTab === "show-flow"'), true);
  assert.equal(shellSource.includes('showSave={activeTab !== "fnb" && activeTab !== "show-flow"}'), true);
});

test("show-flow editor covers ordering, timing, operations, talent, production and visibility fields", () => {
  for (const requiredText of [
    "Session offset",
    "Absolute time",
    "Duration minutes",
    "Cue / segment",
    "Action",
    "Directory owner",
    "Unfilled owner role",
    "Cue type",
    "Department",
    "Speaker",
    "Talent / role",
    "AV notes",
    "Audio notes",
    "Lighting notes",
    "Internal notes",
    "Public cue description",
    "Approved public",
    "Duplicate",
    "Insert after",
    "Move up",
    "Move down",
    "Delete",
  ]) {
    assert.equal(workspaceSource.includes(requiredText), true, `missing ${requiredText}`);
  }
});

test("Show Flow opens as a run-sheet view and gates configuration behind explicit edit mode", () => {
  for (const requiredText of [
    'useState<"view" | "edit">("view")',
    'aria-label="View Show Flow"',
    "Chronological onsite run sheet",
    "Edit show flow",
    "Save changes",
    "Discard your unsaved Show Flow changes?",
    "Return this Show Flow to Draft?",
    'aria-labelledby="show-flow-cue-editor-title"',
    'aria-labelledby="manage-show-flow-title"',
    "Return to Draft and edit",
    'mode === "edit"',
    "Select cues",
  ]) assert.equal(workspaceSource.includes(requiredText), true, `missing reader-first behavior: ${requiredText}`);
  assert.equal(workspaceSource.includes('if (status === "APPROVED") setMode("view")'), true);
  assert.equal(workspaceSource.includes('workspace.status === "APPROVED" && !window.confirm'), false);
});

test("show-flow API keeps legacy reads while adding guarded workspace saves and permission-safe publication", () => {
  assert.equal(routeSource.includes('searchParams.get("mode") === "workspace"'), true);
  assert.equal(routeSource.includes("expectedRevision: body.expectedRevision"), true);
  assert.equal(routeSource.includes('requireEventRouteAccess(request, eventId, "write")'), true);
  assert.equal(publicationRouteSource.includes('requireEventRouteAccess(request, eventId, "read")'), true);
  assert.equal(publicationRouteSource.includes('requireEventRouteAccess(request, eventId, "write")'), true);
  assert.equal(publicRouteSource.includes("listPublishedEventAgenda"), true);
  assert.equal(publicRouteSource.includes("sessionShowFlowItem"), false);
});

test("Show Flow v1 persists controlled cue types, event-scoped directory owners, and approval state", () => {
  for (const required of [
    "SessionShowFlowCueType",
    "ownerPersonId",
    "SessionShowFlowStatus",
    "approvedByUserId",
    "approvedAt",
  ]) assert.equal(schemaSource.includes(required), true, `missing canonical ${required}`);
  assert.equal(serviceSource.includes('where: { eventId, id: { in: ownerPersonIds } }'), true);
  assert.equal(serviceSource.includes('"CROSS_EVENT_OWNER"'), true);
  assert.equal(serviceSource.includes("setSessionShowFlowApproval"), true);
  assert.equal(routeSource.includes("export async function PATCH"), true);
});

test("Show Flow owner relations stay aligned across schemas, generated client, and local startup", () => {
  assert.equal(schemaSource, rootSchemaSource, "root and web Prisma schemas have drifted");

  for (const schema of [schemaSource, rootSchemaSource]) {
    assert.match(schema, /ownerPersonId\s+String\?\s+@db\.Uuid/);
    assert.match(
      schema,
      /ownerPerson\s+EventPerson\?\s+@relation\(fields: \[ownerPersonId\], references: \[id\], onDelete: SetNull\)/,
    );
    assert.match(schema, /showFlowCues\s+SessionShowFlowItem\[\]/);
  }

  const generatedSchemaCandidates = [
    "node_modules/.prisma/client/schema.prisma",
    "../node_modules/.prisma/client/schema.prisma",
  ];
  const generatedSchemaPath = generatedSchemaCandidates.find((candidate) => existsSync(candidate));
  assert.ok(generatedSchemaPath, "no generated Prisma schema found; run npm run prisma:generate");
  const generatedSchema = readFileSync(generatedSchemaPath, "utf8");
  assert.match(generatedSchema, /ownerPersonId\s+String\?\s+@db\.Uuid/);
  assert.match(
    generatedSchema,
    /ownerPerson\s+EventPerson\?\s+@relation\(fields: \[ownerPersonId\], references: \[id\], onDelete: SetNull\)/,
  );
  assert.match(generatedSchema, /showFlowCues\s+SessionShowFlowItem\[\]/);

  assert.equal(packageSource.scripts?.["prisma:generate"], "npx prisma generate --config prisma.config.ts --schema ./prisma/schema.prisma");
  assert.equal(packageSource.scripts?.predev, "npm run prisma:generate");
  assert.equal(packageSource.scripts?.postinstall, "npm run prisma:generate");
});

test("Show Flow starters and copy use canonical same-event service paths", () => {
  for (const template of ["GENERAL_SESSION", "BREAKOUT", "MEAL", "RECEPTION"]) {
    assert.equal(serviceSource.includes(`${template}: [`), true, `missing ${template} starter`);
  }
  assert.equal(serviceSource.includes("copySessionShowFlow"), true);
  assert.equal(serviceSource.includes("getSessionShowFlowWorkspace(eventId, input.sourceSessionId)"), true);
  assert.equal(routeSource.includes('body.action === "apply-template"'), true);
  assert.equal(routeSource.includes('body.action === "copy-session"'), true);
});

test("Show Flow binary responses slice pooled buffers to exact generated bytes", () => {
  assert.equal(exportRouteSource.includes("bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)"), true);
});

test("late workspace loads cannot overwrite a newer unsaved cue edit", () => {
  assert.equal(workspaceSource.includes("localEditVersionRef"), true);
  assert.equal(workspaceSource.includes("localEditVersionRef.current !== editVersionAtStart"), true);
});

test("save responses preserve edits made while the request is in flight", () => {
  assert.equal(workspaceSource.includes("editVersionAtSave"), true);
  assert.equal(workspaceSource.includes("Earlier changes saved. Save again to include newer edits."), true);
});

test("Show Flow header uses canonical expected-attendance value and provenance", () => {
  assert.equal(serviceSource.includes("attendanceSource: true"), true);
  assert.equal(workspaceSource.includes("Planner estimate"), true);
  assert.equal(workspaceSource.includes("Provenance not set"), true);
});

test("initial Show Flow load avoids duplicate authorization and unrelated speaker-profile fetches", () => {
  const getRoute = routeSource.slice(routeSource.indexOf("async function getHandler"), routeSource.indexOf("export async function POST"));
  assert.equal((getRoute.match(/requireEventRouteAccess/g) ?? []).length, 1);
  assert.equal(getRoute.includes("auth.canEdit"), true);
  assert.equal(authSource.includes("canEdit: decision.canEdit"), true);
  assert.equal(routeSource.includes('withApiRequestLogging("GET /api/events/:eventId/sessions/:sessionId/show-flow", getHandler)'), true);
  assert.equal(workspaceSource.includes("fetch(`/api/events/${eventId}/speakers`)"), false);
  assert.equal(workspaceSource.includes("setSpeakers(nextWorkspace.speakers)"), true);
  assert.equal(workspaceSource.includes("autoLoadedSessionRef.current === sessionKey"), true);
  assert.equal(serviceSource.includes("getPrisma().speaker.findMany"), true);
  const workspaceService = serviceSource.slice(
    serviceSource.indexOf("export async function getSessionShowFlowWorkspace"),
    serviceSource.indexOf("export async function replaceSessionShowFlow"),
  );
  assert.equal(workspaceService.includes("snapshot: true"), false);
});

test("local Show Flow reads have bounded query concurrency without changing production pool safety", () => {
  assert.equal(prismaSource.includes('env.NODE_ENV === "development" || env.NODE_ENV === "test" ? 4 : 1'), true);
  assert.equal(prismaSource.includes("configured >= 1 && configured <= 10"), true);
});
