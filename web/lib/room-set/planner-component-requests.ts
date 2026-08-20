/**
 * Deterministic planner prompt → catalog component requests (no LLM geometry).
 * Server-safe: no React, tldraw, or canvas imports.
 */

import {
  getRoomSetComponent,
  type RoomSetComponentId,
} from "@/lib/room-set/component-library";
import type { LayoutSpec } from "./layout-spec";

export type RoomSetPlannerPlacementPreference =
  | "side"
  | "rear"
  | "perimeter"
  | "front"
  | "mixed";

export type RoomSetPlannerGenerationMode = "full" | "additive";

/** Where a component request originated after interpretation (debug / Last generation). */
export type RoomSetPlannerComponentRequestSource = "ai" | "localFallback" | "merged";

export type RoomSetComponentRequestInterpretationMeta = Readonly<{
  aiInterpretationSucceeded: boolean;
  usedLocalComponentFallback: boolean;
  usedLocalPlacementEnrichment: boolean;
}>;

/** Legacy interpreter token — mapped to catalog IDs during normalization. */
export type RoomSetPlannerLegacyComponentType =
  | "cocktailCluster"
  | "networkingPod"
  | "sponsorLounge";

export type RoomSetPlannerComponentRequest = Readonly<{
  catalogComponentId: RoomSetComponentId;
  count: number;
  placementPreference?: RoomSetPlannerPlacementPreference;
  source?: RoomSetPlannerComponentRequestSource;
}>;

export type RoomSetAddByEachAnchorRequest = RoomSetPlannerComponentRequest &
  Readonly<{
    anchorComponentId: RoomSetComponentId;
    quantityPerAnchor: number;
    anchorCount: number;
  }>;

export type RoomSetPlannerComponentRequestInferenceOptions = Readonly<{
  baseLayoutSpec?: LayoutSpec | null;
}>;

export type RoomSetPrimaryAudienceObjectCountIntent = Readonly<{
  componentId: RoomSetComponentId;
  count: number;
  label: string;
}>;

export const ROOM_SET_PROMPT_MAX_COMPONENT_COUNT_DEFAULT = 48;

const PERIMETER_PLACEMENT_PROMPT_RE =
  /\b(?:(?:spread|distributed?)\s+(?:them\s+)?(?:out\s+)?(?:around|along|on)|(?:around|along|on|against|by)\s+(?:the\s+)?(?:outside\s+)?(?:walls?|perimeter|edge(?:s)?(?:\s+of\s+(?:the\s+)?room)?)|(?:outside|outer)\s+walls?|room\s+edges?|periphery|perimeter\s+of\s+the\s+room)\b/i;
const SIDE_PLACEMENT_PROMPT_RE =
  /\b(?:side\s+wings?|(?:left|right)\s+(?:sides?|wings?)|lateral\s+(?:sides?|wings?)|along\s+the\s+sides?)\b/i;
const REAR_PLACEMENT_PROMPT_RE =
  /\b(?:towards?\s+the\s+back|at\s+the\s+back|in\s+the\s+back|back\s+of\s+(?:the\s+)?room|far\s+from\s+(?:the\s+)?stage|rear\s+of\s+(?:the\s+)?room|away\s+from\s+(?:the\s+)?stage|back\s+of\s+house)\b/i;
const FRONT_PLACEMENT_PROMPT_RE =
  /\b(?:near\s+(?:the\s+)?stage|front\s+of\s+(?:the\s+)?room|downstage|foh\s+(?:side|area)|front\s+edge)\b/i;

type PromptCatalogDescriptor = Readonly<{
  catalogComponentId: RoomSetComponentId;
  labelNoun: string;
  match: RegExp;
  countPatterns: readonly RegExp[];
  maxCount: number;
  defaultCount: (attendeeCount: number) => number;
}>;

