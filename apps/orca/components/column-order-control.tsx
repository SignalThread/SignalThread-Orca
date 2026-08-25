"use client";

import { Columns3, GripVertical, Lock, RotateCcw, X } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ColumnOrderItem<TId extends string = string> = {
  id: TId;
  label: string;
};

type ColumnOrderScope = {
  userId?: string | null;
  orgId?: string | null;
  eventId?: string | null;
  viewId: string;
};

type UsePersistedColumnOrderOptions<TId extends string> = {
  columns: readonly ColumnOrderItem<TId>[];
  scope: ColumnOrderScope;
};

const STORAGE_PREFIX = "plannerDash:columnOrder";

function stableScopePart(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized.replace(/:/g, "_") : fallback;
}

export function buildColumnOrderStorageKey(scope: ColumnOrderScope): string {
  return [
    STORAGE_PREFIX,
    stableScopePart(scope.userId, "anonymous"),
    stableScopePart(scope.orgId, "no-org"),
    stableScopePart(scope.eventId, "no-event"),
    stableScopePart(scope.viewId, "unknown-view"),
  ].join(":");
}

function normalizeOrder<TId extends string>(stored: unknown, defaultIds: TId[]): TId[] {
  if (!Array.isArray(stored)) return defaultIds;
  const allowed = new Set(defaultIds);
  const next = stored.filter((id): id is TId => typeof id === "string" && allowed.has(id as TId));
  for (const id of defaultIds) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

export function applyColumnOrder<T extends { id: string }, TId extends T["id"]>(
  columns: readonly T[],
  order: readonly TId[],
): T[] {
  const byId = new Map(columns.map((column) => [column.id, column] as const));
  const ordered = order.flatMap((id) => {
    const column = byId.get(id);
    return column ? [column] : [];
  });
  for (const column of columns) {
    if (!ordered.some((entry) => entry.id === column.id)) ordered.push(column);
  }
  return ordered;
}

type ColumnDropPosition = "before" | "after";

export function reorderColumnOrder<TId extends string>(
  currentOrder: readonly TId[],
  draggingId: TId,
  targetId: TId,
  position: ColumnDropPosition,
): TId[] {
  if (draggingId === targetId) return [...currentOrder];
  const next = currentOrder.filter((id) => id !== draggingId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex === -1) return [...currentOrder];
  next.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, draggingId);
  return next;
}

export function usePersistedColumnOrder<TId extends string>({
  columns,
  scope,
}: UsePersistedColumnOrderOptions<TId>) {
  const defaultOrder = useMemo(() => columns.map((column) => column.id), [columns]);
  const storageKey = buildColumnOrderStorageKey(scope);
  const [columnOrder, setColumnOrderState] = useState<TId[]>(defaultOrder);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        setColumnOrderState(normalizeOrder(raw ? JSON.parse(raw) : null, defaultOrder));
      } catch {
        setColumnOrderState(defaultOrder);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [defaultOrder, storageKey]);

  const setColumnOrder = useCallback((nextOrder: TId[]) => {
    const normalized = normalizeOrder(nextOrder, defaultOrder);
    setColumnOrderState(normalized);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    } catch {
      // Local persistence is best-effort; the in-memory order still applies.
    }
  }, [defaultOrder, storageKey]);

  const resetColumnOrder = useCallback(() => {
    setColumnOrderState(defaultOrder);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Best-effort reset.
    }
  }, [defaultOrder, storageKey]);

  return {
    storageKey,
    columnOrder,
    orderedColumns: applyColumnOrder(columns, columnOrder),
    setColumnOrder,
    resetColumnOrder,
  };
}

type UseColumnHeaderReorderOptions<TId extends string> = {
  orderedColumns: readonly ColumnOrderItem<TId>[];
  onColumnOrderChange: (nextOrder: TId[]) => void;
};

