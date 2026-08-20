import assert from "node:assert/strict";
import test from "node:test";
import {
  addBudgetCategoryFilterOption,
  BUDGET_CATEGORY_OPTIONS,
  BUDGET_CATEGORY_PILL_STYLES,
  BUDGET_CATEGORY_DEFAULT_PILL_STYLE,
  budgetCategoriesMatch,
  budgetCategoryPillClasses,
  budgetFilterValuesMatch,
  buildBudgetCategoryMatchKeys,
  getBudgetCategoryDisplay,
  getBudgetCategoryPillStyle,
  normalizeBudgetCategoryForStorage,
} from "./budget-category-filter";

test("budget category options use the exact requested order", () => {
  assert.deepEqual([...BUDGET_CATEGORY_OPTIONS], [
    "Venue",
    "Housing",
    "F&B",
    "AV & Production",
    "Speakers",
    "Registration & Technology",
    "Marketing",
    "Staffing",
    "Transportation",
    "Exhibits & Sponsorship",
    "Décor & Branding",
    "Contingency",
  ]);
});

test("imported Food & Beverage category matches URL drilldown category safely", () => {
  assert.equal(budgetCategoriesMatch("Food & Beverage", "F&B"), true);
  assert.equal(budgetCategoriesMatch(" Food & Beverage ", "F&B"), true);
  assert.equal(budgetCategoriesMatch("Food & Beverage", "F&B"), true);
});

test("manual category aliases still match imported and canonical variants", () => {
  assert.equal(budgetCategoriesMatch("F&B", "Food & Beverage"), true);
  assert.equal(budgetCategoriesMatch("fnb", "Food & Beverage"), true);
  assert.equal(budgetCategoriesMatch("F and B", "F&B"), true);
  assert.equal(budgetCategoriesMatch("Decor", "Décor & Branding"), true);
  assert.equal(budgetCategoriesMatch("Décor", "Décor & Branding"), true);
  assert.equal(budgetCategoriesMatch("Decor & Branding", "Décor & Branding"), true);
  assert.equal(budgetCategoriesMatch("Audio Visual", "AV & Production"), true);
  assert.equal(budgetCategoriesMatch("AV", "AV & Production"), true);
  assert.equal(budgetCategoriesMatch("Production", "AV & Production"), true);
  assert.equal(budgetCategoriesMatch("Registration", "Registration & Technology"), true);
  assert.equal(budgetCategoriesMatch("Technology", "Registration & Technology"), true);
  assert.equal(budgetCategoriesMatch("Exhibits", "Exhibits & Sponsorship"), true);
  assert.equal(budgetCategoriesMatch("Sponsorship", "Exhibits & Sponsorship"), true);
  assert.equal(budgetCategoriesMatch("AV", "Food & Beverage"), false);
});

test("category match keys handle spaces, punctuation, and encoded ampersands after URL parsing", () => {
  assert.deepEqual(
    buildBudgetCategoryMatchKeys(" Food   &   Beverage "),
    ["food & beverage", "f&b"],
  );
  assert.equal(budgetCategoriesMatch("Food & Beverage", "F&B"), true);
});

test("old saved categories display and store as new labels", () => {
  assert.equal(getBudgetCategoryDisplay("Decor"), "Décor & Branding");
  assert.equal(getBudgetCategoryDisplay("Food & Beverage"), "F&B");
  assert.equal(normalizeBudgetCategoryForStorage("Audio Visual"), "AV & Production");
  assert.equal(normalizeBudgetCategoryForStorage("Registration"), "Registration & Technology");
});

test("each canonical budget category has a unique deterministic pill style", () => {
  const styleKeys = BUDGET_CATEGORY_OPTIONS.map((category) => getBudgetCategoryPillStyle(category).key);
  assert.equal(new Set(styleKeys).size, BUDGET_CATEGORY_OPTIONS.length);
  for (const category of BUDGET_CATEGORY_OPTIONS) {
    assert.equal(getBudgetCategoryPillStyle(category), BUDGET_CATEGORY_PILL_STYLES[category]);
    assert.match(budgetCategoryPillClasses(category), /border/);
    assert.match(budgetCategoryPillClasses(category), /bg-/);
    assert.match(budgetCategoryPillClasses(category), /text-/);
  }
});

test("category aliases use the same pill style as their canonical category", () => {
  assert.equal(getBudgetCategoryPillStyle("Decor").key, getBudgetCategoryPillStyle("Décor & Branding").key);
  assert.equal(getBudgetCategoryPillStyle("Décor").key, getBudgetCategoryPillStyle("Décor & Branding").key);
  assert.equal(getBudgetCategoryPillStyle("Food & Beverage").key, getBudgetCategoryPillStyle("F&B").key);
  assert.equal(getBudgetCategoryPillStyle("Audio Visual").key, getBudgetCategoryPillStyle("AV & Production").key);
  assert.equal(getBudgetCategoryPillStyle("AV").key, getBudgetCategoryPillStyle("AV & Production").key);
  assert.equal(getBudgetCategoryPillStyle("Registration").key, getBudgetCategoryPillStyle("Registration & Technology").key);
  assert.equal(getBudgetCategoryPillStyle("Exhibits").key, getBudgetCategoryPillStyle("Exhibits & Sponsorship").key);
  assert.equal(getBudgetCategoryPillStyle("Sponsorship").key, getBudgetCategoryPillStyle("Exhibits & Sponsorship").key);
});

test("unknown categories get the safe default pill style", () => {
  assert.equal(getBudgetCategoryPillStyle("Custom category").key, BUDGET_CATEGORY_DEFAULT_PILL_STYLE.key);
  assert.equal(budgetCategoryPillClasses("Custom category"), BUDGET_CATEGORY_DEFAULT_PILL_STYLE.className);
});

test("subcategory and search-adjacent filter values trim safely without aliasing", () => {
  assert.equal(budgetFilterValuesMatch(" Catering ", "catering"), true);
  assert.equal(budgetFilterValuesMatch("Catering", "Coffee Break"), false);
});

test("category dropdown options canonicalize imported aliases", () => {
  const options = new Set<string>();
  addBudgetCategoryFilterOption(options, "F&B");
  addBudgetCategoryFilterOption(options, " Food & Beverage ");
  addBudgetCategoryFilterOption(options, "Decor");

  assert.deepEqual(Array.from(options), ["F&B", "Décor & Branding"]);
});

test("matching imported rows are not treated as a blank filtered result", () => {
  const rows = [
    { category: "Food & Beverage", subcategory: "Coffee Break" },
    { category: "AV", subcategory: "Audio" },
  ];

  const filteredRows = rows.filter((row) => budgetCategoriesMatch(row.category, "F&B"));
  assert.equal(filteredRows.length, 1);
  assert.equal(filteredRows[0]?.subcategory, "Coffee Break");
});
