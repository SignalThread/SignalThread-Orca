import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error TS project config does not enable allowImportingTsExtensions.
import { roomSetStorageKey } from "./persistence.ts";
import type { RoomSetDocumentV1 } from "./spatial-types.ts";

function installMemoryStorage() {
  const bag: Record<string, string> = {};
  const storage: Storage = {
    get length() {
      return Object.keys(bag).length;
    },
    clear() {
      for (const k of Object.keys(bag)) delete bag[k];
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null;
    },
    key(index: number) {
      return Object.keys(bag)[index] ?? null;
    },
    removeItem(key: string) {
      delete bag[key];
    },
    setItem(key: string, value: string) {
      bag[key] = value;
    },
  };
  globalThis.localStorage = storage;
}

test("roomSetStorageKey is stable per event + session", () => {
  assert.equal(roomSetStorageKey("e1", "s1"), "planner.roomSet:v1:e1:s1");
});

test("persist + load round-trip for a v1 document", async () => {
  installMemoryStorage();
  // @ts-expect-error TS project config does not enable allowImportingTsExtensions.
  const { persistRoomSetDocument, loadRoomSetDocument } = await import("./persistence.ts");

  const doc: RoomSetDocumentV1 = {
    version: 1,
    activeLayoutId: "lay-1",
    layouts: {
      "lay-1": {
        id: "lay-1",
        name: "Main",
        boundary: { widthLu: 40, depthLu: 30 },
        objects: [],
      },
    },
    plannerScenes: {
      "lay-1": {
        roomShell: {
          widthLu: 40,
          depthLu: 30,
          bounds: { xLu: 0, yLu: 0, widthLu: 40, depthLu: 30 },
        },
        objects: [
          {
            id: "planner-scene-object-1",
            componentId: "stage-riser",
            objectType: "stage",
            name: "Riser",
            label: "Stage",
            capacity: { seated: 0, staff: 0 },
            source: { kind: "manual", detail: "test" },
            transform: {
              xLu: 10,
              yLu: 4,
              widthLu: 12,
              depthLu: 8,
              rotationDeg: 0,
            },
            metadata: {
              componentCategory: "stages",
              visualVariant: "rect",
              neutralNote: "Small raised platform",
            },
          },
        ],
      },
    },
    layoutSpecs: {
      "lay-1": {
        version: 1,
        source: "ai-generate",
        eventIntent: "banquet_remarks",
        layoutType: "banquet",
        attendeeTarget: 80,
        densityPreference: "balanced",
        audienceStyle: "grid",
        front: { av: [] },
        audience: {
          primaryComponentId: "table-round-60",
          primaryComponentCapacity: 8,
          requiredPrimaryComponents: 10,
        },
        secondary: [],
      },
    },
  };

  const ok = persistRoomSetDocument("ev", "sess", doc);
  assert.equal(ok, true);

  const read = loadRoomSetDocument("ev", "sess");
  assert.deepEqual(read, doc);
  assert.equal(read?.layoutSpecs?.["lay-1"]?.eventIntent, "banquet_remarks");
});

test("load returns null for invalid JSON", async () => {
  installMemoryStorage();
  globalThis.localStorage.setItem(roomSetStorageKey("e", "s"), "{not json");
  // @ts-expect-error TS project config does not enable allowImportingTsExtensions.
  const { loadRoomSetDocument } = await import("./persistence.ts");
  assert.equal(loadRoomSetDocument("e", "s"), null);
});
