export type OrganizationSelectionDecision =
  | {
      status: "NO_ACCESS";
    }
  | {
      status: "NEEDS_ORG_SELECTION";
    }
  | {
      status: "OK";
      activeOrgId: string;
      shouldPersistSelection: boolean;
    };

/**
 * This is the sole rule for turning an authorized organization set into an
 * active account context. A remembered active ID is not a selection by itself.
 */
export function resolveOrganizationSelection(input: {
  accessibleOrgIds: readonly string[];
  requestedOrgId: string | null;
  selectedOrgId: string | null;
}): OrganizationSelectionDecision {
  const accessibleOrgIds = [...new Set(input.accessibleOrgIds)];

  if (accessibleOrgIds.length === 0) {
    return { status: "NO_ACCESS" };
  }

  if (accessibleOrgIds.length === 1) {
    const activeOrgId = accessibleOrgIds[0]!;
    return {
      status: "OK",
      activeOrgId,
      shouldPersistSelection: input.requestedOrgId !== activeOrgId || input.selectedOrgId !== activeOrgId,
    };
  }

  if (
    input.requestedOrgId &&
    input.selectedOrgId === input.requestedOrgId &&
    accessibleOrgIds.includes(input.requestedOrgId)
  ) {
    return {
      status: "OK",
      activeOrgId: input.requestedOrgId,
      shouldPersistSelection: false,
    };
  }

  return { status: "NEEDS_ORG_SELECTION" };
}