export const PROMPT_ADDABLE_CATALOG_COMPONENT_IDS: readonly RoomSetComponentId[] = [
  "table-cocktail-cluster",
  "decor-plant-cluster",
  "fnb-portable-bar",
  "fnb-buffet-line",
  "fnb-coffee-station",
  "registration-desk",
  "registration-kiosk",
  "lounge-chair",
  "booth-10x10",
  "av-speaker-stack",
  "av-foh-control",
  "av-confidence-monitor",
];

const PROMPT_CATALOG_DESCRIPTORS: readonly PromptCatalogDescriptor[] = [
  {
    catalogComponentId: "decor-plant-cluster",
    labelNoun: "plant clusters",
    match: /\b(?:plant\s+clusters?|greenery\s+clusters?|potted\s+plants?|scenic\s+plants?|plantes?)\b/i,
    countPatterns: [
      /(\d+)\s+more\s+plants?\b/i,
      /(\d+)\s+plant\s+clusters?\b/i,
      /(\d+)\s+plants?\b/i,
    ],
    maxCount: 48,
    defaultCount: () => 6,
  },
  {
    catalogComponentId: "table-cocktail-cluster",
    labelNoun: "cocktail clusters",
    match:
      /\b(?:cocktail(\s+clusters?|tables?)?|mingle\s+clusters?|highboys?|standing\s+(?:tables?|reception)|cocktail\s+pods?)\b/i,
    countPatterns: [
      /(\d+)\s+(?:cocktail\s+)?clusters?\b/i,
      /(\d+)\s+cocktail\s+tables?\b/i,
      /(\d+)\s+cocktail\b/i,
    ],
    maxCount: 48,
    defaultCount: (guests) => clampInt(Math.round(guests / 50), 4, 12),
  },
  {
    catalogComponentId: "fnb-portable-bar",
    labelNoun: "bars",
    match: /\b(?:portable\s+)?bars?\b|\bbar\s+service\b/i,
    countPatterns: [/(\d+)\s+bars?\b/i],
    maxCount: 12,
    defaultCount: () => 2,
  },
  {
    catalogComponentId: "fnb-buffet-line",
    labelNoun: "buffet stations",
    match: /\b(?:buffet\s+(?:lines?|stations?)|food\s+stations?)\b/i,
    countPatterns: [/(\d+)\s+buffets?\b/i, /(\d+)\s+buffet\s+(?:lines?|stations?)\b/i],
    maxCount: 8,
    defaultCount: () => 1,
  },
  {
    catalogComponentId: "registration-desk",
    labelNoun: "registration desks",
    match: /\b(?:registration|check-?in)\s+(?:desks?|counter|area)\b|\bregistration\b/i,
    countPatterns: [/(\d+)\s+registration\s+desks?\b/i],
    maxCount: 6,
    defaultCount: () => 1,
  },
  {
    catalogComponentId: "lounge-chair",
    labelNoun: "lounge chairs",
    match: /\b(?:lounge\s+(?:chairs?|pods?|groupings?)|soft\s+seating\s+pods?|hospitality\s+pods?)\b/i,
    countPatterns: [
      /(\d+)\s+lounge\s+chairs?\b/i,
      /(\d+)\s+lounge\s+pods?\b/i,
    ],
    maxCount: 24,
    defaultCount: (guests) => clampInt(Math.round(guests / 80), 4, 12),
  },
  {
    catalogComponentId: "booth-10x10",
    labelNoun: "sponsor areas",
    match:
      /\b(?:sponsor(ship)?\s+(?:areas?|zones?|lounges?)|exhibit\s+booths?|10\s*[x×]\s*10\s+booths?|sponsor\s+lounge)\b/i,
    countPatterns: [/(\d+)\s+(?:sponsor\s+)?(?:areas?|booths?|lounges?)\b/i],
    maxCount: 6,
    defaultCount: (guests) => clampInt(Math.round(guests / 150), 1, 4),
  },
  {
    catalogComponentId: "av-speaker-stack",
    labelNoun: "speaker stacks",
    match: /\b(?:speaker\s+stacks?|pa\s+speakers?|audio\s+stacks?)\b/i,
    countPatterns: [/(\d+)\s+speaker\s+stacks?\b/i],
    maxCount: 8,
    defaultCount: () => 2,
  },
  {
    catalogComponentId: "av-foh-control",
    labelNoun: "FOH tech positions",
    match: /\b(?:foh\s+(?:control|position)|tech\s+table|show\s+call)\b/i,
    countPatterns: [/(\d+)\s+foh\b/i],
    maxCount: 4,
    defaultCount: () => 1,
  },
  {
    catalogComponentId: "fnb-coffee-station",
    labelNoun: "coffee stations",
    match: /\b(?:coffee\s+stations?|espresso\s+bars?|café\s+stations?)\b/i,
    countPatterns: [/(\d+)\s+coffee\s+stations?\b/i],
    maxCount: 6,
    defaultCount: () => 1,
  },
];

