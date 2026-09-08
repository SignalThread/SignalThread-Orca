import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_EVENT_STARTER_SIGNAL_NAMES,
  buildEventScopedSignalCopyRows,
  pickApprovedGlobalStarterRows,
  type EventScopedSignalSourceRow
} from "../lib/signals/event-scoped-signal-copies";

function sourceSignal(overrides: Partial<EventScopedSignalSourceRow> & Pick<EventScopedSignalSourceRow, "id" | "name">): EventScopedSignalSourceRow {
  return {
    id: overrides.id,
    name: overrides.name,
    category: overrides.category ?? "Custom",
    default_prompt: overrides.default_prompt ?? `${overrides.name} default prompt`,
    admin_override_prompt: overrides.admin_override_prompt ?? null,
    visibility: overrides.visibility ?? "global",
    role_scope: overrides.role_scope ?? null,
    template_scope: overrides.template_scope ?? null,
    is_active: overrides.is_active ?? true,
    available_in_pattern_mode: overrides.available_in_pattern_mode ?? true,
    tones: overrides.tones ?? ["Professional"],
    created_by: overrides.created_by ?? "global-admin"
  };
}

test("event-scoped copy builder copies exactly the four approved starter signals", () => {
  const rows = buildEventScopedSignalCopyRows({
    eventId: "event-a",
    companyId: "company-a",
    sourceRows: [
      sourceSignal({ id: "global-ai", name: "Conversation Brief Agent", category: "AI-Powered" }),
      sourceSignal({ id: "global-company", name: "Company Intel Agent", category: "Contextual" }),
      sourceSignal({ id: "global-next", name: "Follow-Up Agent", category: "Call-to-Action" }),
      sourceSignal({ id: "global-angle", name: "Positioning Agent", category: "AI-Powered" }),
      sourceSignal({ id: "global-ali", name: "Ali is great!!", category: "Custom" })
    ],
    createdBy: "event-creator"
  });

  assert.deepEqual(rows.map((row) => row.name), [...APPROVED_EVENT_STARTER_SIGNAL_NAMES]);
  assert.equal(rows.length, 4);
  assert.equal(rows.some((row) => row.name === "Ali is great!!"), false);
  assert.equal(rows.every((row) => row.event_id === "event-a"), true);
  assert.equal(rows.every((row) => row.company_id === "company-a"), true);
  assert.equal(rows.every((row) => row.signal_scope === "event"), true);
  assert.equal(rows.every((row) => row.owner_user_id === null), true);
  assert.equal(rows.every((row) => row.created_by === "event-creator"), true);
  assert.deepEqual(
    rows.map((row) => row.source_signal_id),
    ["global-ai", "global-company", "global-next", "global-angle"]
  );
});

test("event-scoped copies preserve editable signal fields from the global starter", () => {
  const [copy] = buildEventScopedSignalCopyRows({
    eventId: "event-a",
    companyId: "company-a",
    sourceRows: [
      sourceSignal({
        id: "global-angle",
        name: "Positioning Agent",
        category: "AI-Powered",
        default_prompt: "global default",
        admin_override_prompt: "global override",
        visibility: "role",
        role_scope: "exhibitor_admin",
        template_scope: "template-a",
        is_active: false,
        available_in_pattern_mode: false,
        tones: ["Consultative", "Persuasive"]
      })
    ]
  });

  assert.equal(copy.name, "Positioning Agent");
  assert.equal(copy.category, "AI-Powered");
  assert.equal(copy.default_prompt, "global default");
  assert.equal(copy.admin_override_prompt, "global override");
  assert.equal(copy.visibility, "role");
  assert.equal(copy.role_scope, "exhibitor_admin");
  assert.equal(copy.template_scope, "template-a");
  assert.equal(copy.is_active, false);
  assert.equal(copy.available_in_pattern_mode, false);
  assert.deepEqual(copy.tones, ["Consultative", "Persuasive"]);
});

test("copy builder skips starter signals that already exist for the event", () => {
  const rows = buildEventScopedSignalCopyRows({
    eventId: "event-a",
    companyId: "company-a",
    sourceRows: [
      sourceSignal({ id: "global-ai", name: "Conversation Brief Agent" }),
      sourceSignal({ id: "global-company", name: "Company Intel Agent" })
    ],
    existingRows: [{ source_signal_id: "global-ai", name: "Conversation Brief Agent" }]
  });

  assert.deepEqual(rows.map((row) => row.name), ["Company Intel Agent"]);
});

test("editing one event copy leaves the global starter and other event copies unchanged", () => {
  const globalStrategicAngle = sourceSignal({
    id: "global-angle",
    name: "Positioning Agent",
    default_prompt: "global strategic angle"
  });
  const [eventACopy] = buildEventScopedSignalCopyRows({
    eventId: "event-a",
    companyId: "company-a",
    sourceRows: [globalStrategicAngle]
  });
  const [eventBCopy] = buildEventScopedSignalCopyRows({
    eventId: "event-b",
    companyId: "company-a",
    sourceRows: [globalStrategicAngle]
  });

  const editedEventA = {
    ...eventACopy,
    default_prompt: "event a strategic angle"
  };

  assert.equal(editedEventA.default_prompt, "event a strategic angle");
  assert.equal(eventBCopy.default_prompt, "global strategic angle");
  assert.equal(globalStrategicAngle.default_prompt, "global strategic angle");
  assert.equal(eventACopy.event_id, "event-a");
  assert.equal(eventBCopy.event_id, "event-b");
  assert.equal(eventACopy.source_signal_id, globalStrategicAngle.id);
  assert.equal(eventBCopy.source_signal_id, globalStrategicAngle.id);
});

test("approved starter selection ignores custom global signals", () => {
  const picked = pickApprovedGlobalStarterRows([
    sourceSignal({ id: "global-ali", name: "Ali is great!!" }),
    sourceSignal({ id: "global-angle", name: "Positioning Agent" })
  ]);

  assert.deepEqual(picked.map((row) => row.name), ["Positioning Agent"]);
});

test("approved starter selection no longer treats old default labels as default agents", () => {
  const picked = pickApprovedGlobalStarterRows([
    sourceSignal({ id: "old-ai", name: "AI Summary", category: "AI-Powered" }),
    sourceSignal({ id: "old-company", name: "Company Context", category: "Contextual" }),
    sourceSignal({ id: "old-next", name: "Suggested Next Step", category: "Call-to-Action" }),
    sourceSignal({ id: "old-angle", name: "Strategic Angle", category: "AI-Powered" })
  ]);

  assert.deepEqual(picked.map((row) => row.name), []);
});

test("custom user-created agent names are not renamed or copied as default agents", () => {
  const custom = sourceSignal({ id: "custom-1", name: "Strategic Angle", category: "Custom" });
  const rows = buildEventScopedSignalCopyRows({
    eventId: "event-a",
    companyId: "company-a",
    sourceRows: [custom]
  });

  assert.equal(custom.name, "Strategic Angle");
  assert.deepEqual(rows, []);
});
