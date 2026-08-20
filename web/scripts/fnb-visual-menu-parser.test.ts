import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  cleanupVisualFnbMenuRows,
  createVisualFnbPageBatches,
  getVisualFnbRenderedPageLimit,
  parseFnbMenuVisually,
} from "../lib/fnb-visual-menu-parser";

describe("visual F&B menu parser cleanup", () => {
  it("covers a 43-page menu with 5-page batches and 1-page overlap", () => {
    const pages = Array.from({ length: 43 }, (_, index) => ({
      pageNumber: index + 1,
      dataUrl: `data:image/png;base64,page-${index + 1}`,
      width: 1500,
      height: 2000,
    }));

    const batches = createVisualFnbPageBatches(pages, { batchSize: 5, pageOverlap: 1, maxBatches: 12 });
    const coveredPageNumbers = new Set(batches.flat().map((page) => page.pageNumber));

    assert.equal(getVisualFnbRenderedPageLimit(), 49);
    assert.equal(batches.length, 11);
    assert.deepEqual(batches[0].map((page) => page.pageNumber), [1, 2, 3, 4, 5]);
    assert.deepEqual(batches[1].map((page) => page.pageNumber), [5, 6, 7, 8, 9]);
    assert.deepEqual(batches.at(-1)?.map((page) => page.pageNumber), [41, 42, 43]);
    assert.equal(coveredPageNumbers.size, 43);
    assert.deepEqual([...coveredPageNumbers].sort((a, b) => a - b), pages.map((page) => page.pageNumber));

    for (let index = 1; index < batches.length; index += 1) {
      assert.equal(batches[index - 1].at(-1)?.pageNumber, batches[index][0].pageNumber);
      assert.ok(batches[index].length <= 5);
    }
  });

  it("keeps visually priced catalog rows with trailing-dot and tiered prices", () => {
    const result = cleanupVisualFnbMenuRows([
      { itemName: "Continental Breakfast", description: "Assorted pastries and fruit", category: "Breakfast", price: "40.", unit: "per person", pageNumber: 2, confidence: 0.92 },
      { itemName: "Breakfast Buffet", description: "Hot buffet", category: "Breakfast", price: "55.", unit: "per person", pageNumber: 3, confidence: 0.88 },
      { itemName: "Breakfast Bakeries & Muffins", description: "", category: "Breakfast", price: "70. per dozen", unit: "per dozen", pageNumber: 4, confidence: 0.91 },
      { itemName: "Bottled Water", description: "", category: "Beverage", price: "7.00 each", unit: "each", pageNumber: 8, confidence: 0.9 },
      { itemName: "Refresh Break", description: "Timed beverage service", category: "Breaks", price: "30 minutes 22. | 1 hour 32.", unit: "per person", pageNumber: 9, confidence: 0.86 },
      { itemName: "House Cabernet", description: "", category: "Wine", price: "$65 per bottle", unit: "per bottle", pageNumber: 22, confidence: 0.94 },
    ], { fileName: "Gaylord Menu.pdf" });

    assert.equal(result.items.length, 6);
    assert.deepEqual(result.ledger.map((entry) => entry.decision), ["saved", "saved", "saved", "saved", "saved", "saved"]);
    assert.equal(result.items[0].sourceMenuFileName, "Gaylord Menu.pdf");
  });

  it("keeps unpriced orderable catering offerings with empty price fields", () => {
    const result = cleanupVisualFnbMenuRows([
      { pageTitle: "Breakfast Buffets", sectionTitle: "", category: "", itemName: "Southern Breakfast Buffet", description: "Scrambled eggs, bacon, breakfast potatoes, pastries", price: "", unit: "", pageNumber: 4, confidence: 0.93 },
      { pageTitle: "Reception Stations", sectionTitle: "Action Stations", category: "", itemName: "Build Your Own Pasta Station", description: "Chef-attended pasta station with sauces and toppings", price: "", unit: "", pageNumber: 12, confidence: 0.9 },
      { pageTitle: "Hosted Bar Packages", sectionTitle: "", category: "", itemName: "Premium Hosted Bar Package", description: "Premium spirits, beer, wine, and soft drinks", price: "", unit: "", pageNumber: 20, confidence: 0.91 },
      { pageTitle: "À La Carte Beverages", sectionTitle: "À La Carte", category: "", itemName: "A La Carte Coffee Service", description: "Freshly brewed regular and decaffeinated coffee", price: "", unit: "", pageNumber: 22, confidence: 0.88 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.equal(result.items.length, 4);
    assert.deepEqual(result.items.map((item) => item.price), ["", "", "", ""]);
    assert.deepEqual(result.items.map((item) => item.unit), ["", "", "", ""]);
    assert.deepEqual(result.items.map((item) => item.category), ["Breakfast", "Reception", "Beverage", "A La Carte"]);
    assert.ok(result.ledger.every((entry) => entry.decision === "saved"));
    assert.ok(result.ledger.every((entry) => entry.reason === "Orderable catering offering without visible price"));
  });

  it("rejects generic section headings without prices or descriptions", () => {
    const result = cleanupVisualFnbMenuRows([
      { itemName: "Breakfast Buffets", description: "", category: "", price: "", unit: "", pageNumber: 3, confidence: 0.92 },
      { itemName: "Reception Displays", description: "", category: "", price: "", unit: "", pageNumber: 8, confidence: 0.9 },
      { itemName: "Bar Packages", description: "", category: "", price: "", unit: "", pageNumber: 15, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.equal(result.items.length, 0);
    assert.deepEqual(result.ledger.map((entry) => entry.decision), ["rejected", "rejected", "rejected"]);
    assert.ok(result.ledger.every((entry) => entry.reason === "Generic section heading, not an orderable offering"));
  });

  it("rejects policy, footer, tax, guarantee, and explanatory rows", () => {
    const result = cleanupVisualFnbMenuRows([
      { itemName: "Pricing Guaranteed Through July 31", description: "", category: "", price: "2024", unit: "", pageNumber: 1, confidence: 0.9 },
      { itemName: "An additional charge of", description: "will apply to late requests", category: "", price: "25.", unit: "", pageNumber: 2, confidence: 0.9 },
      { itemName: "Paid at the time of signing", description: "deposit policy", category: "", price: "$500", unit: "", pageNumber: 2, confidence: 0.9 },
      { itemName: "(Based on", description: "minimum attendance", category: "", price: "100", unit: "", pageNumber: 3, confidence: 0.9 },
      { itemName: "All prices are subject", description: "to taxable service charge", category: "", price: "24.", unit: "", pageNumber: 4, confidence: 0.9 },
    ], { fileName: "Policy Menu.pdf" });

    assert.equal(result.items.length, 0);
    assert.deepEqual(result.ledger.map((entry) => entry.decision), ["rejected", "rejected", "rejected", "rejected", "rejected"]);
    assert.ok(result.ledger.every((entry) => /Policy|Missing real visible price|Item name/.test(entry.reason)));
  });

  it("rejects policy, service, minimum, served-with, and included-items copy without prices", () => {
    const result = cleanupVisualFnbMenuRows([
      { itemName: "All Buffets Include", description: "Freshly brewed regular and decaffeinated coffee, iced tea, and rolls", category: "", price: "", unit: "", pageNumber: 5, confidence: 0.9 },
      { itemName: "Served With Dinner Rolls And Butter", description: "", category: "Dinner", price: "", unit: "", pageNumber: 13, confidence: 0.9 },
      { itemName: "Minimum Of 25 Guests Required", description: "", category: "", price: "", unit: "", pageNumber: 18, confidence: 0.9 },
      { itemName: "Taxable Service Charge", description: "All prices are subject to service charge and sales tax", category: "", price: "", unit: "", pageNumber: 30, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.equal(result.items.length, 0);
    assert.deepEqual(result.ledger.map((entry) => entry.decision), ["rejected", "rejected", "rejected", "rejected"]);
    assert.ok(result.ledger.every((entry) => /Non-orderable|Policy/.test(entry.reason)));
  });

  it("rejects unpriced descriptions and ingredients that are not selectable offerings", () => {
    const result = cleanupVisualFnbMenuRows([
      { itemName: "Seasonal Vegetables", description: "Chef selection of market vegetables", category: "", price: "", unit: "", pageNumber: 10, confidence: 0.9 },
      { itemName: "Fresh Herbs", description: "Basil, parsley, and chives", category: "", price: "", unit: "", pageNumber: 10, confidence: 0.9 },
      { itemName: "Random Description", description: "Designed to complement your event experience", category: "", price: "", unit: "", pageNumber: 11, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.equal(result.items.length, 0);
    assert.deepEqual(result.ledger.map((entry) => entry.decision), ["rejected", "rejected", "rejected"]);
    assert.ok(result.ledger.every((entry) => entry.reason === "Missing price and not a clear orderable offering"));
  });

  it("accepts hotel-style packages, buffets, stations, and bar offerings without prices", () => {
    const result = cleanupVisualFnbMenuRows([
      { pageTitle: "Meeting Packages", sectionTitle: "", category: "", itemName: "Executive Meeting Package", description: "Breakfast, continuous beverage service, and afternoon snack", price: "", unit: "", pageNumber: 2, confidence: 0.91 },
      { pageTitle: "Breakfast Buffets", sectionTitle: "", category: "", itemName: "Atlanta Breakfast Buffet", description: "Scrambled eggs, bacon, sausage, breakfast potatoes, pastries", price: "", unit: "", pageNumber: 4, confidence: 0.92 },
      { pageTitle: "Reception Stations", sectionTitle: "Chef Attended Stations", category: "", itemName: "Chef Attended Omelet Station", description: "Made-to-order omelets with assorted toppings", price: "", unit: "", pageNumber: 8, confidence: 0.9 },
      { pageTitle: "Hosted Bar Packages", sectionTitle: "", category: "", itemName: "Premium Bar Package", description: "Premium spirits, imported beer, domestic beer, wine, and mixers", price: "", unit: "", pageNumber: 14, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.equal(result.items.length, 4);
    assert.deepEqual(result.items.map((item) => item.itemName), [
      "Executive Meeting Package",
      "Atlanta Breakfast Buffet",
      "Chef Attended Omelet Station",
      "Premium Bar Package",
    ]);
    assert.deepEqual(result.items.map((item) => item.price), ["", "", "", ""]);
    assert.deepEqual(result.ledger.map((entry) => entry.decision), ["saved", "saved", "saved", "saved"]);
  });

  it("keeps parent packages and suppresses child components already captured in the parent description", () => {
    const result = cleanupVisualFnbMenuRows([
      {
        pageTitle: "Dinner Buffets",
        sectionTitle: "Regional Dinner Buffet",
        category: "",
        itemName: "Coastal Dinner Buffet",
        description: "Includes baby kale salad, beef bourguignon, coconut cake, and artisan rolls.",
        price: "",
        unit: "",
        pageNumber: 16,
        confidence: 0.93,
      },
      { pageTitle: "Dinner Buffets", sectionTitle: "Regional Dinner Buffet", category: "", itemName: "Baby Kale Salad", description: "", price: "", unit: "", pageNumber: 16, confidence: 0.9 },
      { pageTitle: "Dinner Buffets", sectionTitle: "Regional Dinner Buffet", category: "", itemName: "Beef Bourguignon", description: "", price: "", unit: "", pageNumber: 16, confidence: 0.9 },
      { pageTitle: "Dinner Buffets", sectionTitle: "Regional Dinner Buffet", category: "", itemName: "Coconut Cake", description: "", price: "", unit: "", pageNumber: 16, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), ["Coastal Dinner Buffet"]);
    assert.equal(result.items[0].description.includes("beef bourguignon"), true);
    assert.equal(result.ledger.filter((entry) => entry.reason.startsWith("Component already captured")).length, 3);
  });

  it("suppresses station-named children when a package parent contains them in the same context", () => {
    const result = cleanupVisualFnbMenuRows([
      {
        pageTitle: "Dinner Packages",
        sectionTitle: "Regional Feasts",
        category: "",
        itemName: "Pacific Rim",
        description: "Package includes Japanese sushi & nigiri, tuna poke shooters, and Asian street food station.",
        price: "",
        unit: "",
        pageNumber: 22,
        confidence: 0.93,
      },
      { pageTitle: "Dinner Packages", sectionTitle: "Regional Feasts", category: "", itemName: "Japanese Sushi & Nigiri", description: "", price: "", unit: "", pageNumber: 22, confidence: 0.9 },
      { pageTitle: "Dinner Packages", sectionTitle: "Regional Feasts", category: "", itemName: "Tuna Poke Shooters", description: "", price: "", unit: "", pageNumber: 22, confidence: 0.9 },
      { pageTitle: "Dinner Packages", sectionTitle: "Regional Feasts", category: "", itemName: "Asian Street Food Station", description: "", price: "", unit: "", pageNumber: 22, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), ["Pacific Rim"]);
    assert.equal(result.ledger.filter((entry) => entry.reason.startsWith("Component already captured")).length, 3);
  });

  it("keeps child rows when no parent description contains them", () => {
    const result = cleanupVisualFnbMenuRows([
      {
        pageTitle: "Dinner Buffets",
        sectionTitle: "Regional Dinner Buffet",
        category: "",
        itemName: "Coastal Dinner Buffet",
        description: "Includes artisan rolls and chef-selected dessert.",
        price: "",
        unit: "",
        pageNumber: 16,
        confidence: 0.93,
      },
      { pageTitle: "Dinner Buffets", sectionTitle: "Regional Dinner Buffet", category: "", itemName: "Baby Kale Salad", description: "", price: "", unit: "", pageNumber: 16, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), ["Coastal Dinner Buffet", "Baby Kale Salad"]);
  });

  it("keeps child rows with their own visible price", () => {
    const result = cleanupVisualFnbMenuRows([
      {
        pageTitle: "Dinner Buffets",
        sectionTitle: "Regional Dinner Buffet",
        category: "",
        itemName: "Coastal Dinner Buffet",
        description: "Includes baby kale salad and artisan rolls.",
        price: "",
        unit: "",
        pageNumber: 16,
        confidence: 0.93,
      },
      { pageTitle: "Dinner Buffets", sectionTitle: "Regional Dinner Buffet", category: "", itemName: "Baby Kale Salad", description: "", price: "9.00 each", unit: "each", pageNumber: 16, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), ["Coastal Dinner Buffet", "Baby Kale Salad"]);
    assert.equal(result.items[1].price, "9.00 each");
  });

  it("keeps true a la carte child items as standalone offerings", () => {
    const result = cleanupVisualFnbMenuRows([
      {
        pageTitle: "Reception Packages",
        sectionTitle: "Reception Menu",
        category: "",
        itemName: "Market Reception Package",
        description: "Includes mini crab cakes, tomato bruschetta, and seasonal display.",
        price: "",
        unit: "",
        pageNumber: 18,
        confidence: 0.93,
      },
      { pageTitle: "À La Carte Hors d'oeuvres", sectionTitle: "Cold Items", category: "", itemName: "Mini Crab Cakes", description: "", price: "", unit: "", pageNumber: 19, confidence: 0.9 },
      { pageTitle: "À La Carte Hors d'oeuvres", sectionTitle: "Cold Items", category: "", itemName: "Tomato Bruschetta", description: "", price: "", unit: "", pageNumber: 19, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), [
      "Market Reception Package",
      "Mini Crab Cakes",
      "Tomato Bruschetta",
    ]);
  });

  it("keeps selectable stations standalone even when named inside a parent package", () => {
    const result = cleanupVisualFnbMenuRows([
      {
        pageTitle: "Reception Packages",
        sectionTitle: "Reception Menu",
        category: "",
        itemName: "Chef's Reception Package",
        description: "Includes pasta station, carving station, and seasonal display.",
        price: "",
        unit: "",
        pageNumber: 20,
        confidence: 0.93,
      },
      { pageTitle: "Reception Stations", sectionTitle: "Action Stations", category: "", itemName: "Pasta Station", description: "Chef-attended pasta with sauces and toppings", price: "", unit: "", pageNumber: 20, confidence: 0.9 },
      { pageTitle: "Reception Stations", sectionTitle: "Carving Stations", category: "", itemName: "Carving Station", description: "Chef-carved roasted turkey and accompaniments", price: "", unit: "", pageNumber: 20, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), [
      "Chef's Reception Package",
      "Pasta Station",
      "Carving Station",
    ]);
  });

  it("collapses duplicate parent variants and keeps the stronger row", () => {
    const sharedDescription = "Includes greek salad, lemon chicken, roasted vegetables, and honey cake.";
    const result = cleanupVisualFnbMenuRows([
      { pageTitle: "Lunch Buffets", sectionTitle: "", category: "", itemName: "Mediterranean Buffet", description: sharedDescription, price: "", unit: "", pageNumber: 11, confidence: 0.9 },
      { pageTitle: "Lunch Buffets", sectionTitle: "Weekday Lunch", category: "", itemName: "Mediterranean Lunch Buffet", description: sharedDescription, price: "", unit: "", pageNumber: 11, confidence: 0.92 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), ["Mediterranean Lunch Buffet"]);
    assert.equal(result.ledger.some((entry) => entry.reason === "Duplicate parent offering variant"), true);
  });

  it("collapses obvious station variants and keeps the station-labeled row", () => {
    const stationDescription = "Warm pressed sandwiches with mozzarella, tomato, and basil.";
    const result = cleanupVisualFnbMenuRows([
      { pageTitle: "Reception Stations", sectionTitle: "Action Stations", category: "", itemName: "Mini Panini", description: stationDescription, price: "", unit: "", pageNumber: 18, confidence: 0.9 },
      { pageTitle: "Reception Stations", sectionTitle: "Action Stations", category: "", itemName: "Mini Panini Station", description: stationDescription, price: "", unit: "", pageNumber: 18, confidence: 0.9 },
      { pageTitle: "Reception Stations", sectionTitle: "Action Stations", category: "", itemName: "Slider Station", description: "Mini beef sliders with condiments.", price: "", unit: "", pageNumber: 18, confidence: 0.9 },
      { pageTitle: "Reception Stations", sectionTitle: "Action Stations", category: "", itemName: "Slider Station", description: "Mini beef sliders with condiments.", price: "", unit: "", pageNumber: 18, confidence: 0.91 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), ["Mini Panini Station", "Slider Station"]);
    assert.equal(result.ledger.filter((entry) => entry.reason === "Duplicate station offering variant").length, 2);
  });

  it("keeps hotel-style buffet and bar parents without over-extracting package components", () => {
    const result = cleanupVisualFnbMenuRows([
      {
        pageTitle: "Dinner Buffets",
        sectionTitle: "Chef's Regional Buffets",
        category: "",
        itemName: "Georgia on My Mind",
        description: "Buffet includes bbq chicken flatbread, baby kale salad, beef meatballs, and coconut cake.",
        price: "",
        unit: "",
        pageNumber: 24,
        confidence: 0.93,
      },
      { pageTitle: "Dinner Buffets", sectionTitle: "Chef's Regional Buffets", category: "", itemName: "BBQ Chicken Flatbread", description: "", price: "", unit: "", pageNumber: 24, confidence: 0.9 },
      { pageTitle: "Dinner Buffets", sectionTitle: "Chef's Regional Buffets", category: "", itemName: "Baby Kale Salad", description: "", price: "", unit: "", pageNumber: 24, confidence: 0.9 },
      { pageTitle: "Dinner Buffets", sectionTitle: "Chef's Regional Buffets", category: "", itemName: "Beef Meatballs", description: "", price: "", unit: "", pageNumber: 24, confidence: 0.9 },
      {
        pageTitle: "Bar Packages",
        sectionTitle: "Hosted Bars",
        category: "",
        itemName: "Diamond Bar",
        description: "Premium bar package with sparkling wine, imported beer, domestic beer, and soft drinks.",
        price: "",
        unit: "",
        pageNumber: 35,
        confidence: 0.92,
      },
      { pageTitle: "Bar Packages", sectionTitle: "Hosted Bars", category: "", itemName: "Imported Beer", description: "", price: "", unit: "", pageNumber: 35, confidence: 0.9 },
      { pageTitle: "Bar Packages", sectionTitle: "Hosted Bars", category: "", itemName: "Soft Drinks", description: "", price: "", unit: "", pageNumber: 35, confidence: 0.9 },
    ], { fileName: "Hotel Catering Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.itemName), ["Georgia on My Mind", "Diamond Bar"]);
    assert.equal(result.ledger.filter((entry) => entry.reason.startsWith("Component already captured")).length, 5);
  });

  it("marks low-confidence valid rows for review instead of returning them as saved items", () => {
    const result = cleanupVisualFnbMenuRows([
      { itemName: "Chef Attended Omelet Station", description: "", category: "Breakfast", price: "18.", unit: "per person", pageNumber: 5, confidence: 0.4 },
    ], { fileName: "Breakfast Menu.pdf" });

    assert.equal(result.items.length, 0);
    assert.equal(result.ledger.length, 1);
    assert.equal(result.ledger[0].decision, "needs_review");
    assert.equal(result.ledger[0].reason, "Low model confidence");
  });

  it("deduplicates repeated visual rows from overlapping page batches", () => {
    const result = cleanupVisualFnbMenuRows([
      { itemName: "Assorted Danish Pastries", description: "", category: "Breakfast", price: "72. per dozen", unit: "per dozen", pageNumber: 6, confidence: 0.93 },
      { itemName: "Assorted Danish Pastries", description: "", category: "Breakfast", price: "72. per dozen", unit: "per dozen", pageNumber: 6, confidence: 0.93 },
    ], { fileName: "Breakfast Menu.pdf" });

    assert.equal(result.items.length, 1);
    assert.deepEqual(result.ledger.map((entry) => entry.decision), ["saved", "rejected"]);
    assert.equal(result.ledger[1].reason, "Duplicate visual row");
  });

  it("infers categories from sectionTitle and pageTitle", () => {
    const result = cleanupVisualFnbMenuRows([
      { pageTitle: "Breakfast Buffets", sectionTitle: "", category: "", itemName: "Continental Breakfast", description: "", price: "40.", unit: "per person", pageNumber: 2, confidence: 0.92 },
      { pageTitle: "", sectionTitle: "À La Carte Enhancements", category: "", itemName: "Bacon", description: "", price: "7.00 each", unit: "each", pageNumber: 3, confidence: 0.9 },
      { pageTitle: "Lunch Buffets", sectionTitle: "", category: "", itemName: "Deli Buffet", description: "", price: "55.", unit: "per person", pageNumber: 4, confidence: 0.88 },
    ], { fileName: "Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.category), ["Breakfast", "A La Carte", "Lunch"]);
  });

  it("normalizes reception, stations, displays, and hors d'oeuvre contexts to Reception", () => {
    const result = cleanupVisualFnbMenuRows([
      { pageTitle: "Reception Displays", sectionTitle: "", category: "", itemName: "Imported Cheese Display", description: "", price: "22.", unit: "per person", pageNumber: 10, confidence: 0.92 },
      { pageTitle: "", sectionTitle: "Hors d’oeuvre Reception", category: "", itemName: "Mini Crab Cakes", description: "", price: "8.00 each", unit: "each", pageNumber: 11, confidence: 0.9 },
      { pageTitle: "", sectionTitle: "Action Stations", category: "", itemName: "Pasta Station", description: "", price: "32.", unit: "per person", pageNumber: 12, confidence: 0.88 },
    ], { fileName: "Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.category), ["Reception", "Reception", "Reception"]);
  });

  it("normalizes beverage, bar, wine, beer, liquor, and hosted bar contexts to Beverage", () => {
    const result = cleanupVisualFnbMenuRows([
      { pageTitle: "Hosted Bar Packages", sectionTitle: "", category: "", itemName: "Premium Hosted Bar", description: "", price: "65.", unit: "per person", pageNumber: 20, confidence: 0.92 },
      { pageTitle: "", sectionTitle: "Wine", category: "", itemName: "House Cabernet", description: "", price: "$65 per bottle", unit: "per bottle", pageNumber: 21, confidence: 0.9 },
      { pageTitle: "", sectionTitle: "Beer and Liquor", category: "", itemName: "Domestic Beer", description: "", price: "8.00 each", unit: "each", pageNumber: 22, confidence: 0.88 },
    ], { fileName: "Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.category), ["Beverage", "Beverage", "Beverage"]);
  });

  it("uses nearest prior heading context and marks unknown categories as Needs Review", () => {
    const result = cleanupVisualFnbMenuRows([
      { pageTitle: "Dinner Entrees", sectionTitle: "", category: "", itemName: "Herb Roasted Chicken", description: "", price: "72.", unit: "per person", pageNumber: 30, confidence: 0.92 },
      { pageTitle: "", sectionTitle: "", category: "", itemName: "Braised Short Rib", description: "", price: "84.", unit: "per person", pageNumber: 30, confidence: 0.9 },
      { pageTitle: "", sectionTitle: "", category: "", itemName: "Chef's Seasonal Selection", description: "", price: "44.", unit: "per person", pageNumber: 31, confidence: 0.88 },
    ], { fileName: "Menu.pdf" });

    assert.deepEqual(result.items.map((item) => item.category), ["Dinner", "Dinner", "Dinner"]);

    const unknown = cleanupVisualFnbMenuRows([
      { pageTitle: "", sectionTitle: "", category: "", itemName: "Chef's Seasonal Selection", description: "", price: "44.", unit: "per person", pageNumber: 31, confidence: 0.88 },
    ], { fileName: "Menu.pdf" });
    assert.equal(unknown.items[0].category, "Needs Review");
  });

  it("does not contain Gaylord-specific category or page-number mapping", async () => {
    const source = await readFile("lib/fnb-visual-menu-parser.ts", "utf8");

    assert.equal(/gaylord/i.test(source), false);
    assert.equal(/hilton/i.test(source), false);
    assert.equal(/category\s*by\s*page/i.test(source), false);
    assert.equal(/page\s*category\s*map/i.test(source), false);
  });

  it("renders a PDF page and sends a bounded visual batch through the service", async () => {
    const pdfBase64 = await readFile("scripts/fixtures/fnb-menu-sample.pdf.b64", "utf8");
    const pdfBytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
    const result = await parseFnbMenuVisually({
      eventId: "event-1",
      sourceMenuId: "source-menu-1",
      fileName: "Sample Menu.pdf",
      pdfBytes,
      pageRange: { startPage: 1, endPage: 1 },
      batchSize: 2,
      maxOpenAiCalls: 1,
      model: "test-vision-model",
      callVisionModel: async ({ pages, model }) => {
        assert.equal(model, "test-vision-model");
        assert.equal(pages.length, 1);
        assert.equal(pages[0].pageNumber, 1);
        assert.match(pages[0].dataUrl, /^data:image\/png;base64,/);
        return {
          items: [{
            itemName: "Continental Breakfast",
            description: "Pastries and fruit",
            category: "Breakfast",
            price: "40.",
            unit: "per person",
            pageNumber: pages[0].pageNumber,
            confidence: 0.95,
          }],
        };
      },
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].itemName, "Continental Breakfast");
    assert.equal(result.ledger[0].decision, "saved");
    assert.deepEqual(result.usageSummary, {
      openAiCallCount: 1,
      pagesParsed: 1,
      model: "test-vision-model",
    });
  });
});