const LEGACY_COMPONENT_TYPE_TO_CATALOG: Record<RoomSetPlannerLegacyComponentType, RoomSetComponentId> = {
  cocktailCluster: "table-cocktail-cluster",
  networkingPod: "table-cocktail-cluster",
  sponsorLounge: "booth-10x10",
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isPromptAddableCatalogComponentId(value: string): value is RoomSetComponentId {
  return (PROMPT_ADDABLE_CATALOG_COMPONENT_IDS as readonly string[]).includes(value);
}

function placementPreferenceParser(raw: unknown): RoomSetPlannerPlacementPreference | undefined {
  return raw === "side" || raw === "rear" || raw === "perimeter" || raw === "front" || raw === "mixed"
    ? raw
    : undefined;
}

function componentRequestSourceParser(raw: unknown): RoomSetPlannerComponentRequestSource | undefined {
  return raw === "ai" || raw === "localFallback" || raw === "merged" ? raw : undefined;
}

function legacyComponentTypeParser(raw: unknown): RoomSetPlannerLegacyComponentType | null {
  return raw === "cocktailCluster" || raw === "networkingPod" || raw === "sponsorLounge" ? raw : null;
}

function explicitCountFromPatterns(prompt: string, patterns: readonly RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match?.[1]) continue;
    const n = Math.round(Number(match[1]));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function genericAddCountFromPrompt(prompt: string): number | null {
  const moreFirst = prompt.match(/\b(\d+)\s+more\b/i);
  if (moreFirst?.[1]) {
    const n = Math.round(Number(moreFirst[1]));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const addMatch = prompt.match(/\b(?:add|place|insert|put|give)\s+(\d+)(?:\s+more)?\b/i);
  if (!addMatch?.[1]) return null;
  const n = Math.round(Number(addMatch[1]));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanComponentPhrase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:the|a|an|existing|current)\s+/i, "")
    .trim();
}

function promptCatalogDescriptorForPhrase(
  raw: string,
): PromptCatalogDescriptor | null {
  const phrase = cleanComponentPhrase(raw);
  if (!phrase) return null;
  return PROMPT_CATALOG_DESCRIPTORS.find((descriptor) => descriptor.match.test(phrase)) ?? null;
}

function layoutSpecComponentCount(
  spec: LayoutSpec | null | undefined,
  componentId: RoomSetComponentId,
): number {
  if (!spec) return 0;
  let count = 0;
  if (spec.front.screen?.componentId === componentId) count += spec.front.screen.count;
  if (spec.front.stage?.componentId === componentId) count += spec.front.stage.count;
  for (const item of spec.front.av) {
    if (item.componentId === componentId) count += item.count;
  }
  if (spec.audience.primaryComponentId === componentId) {
    count += spec.audience.requiredPrimaryComponents;
  }
  for (const item of spec.secondary) {
    if (item.componentId === componentId) count += item.count;
  }
  return count;
}

