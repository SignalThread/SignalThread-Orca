export type FnbPickerCatalogItem = {
  id: string;
  sourceMenuId?: string | null;
  itemName: string;
  description: string | null;
  price: string | null;
  unit: string | null;
  category: string | null;
  sourceMenuFileName: string | null;
};

export type FnbPickerAssignment = {
  id: string;
  eventFnbCatalogItemId: string;
};

const PREFERRED_CATEGORY_ORDER = [
  "Beverage",
  "Breakfast",
  "Breaks",
  "Lunch",
  "Dinner",
  "Dessert",
  "Reception",
] as const;

function normalized(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function availableFnbPickerCategories(items: readonly FnbPickerCatalogItem[]): string[] {
  const byNormalizedName = new Map<string, string>();
  for (const item of items) {
    const category = item.category?.trim();
    if (!category) continue;
    const key = normalized(category);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, category);
  }

  const preferredIndex = new Map(PREFERRED_CATEGORY_ORDER.map((category, index) => [normalized(category), index]));
  return [...byNormalizedName.values()].sort((left, right) => {
    const leftIndex = preferredIndex.get(normalized(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = preferredIndex.get(normalized(right)) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.localeCompare(right);
  });
}

export function filterAvailableFnbCatalogItems(input: {
  items: readonly FnbPickerCatalogItem[];
  assignedItemIds: ReadonlySet<string>;
  category: string;
  search: string;
}): FnbPickerCatalogItem[] {
  const selectedCategory = normalized(input.category);
  const query = normalized(input.search);

  return input.items.filter((item) => {
    if (input.assignedItemIds.has(item.id)) return false;
    if (selectedCategory && selectedCategory !== "all" && normalized(item.category) !== selectedCategory) return false;
    if (!query) return true;
    return [item.itemName, item.category, item.description, item.sourceMenuFileName]
      .some((value) => normalized(value).includes(query));
  });
}

export function mergeFnbPickerAssignment<T extends FnbPickerAssignment>(current: readonly T[], assignment: T): T[] {
  return current.some((entry) => entry.eventFnbCatalogItemId === assignment.eventFnbCatalogItemId)
    ? [...current]
    : [...current, assignment];
}

export function removeFnbPickerAssignment<T extends FnbPickerAssignment>(current: readonly T[], assignmentId: string): T[] {
  return current.filter((entry) => entry.id !== assignmentId);
}
