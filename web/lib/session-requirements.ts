import { Prisma, type BudgetLineItemStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  SESSION_REQUIREMENT_DEFAULT_TEMPLATE_NAME,
  SESSION_REQUIREMENT_PLATFORM_DEFAULT_CATALOGS,
  inferSessionRequirementCatalogType,
  type SessionRequirementCatalogType,
} from "@/lib/session-requirement-catalog";
import { buildSessionRequirementSelectionPersistencePlan } from "@/lib/session-requirement-selection-persistence";
import { recordEventActivity } from "@/src/server/services/event-activity";
import { parseSessionRequirementQuantity, SessionRequirementQuantityError } from "@/lib/session-requirement-quantity";

/** Authenticated actor context for session-requirement audit entries. */
export type SessionRequirementAuditActor = { id: string } | null | undefined;

function requirementActor(actor: SessionRequirementAuditActor) {
  return actor?.id ? ({ kind: "USER", userId: actor.id } as const) : ({ kind: "SYSTEM", label: "System" } as const);
}

export class SessionRequirementError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type SessionRequirementTemplateRecord = {
  id: string;
  eventId: string;
  name: string;
  sections: SessionRequirementSectionRecord[];
};

export type SessionRequirementSectionRecord = {
  id: string;
  key: string;
  label: string;
  type: SessionRequirementCatalogType;
  icon: string;
  sortOrder: number;
  items: SessionRequirementItemRecord[];
};

export type SessionRequirementItemRecord = {
  id: string;
  key: string;
  type: SessionRequirementCatalogType;
  label: string;
  active: boolean;
  hasQuantity: boolean;
  sortOrder: number;
};

export type LinkedBudgetLineItemRecord = {
  id: string;
  lineItem: string;
  category: string;
  subcategory: string;
  forecastCents: number;
  actualCents: number;
  status: BudgetLineItemStatus;
};

export type SessionRequirementSelectionRecord = {
  sessionId: string;
  itemId: string;
  quantity: number | null;
  linkedBudgetLineItem: LinkedBudgetLineItemRecord | null;
};

export type SessionRequirementBudgetLinkRecord = {
  sessionId: string;
  itemId: string;
  linkedBudgetLineItem: LinkedBudgetLineItemRecord | null;
};

type TemplateUpdateInput = {
  name?: unknown;
  sections?: unknown;
};

type CustomRequirementItemInput = {
  label?: unknown;
  hasQuantity?: unknown;
};

type NormalizedTemplateSectionInput = {
  id?: string;
  key: string;
  label: string;
  icon: string;
  sortOrder: number;
  items: Array<{
    id?: string;
    key: string;
    label: string;
    active: boolean;
    hasQuantity: boolean;
    sortOrder: number;
  }>;
};

type TxClient = Prisma.TransactionClient;
type TemplateReadClient = ReturnType<typeof getPrisma> | TxClient;
type EventTemplateContext = {
  id: string;
  sessionRequirementTemplateId: string | null;
};

const templateQueryArgs = {
  select: {
    id: true,
    eventId: true,
    name: true,
    sections: {
      orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
      select: {
        id: true,
        key: true,
        label: true,
        icon: true,
        sortOrder: true,
        items: {
          orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
          select: {
            id: true,
            key: true,
            label: true,
            active: true,
            hasQuantity: true,
            sortOrder: true,
          },
        },
      },
    },
  },
} satisfies Prisma.SessionRequirementTemplateDefaultArgs;

type TemplateWithSections = Prisma.SessionRequirementTemplateGetPayload<typeof templateQueryArgs>;