export function inferAddByEachAnchorComponentRequestFromPrompt(
  prompt: string,
  options: RoomSetPlannerComponentRequestInferenceOptions = {},
): RoomSetAddByEachAnchorRequest | null {
  const text = prompt.trim();
  if (!text) return null;

  const match = text.match(
    /\b(?:add|place|put|insert)\s+(\d{1,3})\s+(.+?)\s+(?:by|near|next\s+to|beside|around)\s+each\s+(.+?)(?:[.!?]|$)/i,
  );
  if (!match?.[1] || !match[2] || !match[3]) return null;

  const objectDescriptor = promptCatalogDescriptorForPhrase(match[2]);
  const anchorDescriptor = promptCatalogDescriptorForPhrase(match[3]);
  if (!objectDescriptor || !anchorDescriptor) return null;
  if (objectDescriptor.catalogComponentId === anchorDescriptor.catalogComponentId) return null;

  const quantityPerAnchor = clampInt(Number(match[1]), 1, objectDescriptor.maxCount);
  const anchorCount = Math.max(
    1,
    layoutSpecComponentCount(options.baseLayoutSpec, anchorDescriptor.catalogComponentId),
  );
  const count = clampInt(
    quantityPerAnchor * anchorCount,
    1,
    objectDescriptor.maxCount,
  );

  return {
    catalogComponentId: objectDescriptor.catalogComponentId,
    anchorComponentId: anchorDescriptor.catalogComponentId,
    quantityPerAnchor,
    anchorCount,
    count,
    placementPreference: inferPlacementPreferenceFromPrompt(text),
  };
}

const ATTENDEE_CAPACITY_CONTEXT_RE =
  /\b(?:capacity|attendees?|guests?|people|person|pax|seats?|headcount)\b/i;

/** Explicit capacity target from edit prompts (e.g. "up to 200", "increase capacity to 200"). */
export function inferCapacityTargetFromPrompt(prompt: string): number | null {
  const text = prompt.trim();
  if (!text) return null;
  if (!ATTENDEE_CAPACITY_CONTEXT_RE.test(text)) return null;
  const patterns = [
    /\b(\d{1,4})\s*[-–]\s*person(?:\s|\b)/i,
    /\b(\d{1,4})\s+person(?:\s|\b)/i,
    /\b(\d{1,4})\s*[-–]\s*people(?:\s|\b)/i,
    /\b(\d{1,4})\s+(?:attendees?|guests?|people|pax|seats?)\b/i,
    /\b(?:for|fit)\s+(\d{1,4})\s+(?:people|guests|attendees|pax)\b/i,
    /\bmake\b[\s\S]{0,24}\bfor\s+(\d{1,4})\s+(?:people|guests|attendees|pax)\b/i,
    /\b(?:capacity|attendees?|guests?|people|pax|seats?)\b[\s\S]{0,32}\b(?:to|up\s+to|at)\s*(\d{1,4})\b/i,
    /\b(?:increase|raise|reduce|decrease|lower|change|set|make)\b[\s\S]{0,40}\b(?:capacity|attendees?|guests?|people|pax|seats?)\b[\s\S]{0,16}\b(?:to|up\s+to|at)\s*(\d{1,4})\b/i,
    /\b(?:to|at)\s+(\d{1,4})\s+(?:attendees?|guests?|people|pax|seats?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const n = Math.round(Number(match[1]));
    if (Number.isFinite(n) && n >= 1 && n <= 1200) return n;
  }
  return null;
}

/** Explicit primary audience object count, distinct from attendee/headcount parsing. */
export function inferPrimaryAudienceObjectCountFromPrompt(
  prompt: string,
): RoomSetPrimaryAudienceObjectCountIntent | null {
  const text = prompt.trim();
  if (!text) return null;

  const patterns: ReadonlyArray<
    Readonly<{
      componentId: RoomSetComponentId;
      label: string;
      re: RegExp;
    }>
  > = [
    {
      componentId: "table-round-60",
      label: "banquet rounds",
      re: /\b(\d{1,3})\s+(?:banquet\s+)?(?:rounds?|round\s+tables?|banquet\s+rounds?)\b/i,
    },
    {
      componentId: "table-round-60",
      label: "round tables",
      re: /\b(\d{1,3})\s+(?:banquet\s+)?tables?\b/i,
    },
    {
      componentId: "table-cocktail-cluster",
      label: "cocktail tables",
      re: /\b(\d{1,3})\s+(?:cocktail\s+tables?|cocktail\s+clusters?|highboys?|mingle\s+clusters?)\b/i,
    },
    {
      componentId: "seating-classroom-row",
      label: "classroom rows",
      re: /\b(\d{1,3})\s+(?:classroom\s+rows?|desk\s+rows?|training\s+rows?)\b/i,
    },
    {
      componentId: "seating-theater-row",
      label: "theater rows",
      re: /\b(\d{1,3})\s+(?:theater\s+rows?|chair\s+rows?|audience\s+rows?)\b/i,
    },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.re);
    if (!match?.[1]) continue;
    const count = clampInt(Number(match[1]), 1, 400);
    return { componentId: pattern.componentId, count, label: pattern.label };
  }

  return null;
}

