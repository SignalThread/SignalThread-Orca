import { Prisma, SupplyFulfillmentState } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateSuggestedQuantity,
  deriveSupplyReadiness,
  inferSupplyContexts,
  supplyWarningCodes,
} from "@/lib/supplies-domain";
import {
  eventOwnerEligibilityWhere,
  listEventAssignableUsers,
} from "@/src/server/services/event-assignable-users";
import {
  localDateTimeToInstant,
  resolveEventTimezone,
} from "@/lib/event-time-boundaries";

export class SuppliesError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const allocationInclude = {
  SupplyItem: true,
  User: { select: { id: true, name: true, email: true } },
  BudgetLineItem: {
    select: { id: true, lineItem: true, category: true, forecastCents: true },
  },
  SupplyDependency: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.SessionSupplyAllocationInclude;

type AllocationRecord = Prisma.SessionSupplyAllocationGetPayload<{
  include: typeof allocationInclude;
}>;

function normalizeAllocation<T extends AllocationRecord>(allocation: T) {
  const {
    SupplyItem,
    User,
    BudgetLineItem,
    SupplyDependency,
    ...record
  } = allocation;
  return {
    ...record,
    supplyItem: SupplyItem,
    responsibleUser: User,
    budgetLineItem: BudgetLineItem,
    dependencies: SupplyDependency,
  };
}
const EXTERNAL_OWNERSHIP_NAMES = new Set([
  "queue sign",
  "queue signs",
  "check-in tablet",
  "check-in tablets",
  "badge printer",
  "badge printers",
  "scanner kit",
  "scanner kits",
  "power",
  "internet",
  "power and internet",
]);

export function isExternallyOwnedSupplyName(value: unknown) {
  return EXTERNAL_OWNERSHIP_NAMES.has(
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[–—]/g, "-"),
  );
}

function assertSupplyOwnership(name: unknown) {
  if (isExternallyOwnedSupplyName(name))
    throw new SuppliesError(
      "This need is owned by Signage, AV, Lead Retrieval, or the venue. Review its linked operational confirmation instead.",
      409,
    );
}

function cleanText(value: unknown, max = 5000) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function nonnegativeInt(value: unknown, nullable = true) {
  if ((value == null || value === "") && nullable) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0)
    throw new SuppliesError("Quantity must be a non-negative whole number");
  return number;
}

const BADGE_PRINTING_METHODS = new Set([
  "PRE_PRINTED",
  "ON_DEMAND",
  "HYBRID",
  "NONE",
]);
function optionalBoolean(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "boolean")
    throw new SuppliesError("Profile choices must be yes or no");
  return value;
}

function sessionStart(session: {
  dayDate: Date;
  startTime: Date | null;
  event?: { timezone: string | null };
}) {
  if (!session.startTime) return null;
  const timezone = resolveEventTimezone(
    session.event?.timezone,
  ).resolvedTimezone;
  return localDateTimeToInstant(
    {
      year: session.dayDate.getUTCFullYear(),
      month: session.dayDate.getUTCMonth() + 1,
      day: session.dayDate.getUTCDate(),
      hour: session.startTime.getUTCHours(),
      minute: session.startTime.getUTCMinutes(),
      second: session.startTime.getUTCSeconds(),
    },
    timezone,
  );
}

async function requireSession(
  eventId: string,
  sessionId: string,
  tx: ReturnType<typeof getPrisma> | Prisma.TransactionClient = getPrisma(),
) {
  const session = await tx.matrixRow.findFirst({
    where: { id: sessionId, eventId, archivedAt: null },
    include: { room: true, event: { select: { timezone: true } } },
  });
  if (!session) throw new SuppliesError("Session not found", 404);
  return session;
}

