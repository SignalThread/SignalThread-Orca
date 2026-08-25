type TimelineCompletionItem = {
  status: string | null | undefined;
  // Retained in existing payloads for compatibility; completion never reads it.
  progress?: number | null;
};

export function calculateTimelineCompletion(items: readonly TimelineCompletionItem[]) {
  const totalItems = items.length;
  const completeItems = items.filter((item) => item.status === "COMPLETE").length;

  return {
    totalItems,
    completeItems,
    percentComplete: totalItems === 0 ? 0 : Math.round((completeItems / totalItems) * 100),
  };
}