/** Count for additive "N more" component requests (additional units, not total inventory). */
export function inferAdditiveCountFromPrompt(prompt: string): number | null {
  return genericAddCountFromPrompt(prompt);
}

/** True only when the prompt explicitly requests accessibility / ADA accommodations. */
export function inferAccessibilityPriorityFromPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return /\b(?:ada\b|accessibility|accessible\s+seating|wheelchair|mobility\s+access|a11y|access(?:ible)?\s+(?:route|path|seating))\b/i.test(
    text,
  );
}

export function resolveAccessibilityPriorityForApply(prompt: string, current: boolean): boolean {
  if (/\b(?:no\s+accessibility|without\s+ada|non-accessible)\b/i.test(prompt)) return false;
  if (inferAccessibilityPriorityFromPrompt(prompt)) return true;
  return current;
}

export function resolveAccessibilityPriorityForGenerate(
  userChecked: boolean,
  prompt: string,
): boolean {
  return userChecked || inferAccessibilityPriorityFromPrompt(prompt);
}

export function inferPlacementPreferenceFromPrompt(
  prompt: string,
): RoomSetPlannerPlacementPreference | undefined {
  const text = prompt.trim();
  if (!text) return undefined;
  if (PERIMETER_PLACEMENT_PROMPT_RE.test(text)) return "perimeter";
  if (FRONT_PLACEMENT_PROMPT_RE.test(text)) return "front";
  if (REAR_PLACEMENT_PROMPT_RE.test(text)) return "rear";
  if (SIDE_PLACEMENT_PROMPT_RE.test(text)) return "side";
  return undefined;
}

function pickPlacementPreference(
  current: RoomSetPlannerPlacementPreference | undefined,
  next: RoomSetPlannerPlacementPreference | undefined,
): RoomSetPlannerPlacementPreference {
  if (current && current !== "mixed") return current;
  if (next && next !== "mixed") return next;
  return current ?? next ?? "mixed";
}

export function maxPromptCountForCatalogComponent(componentId: RoomSetComponentId): number {
  const row = PROMPT_CATALOG_DESCRIPTORS.find((d) => d.catalogComponentId === componentId);
  return row?.maxCount ?? ROOM_SET_PROMPT_MAX_COMPONENT_COUNT_DEFAULT;
}

export function labelNounForCatalogComponent(componentId: RoomSetComponentId): string {
  const row = PROMPT_CATALOG_DESCRIPTORS.find((d) => d.catalogComponentId === componentId);
  if (row) return row.labelNoun;
  const def = getRoomSetComponent(componentId);
  return def ? `${def.label.toLowerCase()} units` : componentId.replaceAll("-", " ");
}

