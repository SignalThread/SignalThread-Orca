import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogItemPriceDisplayIncludesUnit,
  formatCatalogItemPriceDisplay,
  formatCatalogItemUnitDisplay,
} from "../lib/fnb-catalog-price-display";

describe("F&B catalog price display", () => {
  it("formats trailing-dot prices with embedded per units", () => {
    assert.equal(formatCatalogItemPriceDisplay({ price: "120. per gallon", unit: "per gallon" }), "$120 / gallon");
    assert.equal(formatCatalogItemPriceDisplay({ price: "70. per dozen", unit: "per dozen" }), "$70 / dozen");
  });

  it("formats each-unit prices without duplicating units", () => {
    assert.equal(formatCatalogItemPriceDisplay({ price: "7. each", unit: "each" }), "$7 each");
    assert.equal(formatCatalogItemPriceDisplay({ price: "5.50 each", unit: "each" }), "$5.50 each");
  });

  it("formats tiered duration prices with a single trailing unit", () => {
    assert.equal(
      formatCatalogItemPriceDisplay({ price: "30 minutes 22. | 1 hour 32.", unit: "per person" }),
      "30 min: $22 / 1 hr: $32 per person",
    );
  });

  it("uses separate unit when price is amount-only", () => {
    assert.equal(formatCatalogItemPriceDisplay({ price: "40.", unit: "per person" }), "$40 / person");
    assert.equal(formatCatalogItemPriceDisplay({ price: "$65", unit: "per bottle" }), "$65 / bottle");
  });

  it("normalizes common source-menu price/unit phrases", () => {
    assert.equal(formatCatalogItemPriceDisplay({ price: "7", unit: "priced per item" }), "$7 each");
    assert.equal(formatCatalogItemPriceDisplay({ price: "21", unit: "Per Price Person" }), "$21 / person");
    assert.equal(formatCatalogItemPriceDisplay({ price: "70", unit: "Priced per Dozen" }), "$70 / dozen");
    assert.equal(formatCatalogItemPriceDisplay({ price: "$7 priced per item", unit: null }), "$7 each");
    assert.equal(formatCatalogItemPriceDisplay({ price: "$21 / price person", unit: null }), "$21 / person");
  });

  it("normalizes bottle, glass, drink, and gallon units", () => {
    assert.equal(formatCatalogItemPriceDisplay({ price: "$65", unit: "Price per Bottle" }), "$65 / bottle");
    assert.equal(formatCatalogItemPriceDisplay({ price: "$14", unit: "priced per glass" }), "$14 / glass");
    assert.equal(formatCatalogItemPriceDisplay({ price: "$18", unit: "price per drink" }), "$18 / drink");
    assert.equal(formatCatalogItemPriceDisplay({ price: "120. per gallon", unit: "per gallon" }), "$120 / gallon");
  });

  it("reports when formatted display already includes unit context", () => {
    assert.equal(catalogItemPriceDisplayIncludesUnit({ price: "120. per gallon", unit: "per gallon" }), true);
    assert.equal(catalogItemPriceDisplayIncludesUnit({ price: "$65", unit: null }), false);
  });

  it("returns compact unit display only when unit is not already in price", () => {
    assert.equal(formatCatalogItemUnitDisplay({ price: "7", unit: "priced per item" }), "");
    assert.equal(formatCatalogItemUnitDisplay({ price: "$21 / price person", unit: "Per Price Person" }), "");
    assert.equal(formatCatalogItemUnitDisplay({ price: "", unit: "Priced per Bottle" }), "bottle");
  });
});
