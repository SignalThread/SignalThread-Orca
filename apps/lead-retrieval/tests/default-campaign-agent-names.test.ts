import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  APPROVED_EVENT_STARTER_SIGNAL_NAMES,
  pickApprovedGlobalStarterRows,
  type EventScopedSignalSourceRow
} from "../lib/signals/event-scoped-signal-copies";

const root = process.cwd();
const NEW_DEFAULT_NAMES = [
  "Conversation Brief Agent",
  "Company Intel Agent",
  "Follow-Up Agent",
  "Positioning Agent"
] as const;
const OLD_DEFAULT_NAMES = [
  "AI Summary",
  "Company Context",
  "Suggested Next Step",
  "Strategic Angle"
] as const;

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function sourceSignal(name: string): EventScopedSignalSourceRow {
  return {
    id: `id-${name}`,
    name,
    category: "Custom",
    default_prompt: `${name} prompt`,
    admin_override_prompt: null,
    visibility: "global",
    role_scope: null,
    template_scope: null,
    is_active: true,
    available_in_pattern_mode: true,
    tones: [],
    created_by: "seed"
  };
}

test("default campaign agent allowlist uses the renamed labels", () => {
  assert.deepEqual([...APPROVED_EVENT_STARTER_SIGNAL_NAMES], [...NEW_DEFAULT_NAMES]);
  for (const oldName of OLD_DEFAULT_NAMES) {
    assert.equal(APPROVED_EVENT_STARTER_SIGNAL_NAMES.includes(oldName as never), false);
  }
});

test("default campaign agent rename migration targets only defaults and default-derived event copies", () => {
  const migration = read("supabase/migrations/0083_rename_default_campaign_agents.sql");

  for (const name of [...OLD_DEFAULT_NAMES, ...NEW_DEFAULT_NAMES]) {
    assert.match(migration, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(migration, /where s\.signal_scope = 'default'/);
  assert.match(migration, /s\.source_signal_id = d\.id/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
});

test("UI fallback labels use renamed default agent names", () => {
  const starterTemplates = read("components/signals/signal-starter-templates.ts");
  const createBuilder = read("components/signals/signal-create-builder.tsx");
  const leadDetail = read("app/(app)/exhibitor/leads/[leadId]/page.tsx");

  assert.match(starterTemplates, /Positioning Agent/);
  assert.match(starterTemplates, /Company Intel Agent/);
  assert.match(createBuilder, /Positioning Agent/);
  assert.match(leadDetail, /Conversation Brief Agent/);
});

test("old default labels are not copied as default agents and custom names remain unchanged", () => {
  const picked = pickApprovedGlobalStarterRows([
    ...OLD_DEFAULT_NAMES.map((name) => sourceSignal(name)),
    ...NEW_DEFAULT_NAMES.map((name) => sourceSignal(name))
  ]);

  assert.deepEqual(picked.map((row) => row.name), [...NEW_DEFAULT_NAMES]);

  const custom = sourceSignal("Strategic Angle");
  assert.equal(custom.name, "Strategic Angle");
  assert.deepEqual(pickApprovedGlobalStarterRows([custom]), []);
});
