import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  attendeeOwnership,
  getRegistrationProviderAdapter,
  interpretCapabilities,
  isLocallyEditable,
  NO_CAPABILITIES,
  type RegistrationProviderCapabilities,
} from "../src/server/services/event-integration";

const service = readFileSync("src/server/services/event-integration.ts", "utf8");
const route = readFileSync("app/api/events/[eventId]/integrations/route.ts", "utf8");

function caps(over: Partial<RegistrationProviderCapabilities> = {}): RegistrationProviderCapabilities {
  return { ...NO_CAPABILITIES, ...over };
}

// --- capability interpretation ---------------------------------------------

test("a provider with no capabilities is read-only (no sync, no writeback)", () => {
  const i = interpretCapabilities(NO_CAPABILITIES);
  assert.equal(i.canSyncIn, false);
  assert.equal(i.canWriteback, false);
  assert.equal(i.isReadOnly, true);
});

test("pull-only provider can sync in but is still read-only for writeback", () => {
  const i = interpretCapabilities(caps({ canPullAttendees: true }));
  assert.equal(i.canSyncIn, true);
  assert.equal(i.canWriteback, false);
  assert.equal(i.isReadOnly, true);
});

test("a provider that can update/cancel is not read-only", () => {
  assert.equal(interpretCapabilities(caps({ canUpdateAttendees: true })).isReadOnly, false);
  assert.equal(interpretCapabilities(caps({ canCancelAttendees: true })).canWriteback, true);
});

// --- ownership + editability -----------------------------------------------

test("attendee ownership distinguishes local / imported / integration-owned", () => {
  assert.equal(attendeeOwnership({ source: "MANUAL", syncStatus: "LOCAL_ONLY", hasExternalIdentity: false }), "local");
  assert.equal(attendeeOwnership({ source: "CSV_IMPORT", syncStatus: "LOCAL_ONLY", hasExternalIdentity: false }), "imported");
  assert.equal(attendeeOwnership({ source: "REGISTRATION_INTEGRATION", syncStatus: "SYNCED", hasExternalIdentity: true }), "integration_owned");
  assert.equal(attendeeOwnership({ source: "MANUAL", syncStatus: "LOCAL_ONLY", hasExternalIdentity: true }), "integration_owned");
});

test("local/imported are always locally editable; integration-owned only with writeback", () => {
  assert.equal(isLocallyEditable("local", NO_CAPABILITIES), true);
  assert.equal(isLocallyEditable("imported", NO_CAPABILITIES), true);
  assert.equal(isLocallyEditable("integration_owned", NO_CAPABILITIES), false);
  assert.equal(isLocallyEditable("integration_owned", caps({ canUpdateAttendees: true })), true);
});

// --- provider-agnostic -----------------------------------------------------

test("no real provider adapters are registered (Bizzabo/Aura return null)", () => {
  assert.equal(getRegistrationProviderAdapter("bizzabo"), null);
  assert.equal(getRegistrationProviderAdapter("aura"), null);
  assert.equal(getRegistrationProviderAdapter("anything"), null);
});

test("the core has no provider-specific assumptions (no hardcoded provider names)", () => {
  for (const name of ["bizzabo", "aura", "cvent"]) {
    assert.doesNotMatch(service.toLowerCase().replace(/\/\*[\s\S]*?\*\//g, ""), new RegExp(`"${name}"`), `no hardcoded ${name}`);
  }
  // provider is a free string with a generic adapter seam.
  assert.match(service, /export interface RegistrationProviderAdapter/);
  assert.match(service, /const PROVIDER_ADAPTERS: Record<string, RegistrationProviderAdapter> = \{\}/);
});

// --- persistence + route ---------------------------------------------------

test("connection upsert is event+provider unique and capability-driven; route exposes interpretation", () => {
  assert.match(service, /eventId_provider: \{ eventId: args\.eventId, provider \}/);
  assert.match(service, /const caps = normalizeCapabilities\(args\.capabilities\)/);
  assert.match(service, /Unknown capability/);
  assert.ok(existsSync("app/api/events/[eventId]/integrations/route.ts"));
  assert.match(route, /interpretCapabilities/);
  assert.match(route, /listEventIntegrationConnections/);
  assert.match(route, /upsertEventIntegrationConnection/);
});

test("external identity mapping is generic (object type + id) and idempotent", () => {
  assert.match(service, /eventId_provider_externalObjectType_externalObjectId/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /eventExternalIdentity\.upsert/);
  assert.match(service, /return \{ created: !existing, id: identity\.id \}/);
  assert.match(service, /eventDirectoryPerson\.findFirst\(\{ where: \{ id: args\.directoryPersonId, eventId: args\.eventId/);
});
