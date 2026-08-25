export type TimelineGroupSummaryItem = {
  isCriticalPath: boolean;
};

/**
 * Keep a hierarchy badge tied to the exact item collection rendered below it.
 */
export function getTimelineGroupSummary(items: readonly TimelineGroupSummaryItem[]) {
  return {
    itemCount: items.length,
    hasCriticalPath: items.some((item) => item.isCriticalPath),
  };
}
