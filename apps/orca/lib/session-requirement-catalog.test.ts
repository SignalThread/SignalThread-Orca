import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_REQUIREMENT_PLATFORM_DEFAULT_CATALOGS,
  budgetCategoryForSessionRequirementCatalogType,
  inferSessionRequirementCatalogType,
  isStaffingNeedRequirementItem,
} from "./session-requirement-catalog";

test("staffing need filter keeps role/count items and rejects F&B package labels", () => {
  assert.equal(isStaffingNeedRequirementItem({ key: "av-tech", label: "AV Tech" }), true);
  assert.equal(isStaffingNeedRequirementItem({ key: "stage-manager", label: "Stage Manager" }), true);
  assert.equal(isStaffingNeedRequirementItem({ key: "room-monitor", label: "Room Monitor" }), true);
  assert.equal(isStaffingNeedRequirementItem({ key: "bar-staff", label: "Bar Staff" }), true);

  assert.equal(isStaffingNeedRequirementItem({ key: "mimosa-bar-package", label: "Mimosa Bar Package" }), false);
  assert.equal(isStaffingNeedRequirementItem({ key: "breakfast", label: "Breakfast Package" }), false);
  assert.equal(isStaffingNeedRequirementItem({ key: "coffee-service", label: "Coffee Service" }), false);
});

test("signage remains a generic catalog while Supplies uses its dedicated workspace", () => {
  const types = SESSION_REQUIREMENT_PLATFORM_DEFAULT_CATALOGS.map((section) => section.type);
  assert.equal(types.includes("SUPPLIES"), false);
  assert.ok(types.includes("SIGNAGE"));
  assert.equal(inferSessionRequirementCatalogType({ key: "supplies", label: "Session materials" }), "SUPPLIES");
  assert.equal(inferSessionRequirementCatalogType({ key: "wayfinding", label: "Directional signs" }), "SIGNAGE");
  assert.equal(budgetCategoryForSessionRequirementCatalogType("SIGNAGE"), "Signage");
});