export function inferPlannerGenerationMode(prompt: string): RoomSetPlannerGenerationMode {
  const text = prompt.trim().toLowerCase();
  if (!text) return "full";
  if (
    /\b(?:add|insert|place|put|replace|swap|move|relocate|remove|delete|spread)\b/i.test(text) ||
    inferCapacityTargetFromPrompt(text) != null
  ) {
    return "additive";
  }
  const fullRoomCue =
    /\b(create|generate|build|design|layout)\b[\s\S]{0,48}\b(room|layout|dinner|session|reception|banquet|awards|keynote|town\s+hall|workshop|training|expo)\b/i;
  if (fullRoomCue.test(text)) return "full";
  return "full";
}

/** Deterministic keyword extraction for any supported catalog add-on. */
export function inferPlannerComponentRequestsFromPrompt(
  prompt: string,
  attendeeCount: number,
  options: RoomSetPlannerComponentRequestInferenceOptions = {},
): readonly RoomSetPlannerComponentRequest[] {
  const text = prompt.trim();
  if (!text) return [];
  const addByEachAnchor = inferAddByEachAnchorComponentRequestFromPrompt(text, options);
  if (addByEachAnchor) return [addByEachAnchor];

  const guests = clampInt(attendeeCount, 12, 1200);
  const placementPreference = inferPlacementPreferenceFromPrompt(text);
  const genericCount = genericAddCountFromPrompt(text);
  const out: RoomSetPlannerComponentRequest[] = [];

  for (const descriptor of PROMPT_CATALOG_DESCRIPTORS) {
    if (!descriptor.match.test(text)) continue;
    const explicit =
      explicitCountFromPatterns(text, descriptor.countPatterns) ??
      (genericCount !== null && PROMPT_CATALOG_DESCRIPTORS.filter((d) => d.match.test(text)).length === 1
        ? genericCount
        : null);
    out.push({
      catalogComponentId: descriptor.catalogComponentId,
      count: clampInt(explicit ?? descriptor.defaultCount(guests), 1, descriptor.maxCount),
      placementPreference,
    });
  }

  return out;
}

function catalogIdFromUnknownEntry(entry: Record<string, unknown>): RoomSetComponentId | null {
  if (typeof entry.catalogComponentId === "string" && isPromptAddableCatalogComponentId(entry.catalogComponentId)) {
    return entry.catalogComponentId;
  }
  const legacy = legacyComponentTypeParser(entry.componentType);
  return legacy ? LEGACY_COMPONENT_TYPE_TO_CATALOG[legacy] : null;
}

export function normalizePlannerComponentRequestsFromUnknown(value: unknown): RoomSetPlannerComponentRequest[] {
  if (!Array.isArray(value)) return [];
  const out: RoomSetPlannerComponentRequest[] = [];
  const capEntries = Math.min(value.length, 12);
  for (let ei = 0; ei < capEntries; ei += 1) {
    const raw = value[ei];
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const catalogComponentId = catalogIdFromUnknownEntry(entry);
    if (!catalogComponentId) continue;
    const roundedCount = Math.round(Number(entry.count) || 0);
    if (!Number.isFinite(roundedCount) || roundedCount <= 0) continue;
    const maxCount = maxPromptCountForCatalogComponent(catalogComponentId);
    const takeCount = clampInt(Math.min(roundedCount, maxCount), 1, maxCount);
    const existingIdx = out.findIndex((row) => row.catalogComponentId === catalogComponentId);
    if (existingIdx >= 0) {
      const existing = out[existingIdx]!;
      out[existingIdx] = {
        catalogComponentId,
        count: clampInt(existing.count + takeCount, 1, maxCount),
        placementPreference: pickPlacementPreference(
          existing.placementPreference,
          placementPreferenceParser(entry.placementPreference),
        ),
      };
      continue;
    }
    out.push({
      catalogComponentId,
      count: takeCount,
      placementPreference: placementPreferenceParser(entry.placementPreference),
      source: componentRequestSourceParser(entry.source),
    });
  }
  return out;
}