function toOptionalText(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toSlug(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function uniqueKey(baseKey: string, used: Set<string>): string {
  let candidate = baseKey;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${baseKey}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeTemplateRecord(template: TemplateWithSections): SessionRequirementTemplateRecord {
  return {
    id: template.id,
    eventId: template.eventId,
    name: template.name,
    sections: template.sections.map((section) => ({
      id: section.id,
      key: section.key,
      label: section.label,
      type: inferSessionRequirementCatalogType({ key: section.key, label: section.label }),
      icon: section.icon,
      sortOrder: section.sortOrder,
      items: section.items.map((item) => ({
        id: item.id,
        key: item.key,
        type: inferSessionRequirementCatalogType({ key: section.key, label: section.label }),
        label: item.label,
        active: item.active,
        hasQuantity: item.hasQuantity,
        sortOrder: item.sortOrder,
      })),
    })),
  };
}

async function loadTemplateById(tx: TemplateReadClient, templateId: string): Promise<TemplateWithSections | null> {
  return tx.sessionRequirementTemplate.findUnique({
    where: { id: templateId },
    ...templateQueryArgs,
  });
}

async function createDefaultTemplate(tx: TxClient, eventId: string): Promise<TemplateWithSections> {
  return tx.sessionRequirementTemplate.create({
    data: {
      eventId,
      name: SESSION_REQUIREMENT_DEFAULT_TEMPLATE_NAME,
      sections: {
        create: SESSION_REQUIREMENT_PLATFORM_DEFAULT_CATALOGS.map((section, sectionIndex) => ({
          key: section.key,
          label: section.label,
          icon: section.icon,
          sortOrder: sectionIndex,
          items: {
            create: section.items.map((item, itemIndex) => ({
              key: item.key,
              label: item.label,
              active: true,
              hasQuantity: item.hasQuantity,
              sortOrder: itemIndex,
            })),
          },
        })),
      },
    },
    ...templateQueryArgs,
  });
}

async function ensurePlatformDefaultSectionsTx(
  tx: TxClient,
  template: TemplateWithSections,
): Promise<TemplateWithSections> {
  let didMutate = false;
  const sectionByKey = new Map(template.sections.map((section) => [section.key, section]));

  for (const [sectionIndex, defaultSection] of SESSION_REQUIREMENT_PLATFORM_DEFAULT_CATALOGS.entries()) {
    let resolvedSection = sectionByKey.get(defaultSection.key);

    if (!resolvedSection) {
      didMutate = true;
      const createdSection = await tx.sessionRequirementSection.create({
        data: {
          templateId: template.id,
          key: defaultSection.key,
          label: defaultSection.label,
          icon: defaultSection.icon,
          sortOrder: sectionIndex,
        },
      });
      resolvedSection = {
        ...createdSection,
        items: [],
      };
      sectionByKey.set(defaultSection.key, resolvedSection);
    }

    const existingItemKeys = new Set(resolvedSection.items.map((item) => item.key));
    const maxSortOrder = resolvedSection.items.reduce((maxValue, item) => Math.max(maxValue, item.sortOrder), -1);
    const itemsToCreate = defaultSection.items
      .filter((defaultItem) => !existingItemKeys.has(defaultItem.key))
      .map((defaultItem, missingIndex) => ({
        sectionId: resolvedSection.id,
        key: defaultItem.key,
        label: defaultItem.label,
        active: true,
        hasQuantity: defaultItem.hasQuantity,
        sortOrder: maxSortOrder + missingIndex + 1,
      }));

    if (itemsToCreate.length > 0) {
      didMutate = true;
      await tx.sessionRequirementItem.createMany({
        data: itemsToCreate,
        skipDuplicates: true,
      });
    }
  }

  if (!didMutate) return template;

  const refreshed = await loadTemplateById(tx, template.id);
  if (!refreshed) {
    throw new SessionRequirementError("Session requirement template not found", 404);
  }
  return refreshed;
}

export async function ensureEventSessionRequirementTemplateTx(
  tx: TxClient,
  eventId: string,
  eventContext?: EventTemplateContext,
): Promise<SessionRequirementTemplateRecord> {
  const event = eventContext ?? await tx.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      sessionRequirementTemplateId: true,
    },
  });

  if (!event) {
    throw new SessionRequirementError("Event not found", 404);
  }

  let template: TemplateWithSections | null = null;

  if (event.sessionRequirementTemplateId) {
    template = await loadTemplateById(tx, event.sessionRequirementTemplateId);
  }

  if (!template) {
    template = await tx.sessionRequirementTemplate.findFirst({
      where: { eventId: event.id },
      ...templateQueryArgs,
      orderBy: { createdAt: "asc" },
    });
  }

  if (!template) {
    template = await createDefaultTemplate(tx, event.id);
  }

  template = await ensurePlatformDefaultSectionsTx(tx, template);

  if (event.sessionRequirementTemplateId !== template.id) {
    await tx.event.update({
      where: { id: event.id },
      data: {
        sessionRequirementTemplateId: template.id,
      },
    });
  }

  return normalizeTemplateRecord(template);
}

