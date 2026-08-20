"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Download, Search, X } from "lucide-react";
import styles from "./action-center.module.css";

export type ActionView = "risks" | "approvals" | "deadlines" | "tasks" | "budget";
export type ActionTone = "critical" | "warning" | "stable" | "neutral";
export type ActionCenterQueueItem = {
  id: string;
  type: ActionView;
  sourceId: string;
  eventId: string;
  eventName: string;
  eventDateLabel: string;
  eventStatusLabel: string;
  title: string;
  rawTitle: string | null;
  itemTypeLabel: string;
  context: string;
  assigneeName: string | null;
  priority: "critical" | "high" | "medium" | "low" | null;
  severity: "critical" | "high" | "medium" | "low" | null;
  statusLabel: string;
  categoryLabel: string;
  dueDateLabel: string | null;
  overdueDays: number | null;
  href: string;
  tone: ActionTone;
  needsTitle: boolean;
};

type GroupBy = "event" | "assignee" | "priority" | "type" | "dueDate";
type SummaryFilter = "all" | "events" | "critical" | "overdue";

const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: "event", label: "Event" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "type", label: "Type" },
  { value: "dueDate", label: "Due date" },
];

function toneClass(tone: ActionTone): string {
  if (tone === "critical") return styles.chipDanger;
  if (tone === "warning") return styles.chipWarning;
  if (tone === "stable") return styles.chipSuccess;
  return styles.chipInfo;
}

function groupLabel(item: ActionCenterQueueItem, groupBy: GroupBy): string {
  if (groupBy === "assignee") return item.assigneeName || "Unassigned";
  if (groupBy === "priority") return item.severity ?? item.priority ?? "No priority";
  if (groupBy === "type") return item.itemTypeLabel || item.statusLabel || item.type;
  if (groupBy === "dueDate") {
    if (typeof item.overdueDays === "number" && item.overdueDays > 0) return "Overdue";
    if (item.dueDateLabel?.startsWith("Due today") || item.dueDateLabel?.startsWith("Due in")) return "Due this week";
    if (item.dueDateLabel) return "Due later";
    return "No due date";
  }
  return item.eventName;
}

function groupMeta(item: ActionCenterQueueItem, groupBy: GroupBy): string {
  if (groupBy === "event") return item.eventDateLabel;
  if (groupBy === "assignee") return item.assigneeName ? "Assigned" : "Assignment action requires backend support";
  if (groupBy === "priority") return "Severity grouping";
  if (groupBy === "dueDate") return item.dueDateLabel ?? "No due date";
  return item.statusLabel || item.categoryLabel;
}

