import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const matrixSnapshot = readFileSync("lib/matrix2.ts", "utf8");
const matrixMutation = readFileSync("lib/matrix2-session.ts", "utf8");
const requirements = readFileSync("lib/session-requirements.ts", "utf8");
const templateRoute = readFileSync("app/api/events/[eventId]/session-requirements/template/route.ts", "utf8");
const commandCenter = readFileSync("src/server/services/event-command-center.ts", "utf8");

test("Slice 4 uses schema-backed session staff and AV records as Matrix authorities", () => {
  assert.match(matrixSnapshot, /sessionStaffAssignment\.findMany/);
  assert.match(matrixSnapshot, /sessionAVRequirement\.findMany/);
  assert.doesNotMatch(matrixSnapshot, /FROM "MatrixRowStaffAssignment"/);
  assert.match(matrixMutation, /tx\.sessionStaffAssignment\.deleteMany/);
  assert.match(matrixMutation, /tx\.sessionAVRequirement\.deleteMany/);
  assert.doesNotMatch(matrixMutation, /INSERT INTO "MatrixRowStaffAssignment"/);
  assert.doesNotMatch(commandCenter, /matrixRowsWithAv/);
});

test("Slice 4 makes template GET pure and exposes explicit write initialization", () => {
  const getStart = requirements.indexOf("export async function getEventSessionRequirementTemplate");
  const initializeStart = requirements.indexOf("export async function initializeEventSessionRequirementTemplate");
  const getSource = requirements.slice(getStart, initializeStart);
  assert.doesNotMatch(getSource, /ensureEventSessionRequirementTemplateTx/);
  assert.match(templateRoute, /POST[\s\S]*session-requirements\/template/);
  assert.match(templateRoute, /requireEventRouteAccess\(request, eventId, "write"\)/);
  assert.match(templateRoute, /initializeEventSessionRequirementTemplate/);
});
