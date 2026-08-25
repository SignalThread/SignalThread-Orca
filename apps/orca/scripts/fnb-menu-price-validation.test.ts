import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasRealPriceText } from "../lib/fnb-menu-price-validation";

describe("F&B menu price validation", () => {
  it("accepts trailing-dot whole-dollar PDF prices", () => {
    assert.equal(hasRealPriceText("40.", "Continental Breakfast", "per person"), true);
    assert.equal(hasRealPriceText("55.", "Breakfast Buffet", "per person"), true);
    assert.equal(hasRealPriceText("70. per dozen", "Breakfast Bakeries & Muffins", "per dozen"), true);
    assert.equal(hasRealPriceText("7.00 each", "Bottled Water", "each"), true);
    assert.equal(hasRealPriceText("30 minutes 22. | 1 hour 32.", "Music City Break", "per person"), true);
  });

  it("does not accept garbage numeric strings", () => {
    assert.equal(hasRealPriceText("Room 301", "Meeting Room", ""), false);
    assert.equal(hasRealPriceText("30 minutes | 1 hour", "Timed Break", "per person"), false);
    assert.equal(hasRealPriceText("1.", "Tiny Noise", ""), false);
    assert.equal(hasRealPriceText("2024 menu page", "Menu Page", ""), false);
  });

  it("keeps Gaylord-style trailing-dot items out of rejectedAsGarbage", () => {
    const gaylordItems = [
      { itemName: "Continental Breakfast", price: "40.", unit: "per person" },
      { itemName: "Breakfast Buffet", price: "55.", unit: "per person" },
      { itemName: "Breakfast Bakeries & Muffins", price: "70. per dozen", unit: "per dozen" },
      { itemName: "Music City Break", price: "30 minutes 22. | 1 hour 32.", unit: "per person" },
    ];

    const rejectedAsGarbage = gaylordItems.filter((item) => !hasRealPriceText(item.price, item.itemName, item.unit));

    assert.deepEqual(rejectedAsGarbage, []);
  });
});