export async function getEventSessionRequirementTemplate(eventId: string): Promise<SessionRequirementTemplateRecord> {
  const db = getPrisma();
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, sessionRequirementTemplateId: true },
  });
  if (!event) throw new SessionRequirementError("Event not found", 404);

  const template = event.sessionRequirementTemplateId
    ? await loadTemplateById(db, event.sessionRequirementTemplateId)
    : await db.sessionRequirementTemplate.findFirst({
      where: { eventId },
      ...templateQueryArgs,
      orderBy: { createdAt: "asc" },
    });
  if (!template) {
    throw new SessionRequirementError("Session requirement template is not initialized", 409);
  }
  return normalizeTemplateRecord(template);
}

/** Explicit write-time initialization/repair; GET callers must use the pure reader above. */
export async function initializeEventSessionRequirementTemplate(
  eventId: string,
): Promise<SessionRequirementTemplateRecord> {
  return getPrisma().$transaction(async (tx) => ensureEventSessionRequirementTemplateTx(tx, eventId));
}

function normalizeTemplateUpdateSections(value: unknown): NormalizedTemplateSectionInput[] {
  if (!Array.isArray(value)) {
    throw new SessionRequirementError("sections must be an array", 400);
  }

  const sectionKeys = new Set<string>();
  return value.map((rawSection, sectionIndex) => {
    if (!rawSection || typeof rawSection !== "object") {
      throw new SessionRequirementError("Each section must be an object", 400);
    }
    const section = rawSection as Record<string, unknown>;
    const label = toOptionalText(section.label);
    if (!label) {
      throw new SessionRequirementError("Section label is required", 400);
    }

    const rawKey = toOptionalText(section.key) ?? toSlug(label, `section-${sectionIndex + 1}`);
    const sectionKey = uniqueKey(rawKey, sectionKeys);
    const icon = toOptionalText(section.icon) ?? "list";
    const itemsRaw = Array.isArray(section.items) ? section.items : [];

    const itemKeys = new Set<string>();
    const items = itemsRaw.map((rawItem, itemIndex) => {
      if (!rawItem || typeof rawItem !== "object") {
        throw new SessionRequirementError("Each item must be an object", 400);
      }
      const item = rawItem as Record<string, unknown>;
      const itemLabel = toOptionalText(item.label);
      if (!itemLabel) {
        throw new SessionRequirementError("Item label is required", 400);
      }

      const rawItemKey = toOptionalText(item.key) ?? toSlug(itemLabel, `item-${itemIndex + 1}`);
      const itemKey = uniqueKey(rawItemKey, itemKeys);
      const active = item.active !== false;
      const hasQuantity = Boolean(item.hasQuantity);

      return {
        id: toOptionalText(item.id) ?? undefined,
        key: itemKey,
        label: itemLabel,
        active,
        hasQuantity,
        sortOrder: itemIndex,
      };
    });

    return {
      id: toOptionalText(section.id) ?? undefined,
      key: sectionKey,
      label,
      icon,
      sortOrder: sectionIndex,
      items,
    };
  });
}