function matchesSearch(item: ActionCenterQueueItem, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    item.title,
    item.eventName,
    item.assigneeName ?? "Unassigned",
    item.itemTypeLabel,
    item.statusLabel,
    item.categoryLabel,
    item.context,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function isCritical(item: ActionCenterQueueItem): boolean {
  return item.tone === "critical" || item.severity === "critical" || item.priority === "critical";
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv(items: ActionCenterQueueItem[]) {
  const rows = [
    ["title", "event", "type", "assignee", "status", "due_or_overdue", "link"],
    ...items.map((item) => [
      item.title,
      item.eventName,
      item.itemTypeLabel,
      item.assigneeName ?? "Unassigned",
      item.statusLabel,
      item.dueDateLabel ?? (item.overdueDays ? `${item.overdueDays}d overdue` : ""),
      item.href,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "orcaos-action-center-selection.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ActionCenterQueue({
  selectedView,
  items,
  totalItems,
  affectedEventCount,
  criticalCount,
  overdueCount,
  emptyMessage,
  initialSummaryFilter = "all",
}: {
  selectedView: ActionView;
  items: ActionCenterQueueItem[];
  totalItems: number;
  affectedEventCount: number;
  criticalCount: number;
  overdueCount: number;
  emptyMessage: string;
  initialSummaryFilter?: SummaryFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("event");
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>(initialSummaryFilter);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSummaryFilter(initialSummaryFilter);
  }, [initialSummaryFilter]);

  function setUrlFilter(nextFilter: SummaryFilter) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", selectedView);
    if (selectedView === "deadlines" && nextFilter === "overdue") {
      params.set("filter", "overdue");
    } else {
      params.delete("filter");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function updateSummaryFilter(nextFilter: SummaryFilter) {
    setSummaryFilter(nextFilter);
    setUrlFilter(nextFilter);
  }

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (!matchesSearch(item, search)) return false;
      if (summaryFilter === "overdue") return typeof item.overdueDays === "number" && item.overdueDays > 0;
      if (summaryFilter === "critical") return isCritical(item);
      return true;
    });
  }, [items, search, summaryFilter]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ActionCenterQueueItem[]>();
    for (const item of visibleItems) {
      const label = groupLabel(item, groupBy);
      groups.set(label, [...(groups.get(label) ?? []), item]);
    }

    return Array.from(groups.entries())
      .map(([label, groupItems]) => ({ label, meta: groupMeta(groupItems[0]!, groupBy), items: groupItems }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [groupBy, visibleItems]);

  const selectedVisibleItems = visibleItems.filter((item) => selectedIds.has(item.id));
  const allVisibleSelected = visibleItems.length > 0 && selectedVisibleItems.length === visibleItems.length;

  function toggleItem(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const item of visibleItems) next.delete(item.id);
      } else {
        for (const item of visibleItems) next.add(item.id);
      }
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setSummaryFilter("all");
    setGroupBy("event");
    setUrlFilter("all");
  }

  return (
    <>
      <section className={styles.summaryStrip} aria-label="Action Center summary filters">
        <button
          type="button"
          className={`${styles.summaryItem} ${summaryFilter === "all" ? styles.summaryItemActive : ""}`}
          onClick={() => updateSummaryFilter("all")}
        >
          {totalItems} total items
        </button>
        <button
          type="button"
          className={`${styles.summaryItem} ${groupBy === "event" ? styles.summaryItemActive : ""}`}
          onClick={() => {
            setGroupBy("event");
            updateSummaryFilter("events");
          }}
        >
          {affectedEventCount} affected {affectedEventCount === 1 ? "event" : "events"}
        </button>
        <button
          type="button"
          className={`${styles.summaryItem} ${
            selectedView === "deadlines"
              ? summaryFilter === "overdue" ? styles.summaryItemActive : ""
              : summaryFilter === "critical" ? styles.summaryItemActive : ""
          }`}
          title="Critical filter applies to overdue deadlines, overdue roadmap items, and high-severity risks."
          onClick={() => {
            const activeFilter = selectedView === "deadlines" ? "overdue" : "critical";
            updateSummaryFilter(summaryFilter === activeFilter ? "all" : activeFilter);
          }}
        >
          {selectedView === "deadlines" ? `${overdueCount} overdue` : `${criticalCount} critical`}
        </button>
      </section>

      <main className={styles.queuePanel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>
              {selectedView === "approvals"
                ? "Approval Queue"
                : selectedView === "deadlines"
                  ? "Deadline Queue"
                  : selectedView === "tasks"
                    ? "Task Queue"
                    : selectedView === "budget"
                      ? "Budget Queue"
                      : "Risk Queue"}
            </h2>
            <p className={styles.panelSubtitle}>Grouped by {GROUP_OPTIONS.find((option) => option.value === groupBy)?.label}</p>
          </div>
          <span className={`${styles.chip} ${styles.chipInfo} ${styles.panelCount}`}>
            {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
          </span>
        </div>

        <div className={styles.controlBar}>
          <label className={styles.searchWrap}>
            <span className={styles.visuallyHidden}>Search Action Center items</span>
            <Search className="h-3.5 w-3.5" aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search items, events, assignees..."
              className={styles.searchInput}
            />
            {search ? (
              <button type="button" className={styles.clearSearchButton} onClick={() => setSearch("")} aria-label="Clear search">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </label>

          <label className={styles.selectLabel}>
            <span>Group by</span>
            <select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)} className={styles.selectControl}>
              {GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className={styles.secondaryButton} onClick={clearFilters}>
            Clear filters
          </button>
        </div>

        <div className={styles.bulkHeader}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={visibleItems.length === 0}
              onChange={toggleAllVisible}
            />
            Select all visible
          </label>
          <span>{selectedVisibleItems.length} selected</span>
        </div>

        {selectedVisibleItems.length > 0 ? (
          <div className={styles.bulkBar}>
            <span>{selectedVisibleItems.length} selected</span>
            <button type="button" disabled title="Backend action required.">Assign</button>
            <button type="button" disabled title="Backend action required.">Mark reviewed</button>
            <button type="button" disabled title="Backend action required.">Snooze</button>
            <button type="button" onClick={() => exportCsv(selectedVisibleItems)}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className={styles.emptyWrap}>
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Clear for now</p>
              <p className={styles.emptyText}>{emptyMessage}</p>
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className={styles.emptyWrap}>
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>No matches</p>
              <p className={styles.emptyText}>No items match this search.</p>
            </div>
          </div>
        ) : (
          <div className={styles.groupList}>
            {groupedItems.map((group) => (
              <section key={group.label} className={styles.group}>
                <div className={styles.groupHeader}>
                  <div className="min-w-0">
                    <h3 className={styles.eventName}>{group.label}</h3>
                    <p className={styles.eventMeta}>{group.meta}</p>
                  </div>
                  <span className={`${styles.chip} ${styles.chipInfo}`}>{group.items.length} items</span>
                </div>

                <div className={styles.itemList}>
                  {group.items.map((item) => (
                    <div key={item.id} className={styles.itemRow}>
                      <label className={styles.rowCheckbox}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          aria-label={`Select ${item.title}`}
                        />
                      </label>
                      <span className={`${styles.itemIcon} ${toneClass(item.tone)}`} aria-hidden />
                      <span className={styles.itemMain}>
                        <span className={styles.itemTitleLine}>
                          <span className={styles.itemTitle} title={item.rawTitle ?? item.title}>{item.title}</span>
                          <span className={`${styles.chip} ${toneClass(item.tone)}`}>{item.itemTypeLabel}</span>
                          {item.needsTitle ? <span className={`${styles.chip} ${styles.chipWarning}`}>Needs title</span> : null}
                          {!item.assigneeName ? (
                            <button type="button" className={styles.assignButton} disabled title="Assignment action requires backend support. Open item to assign.">
                              Assign
                            </button>
                          ) : null}
                        </span>
                        <span className={styles.itemContext}>{item.context}</span>
                      </span>
                      <Link href={item.href} className={styles.openLink}>
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
