import assert from "node:assert/strict";
import test from "node:test";

import type { PlannerScene, PlannerSceneObject } from "./planner-scene";
import {
  normalizePlannerSceneFromUnknown,
  parsePlannerSceneJson,
  serializePlannerSceneJson,
} from "./planner-scene-io";

function objectWithMetadata(metadata: PlannerSceneObject["metadata"] & Readonly<Record<string, unknown>>): PlannerSceneObject {
  return {
    id: "visual-table-1",
    componentId: "table-round-60",
    objectType: "banquet_table",
    name: "60in round",
    label: "VIP table",
    capacity: { seated: 8, staff: 0 },
    source: { kind: "generated" },
    transform: {
      xLu: 12,
      yLu: 18,
      widthLu: 6.1,
      depthLu: 6.1,
      rotationDeg: 0,
    },
    metadata,
  };
}

function sceneWithObject(object: PlannerSceneObject): PlannerScene {
  return {
    roomShell: {
      widthLu: 120,
      depthLu: 80,
      bounds: { xLu: 0, yLu: 0, widthLu: 120, depthLu: 80 },
    },
    objects: [object],
  };
}

test("metadata seatingTableId and seatingPlanId survive parse/stringify/load", () => {
  const scene = sceneWithObject(
    objectWithMetadata({
      componentCategory: "tables",
      visualVariant: "round",
      neutralNote: "",
      seatingTableId: "table-a",
      seatingPlanId: "plan-a",
    }),
  );

  const parsed = parsePlannerSceneJson(serializePlannerSceneJson(scene));

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.scene.objects[0].metadata.seatingTableId, "table-a");
  assert.equal(parsed.scene.objects[0].metadata.seatingPlanId, "plan-a");
});

test("old drafts without seating metadata still parse safely", () => {
  const scene = sceneWithObject(
    objectWithMetadata({
      componentCategory: "tables",
      visualVariant: "round",
      neutralNote: "",
    }),
  );

  const parsed = parsePlannerSceneJson(JSON.stringify(scene));

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.scene.objects[0].metadata.seatingTableId, undefined);
  assert.equal(parsed.scene.objects[0].metadata.seatingPlanId, undefined);
});

test("malformed seating metadata does not crash or create bogus links", () => {
  const parsed = normalizePlannerSceneFromUnknown({
    roomShell: {
      widthLu: 120,
      depthLu: 80,
      bounds: { xLu: 0, yLu: 0, widthLu: 120, depthLu: 80 },
    },
    objects: [
      {
        ...objectWithMetadata({
          componentCategory: "tables",
          visualVariant: "round",
          neutralNote: "",
        }),
        metadata: {
          componentCategory: "tables",
          visualVariant: "round",
          neutralNote: "",
          seatingTableId: 42,
          seatingPlanId: ["plan-a"],
        },
      },
    ],
  });

  assert.ok(parsed);
  assert.equal(parsed.objects[0].metadata.seatingTableId, undefined);
  assert.equal(parsed.objects[0].metadata.seatingPlanId, undefined);
});

test("unknown metadata keys are preserved with seating metadata", () => {
  const scene = sceneWithObject(
    objectWithMetadata({
      componentCategory: "tables",
      visualVariant: "round",
      neutralNote: "",
      seatingTableId: "table-a",
      seatingPlanId: "plan-a",
      plannerAuditToken: "keep-me",
    }),
  );

  const parsed = parsePlannerSceneJson(serializePlannerSceneJson(scene));

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const metadata = parsed.scene.objects[0].metadata as PlannerSceneObject["metadata"] & Record<string, unknown>;
  assert.equal(metadata.plannerAuditToken, "keep-me");
});

test("nested JSON-safe unknown metadata survives normalization", () => {
  const scene = sceneWithObject(
    objectWithMetadata({
      componentCategory: "tables",
      visualVariant: "round",
      neutralNote: "",
      plannerAudit: {
        token: "keep-me",
        flags: ["source-component", "visual-audit"],
        reviewed: true,
        score: 0.98,
      },
    }),
  );

  const parsed = parsePlannerSceneJson(serializePlannerSceneJson(scene));

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const metadata = parsed.scene.objects[0].metadata as PlannerSceneObject["metadata"] & Record<string, unknown>;
  assert.deepEqual(metadata.plannerAudit, {
    token: "keep-me",
    flags: ["source-component", "visual-audit"],
    reviewed: true,
    score: 0.98,
  });
});

test("unsafe or non-json metadata keys are skipped without breaking known metadata", () => {
  const parsed = normalizePlannerSceneFromUnknown({
    roomShell: {
      widthLu: 120,
      depthLu: 80,
      bounds: { xLu: 0, yLu: 0, widthLu: 120, depthLu: 80 },
    },
    objects: [
      {
        ...objectWithMetadata({
          componentCategory: "tables",
          visualVariant: "round",
          neutralNote: "",
        }),
        metadata: {
          componentCategory: " tables ",
          visualVariant: " round ",
          neutralNote: "",
          seatingTableId: " table-a ",
          plannerAuditToken: "keep-me",
          plannerAuditScore: Number.POSITIVE_INFINITY,
          plannerAuditCallback: () => "drop-me",
          constructor: { polluted: true },
          nested: {
            ok: true,
            __proto__: { polluted: true },
            invalid: Symbol("drop-me"),
          },
        },
      },
    ],
  });

  assert.ok(parsed);
  const metadata = parsed.objects[0].metadata as PlannerSceneObject["metadata"] & Record<string, unknown>;
  assert.equal(metadata.componentCategory, "tables");
  assert.equal(metadata.visualVariant, "round");
  assert.equal(metadata.seatingTableId, "table-a");
  assert.equal(metadata.plannerAuditToken, "keep-me");
  assert.equal("plannerAuditScore" in metadata, false);
  assert.equal("plannerAuditCallback" in metadata, false);
  assert.equal(Object.hasOwn(metadata, "constructor"), false);
  assert.deepEqual(metadata.nested, { ok: true });
});

test("generated scene can accept repaired links without changing object geometry", () => {
  const object = objectWithMetadata({
    componentCategory: "tables",
    visualVariant: "round",
    neutralNote: "",
    seatingTableId: "table-a",
    seatingPlanId: "plan-a",
  });
  const parsed = parsePlannerSceneJson(JSON.stringify(sceneWithObject(object)));

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.scene.objects[0].transform, object.transform);
});