export async function updateEventSessionRequirementTemplate(
  eventId: string,
  input: TemplateUpdateInput,
  actor?: SessionRequirementAuditActor,
): Promise<SessionRequirementTemplateRecord> {
  return getPrisma().$transaction(async (tx) => {
    const ensured = await ensureEventSessionRequirementTemplateTx(tx, eventId);
    const name = toOptionalText(input.name) ?? ensured.name;
    const sections = typeof input.sections === "undefined" ? null : normalizeTemplateUpdateSections(input.sections);

    await tx.sessionRequirementTemplate.update({
      where: { id: ensured.id },
      data: { name },
    });

    const recordTemplateActivity = async (detail: string) => {
      await recordEventActivity(tx, {
        eventId,
        actor: requirementActor(actor),
        module: "EVENT_SETTINGS",
        action: "UPDATED",
        entityType: "SessionRequirementTemplate",
        entityId: ensured.id,
        entityLabel: name,
        message: `Updated session requirement template (${detail})`,
      });
    };

    if (!sections) {
      await recordTemplateActivity("renamed");
      return ensureEventSessionRequirementTemplateTx(tx, eventId);
    }

    const existingSections = await tx.sessionRequirementSection.findMany({
      where: { templateId: ensured.id },
      include: { items: true },
    });
    const existingSectionById = new Map(existingSections.map((section) => [section.id, section]));
    const keptSectionIds = new Set<string>();

    for (const section of sections) {
      let sectionId = section.id ?? "";
      const existingSection = sectionId ? existingSectionById.get(sectionId) : null;

      if (existingSection) {
        await tx.sessionRequirementSection.update({
          where: { id: existingSection.id },
          data: {
            key: section.key,
            label: section.label,
            icon: section.icon,
            sortOrder: section.sortOrder,
          },
        });
        sectionId = existingSection.id;
      } else {
        const created = await tx.sessionRequirementSection.create({
          data: {
            templateId: ensured.id,
            key: section.key,
            label: section.label,
            icon: section.icon,
            sortOrder: section.sortOrder,
          },
        });
        sectionId = created.id;
      }

      keptSectionIds.add(sectionId);

      const existingItems = (existingSection?.items ?? []).map((item) => [item.id, item] as const);
      const existingItemById = new Map(existingItems);
      const keptItemIds = new Set<string>();

      for (const item of section.items) {
        const existingItem = item.id ? existingItemById.get(item.id) : null;
        if (existingItem) {
          await tx.sessionRequirementItem.update({
            where: { id: existingItem.id },
            data: {
              key: item.key,
              label: item.label,
              active: item.active,
              hasQuantity: item.hasQuantity,
              sortOrder: item.sortOrder,
            },
          });
          keptItemIds.add(existingItem.id);
        } else {
          const createdItem = await tx.sessionRequirementItem.create({
            data: {
              sectionId,
              key: item.key,
              label: item.label,
              active: item.active,
              hasQuantity: item.hasQuantity,
              sortOrder: item.sortOrder,
            },
          });
          keptItemIds.add(createdItem.id);
        }
      }

      if (existingItems.length > 0) {
        const removedItemIds = existingItems
          .map(([id]) => id)
          .filter((id) => !keptItemIds.has(id));

        if (removedItemIds.length > 0) {
          const inUseSelections = await tx.sessionRequirementSelection.findMany({
            where: {
              itemId: { in: removedItemIds },
            },
            select: {
              itemId: true,
            },
            distinct: ["itemId"],
          });
          const inUseIds = new Set(inUseSelections.map((selection) => selection.itemId));
          const deletableIds = removedItemIds.filter((itemId) => !inUseIds.has(itemId));
          const softDisableIds = removedItemIds.filter((itemId) => inUseIds.has(itemId));

          if (deletableIds.length > 0) {
            await tx.sessionRequirementItem.deleteMany({
              where: {
                id: { in: deletableIds },
              },
            });
          }

          if (softDisableIds.length > 0) {
            await tx.sessionRequirementItem.updateMany({
              where: {
                id: { in: softDisableIds },
              },
              data: {
                active: false,
              },
            });
          }
        }
      }
    }

    const sectionsToRemove = existingSections
      .map((section) => section.id)
      .filter((sectionId) => !keptSectionIds.has(sectionId));

    if (sectionsToRemove.length > 0) {
      await tx.sessionRequirementSection.deleteMany({
        where: {
          id: { in: sectionsToRemove },
        },
      });
    }

    await recordTemplateActivity(`${sections.length} section${sections.length === 1 ? "" : "s"}`);

    return ensureEventSessionRequirementTemplateTx(tx, eventId);
  });
}

