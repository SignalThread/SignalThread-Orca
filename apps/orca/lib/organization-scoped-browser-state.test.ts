import assert from "node:assert/strict";
import test from "node:test";
import { clearOrganizationScopedStorage } from "./organization-scoped-browser-state";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  constructor(entries: Array<[string, string]>) {
    entries.forEach(([key, value]) => this.values.set(key, value));
  }

  get length() {
    return this.values.size;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  has(key: string) {
    return this.values.has(key);
  }
}

test("clearing account context removes event-scoped storage but keeps personal UI preferences", () => {
  const storage = new MemoryStorage([
    ["matrix2:selectedEventId", "event-a"],
    ["timeline:selectedEventId", "event-a"],
    ["matrix2:boardOrientation:event-a", "horizontal"],
    ["planner-os:event-cc-layout:event-a:plan", "{}"],
    ["planner.roomSet:v1:event-a:session-a", "{}"],
    ["timeline:view", "BOARD"],
    ["planner-os:shell-sidebar-open", "true"],
  ]);

  clearOrganizationScopedStorage(storage);

  assert.equal(storage.has("matrix2:selectedEventId"), false);
  assert.equal(storage.has("timeline:selectedEventId"), false);
  assert.equal(storage.has("matrix2:boardOrientation:event-a"), false);
  assert.equal(storage.has("planner-os:event-cc-layout:event-a:plan"), false);
  assert.equal(storage.has("planner.roomSet:v1:event-a:session-a"), false);
  assert.equal(storage.has("timeline:view"), true);
  assert.equal(storage.has("planner-os:shell-sidebar-open"), true);
});