/** Merge explicit config/brief rows without local prompt inference (counts add, placement prefers specific). */
export function mergePlannerComponentRequestsWithoutInference(
  primary: readonly RoomSetPlannerComponentRequest[],
  supplemental: readonly RoomSetPlannerComponentRequest[],
): RoomSetPlannerComponentRequest[] {
  return mergeComponentRequests(primary, supplemental);
}

function mergeComponentRequests(
  primary: readonly RoomSetPlannerComponentRequest[],
  supplemental: readonly RoomSetPlannerComponentRequest[],
): RoomSetPlannerComponentRequest[] {
  const byId = new Map<RoomSetComponentId, RoomSetPlannerComponentRequest>();
  for (const request of [...primary, ...supplemental]) {
    const cap = maxPromptCountForCatalogComponent(request.catalogComponentId);
    const prev = byId.get(request.catalogComponentId);
    const count = clampInt((prev?.count ?? 0) + request.count, 1, cap);
    byId.set(request.catalogComponentId, {
      catalogComponentId: request.catalogComponentId,
      count,
      placementPreference: pickPlacementPreference(prev?.placementPreference, request.placementPreference),
      source: prev?.source ?? request.source,
    });
  }
  return [...byId.values()];
}

export function enrichPlannerComponentRequestsFromPrompt(
  requests: readonly RoomSetPlannerComponentRequest[],
  prompt: string,
): RoomSetPlannerComponentRequest[] {
  const inferred = inferPlacementPreferenceFromPrompt(prompt);
  if (!inferred) return [...requests];
  return requests.map((request) => ({
    ...request,
    placementPreference:
      !request.placementPreference || request.placementPreference === "mixed"
        ? inferred
        : request.placementPreference,
  }));
}

function applyPlacementEnrichmentProvenance(
  before: readonly RoomSetPlannerComponentRequest[],
  after: readonly RoomSetPlannerComponentRequest[],
): { requests: RoomSetPlannerComponentRequest[]; usedLocalPlacementEnrichment: boolean } {
  const beforeById = new Map(before.map((row) => [row.catalogComponentId, row]));
  let usedLocalPlacementEnrichment = false;
  const requests = after.map((row) => {
    const prev = beforeById.get(row.catalogComponentId);
    if (!prev) return row;
    const placementChanged =
      prev.placementPreference !== row.placementPreference &&
      (!prev.placementPreference || prev.placementPreference === "mixed") &&
      row.placementPreference !== undefined &&
      row.placementPreference !== "mixed";
    if (!placementChanged) return row;
    if (prev.source === "ai") {
      usedLocalPlacementEnrichment = true;
      return { ...row, source: "merged" as const };
    }
    return row;
  });
  return { requests, usedLocalPlacementEnrichment };
}

/**
 * AI-primary component resolution: AI rows win on count/placement; local parser only fills
 * missing catalog IDs or runs when AI interpretation is unavailable.
 */
