import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSignalInsertPatch } from "@/lib/signals/signal-mutation-patches";
import type { SignalMutationPayload } from "@/components/signals/signal-types";

const payload: SignalMutationPayload = {
  name: "fringe test case",
  category: "Custom",
  default_prompt: "Use the event conversation context.",
  admin_override_prompt: null,
  visibility: "global",
  signal_scope: "event",
  role_scope: null,
  template_scope: null,
  is_active: true,
  available_in_pattern_mode: true,
  tones: ["Professional"]
};

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("event-scoped signal create patch saves event ownership and never creates a global orphan", () => {
  const patch = buildSignalInsertPatch(payload, "user-1", { eventId: "event-1", companyId: "company-1" });

  assert.equal(patch.name, "fringe test case");
  assert.equal(patch.event_id, "event-1");
  assert.equal(patch.company_id, "company-1");
  assert.equal(patch.signal_scope, "event");
  assert.equal(patch.owner_user_id, "user-1");
  assert.equal(patch.source_signal_id, null);
  assert.notEqual(patch.visibility, "global");
  assert.equal(patch.role_scope, "exhibitor_admin");
});

test("company-wide signal create patch keeps company visibility with creator ownership", () => {
  const patch = buildSignalInsertPatch({ ...payload, signal_scope: "company" }, "user-1", { companyId: "company-1" });

  assert.equal(patch.event_id, null);
  assert.equal(patch.company_id, "company-1");
  assert.equal(patch.signal_scope, "company");
  assert.equal(patch.owner_user_id, "user-1");
  assert.equal(patch.source_signal_id, null);
  assert.equal(patch.visibility, "role");
});

test("private signal create patch keeps company, event, and user ownership", () => {
  const patch = buildSignalInsertPatch({ ...payload, signal_scope: "private" }, "user-1", {
    eventId: "event-1",
    companyId: "company-1",
    ownerUserId: "user-1"
  });

  assert.equal(patch.event_id, "event-1");
  assert.equal(patch.company_id, "company-1");
  assert.equal(patch.owner_user_id, "user-1");
  assert.equal(patch.signal_scope, "private");
});

test("GET /api/signals?eventId reads event-scoped rows rather than exposing global custom signals", () => {
  const src = read("lib/data/signals.ts");

  assert.match(src, /if \(eventId\) \{/);
  assert.match(src, /getEventScopedSignalRowsForUser\(sessionUser, eventId, options\)/);
  assert.match(src, /loadSignalRowsForEventContext\(/);
  assert.match(src, /filterWorkflowSelectableSignalRowsForEvent\(eventRows/);
  assert.doesNotMatch(src, /loadApprovedGlobalStarterSignalRows\(\)/);
});

test("exhibitor create/edit/delete flows carry eventId into signal mutations", () => {
  const createPage = read("components/signals/signal-create-page.tsx");
  const libraryClient = read("components/signals/signal-library-client.tsx");
  const editPage = read("components/signals/signal-edit-page.tsx");
  const newRoute = read("app/(app)/exhibitor/signals/new/page.tsx");

  assert.match(newRoute, /resolveExhibitorAppActiveEventId\(sessionUser\.id, rawEventId \?\? null\)/);
  assert.match(createPage, /requestSaveSignal\(payload, undefined, \{ eventId \}\)/);
  assert.match(libraryClient, /requestSaveSignal\(payload, signalId, \{ eventId \}\)/);
  assert.match(libraryClient, /appendEventId\(`\/api\/signals\/\$\{encodeURIComponent\(signal\.id\)\}`, eventId\)/);
  assert.match(editPage, /requestSaveSignal\(payload, signalId, \{ eventId \}\)/);
});

test("signal library table hides usage and marks default-derived rows beside the signal name", () => {
  const libraryClient = read("components/signals/signal-library-client.tsx");
  const tableSection = libraryClient.slice(
    libraryClient.indexOf('<table className="w-full table-fixed text-left">'),
    libraryClient.indexOf("</table>") + "</table>".length
  );

  assert.doesNotMatch(tableSection, />Usage<\/th>/);
  assert.doesNotMatch(tableSection, /signal\.usage_count/);
  assert.match(libraryClient, /isDefaultDerivedSignal/);
  assert.match(libraryClient, /Boolean\(signal\.source_signal_id\)/);
  assert.match(libraryClient, /isDefaultDerived \? systemDefaultBadge\(\) : null/);
});

test("signal API validates event access and prevents exhibitor global mutations", () => {
  const createRoute = read("app/api/signals/route.ts");
  const editRoute = read("app/api/signals/[signalId]/route.ts");

  assert.match(createRoute, /Event id is required for exhibitor Campaign Agent creation/);
  assert.match(createRoute, /assertEventIdAccessibleForUser\(normalizedSessionUser\.id, eventId\)/);
  assert.match(createRoute, /Default Campaign Agents are starter templates and cannot be created here/);
  assert.match(createRoute, /loadSignalEventContext\(eventId\)/);
  assert.match(createRoute, /ownerUserId: normalizedSessionUser\.id/);
  assert.match(createRoute, /toSignalInsertPatch\(/);
  assert.match(editRoute, /Event id is required for exhibitor Campaign Agent updates/);
  assert.match(editRoute, /Default Campaign Agents are starter templates and cannot be edited directly/);
  assert.match(editRoute, /authorizeSignalDelete\(/);
  assert.match(editRoute, /existing\.owner_user_id \?\? sessionUser\.id/);
  assert.match(editRoute, /\.update\(updatePatch as never\)\s*\.eq\("id", existing\.id\)/s);
  assert.match(editRoute, /\.delete\(\)\.eq\("id", existing\.id\)/);
});

test("signal rows and event-scoped loaders preserve owner_user_id serialization without changing scope semantics", () => {
  const signalData = read("lib/data/signals.ts");
  const eventScopedLoader = read("lib/server/signals/event-scoped-signal-copies.ts");

  assert.match(signalData, /owner_user_id: row\.owner_user_id \?\? null/);
  assert.match(eventScopedLoader, /return row\.company_id === input\.companyId && row\.event_id === input\.eventId;/);
  assert.doesNotMatch(eventScopedLoader, /row\.event_id === input\.eventId && !row\.owner_user_id/);
});
