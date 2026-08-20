"use client";

import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  GripVertical,
  LayoutGrid,
  Monitor,
  Package,
  Plus,
  Save,
  Signpost,
  Trash2,
  UsersRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { inferSessionRequirementCatalogType, type SessionRequirementCatalogType } from "@/lib/session-requirement-catalog";

type RequirementItemDraft = {
  id: string;
  key: string;
  label: string;
  active: boolean;
  hasQuantity: boolean;
};

type RequirementSectionDraft = {
  id: string;
  key: string;
  label: string;
  icon: string;
  sortOrder: number;
  items: RequirementItemDraft[];
};

type RequirementTemplateDraft = {
  id: string;
  eventId: string;
  name: string;
  sections: RequirementSectionDraft[];
};

type EditingRow = {
  sectionId: string;
  itemId: string;
  isNew: boolean;
};

const CATALOG_ORDER: Record<string, number> = {
  AV: 0,
  STAFFING: 1,
  SUPPLIES: 2,
  SIGNAGE: 3,
  STATUS: 4,
  FNB: 5,
  SETUP: 6,
  OTHER: 7,
};

const DEFAULT_VISIBLE_CATALOG_TYPES: SessionRequirementCatalogType[] = ["AV", "STAFFING", "SUPPLIES", "SIGNAGE", "STATUS"];

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeKey(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function sectionIcon(icon: string) {
  const normalized = icon.trim().toLowerCase();
  if (normalized.includes("monitor") || normalized.includes("av")) {
    return <Monitor className="h-4 w-4" />;
  }
  if (normalized.includes("utensil") || normalized.includes("food")) {
    return <UtensilsCrossed className="h-4 w-4" />;
  }
  if (normalized.includes("user") || normalized.includes("staff")) {
    return <UsersRound className="h-4 w-4" />;
  }
  if (normalized.includes("package") || normalized.includes("suppl")) {
    return <Package className="h-4 w-4" />;
  }
  if (normalized.includes("sign")) {
    return <Signpost className="h-4 w-4" />;
  }
  if (normalized.includes("status") || normalized.includes("alert")) {
    return <AlertTriangle className="h-4 w-4" />;
  }
  if (normalized.includes("setup") || normalized.includes("layout")) {
    return <LayoutGrid className="h-4 w-4" />;
  }
  return <LayoutGrid className="h-4 w-4" />;
}

function pillClasses(enabled: boolean): string {
  return enabled
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-slate-100 text-slate-500 border-slate-200";
}

function TogglePill({
  label,
  enabled,
  onClick,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-8 items-center rounded-full border px-2.5 text-[11px] font-semibold transition",
        enabled ? "bg-[#28439A] border-[#28439A] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function SortableCatalogRow({
  sectionId,
  item,
  isEditing,
  editorDraft,
  disableInteractions,
  onSelect,
  onDelete,
  onDraftChange,
  onSave,
  onCancel,
}: {
  sectionId: string;
  item: RequirementItemDraft;
  isEditing: boolean;
  editorDraft: RequirementItemDraft | null;
  disableInteractions: boolean;
  onSelect: (sectionId: string, item: RequirementItemDraft) => void;
  onDelete: (sectionId: string, itemId: string) => void;
  onDraftChange: (next: RequirementItemDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: disableInteractions,
  });
  const rowSelectable = !(disableInteractions && !isEditing);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "rounded-lg bg-white px-3 py-2 transition",
        isDragging ? "opacity-60 shadow" : "border border-slate-200/80",
      ].join(" ")}
    >
      <div
        role="button"
        tabIndex={rowSelectable ? 0 : -1}
        aria-disabled={!rowSelectable}
        onClick={() => {
          if (!rowSelectable) return;
          onSelect(sectionId, item);
        }}
        onKeyDown={(event) => {
          if (!rowSelectable) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(sectionId, item);
          }
        }}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-800">{item.label || "Untitled item"}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{item.key || "no-key"}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className={["inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", pillClasses(item.active)].join(" ")}>
            {item.active ? "Active" : "Inactive"}
          </span>
          <span className={["inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", pillClasses(item.hasQuantity)].join(" ")}>
            Qty
          </span>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(sectionId, item.id);
            }}
            disabled={disableInteractions && !isEditing}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            title="Delete item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            disabled={disableInteractions && !isEditing}
            className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isEditing && editorDraft ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold text-slate-600">Item Label</span>
              <input
                value={editorDraft.label}
                onChange={(event) => onDraftChange({ ...editorDraft, label: event.target.value })}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] outline-none focus:border-slate-300"
                autoFocus
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold text-slate-600">Key</span>
              <input
                value={editorDraft.key}
                onChange={(event) => onDraftChange({ ...editorDraft, key: event.target.value })}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[12px] outline-none focus:border-slate-300"
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TogglePill
              label={editorDraft.active ? "Active" : "Inactive"}
              enabled={editorDraft.active}
              onClick={() => onDraftChange({ ...editorDraft, active: !editorDraft.active })}
            />
            <TogglePill
              label={editorDraft.hasQuantity ? "Has Quantity" : "No Quantity"}
              enabled={editorDraft.hasQuantity}
              onClick={() => onDraftChange({ ...editorDraft, hasQuantity: !editorDraft.hasQuantity })}
            />
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600 hover:bg-white"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              className="inline-flex h-8 items-center rounded-md bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e]"
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SessionRequirementsSettings({
  eventId,
  visibleCatalogTypes = DEFAULT_VISIBLE_CATALOG_TYPES,
  focusCatalogType = null,
  title = "Session configuration",
  description = "Manage reusable Run of Show options for sessions.",
  onBack,
}: {
  eventId: string;
  visibleCatalogTypes?: SessionRequirementCatalogType[];
  focusCatalogType?: SessionRequirementCatalogType | null;
  title?: string;
  description?: string;
  onBack?: () => void;
}) {
  const [template, setTemplate] = useState<RequirementTemplateDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [editorDraft, setEditorDraft] = useState<RequirementItemDraft | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );

  useEffect(() => {
    if (!flashMessage) return;
    const timeout = setTimeout(() => setFlashMessage(null), 2500);
    return () => clearTimeout(timeout);
  }, [flashMessage]);

  const loadTemplate = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/session-requirements/template`);
      const payload = (await response.json()) as RequirementTemplateDraft | { error?: string };
      if (!response.ok || !("id" in payload)) {
        throw new Error(("error" in payload && payload.error) || "Failed to load session configuration");
      }
      setTemplate({
        ...payload,
        sections: payload.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => ({
            ...item,
            active: typeof item.active === "boolean" ? item.active : true,
          })),
        })),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load session configuration");
      setTemplate(null);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  const canSave = useMemo(() => {
    if (!template) return false;
    if (!template.name.trim()) return false;
    if (template.sections.some((section) => !section.label.trim())) return false;
    if (template.sections.some((section) => section.items.some((item) => !item.label.trim()))) return false;
    return true;
  }, [template]);

  const visibleTypeSet = useMemo(() => new Set(visibleCatalogTypes), [visibleCatalogTypes]);

  const orderedSections = useMemo(() => {
    if (!template) return [];
    return [...template.sections].filter((section) => {
      const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
      if (!visibleTypeSet.has(sectionType)) return false;
      if (focusCatalogType && sectionType !== focusCatalogType) return false;
      return true;
    }).sort((left, right) => {
      const leftType = inferSessionRequirementCatalogType({ key: left.key, label: left.label });
      const rightType = inferSessionRequirementCatalogType({ key: right.key, label: right.label });
      const leftRank = CATALOG_ORDER[leftType] ?? 99;
      const rightRank = CATALOG_ORDER[rightType] ?? 99;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.sortOrder - right.sortOrder;
    });
  }, [focusCatalogType, template, visibleTypeSet]);

  useEffect(() => {
    if (orderedSections.length === 0) return;
    setCollapsedSections((current) => {
      let changed = false;
      const next = { ...current };
      for (const section of orderedSections) {
        if (!(section.id in next)) {
          next[section.id] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [orderedSections]);

  const applyItemMutation = useCallback((sectionId: string, mutate: (items: RequirementItemDraft[]) => RequirementItemDraft[]) => {
    setTemplate((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            items: mutate(section.items),
          };
        }),
      };
    });
  }, []);

  const startRowEdit = useCallback((sectionId: string, item: RequirementItemDraft, isNew = false) => {
    if (editingRow && !(editingRow.sectionId === sectionId && editingRow.itemId === item.id)) {
      return;
    }
    setEditingRow({ sectionId, itemId: item.id, isNew });
    setEditorDraft({ ...item });
  }, [editingRow]);

  const cancelRowEdit = useCallback(() => {
    if (editingRow?.isNew) {
      applyItemMutation(editingRow.sectionId, (items) => items.filter((item) => item.id !== editingRow.itemId));
    }
    setEditingRow(null);
    setEditorDraft(null);
  }, [applyItemMutation, editingRow]);

  const saveRowEdit = useCallback(() => {
    if (!editingRow || !editorDraft) return;

    const normalizedLabel = editorDraft.label.trim();
    if (!normalizedLabel) {
      setErrorMessage("Item label is required");
      return;
    }

    const normalizedKey = normalizeKey(editorDraft.key || normalizedLabel, "item");

    applyItemMutation(editingRow.sectionId, (items) =>
      items.map((item) => {
        if (item.id !== editingRow.itemId) return item;
        return {
          ...item,
          label: normalizedLabel,
          key: normalizedKey,
          active: editorDraft.active,
          hasQuantity: editorDraft.hasQuantity,
        };
      }),
    );

    setEditingRow(null);
    setEditorDraft(null);
    setErrorMessage(null);
  }, [applyItemMutation, editorDraft, editingRow]);

  const addItemAtTop = useCallback((sectionId: string) => {
    if (editingRow) return;

    const nextItem: RequirementItemDraft = {
      id: makeId("item"),
      key: "",
      label: "",
      active: true,
      hasQuantity: false,
    };

    applyItemMutation(sectionId, (items) => [nextItem, ...items]);
    setCollapsedSections((current) => ({ ...current, [sectionId]: false }));
    setEditingRow({ sectionId, itemId: nextItem.id, isNew: true });
    setEditorDraft(nextItem);
  }, [applyItemMutation, editingRow]);

  const deleteItem = useCallback((sectionId: string, itemId: string) => {
    if (editingRow) return;
    applyItemMutation(sectionId, (items) => items.filter((item) => item.id !== itemId));
  }, [applyItemMutation, editingRow]);

  const handleSectionDragEnd = useCallback((sectionId: string, event: DragEndEvent) => {
    if (editingRow) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    applyItemMutation(sectionId, (items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  }, [applyItemMutation, editingRow]);

  async function handleSaveTemplate() {
    if (!template) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/session-requirements/template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name.trim(),
          sections: template.sections.map((section) => ({
            id: section.id.startsWith("section:") ? undefined : section.id,
            key: normalizeKey(section.key || section.label, "section"),
            label: section.label.trim(),
            icon: section.icon.trim() || "list",
            items: section.items.map((item) => ({
              id: item.id.startsWith("item:") ? undefined : item.id,
              key: normalizeKey(item.key || item.label, "item"),
              label: item.label.trim(),
              active: item.active,
              hasQuantity: item.hasQuantity,
            })),
          })),
        }),
      });

      const payload = (await response.json()) as RequirementTemplateDraft | { error?: string };
      if (!response.ok || !("id" in payload)) {
        throw new Error(("error" in payload && payload.error) || "Failed to save session configuration");
      }

      setTemplate({
        ...payload,
        sections: payload.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => ({
            ...item,
            active: typeof item.active === "boolean" ? item.active : true,
          })),
        })),
      });
      setEditingRow(null);
      setEditorDraft(null);
      setFlashMessage("Session configuration saved");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save session configuration");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-[13px] text-slate-500">Loading session configuration…</p>;
  }

  if (!template) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-rose-600">{errorMessage ?? "Unable to load session configuration."}</p>
        <button
          type="button"
          onClick={() => void loadTemplate()}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-3 inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Settings
            </button>
          ) : null}
          <h3 className="text-[20px] leading-[24px] font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleSaveTemplate()}
          disabled={!canSave || isSaving}
          className="inline-flex h-10 items-center gap-1 rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {orderedSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-[13px] text-slate-500">
            No supported settings are available for this section yet.
          </div>
        ) : orderedSections.map((section) => {
          const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
          const isCollapsed = Boolean(collapsedSections[section.id]);

          return (
            <section key={section.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex w-full items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedSections((current) => ({
                      ...current,
                      [section.id]: !current[section.id],
                    }));
                  }}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-600">
                      {sectionIcon(section.icon)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-slate-900">{section.label}</span>
                      <span className="text-[11px] text-slate-500">{sectionType} • {section.items.length} items</span>
                    </span>
                  </span>
                  <ChevronDown className={["h-4 w-4 text-slate-500 transition-transform", isCollapsed ? "rotate-180" : "rotate-0"].join(" ")} />
                </button>

                <button
                  type="button"
                  onClick={() => addItemAtTop(section.id)}
                  disabled={Boolean(editingRow)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </button>
              </div>

              {!isCollapsed ? (
                <div className="mt-3 space-y-1.5">
                  {section.items.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-[12px] text-slate-500">
                      No items yet. Add one to start this catalog.
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => handleSectionDragEnd(section.id, event)}
                    >
                      <SortableContext
                        items={section.items.map((item) => item.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {section.items.map((item) => {
                          const isEditing = Boolean(
                            editingRow && editingRow.sectionId === section.id && editingRow.itemId === item.id,
                          );

                          return (
                            <SortableCatalogRow
                              key={item.id}
                              sectionId={section.id}
                              item={item}
                              isEditing={isEditing}
                              editorDraft={isEditing ? editorDraft : null}
                              disableInteractions={Boolean(editingRow && !isEditing)}
                              onSelect={startRowEdit}
                              onDelete={deleteItem}
                              onDraftChange={setEditorDraft}
                              onSave={saveRowEdit}
                              onCancel={cancelRowEdit}
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}
      {flashMessage ? <p className="mt-2 text-[13px] font-semibold text-emerald-600">{flashMessage}</p> : null}
    </section>
  );
}
