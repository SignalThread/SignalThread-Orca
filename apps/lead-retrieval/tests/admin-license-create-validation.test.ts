import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLicenseBilling,
  normalizeLicenseBillingSource,
  normalizeLicenseScope,
  validateLicenseCreateScopeFields
} from "../lib/licenses/admin-license-create-validation";

test("normalizeLicenseScope accepts defaults and rejects unknown", () => {
  assert.equal(normalizeLicenseScope("event"), "event");
  assert.equal(normalizeLicenseScope("COMPANY"), "company");
  assert.equal(normalizeLicenseScope(undefined), null);
  assert.equal(normalizeLicenseScope("org"), null);
});

test("normalizeLicenseBilling", () => {
  assert.equal(normalizeLicenseBilling("one_time"), "one_time");
  assert.equal(normalizeLicenseBilling("MONTHLY"), "monthly");
  assert.equal(normalizeLicenseBilling("annual"), null);
});

test("normalizeLicenseBillingSource", () => {
  assert.equal(normalizeLicenseBillingSource("internal"), "internal");
  assert.equal(normalizeLicenseBillingSource("Stripe"), "stripe");
  assert.equal(normalizeLicenseBillingSource("app_store"), "app_store");
  assert.equal(normalizeLicenseBillingSource("google_play"), "google_play");
  assert.equal(normalizeLicenseBillingSource("paypal"), null);
});

test("validateLicenseCreateScopeFields: exhibitor always required", () => {
  assert.equal(
    validateLicenseCreateScopeFields({ scope: "event", eventId: "e1", exhibitorCompanyId: "" }),
    "exhibitorCompanyId is required"
  );
  assert.equal(
    validateLicenseCreateScopeFields({ scope: "company", eventId: "", exhibitorCompanyId: "  " }),
    "exhibitorCompanyId is required"
  );
});

test("validateLicenseCreateScopeFields: event only when scope is event", () => {
  assert.equal(
    validateLicenseCreateScopeFields({ scope: "event", eventId: "", exhibitorCompanyId: "c1" }),
    "eventId is required for event-scoped licenses"
  );
  assert.equal(
    validateLicenseCreateScopeFields({ scope: "company", eventId: "", exhibitorCompanyId: "c1" }),
    null
  );
  assert.equal(
    validateLicenseCreateScopeFields({ scope: "event", eventId: "e1", exhibitorCompanyId: "c1" }),
    null
  );
});
