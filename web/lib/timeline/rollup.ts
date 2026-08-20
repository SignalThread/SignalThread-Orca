type RollupItem = {
  id: string;
  parentId: string | null;
  status: string | null | undefined;
  progress?: number | null;
  disposition?: string | null;
};

export type TimelineChildRollup = {
  childCount: number;
  completeCount: number;
  percentComplete: number;
};

export function buildTimelineChildRollups(items: readonly RollupItem[]): Map<string, TimelineChildRollup> {
  const children = new Map<string, RollupItem[]>();
  for (const item of items) {
    if (!item.parentId || item.disposition === "NOT_NEEDED") continue;
    const siblings = children.get(item.parentId) ?? [];
    siblings.push(item);
    children.set(item.parentId, siblings);
  }

  const memo = new Map<string, number>();
  const progressFor = (item: RollupItem, visiting: Set<string>): number => {
    if (item.status === "COMPLETE") return 100;
    const saved = memo.get(item.id);
    if (typeof saved === "number") return saved;
    if (visiting.has(item.id)) return 0;
    const nested = children.get(item.id) ?? [];
    if (nested.length === 0) return item.progress ?? 0;
    const nextVisiting = new Set(visiting).add(item.id);
    const value = Math.round(nested.reduce((sum, child) => sum + progressFor(child, nextVisiting), 0) / nested.length);
    memo.set(item.id, value);
    return value;
  };

  const result = new Map<string, TimelineChildRollup>();
  for (const [parentId, directChildren] of children) {
    result.set(parentId, {
      childCount: directChildren.length,
      completeCount: directChildren.filter((child) => child.status === "COMPLETE").length,
      percentComplete: Math.round(
        directChildren.reduce((sum, child) => sum + progressFor(child, new Set([parentId])), 0) /
          directChildren.length,
      ),
    });
  }
  return result;
}