export async function createSessionRequirementItemForSection(
  eventId: string,
  sectionId: string,
  input: CustomRequirementItemInput,
): Promise<SessionRequirementItemRecord> {
  const label = toOptionalText(input.label);
  if (!label) {
    throw new SessionRequirementError("Item label is required", 400);
  }

  return getPrisma().$transaction(async (tx) => {
    await ensureEventSessionRequirementTemplateTx(tx, eventId);

    const section = await tx.sessionRequirementSection.findFirst({
      where: {
        id: sectionId,
        template: {
          eventId,
        },
      },
      include: {
        items: {
          select: {
            key: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!section) {
      throw new SessionRequirementError("Requirement section not found", 404);
    }

    const usedItemKeys = new Set(section.items.map((item) => item.key));
    const key = uniqueKey(toSlug(label, "custom-item"), usedItemKeys);
    const sortOrder = section.items.reduce((maxValue, item) => Math.max(maxValue, item.sortOrder), -1) + 1;
    const created = await tx.sessionRequirementItem.create({
      data: {
        sectionId: section.id,
        key,
        label,
        active: true,
        hasQuantity: Boolean(input.hasQuantity),
        sortOrder,
      },
    });

    return {
      id: created.id,
      key: created.key,
      type: inferSessionRequirementCatalogType({ key: section.key, label: section.label }),
      label: created.label,
      active: created.active,
      hasQuantity: created.hasQuantity,
      sortOrder: created.sortOrder,
    };
  });
}

function normalizeSelectionInputs(value: unknown): Array<{ itemId: string; quantity: number | null }> {
  if (!Array.isArray(value)) return [];

  const dedupe = new Set<string>();
  const normalized: Array<{ itemId: string; quantity: number | null }> = [];

  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;
    const itemId = toOptionalText(entry.itemId);
    if (!itemId || dedupe.has(itemId)) continue;
    dedupe.add(itemId);

    let quantity: number | null = null;
    const rawQuantity = entry.quantity;
    if (typeof rawQuantity !== "undefined" && rawQuantity !== null && String(rawQuantity).trim() !== "") {
      try {
        quantity = parseSessionRequirementQuantity(rawQuantity);
      } catch (error) {
        if (error instanceof SessionRequirementQuantityError) {
          throw new SessionRequirementError(error.message, 400);
        }
        throw error;
      }
    }

    normalized.push({
      itemId,
      quantity,
    });
  }

  return normalized;
}

export async function saveSessionRequirementSelections(input: {
  tx: TxClient;
  eventId: string;
  sessionId: string;
  selections: unknown;
}): Promise<void> {
  const normalizedSelections = normalizeSelectionInputs(input.selections);

  const itemIds = normalizedSelections.map((selection) => selection.itemId);
  const allowedItems = itemIds.length > 0
    ? await input.tx.sessionRequirementItem.findMany({
        where: {
          id: { in: itemIds },
          active: true,
          section: {
            template: {
              eventId: input.eventId,
            },
          },
        },
        select: {
          id: true,
          hasQuantity: true,
        },
      })
    : [];

  if (allowedItems.length !== itemIds.length) {
    throw new SessionRequirementError("One or more requirement items are invalid for this event", 400);
  }

  const itemById = new Map(allowedItems.map((item) => [item.id, item]));
  const payload = normalizedSelections.map((selection) => {
    const item = itemById.get(selection.itemId);
    if (!item) {
      throw new SessionRequirementError("One or more requirement items are invalid for this event", 400);
    }
    return {
      sessionId: input.sessionId,
      itemId: selection.itemId,
      quantity: item.hasQuantity ? selection.quantity : null,
    };
  });

  const existingSelections = await input.tx.sessionRequirementSelection.findMany({
    where: {
      sessionId: input.sessionId,
    },
    select: {
      itemId: true,
      quantity: true,
    },
  });

  const persistencePlan = buildSessionRequirementSelectionPersistencePlan(
    existingSelections.map((selection) => ({
      itemId: selection.itemId,
      quantity: selection.quantity ?? null,
    })),
    payload,
  );

  if (persistencePlan.itemIdsToDelete.length > 0) {
    await input.tx.sessionRequirementSelection.deleteMany({
      where: {
        sessionId: input.sessionId,
        itemId: { in: persistencePlan.itemIdsToDelete },
      },
    });
  }

  await Promise.all(
    persistencePlan.selectionsToUpdate.map((selection) =>
      input.tx.sessionRequirementSelection.updateMany({
        where: {
          sessionId: input.sessionId,
          itemId: selection.itemId,
        },
        data: {
          quantity: selection.quantity,
        },
      }),
    ),
  );

  if (persistencePlan.selectionsToInsert.length > 0) {
    await input.tx.sessionRequirementSelection.createMany({
      data: persistencePlan.selectionsToInsert.map((selection) => ({
        sessionId: input.sessionId,
        itemId: selection.itemId,
        quantity: selection.quantity,
      })),
      skipDuplicates: true,
    });
  }
}

export async function listSessionRequirementSelectionsForEvent(eventId: string): Promise<SessionRequirementSelectionRecord[]> {
  const rows = await getPrisma().sessionRequirementSelection.findMany({
    where: {
      session: {
        eventId,
      },
    },
    select: {
      sessionId: true,
      itemId: true,
      quantity: true,
      budgetLineItem: {
        select: {
          id: true,
          lineItem: true,
          category: true,
          subcategory: true,
          forecastCents: true,
          actualCents: true,
          status: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    sessionId: row.sessionId,
    itemId: row.itemId,
    quantity: row.quantity ?? null,
    linkedBudgetLineItem: row.budgetLineItem
      ? {
          id: row.budgetLineItem.id,
          lineItem: row.budgetLineItem.lineItem,
          category: row.budgetLineItem.category,
          subcategory: row.budgetLineItem.subcategory,
          forecastCents: row.budgetLineItem.forecastCents,
          actualCents: row.budgetLineItem.actualCents,
          status: row.budgetLineItem.status,
        }
      : null,
  }));
}

function toLinkedBudgetLineItemRecord(lineItem: LinkedBudgetLineItemRecord | null): LinkedBudgetLineItemRecord | null {
  if (!lineItem) return null;
  return {
    id: lineItem.id,
    lineItem: lineItem.lineItem,
    category: lineItem.category,
    subcategory: lineItem.subcategory,
    forecastCents: lineItem.forecastCents,
    actualCents: lineItem.actualCents,
    status: lineItem.status,
  };
}

export async function updateSessionRequirementBudgetLink(input: {
  eventId: string;
  sessionId: string;
  itemId: string;
  budgetLineItemId: string | null;
}): Promise<SessionRequirementBudgetLinkRecord> {
  const prisma = getPrisma();

  const session = await prisma.matrixRow.findFirst({
    where: {
      id: input.sessionId,
      eventId: input.eventId,
    },
    select: {
      id: true,
    },
  });

  if (!session) {
    throw new SessionRequirementError("Session not found", 404);
  }

  const item = await prisma.sessionRequirementItem.findFirst({
    where: {
      id: input.itemId,
      section: {
        template: {
          eventId: input.eventId,
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!item) {
    throw new SessionRequirementError("Requirement item not found", 404);
  }

  const selectionSelect = {
    sessionId: true,
    itemId: true,
    budgetLineItem: {
      select: {
        id: true,
        lineItem: true,
        category: true,
        subcategory: true,
        forecastCents: true,
        actualCents: true,
        status: true,
      },
    },
  } as const;

  if (!input.budgetLineItemId) {
    const existing = await prisma.sessionRequirementSelection.findUnique({
      where: {
        sessionId_itemId: {
          sessionId: input.sessionId,
          itemId: input.itemId,
        },
      },
      select: {
        sessionId: true,
        itemId: true,
      },
    });

    if (!existing) {
      throw new SessionRequirementError("Session requirement selection not found", 404);
    }

    const updated = await prisma.sessionRequirementSelection.update({
      where: {
        sessionId_itemId: {
          sessionId: input.sessionId,
          itemId: input.itemId,
        },
      },
      data: {
        budgetLineItemId: null,
      },
      select: selectionSelect,
    });

    return {
      sessionId: updated.sessionId,
      itemId: updated.itemId,
      linkedBudgetLineItem: toLinkedBudgetLineItemRecord(updated.budgetLineItem),
    };
  }

  const budgetLineItem = await prisma.budgetLineItem.findFirst({
    where: {
      id: input.budgetLineItemId,
      budget: {
        eventId: input.eventId,
      },
    },
    select: {
      id: true,
      matrixRowId: true,
    },
  });

  if (!budgetLineItem) {
    throw new SessionRequirementError("Budget line item not found", 404);
  }
  if (budgetLineItem.matrixRowId && budgetLineItem.matrixRowId !== input.sessionId) {
    throw new SessionRequirementError("Budget line item is linked to a different session", 409);
  }

  const existingLink = await prisma.sessionRequirementSelection.findFirst({
    where: {
      budgetLineItemId: input.budgetLineItemId,
      OR: [
        { sessionId: { not: input.sessionId } },
        { itemId: { not: input.itemId } },
      ],
    },
    select: {
      sessionId: true,
      itemId: true,
    },
  });

  if (existingLink) {
    throw new SessionRequirementError("Budget line item is already linked to another requirement", 409);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const canonicalLink = await tx.budgetLineItem.updateMany({
        where: {
          id: input.budgetLineItemId!,
          OR: [
            { matrixRowId: null },
            { matrixRowId: input.sessionId },
          ],
        },
        data: { matrixRowId: input.sessionId },
      });
      if (canonicalLink.count !== 1) {
        throw new SessionRequirementError("Budget line item is linked to a different session", 409);
      }

      return tx.sessionRequirementSelection.upsert({
        where: {
          sessionId_itemId: {
            sessionId: input.sessionId,
            itemId: input.itemId,
          },
        },
        create: {
          sessionId: input.sessionId,
          itemId: input.itemId,
          budgetLineItemId: input.budgetLineItemId,
          quantity: null,
        },
        update: {
          budgetLineItemId: input.budgetLineItemId,
        },
        select: selectionSelect,
      });
    });

    return {
      sessionId: updated.sessionId,
      itemId: updated.itemId,
      linkedBudgetLineItem: toLinkedBudgetLineItemRecord(updated.budgetLineItem),
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SessionRequirementError("Budget line item is already linked to another requirement", 409);
    }
    throw error;
  }
}

export async function removeSessionRequirementSelection(input: {
  eventId: string;
  sessionId: string;
  itemId: string;
}): Promise<void> {
  const prisma = getPrisma();
  const result = await prisma.sessionRequirementSelection.deleteMany({
    where: {
      sessionId: input.sessionId,
      itemId: input.itemId,
      session: {
        eventId: input.eventId,
      },
    },
  });

  if (result.count === 0) {
    throw new SessionRequirementError("Session requirement selection not found", 404);
  }
}
