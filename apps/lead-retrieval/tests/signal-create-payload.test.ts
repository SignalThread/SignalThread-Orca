import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SignalMutationPayload } from "@/components/signals/signal-types";
import { buildSignalInsertPatch } from "@/lib/signals/signal-mutation-patches";
import {
  categorySwitchPatch,
  isStarterTemplateSelection,
  legacyVisibilityForSignalScope,
  SCRATCH_TEMPLATE_ID,
  scopesForMutationPayload,
  tonesForMutationPayload
} from "../components/signals/signal-create-payload";

const baseCreatePayload: SignalMutationPayload = {
  name: "Strategic Angle",
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

describe("signal-create-payload", () => {
  describe("scopesForMutationPayload", () => {
    it("clears both scopes for global visibility", () => {
      assert.deepEqual(scopesForMutationPayload("global", "event_organizer", "Lead Intel"), {
        role_scope: null,
        template_scope: null
      });
    });

    it("keeps role scope only for role visibility", () => {
      assert.deepEqual(scopesForMutationPayload("role", "event_organizer", "Lead Intel"), {
        role_scope: "event_organizer",
        template_scope: null
      });
    });

    it("trims role scope and nulls template for role visibility", () => {
      assert.deepEqual(scopesForMutationPayload("role", "  exhibitor_admin  ", ""), {
        role_scope: "exhibitor_admin",
        template_scope: null
      });
    });

    it("keeps template scope only for template visibility", () => {
      assert.deepEqual(scopesForMutationPayload("template", "event_organizer", "Lead Intel"), {
        role_scope: null,
        template_scope: "Lead Intel"
      });
    });

    it("nulls empty trimmed role for role visibility", () => {
      assert.deepEqual(scopesForMutationPayload("role", "   ", "x"), {
        role_scope: null,
        template_scope: null
      });
    });
  });

  describe("tonesForMutationPayload", () => {
    it("create: defaults to Professional when empty or invalid", () => {
      assert.deepEqual(tonesForMutationPayload("create", []), ["Professional"]);
      assert.deepEqual(tonesForMutationPayload("create", ["Invalid" as never]), ["Professional"]);
    });

    it("create: uses first valid tone as primary", () => {
      assert.deepEqual(tonesForMutationPayload("create", ["Friendly"]), ["Friendly"]);
      assert.deepEqual(tonesForMutationPayload("create", ["Invalid" as never, "Consultative"]), ["Consultative"]);
    });

    it("edit: keeps multiple valid tones", () => {
      assert.deepEqual(tonesForMutationPayload("edit", ["Friendly", "Persuasive"]), ["Friendly", "Persuasive"]);
    });

    it("edit: falls back to Professional when none valid", () => {
      assert.deepEqual(tonesForMutationPayload("edit", ["Invalid" as never]), ["Professional"]);
    });
  });

  describe("legacyVisibilityForSignalScope", () => {
    it("keeps default as legacy global and scoped user signals as role-owned compatibility rows", () => {
      assert.equal(legacyVisibilityForSignalScope("default"), "global");
      assert.equal(legacyVisibilityForSignalScope("company"), "role");
      assert.equal(legacyVisibilityForSignalScope("event"), "role");
      assert.equal(legacyVisibilityForSignalScope("private"), "role");
    });
  });

  it("SCRATCH_TEMPLATE_ID is stable", () => {
    assert.equal(SCRATCH_TEMPLATE_ID, "__scratch__");
  });

  describe("category switch (create builder)", () => {
    it("isStarterTemplateSelection is true only for real starter ids", () => {
      assert.equal(isStarterTemplateSelection(null), false);
      assert.equal(isStarterTemplateSelection(SCRATCH_TEMPLATE_ID), false);
      assert.equal(isStarterTemplateSelection("ai-strategic-angle"), true);
    });

    it("clears starter binding when a category starter was selected", () => {
      assert.deepEqual(categorySwitchPatch("ai-strategic-angle"), {
        clearStarterPrefill: true,
        nextSelectedTemplateId: null
      });
    });

    it("preserves scratch selection and does not mark prefill clear", () => {
      assert.deepEqual(categorySwitchPatch(SCRATCH_TEMPLATE_ID), {
        clearStarterPrefill: false,
        nextSelectedTemplateId: SCRATCH_TEMPLATE_ID
      });
    });

    it("preserves undecided (null) selection", () => {
      assert.deepEqual(categorySwitchPatch(null), {
        clearStarterPrefill: false,
        nextSelectedTemplateId: null
      });
    });
  });

  describe("create scope mapping", () => {
    it("maps company-wide creates to company visibility plus creator ownership", () => {
      const patch = buildSignalInsertPatch(
        { ...baseCreatePayload, signal_scope: "company" },
        "user-1",
        { companyId: "company-1" }
      );

      assert.equal(patch.signal_scope, "company");
      assert.equal(patch.company_id, "company-1");
      assert.equal(patch.event_id, null);
      assert.equal(patch.owner_user_id, "user-1");
    });

    it("maps event-only creates to company plus selected event visibility and creator ownership", () => {
      const patch = buildSignalInsertPatch(
        { ...baseCreatePayload, signal_scope: "event" },
        "user-1",
        { companyId: "company-1", eventId: "event-1" }
      );

      assert.equal(patch.signal_scope, "event");
      assert.equal(patch.company_id, "company-1");
      assert.equal(patch.event_id, "event-1");
      assert.equal(patch.owner_user_id, "user-1");
    });

    it("maps private creates to company, event, and current-user ownership", () => {
      const patch = buildSignalInsertPatch(
        { ...baseCreatePayload, signal_scope: "private" },
        "user-1",
        { companyId: "company-1", eventId: "event-1", ownerUserId: "user-1" }
      );

      assert.equal(patch.signal_scope, "private");
      assert.equal(patch.company_id, "company-1");
      assert.equal(patch.event_id, "event-1");
      assert.equal(patch.owner_user_id, "user-1");
    });
  });
});
