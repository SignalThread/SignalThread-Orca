export const MATRIX2_SESSION_TYPE_MANAGE_ID = "__manage-session-types__";

type ResolveMatrix2ToolbarOverflowInput = {
  availableWidth: number;
  templateIds: string[];
  itemWidths: Record<string, number>;
  manageWidth: number;
  moreWidth: number;
  gap: number;
  hasManageAction: boolean;
};

type ResolveMatrix2ToolbarOverflowResult = {
  visibleTemplateIds: string[];
  overflowTemplateIds: string[];
  isManageVisible: boolean;
  isManageInMore: boolean;
  isMoreVisible: boolean;
};

function totalWidth(widths: number[], gap: number): number {
  if (widths.length === 0) return 0;
  return widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
}

export function resolveMatrix2ToolbarOverflow({
  availableWidth,
  templateIds,
  itemWidths,
  manageWidth,
  moreWidth,
  gap,
  hasManageAction,
}: ResolveMatrix2ToolbarOverflowInput): ResolveMatrix2ToolbarOverflowResult {
  const templateWidths = templateIds.map((templateId) => itemWidths[templateId] ?? 0);
  const allTemplatesWidth = totalWidth(templateWidths, gap);
  const allItemWidths = hasManageAction ? [...templateWidths, manageWidth] : templateWidths;

  if (availableWidth > 0 && allTemplatesWidth <= availableWidth) {
    return {
      visibleTemplateIds: templateIds,
      overflowTemplateIds: [],
      isManageVisible: hasManageAction && totalWidth(allItemWidths, gap) <= availableWidth,
      isManageInMore: false,
      isMoreVisible: false,
    };
  }

  const visibleTemplateIds: string[] = [];
  const visibleWidths: number[] = [];

  for (const templateId of templateIds) {
    const width = itemWidths[templateId] ?? 0;
    const candidateWidths = [...visibleWidths, width, moreWidth];
    if (totalWidth(candidateWidths, gap) <= availableWidth) {
      visibleTemplateIds.push(templateId);
      visibleWidths.push(width);
    } else {
      break;
    }
  }

  const overflowTemplateIds = templateIds.filter((templateId) => !visibleTemplateIds.includes(templateId));
  let isManageVisible = false;

  if (hasManageAction) {
    const candidateWidths = [...visibleWidths, manageWidth, moreWidth];
    isManageVisible = totalWidth(candidateWidths, gap) <= availableWidth;
  }

  return {
    visibleTemplateIds,
    overflowTemplateIds,
    isManageVisible,
    isManageInMore: overflowTemplateIds.length > 0 && hasManageAction && !isManageVisible,
    isMoreVisible: overflowTemplateIds.length > 0,
  };
}