export async function getSessionSupplies(eventId: string, sessionId: string) {
  const prisma = getPrisma();
  const session = await requireSession(eventId, sessionId);
  const [
    state,
    allocationRecords,
    templates,
    catalog,
    linkedRequirementSelections,
    avRequirements,
    assignableUsers,
    showFlowCues,
    budgetCandidates,
  ] = await Promise.all([
    prisma.sessionSupplyState.findUnique({ where: { sessionId } }),
    prisma.sessionSupplyAllocation.findMany({
      where: { eventId, sessionId, state: "ACTIVE" },
      include: allocationInclude,
      orderBy: { createdAt: "asc" },
    }),
    prisma.supplyTemplate.findMany({
      where: { active: true, OR: [{ eventId }, { isSystem: true }] },
      include: {
        SupplyTemplateItem: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ isSystem: "asc" }, { createdAt: "asc" }],
    }),
    prisma.supplyItem.findMany({
      where: { eventId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.sessionRequirementSelection.findMany({
      where: {
        sessionId,
        item: { section: { key: { in: ["signage", "av-requirements"] } } },
      },
      include: { item: { include: { section: true } } },
    }),
    prisma.sessionAVRequirement.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    }),
    listEventAssignableUsers(eventId),
    prisma.sessionShowFlowItem.findMany({
      where: { eventId, sessionId },
      select: { id: true, label: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.budgetLineItem.findMany({
      where: {
        budget: { eventId },
        category: { contains: "suppl", mode: "insensitive" },
      },
      select: { id: true, lineItem: true, category: true, forecastCents: true },
      orderBy: [{ lineItem: "asc" }],
      take: 50,
    }),
  ]);
  const allocations = allocationRecords.map(normalizeAllocation);
  const contexts = inferSupplyContexts(session);
  const isRegistration = contexts.includes("REGISTRATION");
  const eventTriggers = new Set(
    templates
      .filter((template) => template.eventId === eventId)
      .map((template) => template.triggerType),
  );
  const selectedNames = new Set(
    allocations.map((item) =>
      (item.supplyItem?.name ?? item.oneOffName ?? "").toLowerCase(),
    ),
  );
  const tables = session.attendance
    ? Math.max(1, Math.ceil(session.attendance / 8))
    : null;
  const inferredStations = session.attendance
    ? Math.max(1, Math.ceil(session.attendance / 50))
    : null;
  const stations = state?.registrationStationCount ?? inferredStations;
  const registrationProfile = isRegistration
    ? {
        stationCount: stations,
        vipDesk: state?.registrationVipDesk ?? false,
        badgePrintingMethod:
          state?.registrationBadgePrintingMethod ?? "PRE_PRINTED",
        accessibilityDesk: state?.registrationAccessibilityDesk ?? false,
        inferredStationCount: state?.registrationStationCount == null,
      }
    : null;
  const eligibleSuggestions = templates
    .filter(
      (template) =>
        contexts.includes(template.triggerType) &&
        (!isRegistration || template.triggerType === "REGISTRATION") &&
        (template.eventId === eventId ||
          !eventTriggers.has(template.triggerType)),
    )
    .flatMap((template) =>
      template.SupplyTemplateItem.map((item) => ({
        templateItemId: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        rationale: item.rationale,
        quantityRule: item.quantityRule,
        source: item.defaultSource,
        owner: item.defaultOwner,
        quantity: calculateSuggestedQuantity({
          attendance: session.attendance,
          tables,
          stations,
          quantityRule: item.quantityRule,
          quantityFactor:
            item.quantityFactor == null ? null : Number(item.quantityFactor),
          fixedQuantity: item.fixedQuantity,
        }),
        alreadyApplied: selectedNames.has(item.name.toLowerCase()),
        eventDefault: template.eventId === eventId,
      })),
    )
    .filter((item) => !isExternallyOwnedSupplyName(item.name))
    .filter(
      (item) =>
        !isRegistration ||
        ((item.name !== "VIP badge sleeves" || registrationProfile?.vipDesk) &&
          (item.name !== "Accessibility check-in kit" ||
            registrationProfile?.accessibilityDesk)),
    );
  const suggestions = isRegistration
    ? eligibleSuggestions.filter((item) => !item.alreadyApplied).slice(0, 7)
    : eligibleSuggestions;
  const readiness = deriveSupplyReadiness({
    notNeeded: Boolean(state?.notNeededAt),
    sessionStart: sessionStart(session),
    allocations: allocations.map((item) => ({
      quantity: item.quantity,
      source: item.source,
      responsibleUserId: item.responsibleUserId,
      setupDeadline: item.setupDeadline,
      fulfillment: item.fulfillment,
      blocking: item.dependencies.some(
        (dependency) => dependency.blocking && !dependency.resolvedAt,
      ),
    })),
  });
  const recommendationByName = new Map(
    eligibleSuggestions.map((suggestion) => [
      suggestion.name.toLowerCase(),
      suggestion.quantity,
    ]),
  );
  const allocationsWithRecommendations = allocations.map((allocation) => ({
    ...allocation,
    currentRecommendation:
      recommendationByName.get(
        (
          allocation.supplyItem?.name ??
          allocation.oneOffName ??
          ""
        ).toLowerCase(),
      ) ?? null,
  }));
  const sessionHref = `/events/${encodeURIComponent(eventId)}/matrix/sessions/${encodeURIComponent(sessionId)}`;
  const signage = linkedRequirementSelections.find(
    (selection) =>
      selection.item.key === "registration-signage" ||
      /queue|registration/i.test(selection.item.label),
  );
  const relatedConfirmations = isRegistration
    ? [
        {
          key: "queue-signs",
          label: "Queue signs",
          quantity: signage?.quantity ?? null,
          status: signage
            ? `${signage.quantity ?? 1} planned`
            : "No Signage requirement recorded",
          owner: "Signage",
          href: `${sessionHref}?tab=signage`,
          action: signage ? "Review in Signage" : "Open Signage",
        },
        ...[
          ["check-in-tablets", "Check-in tablets", "Check-in tablets"],
          ["badge-printers", "Badge printers", "Badge printers"],
          ["scanner-kits", "Scanner kits", "Scanner kits"],
          ["power-internet", "Power and internet", "Power and internet"],
        ].map(([key, label, avType]) => {
          const selection = linkedRequirementSelections.find(
            (item) =>
              item.item.section.key === "av-requirements" &&
              (item.item.key === key ||
                item.item.label.toLowerCase() === avType.toLowerCase()),
          );
          const legacyRequirement = avRequirements.find(
            (item) => item.avType.toLowerCase() === avType.toLowerCase(),
          );
          const quantity =
            selection?.quantity ?? legacyRequirement?.quantity ?? null;
          return {
            key,
            label,
            quantity,
            status:
              selection || legacyRequirement
                ? `${quantity ?? 1} planned`
                : "No AV requirement recorded",
            owner: "AV / venue",
            href: `${sessionHref}?tab=av`,
            action: selection || legacyRequirement ? "Review in AV" : "Open AV",
          };
        }),
      ]
    : [];
  return {
    session: {
      id: session.id,
      name: session.sessionName ?? "Untitled session",
      attendance: session.attendance,
      setupType: session.setupType,
      room: session.room?.name ?? session.roomName,
      startsAt: sessionStart(session)?.toISOString() ?? null,
      isRegistration,
    },
    state: {
      notNeeded: Boolean(state?.notNeededAt),
      sessionNotes: state?.sessionNotes ?? "",
      registrationProfile,
      revision: state?.revision ?? 0,
    },
    readiness,
    suggestions,
    allocations: allocationsWithRecommendations,
    catalog: catalog.filter((item) => !isExternallyOwnedSupplyName(item.name)),
    assignableUsers,
    showFlowCues,
    budgetCandidates,
    relatedConfirmations,
  };
}

export async function applySupplySuggestions(args: {
  eventId: string;
  sessionId: string;
  actorUserId: string;
  items: Array<{
    templateItemId: string;
    quantity?: unknown;
    notes?: unknown;
    responsibleUserId?: unknown;
  }>;
  responsibleUserId?: unknown;
  idempotencyKey?: string;
}) {
  if (!Array.isArray(args.items) || args.items.length === 0)
    throw new SuppliesError("Select at least one suggestion");
  return getPrisma().$transaction(async (tx) => {
    await requireSession(args.eventId, args.sessionId, tx);
    const defaultResponsibleUserId = cleanText(args.responsibleUserId, 100);
    const responsibleIds = [
      ...new Set(
        [
          defaultResponsibleUserId,
          ...args.items.map((item) => cleanText(item.responsibleUserId, 100)),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    if (
      responsibleIds.length &&
      (await tx.user.count({
        where: {
          id: { in: responsibleIds },
          ...eventOwnerEligibilityWhere(args.eventId),
        },
      })) !== responsibleIds.length
    )
      throw new SuppliesError(
        "Responsible person must be a member of this event",
        409,
      );
    const ids = [...new Set(args.items.map((item) => item.templateItemId))];
    const templateItems = await tx.supplyTemplateItem.findMany({
      where: {
        id: { in: ids },
        active: true,
        SupplyTemplate: {
          active: true,
          OR: [{ eventId: args.eventId }, { isSystem: true }],
        },
      },
      include: { SupplyTemplate: true },
    });
    if (templateItems.length !== ids.length)
      throw new SuppliesError("One or more suggestions are unavailable", 409);
    const created = [];
    for (const templateItem of templateItems) {
      assertSupplyOwnership(templateItem.name);
      const requested = args.items.find(
        (item) => item.templateItemId === templateItem.id,
      );
      const quantity = nonnegativeInt(requested?.quantity);
      const notes = cleanText(requested?.notes, 5000);
      const responsibleUserId =
        cleanText(requested?.responsibleUserId, 100) ??
        defaultResponsibleUserId;
      const supplyItem = await tx.supplyItem.upsert({
        where: {
          eventId_name: { eventId: args.eventId, name: templateItem.name },
        },
        update: {},
        create: {
          eventId: args.eventId,
          name: templateItem.name,
          category: templateItem.category,
          unit: templateItem.unit,
          defaultSource: templateItem.defaultSource,
          defaultOwner: templateItem.defaultOwner,
        },
      });
      const existing = await tx.sessionSupplyAllocation.findFirst({
        where: {
          sessionId: args.sessionId,
          supplyItemId: supplyItem.id,
          state: "ACTIVE",
        },
        include: allocationInclude,
      });
      if (existing) {
        created.push(normalizeAllocation(existing));
        continue;
      }
      const allocation = await tx.sessionSupplyAllocation.create({
        data: {
          eventId: args.eventId,
          sessionId: args.sessionId,
          supplyItemId: supplyItem.id,
          category: templateItem.category,
          unit: templateItem.unit,
          quantity,
          suggestedQuantity: quantity,
          quantityRule: templateItem.quantityRule,
          source: templateItem.defaultSource ?? supplyItem.defaultSource,
          owner: templateItem.defaultOwner ?? supplyItem.defaultOwner,
          responsibleUserId,
          notes,
          idempotencyKey: args.idempotencyKey
            ? `${args.idempotencyKey}:${templateItem.id}`
            : `suggestion:${templateItem.id}`,
        },
        include: allocationInclude,
      });
      await tx.supplyAllocationAudit.create({
        data: {
          eventId: args.eventId,
          allocationId: allocation.id,
          actorUserId: args.actorUserId,
          action: "CREATED_FROM_SUGGESTION",
          changes: { templateItemId: templateItem.id, quantity, notes },
        },
      });
      created.push(normalizeAllocation(allocation));
    }
    await tx.sessionSupplyState.upsert({
      where: { sessionId: args.sessionId },
      update: {
        notNeededAt: null,
        notNeededByUserId: null,
        revision: { increment: 1 },
      },
      create: { eventId: args.eventId, sessionId: args.sessionId },
    });
    return created;
  });
}

export async function updateSessionSupplyState(args: {
  eventId: string;
  sessionId: string;
  actorUserId: string;
  revision: unknown;
  sessionNotes?: unknown;
  registrationProfile?: Record<string, unknown>;
}) {
  const revision = nonnegativeInt(args.revision, false)!;
  const data: {
    sessionNotes?: string | null;
    registrationStationCount?: number | null;
    registrationVipDesk?: boolean | null;
    registrationBadgePrintingMethod?: string | null;
    registrationAccessibilityDesk?: boolean | null;
  } = {};
  if ("sessionNotes" in args)
    data.sessionNotes = cleanText(args.sessionNotes, 5000);
  if (args.registrationProfile) {
    const stationCount = nonnegativeInt(
      args.registrationProfile.stationCount,
      true,
    );
    if (stationCount != null && (stationCount < 1 || stationCount > 100))
      throw new SuppliesError("Check-in stations must be between 1 and 100");
    const badgePrintingMethod = cleanText(
      args.registrationProfile.badgePrintingMethod,
      30,
    );
    if (badgePrintingMethod && !BADGE_PRINTING_METHODS.has(badgePrintingMethod))
      throw new SuppliesError("Badge printing method is invalid");
    data.registrationStationCount = stationCount;
    data.registrationVipDesk = optionalBoolean(
      args.registrationProfile.vipDesk,
    );
    data.registrationBadgePrintingMethod = badgePrintingMethod;
    data.registrationAccessibilityDesk = optionalBoolean(
      args.registrationProfile.accessibilityDesk,
    );
  }
  return getPrisma().$transaction(async (tx) => {
    await requireSession(args.eventId, args.sessionId, tx);
    const current = await tx.sessionSupplyState.findUnique({
      where: { sessionId: args.sessionId },
    });
    if (!current) {
      if (revision !== 0)
        throw new SuppliesError(
          "Session supplies changed elsewhere. Refresh and try again.",
          409,
        );
      return tx.sessionSupplyState.create({
        data: { eventId: args.eventId, sessionId: args.sessionId, ...data },
      });
    }
    if (current.eventId !== args.eventId)
      throw new SuppliesError("Session supplies not found", 404);
    const result = await tx.sessionSupplyState.updateMany({
      where: { sessionId: args.sessionId, eventId: args.eventId, revision },
      data: { ...data, revision: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new SuppliesError(
        "Session supplies changed elsewhere. Refresh and try again.",
        409,
      );
    return tx.sessionSupplyState.findUniqueOrThrow({
      where: { sessionId: args.sessionId },
    });
  });
}

export async function createCustomSupply(args: {
  eventId: string;
  sessionId: string;
  actorUserId: string;
  supplyItemId?: unknown;
  name: unknown;
  category?: unknown;
  unit?: unknown;
  quantity?: unknown;
  source?: unknown;
  responsibleUserId?: unknown;
  setupDeadline?: unknown;
  placement?: unknown;
  fulfillment?: unknown;
  notes?: unknown;
  showFlowCueId?: unknown;
  budgetLineItemId?: unknown;
  idempotencyKey?: unknown;
  confirmDuplicate?: unknown;
}) {
  const requestedName = cleanText(args.name, 200);
  const quantity = nonnegativeInt(args.quantity);
  return getPrisma().$transaction(async (tx) => {
    await requireSession(args.eventId, args.sessionId, tx);
    const supplyItemId = cleanText(args.supplyItemId, 100);
    const catalogItem = supplyItemId
      ? await tx.supplyItem.findFirst({
          where: { id: supplyItemId, eventId: args.eventId },
        })
      : null;
    if (supplyItemId && !catalogItem)
      throw new SuppliesError("Catalog item not found", 404);
    const name = catalogItem?.name ?? requestedName;
    if (!name) throw new SuppliesError("Item name is required");
    assertSupplyOwnership(name);
    const responsibleUserId = cleanText(args.responsibleUserId, 100);
    if (
      responsibleUserId &&
      !(await tx.user.findFirst({
        where: eventOwnerEligibilityWhere(args.eventId, responsibleUserId),
        select: { id: true },
      }))
    )
      throw new SuppliesError(
        "Responsible person must be a member of this event",
        409,
      );
    const setupDeadlineText = cleanText(args.setupDeadline);
    const setupDeadline = setupDeadlineText
      ? new Date(setupDeadlineText)
      : null;
    if (setupDeadlineText && Number.isNaN(setupDeadline!.getTime()))
      throw new SuppliesError("Need-by time is invalid");
    const fulfillment = cleanText(args.fulfillment, 30) ?? "PLANNED";
    if (
      !new Set(Object.values(SupplyFulfillmentState)).has(
        fulfillment as SupplyFulfillmentState,
      )
    )
      throw new SuppliesError("Fulfillment state is invalid");
    const showFlowCueId = cleanText(args.showFlowCueId, 100);
    if (
      showFlowCueId &&
      !(await tx.sessionShowFlowItem.findFirst({
        where: {
          id: showFlowCueId,
          eventId: args.eventId,
          sessionId: args.sessionId,
        },
        select: { id: true },
      }))
    )
      throw new SuppliesError("Show Flow cue must belong to this session", 409);
    const budgetLineItemId = cleanText(args.budgetLineItemId, 100);
    if (
      budgetLineItemId &&
      !(await tx.budgetLineItem.findFirst({
        where: {
          id: budgetLineItemId,
          budget: { eventId: args.eventId },
          category: { contains: "suppl", mode: "insensitive" },
        },
        select: { id: true },
      }))
    )
      throw new SuppliesError(
        "Financial reference must be a Supplies Budget item for this event",
        409,
      );
    const sameName = await tx.sessionSupplyAllocation.findFirst({
      where: {
        eventId: args.eventId,
        sessionId: args.sessionId,
        state: "ACTIVE",
        OR: [
          { oneOffName: { equals: name, mode: "insensitive" } },
          { SupplyItem: { name: { equals: name, mode: "insensitive" } } },
        ],
      },
    });
    if (sameName && args.confirmDuplicate !== true)
      throw new SuppliesError(
        "This item is already active. Confirm that you intentionally need a duplicate.",
        409,
      );
    const key =
      cleanText(args.idempotencyKey, 200) ?? `custom:${name.toLowerCase()}`;
    const existing = await tx.sessionSupplyAllocation.findUnique({
      where: {
        eventId_sessionId_idempotencyKey: {
          eventId: args.eventId,
          sessionId: args.sessionId,
          idempotencyKey: key,
        },
      },
      include: allocationInclude,
    });
    if (existing) return normalizeAllocation(existing);
    const allocation = await tx.sessionSupplyAllocation.create({
      data: {
        eventId: args.eventId,
        sessionId: args.sessionId,
        supplyItemId: catalogItem?.id ?? null,
        oneOffName: catalogItem ? null : name,
        category:
          catalogItem?.category ?? cleanText(args.category, 100) ?? "Other",
        unit: catalogItem?.unit ?? cleanText(args.unit, 50) ?? "each",
        quantity,
        quantityRule: "MANUAL",
        quantityOverridden: true,
        source: cleanText(args.source, 200) ?? catalogItem?.defaultSource,
        responsibleUserId,
        setupDeadline,
        placement: cleanText(args.placement, 500),
        fulfillment: fulfillment as SupplyFulfillmentState,
        notes: cleanText(args.notes, 5000),
        showFlowCueId,
        budgetLineItemId,
        idempotencyKey: key,
      },
      include: allocationInclude,
    });
    await tx.supplyAllocationAudit.create({
      data: {
        eventId: args.eventId,
        allocationId: allocation.id,
        actorUserId: args.actorUserId,
        action: "CREATED_CUSTOM",
        changes: { name, quantity },
      },
    });
    await tx.sessionSupplyState.upsert({
      where: { sessionId: args.sessionId },
      update: {
        notNeededAt: null,
        notNeededByUserId: null,
        revision: { increment: 1 },
      },
      create: { eventId: args.eventId, sessionId: args.sessionId },
    });
    return normalizeAllocation(allocation);
  });
}

export async function addCatalogSupply(args: {
  eventId: string;
  sessionId: string;
  actorUserId: string;
  supplyItemId: unknown;
  quantity?: unknown;
}) {
  const supplyItemId = String(args.supplyItemId ?? "");
  const quantity = nonnegativeInt(args.quantity) ?? 1;
  return getPrisma().$transaction(async (tx) => {
    await requireSession(args.eventId, args.sessionId, tx);
    const item = await tx.supplyItem.findFirst({
      where: { id: supplyItemId, eventId: args.eventId },
    });
    if (!item) throw new SuppliesError("Catalog item not found", 404);
    assertSupplyOwnership(item.name);
    const existing = await tx.sessionSupplyAllocation.findFirst({
      where: {
        sessionId: args.sessionId,
        supplyItemId: item.id,
        state: "ACTIVE",
      },
      include: allocationInclude,
    });
    if (existing)
      throw new SuppliesError(
        "This catalog item is already active for the session",
        409,
      );
    const allocation = await tx.sessionSupplyAllocation.create({
      data: {
        eventId: args.eventId,
        sessionId: args.sessionId,
        supplyItemId: item.id,
        category: item.category,
        unit: item.unit,
        quantity,
        quantityRule: "MANUAL",
        quantityOverridden: true,
        source: item.defaultSource,
        owner: item.defaultOwner,
        idempotencyKey: `catalog:${item.id}`,
      },
      include: allocationInclude,
    });
    await tx.supplyAllocationAudit.create({
      data: {
        eventId: args.eventId,
        allocationId: allocation.id,
        actorUserId: args.actorUserId,
        action: "ADDED_FROM_CATALOG",
        changes: { supplyItemId: item.id, quantity },
      },
    });
    return normalizeAllocation(allocation);
  });
}

export async function updateSupplyAllocation(args: {
  eventId: string;
  sessionId: string;
  allocationId: string;
  actorUserId: string;
  revision: unknown;
  patch: Record<string, unknown>;
}) {
  const revision = nonnegativeInt(args.revision, false)!;
  const allowedFulfillment = new Set(Object.values(SupplyFulfillmentState));
  const patch = args.patch;
  const data: Prisma.SessionSupplyAllocationUncheckedUpdateManyInput = {
    revision: { increment: 1 },
  };
  if ("quantity" in patch) {
    data.quantity = nonnegativeInt(patch.quantity);
    data.quantityOverridden = true;
  }
  if ("unit" in patch) {
    const unit = cleanText(patch.unit, 50);
    if (!unit) throw new SuppliesError("Unit is required");
    data.unit = unit;
  }
  for (const key of ["source", "owner", "placement", "notes"] as const)
    if (key in patch)
      data[key] = cleanText(patch[key], key === "notes" ? 5000 : 500);
  if ("setupDeadline" in patch) {
    const value = cleanText(patch.setupDeadline);
    data.setupDeadline = value ? new Date(value) : null;
    if (value && Number.isNaN(new Date(value).getTime()))
      throw new SuppliesError("Setup deadline is invalid");
  }
  if ("fulfillment" in patch) {
    if (!allowedFulfillment.has(patch.fulfillment as SupplyFulfillmentState))
      throw new SuppliesError("Fulfillment state is invalid");
    data.fulfillment = patch.fulfillment as SupplyFulfillmentState;
    data.confirmedAt =
      patch.fulfillment === "CONFIRMED" ? new Date() : undefined;
  }
  return getPrisma().$transaction(async (tx) => {
    if ("name" in patch) {
      const name = cleanText(patch.name, 200);
      if (!name) throw new SuppliesError("Supply name is required");
      assertSupplyOwnership(name);
      const currentForName = await tx.sessionSupplyAllocation.findFirst({
        where: {
          id: args.allocationId,
          eventId: args.eventId,
          sessionId: args.sessionId,
          state: "ACTIVE",
        },
        select: { supplyItemId: true, category: true, unit: true },
      });
      if (!currentForName)
        throw new SuppliesError("Supply requirement not found", 404);
      if (currentForName.supplyItemId) {
        const replacement = await tx.supplyItem.upsert({
          where: { eventId_name: { eventId: args.eventId, name } },
          update: {},
          create: {
            eventId: args.eventId,
            name,
            category: currentForName.category,
            unit: currentForName.unit,
          },
        });
        data.supplyItemId = replacement.id;
        data.oneOffName = null;
      } else data.oneOffName = name;
    }
    if ("responsibleUserId" in patch) {
      const responsibleUserId = cleanText(patch.responsibleUserId, 100);
      if (
        responsibleUserId &&
        !(await tx.user.findFirst({
          where: eventOwnerEligibilityWhere(args.eventId, responsibleUserId),
          select: { id: true },
        }))
      )
        throw new SuppliesError(
          "Responsible person must be a member of this event",
          409,
        );
      data.responsibleUserId = responsibleUserId;
    }
    if ("showFlowCueId" in patch) {
      const showFlowCueId = cleanText(patch.showFlowCueId, 100);
      if (
        showFlowCueId &&
        !(await tx.sessionShowFlowItem.findFirst({
          where: {
            id: showFlowCueId,
            eventId: args.eventId,
            sessionId: args.sessionId,
          },
          select: { id: true },
        }))
      )
        throw new SuppliesError(
          "Show Flow cue must belong to this session",
          409,
        );
      data.showFlowCueId = showFlowCueId;
    }
    if ("budgetLineItemId" in patch) {
      const budgetLineItemId = cleanText(patch.budgetLineItemId, 100);
      if (
        budgetLineItemId &&
        !(await tx.budgetLineItem.findFirst({
          where: {
            id: budgetLineItemId,
            budget: { eventId: args.eventId },
            category: { contains: "suppl", mode: "insensitive" },
          },
          select: { id: true },
        }))
      )
        throw new SuppliesError(
          "Financial reference must be a Supplies Budget item for this event",
          409,
        );
      data.budgetLineItemId = budgetLineItemId;
    }
    const current = await tx.sessionSupplyAllocation.findFirst({
      where: {
        id: args.allocationId,
        eventId: args.eventId,
        sessionId: args.sessionId,
        state: "ACTIVE",
      },
    });
    if (!current) throw new SuppliesError("Supply requirement not found", 404);
    const result = await tx.sessionSupplyAllocation.updateMany({
      where: { id: args.allocationId, revision },
      data,
    });
    if (result.count !== 1)
      throw new SuppliesError(
        "This requirement changed elsewhere. Refresh and try again.",
        409,
      );
    await tx.supplyAllocationAudit.create({
      data: {
        eventId: args.eventId,
        allocationId: args.allocationId,
        actorUserId: args.actorUserId,
        action: "UPDATED",
        changes: patch as Prisma.InputJsonValue,
      },
    });
    const updated = await tx.sessionSupplyAllocation.findUniqueOrThrow({
      where: { id: args.allocationId },
      include: allocationInclude,
    });
    return normalizeAllocation(updated);
  });
}

export async function setSessionSuppliesNotNeeded(args: {
  eventId: string;
  sessionId: string;
  actorUserId: string;
  notNeeded: boolean;
}) {
  await requireSession(args.eventId, args.sessionId);
  if (args.notNeeded) {
    const count = await getPrisma().sessionSupplyAllocation.count({
      where: {
        eventId: args.eventId,
        sessionId: args.sessionId,
        state: "ACTIVE",
      },
    });
    if (count)
      throw new SuppliesError(
        "Remove active requirements before marking supplies not needed",
        409,
      );
  }
  return getPrisma().sessionSupplyState.upsert({
    where: { sessionId: args.sessionId },
    update: {
      notNeededAt: args.notNeeded ? new Date() : null,
      notNeededByUserId: args.notNeeded ? args.actorUserId : null,
      revision: { increment: 1 },
    },
    create: {
      eventId: args.eventId,
      sessionId: args.sessionId,
      notNeededAt: args.notNeeded ? new Date() : null,
      notNeededByUserId: args.notNeeded ? args.actorUserId : null,
    },
  });
}

export async function removeSupplyAllocation(args: {
  eventId: string;
  sessionId: string;
  allocationId: string;
  actorUserId: string;
}) {
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.sessionSupplyAllocation.findFirst({
      where: {
        id: args.allocationId,
        eventId: args.eventId,
        sessionId: args.sessionId,
        state: "ACTIVE",
      },
    });
    if (!current) throw new SuppliesError("Supply requirement not found", 404);
    await tx.sessionSupplyAllocation.update({
      where: { id: current.id },
      data: { state: "CANCELLED", revision: { increment: 1 } },
    });
    await tx.supplyAllocationAudit.create({
      data: {
        eventId: args.eventId,
        allocationId: current.id,
        actorUserId: args.actorUserId,
        action: "CANCELLED",
        changes: {},
      },
    });
    return { ok: true };
  });
}

export async function addSupplyDependency(args: {
  eventId: string;
  sessionId: string;
  allocationId: string;
  actorUserId: string;
  type: unknown;
  label: unknown;
  blocking?: unknown;
}) {
  const label = cleanText(args.label, 500);
  if (!label) throw new SuppliesError("Dependency label is required");
  const types = new Set([
    "SHOW_FLOW",
    "STAFFING",
    "FNB",
    "AV",
    "SIGNAGE",
    "VENDOR",
    "OTHER",
  ]);
  if (!types.has(String(args.type)))
    throw new SuppliesError("Dependency type is invalid");
  const allocation = await getPrisma().sessionSupplyAllocation.findFirst({
    where: {
      id: args.allocationId,
      eventId: args.eventId,
      sessionId: args.sessionId,
      state: "ACTIVE",
    },
  });
  if (!allocation) throw new SuppliesError("Supply requirement not found", 404);
  return getPrisma().supplyDependency.create({
    data: {
      allocationId: allocation.id,
      type: String(args.type) as never,
      label,
      blocking: Boolean(args.blocking),
    },
  });
}

export async function resolveSupplyDependency(args: {
  eventId: string;
  sessionId: string;
  allocationId: string;
  dependencyId: string;
  notes?: unknown;
}) {
  const dependency = await getPrisma().supplyDependency.findFirst({
    where: {
      id: args.dependencyId,
      allocationId: args.allocationId,
      SessionSupplyAllocation: {
        eventId: args.eventId,
        sessionId: args.sessionId,
      },
    },
  });
  if (!dependency) throw new SuppliesError("Dependency not found", 404);
  return getPrisma().supplyDependency.update({
    where: { id: dependency.id },
    data: {
      resolvedAt: new Date(),
      resolutionNotes: cleanText(args.notes, 1000),
    },
  });
}

export async function getEventSupplyRegister(eventId: string) {
  const prisma = getPrisma();
  const [event, allocationRecords, catalog, assignableUsers] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, timezone: true },
    }),
    prisma.sessionSupplyAllocation.findMany({
      where: { eventId, state: "ACTIVE" },
      include: {
        ...allocationInclude,
        MatrixRow: {
          include: {
            room: true,
            event: { select: { timezone: true } },
            sessionStaffAssignments: { take: 1 },
          },
        },
      },
      orderBy: [{ setupDeadline: "asc" }, { createdAt: "asc" }],
    }),
    prisma.supplyItem.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
    }),
    listEventAssignableUsers(eventId),
  ]);
  if (!event) throw new SuppliesError("Event not found", 404);
  const allocations = allocationRecords.map((allocation) => ({
    ...normalizeAllocation(allocation),
    session: allocation.MatrixRow,
  }));
  const rows = catalog.map((item) => {
    const contributions = allocations.filter(
      (allocation) => allocation.supplyItemId === item.id,
    );
    const allocated = contributions.reduce(
      (sum, allocation) => sum + (allocation.quantity ?? 0),
      0,
    );
    const blocked = contributions.some((allocation) =>
      allocation.dependencies.some(
        (dependency) => dependency.blocking && !dependency.resolvedAt,
      ),
    );
    const missingInfo = contributions.some(
      (allocation) =>
        allocation.quantity == null ||
        !allocation.responsibleUserId ||
        !allocation.source ||
        !allocation.setupDeadline,
    );
    const timingRisk = contributions.some((allocation) => {
      const starts = sessionStart(allocation.session);
      return Boolean(
        starts && allocation.setupDeadline && allocation.setupDeadline > starts,
      );
    });
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      committed: item.committedQuantity,
      allocated,
      remaining:
        item.committedQuantity == null
          ? null
          : item.committedQuantity - allocated,
      owners: [
        ...new Set(
          contributions
            .map(
              (entry) =>
                entry.responsibleUser?.name ?? entry.responsibleUser?.email,
            )
            .filter(Boolean),
        ),
      ],
      nextDeadline:
        contributions
          .map((entry) => entry.setupDeadline)
          .filter(Boolean)
          .sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null,
      states: [...new Set(contributions.map((entry) => entry.fulfillment))],
      warnings: supplyWarningCodes({
        committed: item.committedQuantity,
        allocated,
        missingInfo,
        blocked,
        timingRisk,
      }),
      contributions,
    };
  });
  const custom = allocations
    .filter((allocation) => !allocation.supplyItemId)
    .map((allocation) => ({
      id: allocation.id,
      name: allocation.oneOffName!,
      category: allocation.category,
      unit: allocation.unit,
      committed: null,
      allocated: allocation.quantity ?? 0,
      remaining: null,
      owners: allocation.responsibleUser
        ? [allocation.responsibleUser.name ?? allocation.responsibleUser.email]
        : [],
      nextDeadline: allocation.setupDeadline,
      states: [allocation.fulfillment],
      warnings: supplyWarningCodes({
        committed: null,
        allocated: allocation.quantity ?? 0,
        missingInfo:
          allocation.quantity == null ||
          !allocation.responsibleUserId ||
          !allocation.source ||
          !allocation.setupDeadline,
        blocked: allocation.dependencies.some(
          (dependency) => dependency.blocking && !dependency.resolvedAt,
        ),
        timingRisk: Boolean(
          sessionStart(allocation.session) &&
          allocation.setupDeadline &&
          allocation.setupDeadline > sessionStart(allocation.session)!,
        ),
      }),
      contributions: [allocation],
    }));
  const sessionStates = await prisma.sessionSupplyState.findMany({
    where: { eventId, sessionNotes: { not: null } },
    select: { sessionId: true, sessionNotes: true },
  });
  const requirements = allocations.map((allocation) => {
    const missingInfo =
      allocation.quantity == null ||
      !allocation.responsibleUserId ||
      !allocation.source ||
      !allocation.setupDeadline;
    const blocked = allocation.dependencies.some(
      (dependency) => dependency.blocking && !dependency.resolvedAt,
    );
    const timingRisk = Boolean(
      sessionStart(allocation.session) &&
      allocation.setupDeadline &&
      allocation.setupDeadline > sessionStart(allocation.session)!,
    );
    return {
      ...allocation,
      name:
        allocation.supplyItem?.name ??
        allocation.oneOffName ??
        "Untitled supply",
      readiness: blocked
        ? "blocked"
        : missingInfo
          ? "needs_info"
          : timingRisk || allocation.fulfillment === "PLANNED"
            ? "needs_work"
            : "ready",
    };
  });
  return {
    event,
    rows: [...rows.filter((row) => row.contributions.length), ...custom],
    requirements,
    assignableUsers,
    sessionNotes: Object.fromEntries(
      sessionStates.map((state) => [state.sessionId, state.sessionNotes]),
    ),
  };
}