export function useColumnHeaderReorder<TId extends string>({
  orderedColumns,
  onColumnOrderChange,
}: UseColumnHeaderReorderOptions<TId>) {
  const [draggingId, setDraggingId] = useState<TId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: TId; position: ColumnDropPosition } | null>(null);
  const suppressClickRef = useRef(false);
  const orderedIds = useMemo(() => orderedColumns.map((column) => column.id), [orderedColumns]);

  const columnLabelById = useMemo(() => (
    new Map(orderedColumns.map((column) => [column.id, column.label] as const))
  ), [orderedColumns]);

  const getDropPosition = useCallback((event: DragEvent<HTMLElement>): ColumnDropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX > bounds.left + bounds.width / 2 ? "after" : "before";
  }, []);

  const getHeaderReorderProps = useCallback((column: ColumnOrderItem<TId>) => ({
    draggable: true,
    "data-column-reorder-header": column.id,
    "aria-label": `Drag to reorder ${column.label} column`,
    title: `Drag to reorder ${column.label}`,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      suppressClickRef.current = true;
      setDraggingId(column.id);
      setDropTarget(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", column.id);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!draggingId || draggingId === column.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget({ id: column.id, position: getDropPosition(event) });
    },
    onDragLeave: () => {
      setDropTarget((current) => (current?.id === column.id ? null : current));
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!draggingId || draggingId === column.id) return;
      event.preventDefault();
      const position = dropTarget?.id === column.id ? dropTarget.position : getDropPosition(event);
      onColumnOrderChange(reorderColumnOrder(orderedIds, draggingId, column.id, position));
      setDraggingId(null);
      setDropTarget(null);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    },
    onDragEnd: () => {
      setDraggingId(null);
      setDropTarget(null);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    },
  }), [draggingId, dropTarget, getDropPosition, onColumnOrderChange, orderedIds]);

  const getHeaderReorderClassName = useCallback((columnId: TId, className = "") => {
    const isDragging = draggingId === columnId;
    const isDropBefore = dropTarget?.id === columnId && dropTarget.position === "before";
    const isDropAfter = dropTarget?.id === columnId && dropTarget.position === "after";

    return [
      className,
      "group/column-reorder relative cursor-grab select-none transition-colors active:cursor-grabbing",
      isDragging ? "bg-blue-50/80 text-blue-900 opacity-70" : "",
      isDropBefore ? "before:absolute before:top-1 before:bottom-1 before:left-0 before:w-0.5 before:rounded-full before:bg-[#28439A] before:content-['']" : "",
      isDropAfter ? "after:absolute after:top-1 after:right-0 after:bottom-1 after:w-0.5 after:rounded-full after:bg-[#28439A] after:content-['']" : "",
    ].filter(Boolean).join(" ");
  }, [draggingId, dropTarget]);

  const shouldSuppressHeaderClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  return {
    draggingId,
    columnLabelById,
    getHeaderReorderProps,
    getHeaderReorderClassName,
    shouldSuppressHeaderClick,
  };
}

export function ColumnHeaderDragHandle() {
  return (
    <GripVertical
      className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition group-hover/column-reorder:opacity-100 group-focus-within/column-reorder:opacity-100"
      aria-hidden
    />
  );
}

type ColumnOrderControlProps<TId extends string> = {
  label?: string;
  columns: readonly ColumnOrderItem<TId>[];
  pinnedColumns?: readonly ColumnOrderItem[];
  columnOrder: readonly TId[];
  onColumnOrderChange: (nextOrder: TId[]) => void;
  onReset: () => void;
  storageKey?: string;
  align?: "left" | "right";
};

export function ColumnOrderControl<TId extends string>({
  label = "Columns",
  columns,
  pinnedColumns = [],
  columnOrder,
  onColumnOrderChange,
  onReset,
  storageKey,
  align = "right",
}: ColumnOrderControlProps<TId>) {
  const [isOpen, setIsOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<TId | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const orderedColumns = useMemo(() => applyColumnOrder(columns, columnOrder), [columnOrder, columns]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function moveColumn(targetId: TId) {
    if (!draggingId || draggingId === targetId) return;
    const current = orderedColumns.map((column) => column.id);
    const from = current.indexOf(draggingId);
    const to = current.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onColumnOrderChange(next);
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
        aria-expanded={isOpen}
      >
        <Columns3 className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      {isOpen ? (
        <div
          className={[
            "absolute top-[calc(100%+0.5rem)] z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl ring-1 ring-slate-900/5",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold text-slate-900">Column order</p>
              <p className="text-[11px] leading-4 text-slate-500">Drag columns into your preferred order.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close column order"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          {pinnedColumns.length > 0 ? (
            <div className="mb-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pinned</p>
              <div className="space-y-1">
                {pinnedColumns.map((column) => (
                  <div key={column.id} className="flex h-8 items-center gap-2 rounded-md bg-white px-2 text-[12px] font-medium text-slate-500">
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                    <span>{column.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            {orderedColumns.map((column) => (
              <div
                key={column.id}
                draggable
                onDragStart={(event) => {
                  setDraggingId(column.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", column.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  moveColumn(column.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveColumn(column.id);
                  setDraggingId(null);
                }}
                onDragEnd={() => setDraggingId(null)}
                className={[
                  "flex h-9 cursor-grab items-center gap-2 rounded-lg border px-2 text-[12px] font-semibold transition",
                  draggingId === column.id
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                <GripVertical className="h-4 w-4 text-slate-400" aria-hidden />
                <span>{column.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset order
            </button>
            {storageKey ? (
              <span className="max-w-[9rem] truncate text-[10px] text-slate-400" title={storageKey}>
                Saved locally
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