export function buildPlannerComponentRequestsWithProvenance(
  aiRequests: readonly RoomSetPlannerComponentRequest[],
  prompt: string,
  attendeeCount: number,
  aiInterpretationSucceeded: boolean,
): Readonly<{
  requests: RoomSetPlannerComponentRequest[];
  interpretation: RoomSetComponentRequestInterpretationMeta;
}> {
  const text = prompt.trim();
  let usedLocalComponentFallback = false;
  let working: RoomSetPlannerComponentRequest[];

  if (aiInterpretationSucceeded) {
    const aiTagged = aiRequests.map((row) => ({
      ...row,
      source: row.source ?? ("ai" as const),
    }));
    const aiIds = new Set(aiTagged.map((row) => row.catalogComponentId));
    const inferred = text ? inferPlannerComponentRequestsFromPrompt(text, attendeeCount) : [];
    const supplemental = inferred
      .filter((row) => !aiIds.has(row.catalogComponentId))
      .map((row) => ({ ...row, source: "localFallback" as const }));
    if (supplemental.length > 0) usedLocalComponentFallback = true;
    working = [...aiTagged, ...supplemental];
  } else {
    const inferred = text ? inferPlannerComponentRequestsFromPrompt(text, attendeeCount) : [];
    working = inferred.map((row) => ({ ...row, source: "localFallback" as const }));
    if (working.length > 0) usedLocalComponentFallback = true;
  }

  const beforeEnrich = working.map((row) => ({ ...row }));
  const enriched = text ? enrichPlannerComponentRequestsFromPrompt(working, text) : working;
  const { requests, usedLocalPlacementEnrichment } = applyPlacementEnrichmentProvenance(
    beforeEnrich,
    enriched,
  );

  return {
    requests,
    interpretation: {
      aiInterpretationSucceeded,
      usedLocalComponentFallback,
      usedLocalPlacementEnrichment,
    },
  };
}

export function formatComponentRequestInterpretationSummaryLines(
  interpretation: RoomSetComponentRequestInterpretationMeta,
  requests: readonly RoomSetPlannerComponentRequest[],
): string[] {
  const describe = (row: RoomSetPlannerComponentRequest) => {
    const placement =
      row.placementPreference && row.placementPreference !== "mixed"
        ? ` (${row.placementPreference})`
        : "";
    return `${row.count}× ${labelNounForCatalogComponent(row.catalogComponentId)}${placement}`;
  };

  if (interpretation.aiInterpretationSucceeded && requests.length === 0) {
    return [
      "Component requests: AI interpretation succeeded; no secondary catalog components in brief (spread/move/add edits may still run locally).",
    ];
  }

  if (!interpretation.aiInterpretationSucceeded) {
    if (requests.length === 0) {
      return ["Component requests: none detected (AI interpretation unavailable; no local catalog cues)."];
    }
    return [
      "Component requests: local keyword fallback only (AI interpretation unavailable).",
      `Fallback detected: ${requests.map(describe).join("; ")}.`,
    ];
  }

  const lines = ["Component requests: primary source — AI structured interpretation."];
  const aiRows = requests.filter((row) => row.source === "ai");
  const localRows = requests.filter((row) => row.source === "localFallback");
  const mergedRows = requests.filter((row) => row.source === "merged");

  if (aiRows.length > 0) {
    lines.push(`From AI: ${aiRows.map(describe).join("; ")}.`);
  }
  if (interpretation.usedLocalComponentFallback && localRows.length > 0) {
    lines.push(`Local supplement (catalog not in AI response): ${localRows.map(describe).join("; ")}.`);
  }
  if (interpretation.usedLocalPlacementEnrichment && mergedRows.length > 0) {
    lines.push(`Placement cue from prompt (AI had mixed/missing): ${mergedRows.map(describe).join("; ")}.`);
  }
  if (
    requests.length > 0 &&
    !interpretation.usedLocalComponentFallback &&
    !interpretation.usedLocalPlacementEnrichment &&
    aiRows.length === 0
  ) {
    lines.push(`Resolved: ${requests.map(describe).join("; ")}.`);
  }
  return lines;
}

/** @deprecated Prefer {@link buildPlannerComponentRequestsWithProvenance} — kept for callers that only need requests. */
export function supplementPlannerComponentRequests(
  normalized: readonly RoomSetPlannerComponentRequest[],
  prompt: string,
  attendeeCount: number,
): RoomSetPlannerComponentRequest[] {
  return buildPlannerComponentRequestsWithProvenance(
    normalized,
    prompt,
    attendeeCount,
    true,
  ).requests;
}
