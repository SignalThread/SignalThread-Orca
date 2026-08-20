export type RequirementSelectionPersistenceInput = {
  itemId: string;
  quantity: number | null;
};

export type RequirementSelectionPersistencePlan = {
  itemIdsToDelete: string[];
  selectionsToInsert: RequirementSelectionPersistenceInput[];
  selectionsToUpdate: RequirementSelectionPersistenceInput[];
};

export function buildSessionRequirementSelectionPersistencePlan(
  existingSelections: RequirementSelectionPersistenceInput[],
  nextSelections: RequirementSelectionPersistenceInput[],
): RequirementSelectionPersistencePlan {
  const existingByItemId = new Map(existingSelections.map((selection) => [selection.itemId, selection]));
  const nextByItemId = new Map(nextSelections.map((selection) => [selection.itemId, selection]));

  const itemIdsToDelete = existingSelections
    .filter((selection) => !nextByItemId.has(selection.itemId))
    .map((selection) => selection.itemId);

  const selectionsToInsert = nextSelections.filter((selection) => !existingByItemId.has(selection.itemId));

  const selectionsToUpdate = nextSelections.filter((selection) => {
    const existing = existingByItemId.get(selection.itemId);
    return Boolean(existing && existing.quantity !== selection.quantity);
  });

  return {
    itemIdsToDelete,
    selectionsToInsert,
    selectionsToUpdate,
  };
}
