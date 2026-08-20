/**
 * Reusable room-set regression simulation runner.
 *
 * Covers:
 * - Generate New Layout flows
 * - Apply To Current Layout flows
 * - Chained generate -> apply -> apply -> apply flows
 *
 * Usage (from web/):
 *   npx tsx scripts/room-set-composer-simulation.ts --scenario all
 *   npx tsx scripts/room-set-composer-simulation.ts --scenario seating
 *   npx tsx scripts/room-set-composer-simulation.ts --scenario general-session-style-audit
 *   npx tsx scripts/room-set-composer-simulation.ts --scenario preset-layout-audit --room-width 100 --room-depth 70 --attendees 180
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  buildDefaultPlannerSimulationScenarios,
  renderPlannerSceneSvg,
  runPlannerSimulationSuite,
  type PlannerSimulationScenarioDefinition,
  type PlannerSimulationScenarioTag,
  type PlannerSimulationStatus,
  type PlannerSimulationStepResult,
} from "../lib/room-set/planner-layout-simulation";
import {
  layoutStyleOptionsForIntent,
  ROOM_SET_PROMPT_STYLE_HINT_OPTIONS,
} from "../lib/room-set/layout-style-options";
import { finalizeGenerateLayoutSpec } from "../lib/room-set/layout-spec-generate-resolve";
import { composeLayoutSpec } from "../lib/room-set/layout-spec-compose";
import type { LayoutSpec, LayoutSpecLayoutType } from "../lib/room-set/layout-spec";
import { defaultPrimaryForLayoutType } from "../lib/room-set/layout-spec-normalize";
import {
  type RoomSetAudienceStyle,
  type RoomSetEventIntentId,
  type RoomSetLayoutStylePreference,
} from "../lib/room-set/planner-intent-shared";
import type { RoomSetLayoutPlacement } from "../lib/room-set/planner-layout-schema";
import {
  findPlannerLayoutPlacementOverlaps,
  sumPlatedSeatCapacity,
} from "../lib/room-set/planner-layout-validator";
import { analyzeBanquetTableVisualQuality } from "../lib/room-set/planner-layout-visual-quality";
import {
  plannerSceneFromLayoutPlacements,
  type PlannerScene,
} from "../lib/room-set/planner-scene";
import {
  getRoomSetComponent,
  type RoomSetComponentId,
} from "../lib/room-set/component-library";
import {
  ROOM_SET_EVENT_INTENT_ARCHETYPES,
  resolveRoomSetEventIntentPlan,
} from "../lib/room-set/room-layout-starters";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = join(SCRIPT_DIR, "../tmp/room-set-simulations");
const SUMMARY_TABLE_PATH = join(OUTPUT_ROOT, "summary-table.md");
const SCENARIO_FILTERS = [
  "all",
  "presets",
  "support",
  "seating",
  "counts",
  "chains",
  "legacy",
  "general-session-style-audit",
  "preset-layout-audit",
] as const;

type ScenarioFilter = (typeof SCENARIO_FILTERS)[number];

type PresetLayoutAuditCliOptions = Readonly<{
  roomWidthLu: number | null;
  roomDepthLu: number | null;
  attendees: number;
  presetFilter: string | null;
  styleFilter: string | null;
}>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 80);
}

function statusPrefix(status: PlannerSimulationStatus): string {
  return status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseScenarioFilter(args: readonly string[]): ScenarioFilter {
  const scenarioIndex = args.findIndex((arg) => arg === "--scenario");
  const rawValue =
    scenarioIndex >= 0
      ? args[scenarioIndex + 1]
      : args.find((arg) => arg.startsWith("--scenario="))?.slice("--scenario=".length);
  const value = rawValue ?? "all";
  if (SCENARIO_FILTERS.includes(value as ScenarioFilter)) {
    return value as ScenarioFilter;
  }

  console.error(
    `Unknown --scenario value "${value}". Expected one of: ${SCENARIO_FILTERS.join(", ")}`,
  );
  process.exitCode = 1;
  return "all";
}

function cliFlagValue(args: readonly string[], name: string): string | null {
  const index = args.findIndex((arg) => arg === name);
  if (index >= 0) return args[index + 1] ?? null;
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

function parsePositiveNumberFlag(
  args: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = cliFlagValue(args, name);
  if (raw === null || raw === undefined) return fallback;
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) return value;
  console.error(`Invalid ${name} value "${raw}". Expected a positive number.`);
  process.exitCode = 1;
  return fallback;
}

function parseOptionalPositiveNumberFlag(args: readonly string[], name: string): number | null {
  const raw = cliFlagValue(args, name);
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) return value;
  console.error(`Invalid ${name} value "${raw}". Expected a positive number.`);
  process.exitCode = 1;
  return null;
}

function parsePresetLayoutAuditCliOptions(args: readonly string[]): PresetLayoutAuditCliOptions {
  return {
    roomWidthLu: parseOptionalPositiveNumberFlag(args, "--room-width"),
    roomDepthLu: parseOptionalPositiveNumberFlag(args, "--room-depth"),
    attendees: Math.round(parsePositiveNumberFlag(args, "--attendees", PRESET_LAYOUT_AUDIT_ATTENDEES)),
    presetFilter: cliFlagValue(args, "--preset"),
    styleFilter: cliFlagValue(args, "--style"),
  };
}

function filterScenarios(
  scenarios: readonly PlannerSimulationScenarioDefinition[],
  filter: ScenarioFilter,
): readonly PlannerSimulationScenarioDefinition[] {
  if (filter === "all") return scenarios;
  return scenarios.filter((scenario) =>
    scenario.tags?.includes(filter as PlannerSimulationScenarioTag),
  );
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function trySips(svgPath: string, pngPath: string): boolean {
  const result = spawnSync(
    "sips",
    ["-s", "format", "png", svgPath, "--out", pngPath],
    { encoding: "utf8" },
  );
  return result.status === 0 && existsSync(pngPath);
}

function tryQlmanage(svgPath: string, pngPath: string): boolean {
  const outputDir = dirname(pngPath);
  const basename = svgPath.replace(/^.*[\\/]/, "").replace(/\.svg$/i, ".png");
  const result = spawnSync(
    "qlmanage",
    ["-t", "-s", "1600", "-o", outputDir, svgPath],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return false;
  const generatedPath = join(outputDir, basename);
  if (!existsSync(generatedPath)) return false;
  if (generatedPath !== pngPath) {
    copyFileSync(generatedPath, pngPath);
    rmSync(generatedPath, { force: true });
  }
  return existsSync(pngPath);
}

function tryConvertSvgToPng(svgPath: string, pngPath: string): boolean {
  return trySips(svgPath, pngPath) || tryQlmanage(svgPath, pngPath);
}

function writeStepArtifacts(step: PlannerSimulationStepResult): void {
  const stepDir = join(
    OUTPUT_ROOT,
    slugify(step.scenarioId),
    `${String(step.stepIndex + 1).padStart(2, "0")}-${slugify(step.stepId)}`,
  );
  mkdirSync(stepDir, { recursive: true });

  const beforeScenePath = join(stepDir, "before.scene.json");
  const afterScenePath = join(stepDir, "after.scene.json");
  const diffSummaryPath = join(stepDir, "diff-summary.json");
  const beforeSvgPath = join(stepDir, "before.svg");
  const afterSvgPath = join(stepDir, "after.svg");
  const beforePngPath = join(stepDir, "before.png");
  const afterPngPath = join(stepDir, "after.png");

  writeJsonFile(beforeScenePath, step.before.scene);
  writeJsonFile(afterScenePath, step.after.scene);
  writeJsonFile(diffSummaryPath, {
    scenarioId: step.scenarioId,
    scenarioLabel: step.scenarioLabel,
    stepId: step.stepId,
    stepLabel: step.stepLabel,
    kind: step.kind,
    status: step.status,
    prompt: step.prompt,
    applyPath: step.applyPath,
    placementCounts: {
      before: step.before.placementCounts,
      after: step.after.placementCounts,
    },
    attendeeCounts: {
      before: step.before.attendeeTarget,
      after: step.after.attendeeTarget,
      delta: step.diagnostics.attendeeCountDelta,
    },
    appliedSeatCapacity: {
      before: step.before.appliedSeatCapacity,
      after: step.after.appliedSeatCapacity,
      delta: step.diagnostics.appliedSeatCapacityDelta,
    },
    overlapCount: {
      before: step.diagnostics.beforeOverlapCount,
      after: step.diagnostics.afterOverlapCount,
    },
    outOfBoundsCount: {
      before: step.diagnostics.beforeOutOfBoundsCount,
      after: step.diagnostics.afterOutOfBoundsCount,
    },
    capacityResetDetected: step.diagnostics.capacityResetDetected,
    noVisibleChangeDetected: step.diagnostics.noVisibleChangeDetected,
    largeObjectJumps: step.diagnostics.largeObjectJumps,
    unrelatedObjectMutations: step.diagnostics.unrelatedObjectMutations,
    warnings: step.warnings,
    notes: step.notes,
    expectationFailures: step.expectationFailures,
    executionError: step.executionError,
    patchSummary: step.patchSummary,
    spatialDirectives: step.spatialDirectives,
    semanticDirectiveKeys: step.semanticDirectiveKeys,
  });

  writeFileSync(
    beforeSvgPath,
    renderPlannerSceneSvg(step.before.scene, `${step.scenarioLabel} — ${step.stepLabel} (before)`),
    "utf8",
  );
  writeFileSync(
    afterSvgPath,
    renderPlannerSceneSvg(step.after.scene, `${step.scenarioLabel} — ${step.stepLabel} (after)`),
    "utf8",
  );

  tryConvertSvgToPng(beforeSvgPath, beforePngPath);
  tryConvertSvgToPng(afterSvgPath, afterPngPath);
}

function logStep(step: PlannerSimulationStepResult): void {
  const summaryParts = [
    `${statusPrefix(step.status)}`,
    step.scenarioLabel,
    `step=${step.stepLabel}`,
    `mode=${step.kind}${step.applyPath ? `/${step.applyPath}` : ""}`,
    `placements=${step.before.placementCounts.total}->${step.after.placementCounts.total}`,
    `attendees=${step.before.attendeeTarget}->${step.after.attendeeTarget}`,
    `capacity=${step.before.appliedSeatCapacity}->${step.after.appliedSeatCapacity}`,
    `overlaps=${step.diagnostics.afterOverlapCount}`,
    `outOfBounds=${step.diagnostics.afterOutOfBoundsCount}`,
  ];

  console.info(summaryParts.join(" | "));

  if (step.diagnostics.largeObjectJumps.length > 0) {
    console.info(
      `  large jumps: ${step.diagnostics.largeObjectJumps
        .slice(0, 3)
        .map(
          (movement) =>
            `${movement.componentId}${movement.label ? ` (${movement.label})` : ""} ${movement.distanceLu} LU`,
        )
        .join(", ")}`,
    );
  }

  if (step.diagnostics.unrelatedObjectMutations.length > 0) {
    console.info(
      `  unrelated mutations: ${step.diagnostics.unrelatedObjectMutations
        .slice(0, 3)
        .map(
          (movement) =>
            `${movement.componentId}${movement.label ? ` (${movement.label})` : ""} ${movement.distanceLu} LU`,
        )
        .join(", ")}`,
    );
  }

  if (step.warnings.length > 0) {
    console.info(`  warnings: ${step.warnings.join(" | ")}`);
  }

  if (step.expectationFailures.length > 0) {
    console.info(`  expectation failures: ${step.expectationFailures.join(" | ")}`);
  }

  if (step.notes.length > 0) {
    console.info(`  notes: ${step.notes.join(" | ")}`);
  }
}

function markdownCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function compactStatusReasons(step: PlannerSimulationStepResult): string {
  const messages = [
    ...step.expectationFailures,
    ...step.warnings,
  ];
  if (step.executionError) {
    messages.push(`Execution failed: ${step.executionError}`);
  }
  if (step.diagnostics.afterOverlapCount > 0) {
    messages.push(`Overlaps detected: ${step.diagnostics.afterOverlapCount}.`);
  }
  if (step.diagnostics.afterOutOfBoundsCount > 0) {
    messages.push(`Out-of-bounds objects: ${step.diagnostics.afterOutOfBoundsCount}.`);
  }
  if (step.diagnostics.capacityResetDetected) {
    messages.push("Attendee target changed without an explicit count prompt.");
  }
  if (step.diagnostics.noVisibleChangeDetected) {
    messages.push("No visible placement or attendee change.");
  }
  if (step.diagnostics.largeObjectJumps.length > 0) {
    messages.push(`Large object movement: ${step.diagnostics.largeObjectJumps.length} object(s).`);
  }
  if (step.diagnostics.unrelatedObjectMutations.length > 0) {
    messages.push(
      `Unrelated object movement: ${step.diagnostics.unrelatedObjectMutations.length} object(s).`,
    );
  }
  const uniqueMessages = Array.from(new Set(messages));
  if (uniqueMessages.length === 0) return "";
  const first = uniqueMessages[0] ?? "";
  return uniqueMessages.length === 1 ? first : `${first} (+${uniqueMessages.length - 1})`;
}

function beforeAfter(before: string | number | null, after: string | number | null): string {
  return `${before ?? ""}->${after ?? ""}`;
}

function stepLayoutType(step: PlannerSimulationStepResult, side: "before" | "after"): string {
  return step[side].spec?.layoutType ?? "unknown";
}

function buildSummaryTable(steps: readonly PlannerSimulationStepResult[]): string {
  const headers = [
    "scenario",
    "step",
    "status",
    "kind",
    "applyPath",
    "layoutType before->after",
    "attendee before->after",
    "capacity before->after",
    "overlaps",
    "outOfBounds",
    "warnings",
  ];
  const rows = steps.map((step) => [
    step.scenarioId,
    step.stepId,
    statusPrefix(step.status),
    step.kind,
    step.applyPath ?? "",
    beforeAfter(stepLayoutType(step, "before"), stepLayoutType(step, "after")),
    beforeAfter(step.before.attendeeTarget, step.after.attendeeTarget),
    beforeAfter(step.before.appliedSeatCapacity, step.after.appliedSeatCapacity),
    beforeAfter(step.diagnostics.beforeOverlapCount, step.diagnostics.afterOverlapCount),
    beforeAfter(step.diagnostics.beforeOutOfBoundsCount, step.diagnostics.afterOutOfBoundsCount),
    compactStatusReasons(step),
  ]);

  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
    "",
  ].join("\n");
}

type PresetLayoutAuditStatus = "PASS" | "FAIL";

type PresetLayoutAuditCheck = Readonly<{
  name: string;
  status: PresetLayoutAuditStatus;
  detail: string;
}>;

type PresetLayoutAuditCombo = Readonly<{
  presetId: RoomSetEventIntentId;
  presetName: string;
  requestedStyle: RoomSetLayoutStylePreference;
  requestedStyleLabel: string;
  resolvedInternalStyle: RoomSetAudienceStyle | "unknown";
  resolvedLayoutType: LayoutSpecLayoutType | "unknown";
  requestedAttendees: number;
  placedAttendees: number;
  capacity: number;
  primaryObjectCount: number;
  supportObjectCount: number;
  overlapCount: number;
  outOfBoundsCount: number;
  chairOrientationResult: string;
  stageFrontZoneResult: string;
  aisleCirculationResult: string;
  layoutSpecificContractChecks: readonly PresetLayoutAuditCheck[];
  similarityFingerprintChecks: readonly PresetLayoutAuditCheck[];
  fingerprint: string;
  technicalStatus: PresetLayoutAuditStatus;
  status: PresetLayoutAuditStatus;
  reason: string;
  room: Readonly<{ widthLu: number; depthLu: number }>;
  roomShell: Readonly<{ widthLu: number; depthLu: number }>;
  primaryComponentId: RoomSetComponentId | null;
  executionError: string | null;
  composerWarnings: readonly string[];
  outputFolderPath: string | null;
}>;

type PresetLayoutAuditReport = Readonly<{
  scenario: "preset-layout-audit";
  generatedAt: string;
  options: PresetLayoutAuditCliOptions;
  sourceOfTruth: Readonly<{
    presets: string;
    styleOptions: string;
  }>;
  summary: Readonly<{
    comboCount: number;
    pass: number;
    fail: number;
    lockedRegressionPass: number;
    lockedRegressionFail: number;
  }>;
  lockedRegressionChecks: readonly PresetLayoutAuditCheck[];
  combos: readonly PresetLayoutAuditCombo[];
}>;

const PRESET_LAYOUT_AUDIT_ATTENDEES = 120;
const PRESET_LAYOUT_AUDIT_MD_PATH = join(OUTPUT_ROOT, "preset-layout-audit.md");
const PRESET_LAYOUT_AUDIT_JSON_PATH = join(OUTPUT_ROOT, "preset-layout-audit.json");
const PRESET_LAYOUT_AUDIT_ARTIFACT_ROOT = join(OUTPUT_ROOT, "preset-layout-audit");
const PRESET_LAYOUT_AUDIT_FAILURES_REVIEW_PATH = join(PRESET_LAYOUT_AUDIT_ARTIFACT_ROOT, "failures-review.md");
const PRESET_LAYOUT_AUDIT_FAILURES_CONTACT_SHEET_PATH = join(PRESET_LAYOUT_AUDIT_ARTIFACT_ROOT, "failures-contact-sheet.png");
const PRESET_LAYOUT_AUDIT_ALL_COMBOS_REVIEW_PATH = join(PRESET_LAYOUT_AUDIT_ARTIFACT_ROOT, "all-combos-review.md");
const PRESET_LAYOUT_AUDIT_ALL_COMBOS_CONTACT_SHEET_PATH = join(PRESET_LAYOUT_AUDIT_ARTIFACT_ROOT, "all-combos-contact-sheet.png");

function presetLayoutAuditRoomSelectionLabel(options: PresetLayoutAuditCliOptions): string {
  if (options.roomWidthLu === null && options.roomDepthLu === null) return "preset plan boundaries";
  return `${options.roomWidthLu ?? "preset"} x ${options.roomDepthLu ?? "preset"} LU`;
}

function hashFingerprint(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function componentCategory(componentId: RoomSetComponentId): string {
  return getRoomSetComponent(componentId)?.category ?? "uncategorized";
}

function componentCapacity(componentId: RoomSetComponentId): number {
  return Math.max(1, getRoomSetComponent(componentId)?.capacitySeated ?? 1);
}

function normalizedFilterToken(value: string): string {
  return slugify(value.trim());
}

function filterMatches(value: string, filter: string | null): boolean {
  if (!filter?.trim()) return true;
  return normalizedFilterToken(value) === normalizedFilterToken(filter);
}

function presetMatchesFilter(
  preset: Readonly<{ id: RoomSetEventIntentId; label: string }>,
  filter: string | null,
): boolean {
  return filterMatches(preset.id, filter) || filterMatches(preset.label, filter);
}

function styleMatchesFilter(
  style: Readonly<{ id: RoomSetLayoutStylePreference; label: string }>,
  filter: string | null,
): boolean {
  return filterMatches(style.id, filter) || filterMatches(style.label, filter);
}

function buildAuditSeedSpec(args: Readonly<{
  eventIntent: RoomSetEventIntentId;
  layoutType: LayoutSpecLayoutType;
  attendeeCount: number;
  primaryComponentId: RoomSetComponentId;
  primaryComponentCapacity: number;
}>): LayoutSpec {
  const hasFront = args.layoutType !== "reception";
  return {
    version: 1,
    source: "ai-generate",
    eventIntent: args.eventIntent,
    layoutType: args.layoutType,
    attendeeTarget: args.attendeeCount,
    densityPreference: "balanced",
    audienceStyle: "grid",
    front: hasFront
      ? {
          screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
          stage: {
            componentId: args.eventIntent === "awards_dinner" ? "stage-keynote" : "stage-riser",
            count: 1,
            zoneRole: "front",
          },
          av: [{ componentId: "av-foh-control", count: 1, zoneRole: "rear", placementPreference: "rear" }],
        }
      : { av: [] },
    audience: {
      primaryComponentId: args.primaryComponentId,
      primaryComponentCapacity: args.primaryComponentCapacity,
      requiredPrimaryComponents: Math.max(1, Math.ceil(args.attendeeCount / args.primaryComponentCapacity)),
    },
    secondary: [],
  };
}

function countIssue(
  placements: readonly RoomSetLayoutPlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  code: string,
): number {
  return findPlannerLayoutPlacementOverlaps(placements, roomWidthLu, roomDepthLu)
    .filter((issue) => issue.code === code).length;
}

function primaryPlacements(
  placements: readonly RoomSetLayoutPlacement[],
  primaryComponentId: RoomSetComponentId | null,
): readonly RoomSetLayoutPlacement[] {
  return primaryComponentId
    ? placements.filter((placement) => placement.componentId === primaryComponentId)
    : [];
}

function placementCenter(placement: RoomSetLayoutPlacement): Readonly<{ x: number; y: number }> {
  const component = getRoomSetComponent(placement.componentId);
  return {
    x: placement.xLu + (component?.widthLu ?? 0) / 2,
    y: placement.yLu + (component?.depthLu ?? 0) / 2,
  };
}

function placementAuditRect(
  placement: RoomSetLayoutPlacement,
  clearanceLu = 0,
): Readonly<{ x: number; y: number; w: number; h: number }> {
  const component = getRoomSetComponent(placement.componentId);
  return {
    x: placement.xLu - clearanceLu,
    y: placement.yLu - clearanceLu,
    w: (component?.widthLu ?? 0) + clearanceLu * 2,
    h: (component?.depthLu ?? 0) + clearanceLu * 2,
  };
}

function auditRectsIntersect(
  a: Readonly<{ x: number; y: number; w: number; h: number }>,
  b: Readonly<{ x: number; y: number; w: number; h: number }>,
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function countSupportObjects(
  placements: readonly RoomSetLayoutPlacement[],
  primaryComponentId: RoomSetComponentId | null,
): number {
  return placements.filter((placement) => {
    if (placement.componentId === primaryComponentId) return false;
    const category = componentCategory(placement.componentId);
    return category !== "stages" && category !== "av";
  }).length;
}

function fingerprintPrimaryLayout(
  placements: readonly RoomSetLayoutPlacement[],
  primaryComponentId: RoomSetComponentId | null,
): string {
  const normalized = primaryPlacements(placements, primaryComponentId)
    .map((placement) => {
      const center = placementCenter(placement);
      return {
        c: placement.componentId,
        x: Math.round(center.x * 2) / 2,
        y: Math.round(center.y * 2) / 2,
        r: Math.round(placement.rotationDeg / 5) * 5,
      };
    })
    .sort((left, right) => left.y - right.y || left.x - right.x || left.r - right.r);
  return hashFingerprint(normalized);
}

function comboArtifactFolderPath(
  presetId: RoomSetEventIntentId,
  styleId: RoomSetLayoutStylePreference,
): string {
  return join(PRESET_LAYOUT_AUDIT_ARTIFACT_ROOT, `${slugify(presetId)}--${slugify(styleId)}`);
}

function writePresetLayoutAuditComboArtifacts(args: Readonly<{
  presetName: string;
  requestedStyle: RoomSetLayoutStylePreference;
  spec: LayoutSpec | null;
  placements: readonly RoomSetLayoutPlacement[];
  scene: PlannerScene | null;
  room: Readonly<{ widthLu: number; depthLu: number }>;
  folderPath: string;
}>): void {
  mkdirSync(args.folderPath, { recursive: true });
  const scene =
    args.scene ??
    plannerSceneFromLayoutPlacements(args.placements, {
      widthLu: args.room.widthLu,
      depthLu: args.room.depthLu,
    });

  writeJsonFile(join(args.folderPath, "layout-spec.json"), args.spec);
  writeJsonFile(join(args.folderPath, "placements.json"), args.placements);
  writeJsonFile(join(args.folderPath, "scene.json"), scene);

  const svgPath = join(args.folderPath, "layout.svg");
  const pngPath = join(args.folderPath, "layout.png");
  writeFileSync(
    svgPath,
    renderPlannerSceneSvg(scene, `${args.presetName} / ${args.requestedStyle}`),
    "utf8",
  );
  tryConvertSvgToPng(svgPath, pngPath);
}

function passCheck(name: string, detail: string): PresetLayoutAuditCheck {
  return { name, status: "PASS", detail };
}

function failCheck(name: string, detail: string): PresetLayoutAuditCheck {
  return { name, status: "FAIL", detail };
}

function chairOrientationResult(
  placements: readonly RoomSetLayoutPlacement[],
  primaryComponentId: RoomSetComponentId | null,
): PresetLayoutAuditCheck {
  const primary = primaryPlacements(placements, primaryComponentId);
  const chairRows = primary.filter((placement) => componentCategory(placement.componentId) === "seating");
  if (chairRows.length === 0) return passCheck("chair orientation", "PASS: not applicable for table/standing primary objects");
  const severeRotationCount = chairRows.filter((placement) => Math.abs(placement.rotationDeg) > 55).length;
  if (severeRotationCount > 0) {
    return failCheck("chair orientation", `FAIL: ${severeRotationCount} chair row(s) rotate away from the front zone`);
  }
  return passCheck("chair orientation", `PASS: ${chairRows.length} chair row(s) face the front zone`);
}

function stageFrontZoneResult(
  placements: readonly RoomSetLayoutPlacement[],
  primaryComponentId: RoomSetComponentId | null,
  roomDepthLu: number,
): PresetLayoutAuditCheck {
  const frontPlacements = placements.filter((placement) => {
    const category = componentCategory(placement.componentId);
    return category === "stages" || category === "av";
  });
  if (frontPlacements.length === 0) return passCheck("stage/front zone", "PASS: not applicable");

  const misplacedFront = frontPlacements.filter((placement) => placement.yLu > roomDepthLu * 0.42);
  if (misplacedFront.length > 0) {
    return failCheck("stage/front zone", `FAIL: ${misplacedFront.length} front object(s) landed outside the front zone`);
  }

  const protectedFrontPlacements = frontPlacements.filter((placement) => {
    const category = componentCategory(placement.componentId);
    return category === "stages" || placement.componentId.includes("podium");
  });
  const clearanceFrontPlacements =
    protectedFrontPlacements.length > 0 ? protectedFrontPlacements : frontPlacements;
  const protectedRects = clearanceFrontPlacements.map((placement) => placementAuditRect(placement, 1));
  const frontOverlapPrimary = primaryPlacements(placements, primaryComponentId).filter((placement) => {
    const primaryRect = placementAuditRect(placement);
    return protectedRects.some((frontRect) => auditRectsIntersect(primaryRect, frontRect));
  });
  if (frontOverlapPrimary.length > 0) {
    return failCheck(
      "stage/front zone",
      `FAIL: ${frontOverlapPrimary.length} primary object(s) intrude into the stage/remarks zone`,
    );
  }
  return passCheck(
    "stage/front zone",
    `PASS: ${frontPlacements.length} front object(s) keep the stage/remarks zone clear`,
  );
}

function aisleCirculationResult(
  styleId: RoomSetLayoutStylePreference,
  placements: readonly RoomSetLayoutPlacement[],
  primaryComponentId: RoomSetComponentId | null,
  roomWidthLu: number,
): PresetLayoutAuditCheck {
  const primary = primaryPlacements(placements, primaryComponentId);
  if (primary.length === 0) return failCheck("aisle/circulation", "FAIL: no primary objects were placed");
  const centers = primary.map(placementCenter);
  const left = centers.filter((center) => center.x < roomWidthLu * 0.45).length;
  const right = centers.filter((center) => center.x > roomWidthLu * 0.55).length;
  const center = centers.length - left - right;

  if (styleId.includes("center_aisle")) {
    if (left > 0 && right > 0 && center <= Math.max(1, Math.floor(primary.length * 0.2))) {
      return passCheck("aisle/circulation", `PASS: center aisle separates left=${left}, right=${right}, center=${center}`);
    }
    return failCheck("aisle/circulation", `FAIL: center aisle not evident (left=${left}, right=${right}, center=${center})`);
  }

  if (styleId === "theater_chevron") {
    const rotations = primary.map((placement) => Math.abs(placement.rotationDeg));
    const rotated = rotations.filter((rotation) => rotation >= 3).length;
    if ((left > 0 && right > 0) || rotated > 0) {
      return passCheck("aisle/circulation", `PASS: chevron/banked circulation is evident (left=${left}, right=${right}, rotated=${rotated})`);
    }
    return failCheck("aisle/circulation", "FAIL: chevron style did not create paired banks or rotated rows");
  }

  return passCheck("aisle/circulation", "PASS: no special aisle contract requested");
}

function layoutSpecificChecks(args: Readonly<{
  presetId: RoomSetEventIntentId;
  layoutType: LayoutSpecLayoutType | "unknown";
  requestedStyle: RoomSetLayoutStylePreference;
  resolvedStyle: RoomSetAudienceStyle | "unknown";
  requestedAttendees: number;
  capacity: number;
  placements: readonly RoomSetLayoutPlacement[];
  primaryComponentId: RoomSetComponentId | null;
  primaryObjectCount: number;
  room: Readonly<{ widthLu: number; depthLu: number }>;
  composeOk: boolean;
  composeIssueText: string;
}>): readonly PresetLayoutAuditCheck[] {
  const checks: PresetLayoutAuditCheck[] = [];
  if (!args.composeOk) {
    checks.push(failCheck("compose", `FAIL: ${args.composeIssueText || "composer returned ok=false"}`));
    return checks;
  }

  const minRatio = args.layoutType === "reception" ? 0.8 : 0.95;
  const ratio = args.capacity / Math.max(1, args.requestedAttendees);
  checks.push(
    ratio >= minRatio
      ? passCheck("capacity", `PASS: capacity ratio ${roundMetric(ratio)} >= ${minRatio}`)
      : failCheck("capacity", `FAIL: capacity ratio ${roundMetric(ratio)} < ${minRatio}`),
  );
  checks.push(
    args.primaryObjectCount > 0
      ? passCheck("primary objects", `PASS: ${args.primaryObjectCount} primary object(s) placed`)
      : failCheck("primary objects", "FAIL: no primary object placed"),
  );

  if (args.layoutType === "banquet") {
    const metrics = analyzeBanquetTableVisualQuality(args.placements, args.room);
    checks.push(
      metrics.isolatedTableCount === 0
        ? passCheck("banquet cohesion", "PASS: no isolated banquet tables")
        : failCheck("banquet cohesion", `FAIL: ${metrics.isolatedTableCount} isolated banquet table(s)`),
    );
    if (args.resolvedStyle === "grid") {
      checks.push(
        metrics.rowCoherenceScore >= 0.55
          ? passCheck("banquet structured rows", `PASS: row coherence ${roundMetric(metrics.rowCoherenceScore)}`)
          : failCheck("banquet structured rows", `FAIL: row coherence ${roundMetric(metrics.rowCoherenceScore)} < 0.55`),
      );
    }
    if (args.resolvedStyle === "loose" || args.resolvedStyle === "scattered") {
      checks.push(
        metrics.frontBackContinuityScore >= 0.45
          ? passCheck("banquet field continuity", `PASS: continuity ${roundMetric(metrics.frontBackContinuityScore)}`)
          : failCheck("banquet field continuity", `FAIL: continuity ${roundMetric(metrics.frontBackContinuityScore)} < 0.45`),
      );
    }
    checks.push(
      metrics.leftRightBalanceScore >= 0.4
        ? passCheck("banquet balance", `PASS: left/right balance ${roundMetric(metrics.leftRightBalanceScore)}`)
        : failCheck("banquet balance", `FAIL: left/right balance ${roundMetric(metrics.leftRightBalanceScore)} < 0.4`),
    );
  }

  if (args.presetId === "awards_dinner") {
    checks.push(
      args.primaryComponentId === "table-round-60" || args.primaryComponentId === "table-round-72"
        ? passCheck("awards banquet seating", `PASS: awards primary is ${args.primaryComponentId}`)
        : failCheck("awards banquet seating", `FAIL: awards primary is ${args.primaryComponentId ?? "none"}`),
    );
  }

  if (args.layoutType === "theater" && args.requestedStyle === "theater_chevron") {
    checks.push(
      args.resolvedStyle === "loose"
        ? passCheck("chevron resolution", "PASS: chevron resolves to internal loose row style")
        : failCheck("chevron resolution", `FAIL: chevron resolved to ${args.resolvedStyle}`),
    );
  }

  return checks;
}

function sourceIncludesAll(source: string, needles: readonly string[]): boolean {
  return needles.every((needle) => source.includes(needle));
}

function lockedRegressionChecks(combos: readonly PresetLayoutAuditCombo[]): readonly PresetLayoutAuditCheck[] {
  const workspaceSource = readFileSync(
    join(SCRIPT_DIR, "../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx"),
    "utf8",
  );
  const canvasSource = readFileSync(
    join(SCRIPT_DIR, "../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx"),
    "utf8",
  );

  const banquetCombos = combos.filter((combo) => combo.resolvedLayoutType === "banquet");
  const awardsCombos = combos.filter((combo) => combo.presetId === "awards_dinner");
  const chevronCombos = combos.filter((combo) => combo.requestedStyle === "theater_chevron");
  const chairCombos = combos.filter((combo) => combo.resolvedLayoutType === "theater" || combo.resolvedLayoutType === "classroom");

  const checks: PresetLayoutAuditCheck[] = [];
  checks.push(
    banquetCombos.length > 0 && banquetCombos.every((combo) => combo.technicalStatus === "PASS")
      ? passCheck("Banquet layouts", `PASS: ${banquetCombos.length} banquet combo(s) meet technical layout checks`)
      : failCheck("Banquet layouts", `FAIL: ${banquetCombos.filter((combo) => combo.technicalStatus === "FAIL").length}/${banquetCombos.length} banquet combo(s) failed technical checks`),
  );
  checks.push(
    awardsCombos.length > 0 &&
      awardsCombos.every((combo) => combo.primaryComponentId === "table-round-60" || combo.primaryComponentId === "table-round-72") &&
      awardsCombos.every((combo) => combo.capacity >= combo.requestedAttendees * 0.95)
      ? passCheck("Awards banquet seating", `PASS: ${awardsCombos.length} awards combo(s) retain banquet seating capacity`)
      : failCheck("Awards banquet seating", "FAIL: awards dinner seating or capacity regressed"),
  );
  checks.push(
    sourceIncludesAll(canvasSource, [
      "function isEditableChairObject",
      'data-chair-edit-controls="true"',
      "Chair count",
      "Rows",
      "Chairs / row",
      "updateSelectedChairLayout({ chairCount: nextValue })",
    ])
      ? passCheck("Chair editing", "PASS: prototype chair edit controls remain present")
      : failCheck("Chair editing", "FAIL: prototype chair edit controls are missing"),
  );
  checks.push(
    chairCombos.every((combo) => combo.chairOrientationResult.startsWith("PASS")) &&
      sourceIncludesAll(canvasSource, [
        "function ChairBlockSeatMarkers",
        'data-chair-facing="front"',
        'orientation="bottom"',
      ])
      ? passCheck("Chair orientation", "PASS: generated chair rows and renderer markers face front")
      : failCheck("Chair orientation", "FAIL: generated chair orientation or renderer marker contract regressed"),
  );
  checks.push(
    layoutStyleOptionsForIntent("general_session").some((option) => option.id === "theater_chevron") &&
      layoutStyleOptionsForIntent("banquet_remarks").some((option) => option.id === "staggered") &&
      layoutStyleOptionsForIntent("networking_reception").some((option) => option.id === "reception_perimeter") &&
      workspaceSource.includes("layoutStyleOptionsForIntent(stylePresetIntentLedger)") &&
      workspaceSource.includes('role="listbox"')
      ? passCheck("Style dropdown behavior", "PASS: preset-aware style dropdown options are sourced from shared config")
      : failCheck("Style dropdown behavior", "FAIL: preset-aware style dropdown behavior regressed"),
  );
  checks.push(
    ROOM_SET_PROMPT_STYLE_HINT_OPTIONS.some((option) => option.group === "Audience" && option.id === "theater_chevron") &&
      ROOM_SET_PROMPT_STYLE_HINT_OPTIONS.some((option) => option.group === "Banquet" && option.id === "staggered") &&
      workspaceSource.includes('hasPromptStyleContextLedger ? "Style hint"') &&
      workspaceSource.includes("Pick a preset or enter a prompt to unlock style options.")
      ? passCheck("Prompt-only style hint behavior", "PASS: prompt-only mode exposes grouped style hints")
      : failCheck("Prompt-only style hint behavior", "FAIL: prompt-only style hint behavior regressed"),
  );
  checks.push(
    chevronCombos.length > 0 &&
      chevronCombos.every((combo) => combo.resolvedInternalStyle === "loose") &&
      chevronCombos.every((combo) => combo.overlapCount === 0 && combo.outOfBoundsCount === 0)
      ? passCheck("Chevron", `PASS: ${chevronCombos.length} chevron combo(s) resolve and compose cleanly`)
      : failCheck("Chevron", "FAIL: chevron style resolution or clean composition regressed"),
  );

  return checks;
}

function statusFromChecks(checks: readonly PresetLayoutAuditCheck[]): PresetLayoutAuditStatus {
  return checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS";
}

function comboReason(args: Readonly<{
  executionError: string | null;
  overlapCount: number;
  outOfBoundsCount: number;
  layoutChecks: readonly PresetLayoutAuditCheck[];
  similarityChecks: readonly PresetLayoutAuditCheck[];
}>): string {
  if (args.executionError) return `Execution failed: ${args.executionError}`;
  if (args.overlapCount > 0) return `Overlap count is ${args.overlapCount}`;
  if (args.outOfBoundsCount > 0) return `Out-of-bounds count is ${args.outOfBoundsCount}`;
  const failed = [...args.layoutChecks, ...args.similarityChecks].find((check) => check.status === "FAIL");
  return failed?.detail.replace(/^FAIL:\s*/i, "") ?? "All audit checks passed";
}

function buildSimilarityChecks(
  combo: PresetLayoutAuditCombo,
  siblings: readonly PresetLayoutAuditCombo[],
): readonly PresetLayoutAuditCheck[] {
  const matching = siblings.filter((sibling) => sibling.fingerprint === combo.fingerprint && sibling.requestedStyle !== combo.requestedStyle);
  if (matching.length === 0) return [passCheck("sibling fingerprint", "PASS: unique primary-layout fingerprint among sibling styles")];

  const conflicting = matching.filter((sibling) => {
    if (combo.requestedStyle === "auto" || sibling.requestedStyle === "auto") return false;
    return sibling.resolvedInternalStyle !== combo.resolvedInternalStyle || sibling.requestedStyle !== combo.requestedStyle;
  });
  if (conflicting.length === 0) {
    return [
      passCheck(
        "sibling fingerprint",
        `PASS: shares fingerprint only with compatible sibling style(s): ${matching.map((sibling) => sibling.requestedStyle).join(", ")}`,
      ),
    ];
  }

  return [
    failCheck(
      "sibling fingerprint",
      `FAIL: shares fingerprint with sibling style(s): ${conflicting.map((sibling) => sibling.requestedStyle).join(", ")}`,
    ),
  ];
}

function withSuppressedAuditComposeLogs<T>(fn: () => T): T {
  const priorInfo = console.info;
  const priorWarn = console.warn;
  console.info = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.info = priorInfo;
    console.warn = priorWarn;
  }
}

function buildPresetLayoutAuditCombos(
  options: PresetLayoutAuditCliOptions,
): readonly PresetLayoutAuditCombo[] {
  const initialCombos: PresetLayoutAuditCombo[] = [];

  for (const preset of ROOM_SET_EVENT_INTENT_ARCHETYPES) {
    if (!presetMatchesFilter(preset, options.presetFilter)) continue;
    const plan = resolveRoomSetEventIntentPlan({
      intentId: preset.id,
      attendeeCount: options.attendees,
      densityPreference: "balanced",
      accessibilityPriority: false,
      enhancements: {},
    });
    const layoutType = plan.starterId;
    const primaryComponentId = plan.options.capacity?.primaryComponentId ?? defaultPrimaryForLayoutType(layoutType);
    const primaryComponentCapacity = plan.options.capacity?.primaryComponentCapacity ?? componentCapacity(primaryComponentId);
    const seedSpec = buildAuditSeedSpec({
      eventIntent: preset.id,
      layoutType,
      attendeeCount: options.attendees,
      primaryComponentId,
      primaryComponentCapacity,
    });
    const room = {
      widthLu: options.roomWidthLu ?? plan.boundary.widthLu,
      depthLu: options.roomDepthLu ?? plan.boundary.depthLu,
    };

    for (const styleOption of layoutStyleOptionsForIntent(preset.id)) {
      if (!styleMatchesFilter(styleOption, options.styleFilter)) continue;
      let executionError: string | null = null;
      let finalSpec: LayoutSpec | null = null;
      let placements: readonly RoomSetLayoutPlacement[] = [];
      let scene: PlannerScene | null = null;
      let composerWarnings: readonly string[] = [];
      let composeOk = false;
      let composeIssueText = "";

      try {
        const finalized = finalizeGenerateLayoutSpec({
          spec: seedSpec,
          prompt: `Generate a complete ${preset.label} room set for ${options.attendees} attendees.`,
          sidebarCount: options.attendees,
          sidebarDensityPreference: "auto",
          sidebarLayoutStyle: styleOption.id,
          roomWidthLu: room.widthLu,
          roomDepthLu: room.depthLu,
        });
        finalSpec = finalized.spec;
        const specToCompose = finalSpec;
        const composed = withSuppressedAuditComposeLogs(() =>
          composeLayoutSpec({
            spec: specToCompose,
            roomWidthLu: room.widthLu,
            roomDepthLu: room.depthLu,
          }),
        );
        composeOk = composed.ok;
        composeIssueText = composed.issues.map((issue) => issue.message).join(" | ");
        placements = composed.placements;
        scene = composed.scene;
        composerWarnings = composed.warnings;
      } catch (error) {
        executionError = error instanceof Error ? error.message : String(error);
      }

      const primaryId = finalSpec?.audience.primaryComponentId ?? primaryComponentId ?? null;
      const capacity = placements.length > 0 ? sumPlatedSeatCapacity(placements) : 0;
      const overlapCount = countIssue(placements, room.widthLu, room.depthLu, "overlap");
      const outOfBoundsCount = countIssue(placements, room.widthLu, room.depthLu, "out_of_bounds");
      const chairCheck = chairOrientationResult(placements, primaryId);
      const frontCheck = stageFrontZoneResult(placements, primaryId, room.depthLu);
      const aisleCheck = aisleCirculationResult(styleOption.id, placements, primaryId, room.widthLu);
      const primaryObjectCount = primaryPlacements(placements, primaryId).length;
      const layoutChecks = [
        ...layoutSpecificChecks({
          presetId: preset.id,
          layoutType: finalSpec?.layoutType ?? "unknown",
          requestedStyle: styleOption.id,
          resolvedStyle: finalSpec?.audienceStyle ?? "unknown",
          requestedAttendees: options.attendees,
          capacity,
          placements,
          primaryComponentId: primaryId,
          primaryObjectCount,
          room,
          composeOk: composeOk && executionError === null,
          composeIssueText,
        }),
        chairCheck,
        frontCheck,
        aisleCheck,
      ];
      const hardFailureChecks: PresetLayoutAuditCheck[] = [
        ...(executionError ? [failCheck("execution", `FAIL: ${executionError}`)] : []),
        ...(overlapCount > 0 ? [failCheck("overlap", `FAIL: ${overlapCount} overlap(s)`)] : [passCheck("overlap", "PASS: no overlaps")]),
        ...(outOfBoundsCount > 0 ? [failCheck("bounds", `FAIL: ${outOfBoundsCount} out-of-bounds object(s)`)] : [passCheck("bounds", "PASS: no out-of-bounds objects")]),
        ...layoutChecks,
      ];
      const technicalStatus = statusFromChecks(hardFailureChecks);
      const outputFolderPath = comboArtifactFolderPath(preset.id, styleOption.id);
      writePresetLayoutAuditComboArtifacts({
        presetName: preset.label,
        requestedStyle: styleOption.id,
        spec: finalSpec,
        placements,
        scene,
        room,
        folderPath: outputFolderPath,
      });

      initialCombos.push({
        presetId: preset.id,
        presetName: preset.label,
        requestedStyle: styleOption.id,
        requestedStyleLabel: styleOption.label,
        resolvedInternalStyle: finalSpec?.audienceStyle ?? "unknown",
        resolvedLayoutType: finalSpec?.layoutType ?? "unknown",
        requestedAttendees: options.attendees,
        placedAttendees: Math.min(options.attendees, capacity),
        capacity,
        primaryObjectCount,
        supportObjectCount: countSupportObjects(placements, primaryId),
        overlapCount,
        outOfBoundsCount,
        chairOrientationResult: chairCheck.detail,
        stageFrontZoneResult: frontCheck.detail,
        aisleCirculationResult: aisleCheck.detail,
        layoutSpecificContractChecks: layoutChecks,
        similarityFingerprintChecks: [],
        fingerprint: fingerprintPrimaryLayout(placements, primaryId),
        technicalStatus,
        status: technicalStatus,
        reason: comboReason({
          executionError,
          overlapCount,
          outOfBoundsCount,
          layoutChecks,
          similarityChecks: [],
        }),
        room,
        roomShell: room,
        primaryComponentId: primaryId,
        executionError,
        composerWarnings,
        outputFolderPath,
      });
    }
  }

  return initialCombos.map((combo) => {
    const siblings = initialCombos.filter((sibling) => sibling.presetId === combo.presetId);
    const similarityChecks = buildSimilarityChecks(combo, siblings);
    const status = statusFromChecks([
      ...(combo.technicalStatus === "FAIL" ? [failCheck("technical", combo.reason)] : []),
      ...similarityChecks,
    ]);
    return {
      ...combo,
      similarityFingerprintChecks: similarityChecks,
      status,
      reason: comboReason({
        executionError: combo.executionError,
        overlapCount: combo.overlapCount,
        outOfBoundsCount: combo.outOfBoundsCount,
        layoutChecks: combo.layoutSpecificContractChecks,
        similarityChecks,
      }),
    };
  });
}

function buildPresetLayoutAuditReport(
  options: PresetLayoutAuditCliOptions,
): PresetLayoutAuditReport {
  const combos = buildPresetLayoutAuditCombos(options);
  const lockedChecks = lockedRegressionChecks(combos);
  return {
    scenario: "preset-layout-audit",
    generatedAt: new Date().toISOString(),
    options,
    sourceOfTruth: {
      presets: "ROOM_SET_EVENT_INTENT_ARCHETYPES from lib/room-set/room-layout-starters.ts",
      styleOptions: "layoutStyleOptionsForIntent from lib/room-set/layout-style-options.ts",
    },
    summary: {
      comboCount: combos.length,
      pass: combos.filter((combo) => combo.status === "PASS").length,
      fail: combos.filter((combo) => combo.status === "FAIL").length,
      lockedRegressionPass: lockedChecks.filter((check) => check.status === "PASS").length,
      lockedRegressionFail: lockedChecks.filter((check) => check.status === "FAIL").length,
    },
    lockedRegressionChecks: lockedChecks,
    combos,
  };
}

function buildPresetLayoutAuditMarkdown(report: PresetLayoutAuditReport): string {
  const rowHeaders = ["Preset", "Style", "PASS/FAIL", "Why", "Image/output folder"];
  const renderRows = (rows: readonly (readonly (string | number | null)[])[]): string[] => [
    `| ${rowHeaders.map(markdownCell).join(" | ")} |`,
    `| ${rowHeaders.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ];
  const comboStyle = (combo: PresetLayoutAuditCombo): string =>
    `${combo.requestedStyleLabel} (${combo.requestedStyle})`;
  const comboWhy = (combo: PresetLayoutAuditCombo): string =>
    [
      combo.reason,
      `internal=${combo.resolvedInternalStyle}`,
      `layout=${combo.resolvedLayoutType}`,
      `roomShell.widthLu=${combo.roomShell.widthLu}`,
      `roomShell.depthLu=${combo.roomShell.depthLu}`,
      `requested=${combo.requestedAttendees}`,
      `placed=${combo.placedAttendees}`,
      `capacity=${combo.capacity}`,
      `primary=${combo.primaryObjectCount}`,
      `support=${combo.supportObjectCount}`,
      `overlaps=${combo.overlapCount}`,
      `outOfBounds=${combo.outOfBoundsCount}`,
      combo.chairOrientationResult,
      combo.stageFrontZoneResult,
      combo.aisleCirculationResult,
    ].join("; ");
  const comboRow = (combo: PresetLayoutAuditCombo): readonly (string | number | null)[] => [
    combo.presetName,
    comboStyle(combo),
    combo.status,
    comboWhy(combo),
    combo.outputFolderPath,
  ];

  const lockedRows = report.lockedRegressionChecks.map((check) => [
    "LOCKED REGRESSION CHECKS",
    check.name,
    check.status,
    check.detail,
    OUTPUT_ROOT,
  ]);

  const matrixRows = report.combos.map(comboRow);
  const failingCombos = report.combos.filter((combo) => combo.status === "FAIL");
  const failuresByReason = new Map<string, PresetLayoutAuditCombo[]>();
  for (const combo of failingCombos) {
    const bucket = failuresByReason.get(combo.reason) ?? [];
    bucket.push(combo);
    failuresByReason.set(combo.reason, bucket);
  }

  const fixPriority = (combo: PresetLayoutAuditCombo): number => {
    if (/intrude into the front zone/i.test(combo.reason)) return 1;
    if (/shares fingerprint/i.test(combo.reason)) return 2;
    if (/overlap/i.test(combo.reason)) return 3;
    if (/out-of-bounds/i.test(combo.reason)) return 4;
    return 5;
  };
  const nextFixRows = [...failingCombos]
    .sort((left, right) => fixPriority(left) - fixPriority(right) || left.presetName.localeCompare(right.presetName) || left.requestedStyle.localeCompare(right.requestedStyle))
    .map((combo, index) => [
      combo.presetName,
      comboStyle(combo),
      combo.status,
      `${index + 1}. ${fixPriority(combo) === 1 ? "Front-zone/table placement contract" : fixPriority(combo) === 2 ? "Make offered sibling styles visually distinct" : "Investigate remaining audit failure"}: ${combo.reason}`,
      combo.outputFolderPath,
    ]);

  return [
    "# Preset Layout Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 1. Summary Counts",
    "",
    `- Preset/style combos: ${report.summary.comboCount}`,
    `- Combo PASS: ${report.summary.pass}`,
    `- Combo FAIL: ${report.summary.fail}`,
    `- Locked regression PASS: ${report.summary.lockedRegressionPass}`,
    `- Locked regression FAIL: ${report.summary.lockedRegressionFail}`,
    `- Selected room size: ${presetLayoutAuditRoomSelectionLabel(report.options)}`,
    `- Selected attendee count: ${report.options.attendees}`,
    `- Preset filter: ${report.options.presetFilter ?? "all"}`,
    `- Style filter: ${report.options.styleFilter ?? "all"}`,
    `- Markdown report: ${PRESET_LAYOUT_AUDIT_MD_PATH}`,
    `- JSON report: ${PRESET_LAYOUT_AUDIT_JSON_PATH}`,
    `- Combo artifact root: ${PRESET_LAYOUT_AUDIT_ARTIFACT_ROOT}`,
    "",
    "Sources:",
    "",
    `- Presets: ${report.sourceOfTruth.presets}`,
    `- Style options: ${report.sourceOfTruth.styleOptions}`,
    "",
    "## 2. LOCKED REGRESSION CHECKS",
    "",
    ...renderRows(lockedRows),
    "",
    "## 3. PRESET / STYLE PASS-FAIL MATRIX",
    "",
    ...renderRows(matrixRows),
    "",
    "## 4. FAILURES ONLY",
    "",
    ...(failingCombos.length === 0
      ? ["No failing preset/style combos."]
      : [...failuresByReason.entries()].flatMap(([reason, combos]) => [
          `### ${reason}`,
          "",
          ...renderRows(combos.map(comboRow)),
          "",
        ])),
    "",
    "## 5. NEXT FIX ORDER",
    "",
    ...(nextFixRows.length === 0
      ? ["No active layout failures to fix."]
      : renderRows(nextFixRows)),
    "",
  ].join("\n");
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapSvgText(value: string, maxChars: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function layoutPngPathForCombo(combo: PresetLayoutAuditCombo): string | null {
  if (!combo.outputFolderPath) return null;
  return join(combo.outputFolderPath, "layout.png");
}

function failureReviewRow(combo: PresetLayoutAuditCombo): readonly string[] {
  const layoutPngPath = layoutPngPathForCombo(combo);
  return [
    combo.presetName,
    `${combo.requestedStyleLabel} (${combo.requestedStyle})`,
    `${combo.roomShell.widthLu} x ${combo.roomShell.depthLu} LU`,
    String(combo.requestedAttendees),
    combo.reason,
    layoutPngPath ?? "",
    combo.outputFolderPath ?? "",
  ];
}

function buildPresetLayoutAuditFailuresReviewMarkdown(report: PresetLayoutAuditReport): string {
  const failedCombos = report.combos.filter((combo) => combo.status === "FAIL");
  const headers = [
    "Preset",
    "Style",
    "Room size",
    "Attendee count",
    "Fail reason",
    "layout.png path",
    "Artifact folder path",
  ];
  const rows = failedCombos.map(failureReviewRow);
  return [
    "# Preset Layout Audit Failures Review",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Failure count: ${failedCombos.length}`,
    `Selected room size: ${presetLayoutAuditRoomSelectionLabel(report.options)}`,
    `Selected attendee count: ${report.options.attendees}`,
    `Preset filter: ${report.options.presetFilter ?? "all"}`,
    `Style filter: ${report.options.styleFilter ?? "all"}`,
    `Contact sheet: ${PRESET_LAYOUT_AUDIT_FAILURES_CONTACT_SHEET_PATH}`,
    "",
    "| " + headers.map(markdownCell).join(" | ") + " |",
    "| " + headers.map(() => "---").join(" | ") + " |",
    ...rows.map((row) => "| " + row.map(markdownCell).join(" | ") + " |"),
    "",
  ].join("\n");
}

function allCombosReviewRow(combo: PresetLayoutAuditCombo): readonly string[] {
  const layoutPngPath = layoutPngPathForCombo(combo);
  return [
    combo.presetName,
    `${combo.requestedStyleLabel} (${combo.requestedStyle})`,
    combo.status,
    `${combo.roomShell.widthLu} x ${combo.roomShell.depthLu} LU`,
    String(combo.requestedAttendees),
    layoutPngPath ?? "",
    combo.outputFolderPath ?? "",
  ];
}

function buildPresetLayoutAuditAllCombosReviewMarkdown(report: PresetLayoutAuditReport): string {
  const headers = [
    "Preset",
    "Style",
    "PASS/FAIL",
    "Room size",
    "Attendees",
    "layout.png path",
    "Artifact folder path",
  ];
  const rows = report.combos.map(allCombosReviewRow);
  return [
    "# Preset Layout Audit All Combos Review",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Combo count: ${report.summary.comboCount}`,
    `Selected room size: ${presetLayoutAuditRoomSelectionLabel(report.options)}`,
    `Selected attendee count: ${report.options.attendees}`,
    `Preset filter: ${report.options.presetFilter ?? "all"}`,
    `Style filter: ${report.options.styleFilter ?? "all"}`,
    `Contact sheet: ${PRESET_LAYOUT_AUDIT_ALL_COMBOS_CONTACT_SHEET_PATH}`,
    "",
    "| " + headers.map(markdownCell).join(" | ") + " |",
    "| " + headers.map(() => "---").join(" | ") + " |",
    ...rows.map((row) => "| " + row.map(markdownCell).join(" | ") + " |"),
    "",
  ].join("\n");
}

function comboGroupsByPreset(
  combos: readonly PresetLayoutAuditCombo[],
): Array<Readonly<{ presetName: string; combos: readonly PresetLayoutAuditCombo[] }>> {
  const groups: Array<{ presetName: string; combos: PresetLayoutAuditCombo[] }> = [];
  const byName = new Map<string, PresetLayoutAuditCombo[]>();
  for (const combo of combos) {
    let group = byName.get(combo.presetName);
    if (!group) {
      group = [];
      byName.set(combo.presetName, group);
      groups.push({ presetName: combo.presetName, combos: group });
    }
    group.push(combo);
  }
  return groups;
}

async function writePresetLayoutAuditAllCombosContactSheet(
  report: PresetLayoutAuditReport,
): Promise<boolean> {
  if (report.combos.length === 0) return false;

  try {
    const { default: sharp } = await import("sharp");
    const columns = 3;
    const cardWidth = 560;
    const cardHeight = 410;
    const imageWidth = 512;
    const imageHeight = 288;
    const gap = 24;
    const pad = 28;
    const titleHeight = 104;
    const groupHeaderHeight = 44;
    const groupGap = 26;
    const groups = comboGroupsByPreset(report.combos);
    const width = pad * 2 + columns * cardWidth + (columns - 1) * gap;
    let height = titleHeight + pad;
    for (const group of groups) {
      const rows = Math.ceil(group.combos.length / columns);
      height += groupHeaderHeight + rows * cardHeight + Math.max(0, rows - 1) * gap + groupGap;
    }
    height += pad;

    let globalIndex = 0;
    let cursorY = titleHeight;
    const sections: string[] = [];
    for (const group of groups) {
      const groupRows = Math.ceil(group.combos.length / columns);
      sections.push(
        `<text x="${pad}" y="${cursorY + 26}" font-family="ui-sans-serif, system-ui" font-size="22" font-weight="800" fill="#0f172a">${escapeSvgText(group.presetName)}</text>`,
        `<line x1="${pad}" y1="${cursorY + 38}" x2="${width - pad}" y2="${cursorY + 38}" stroke="#cbd5e1" stroke-width="1"/>`,
      );
      const cardsTop = cursorY + groupHeaderHeight;

      for (let index = 0; index < group.combos.length; index += 1) {
        const combo = group.combos[index]!;
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = pad + col * (cardWidth + gap);
        const y = cardsTop + row * (cardHeight + gap);
        const pngPath = layoutPngPathForCombo(combo);
        const imageHref =
          pngPath && existsSync(pngPath)
            ? `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`
            : "";
        const statusFill = combo.status === "PASS" ? "#dcfce7" : "#fee2e2";
        const statusStroke = combo.status === "PASS" ? "#16a34a" : "#dc2626";
        const statusText = combo.status === "PASS" ? "#166534" : "#991b1b";
        const styleLines = wrapSvgText(`${combo.requestedStyleLabel} (${combo.requestedStyle})`, 54).slice(0, 2);
        const meta = `${combo.roomShell.widthLu} x ${combo.roomShell.depthLu} LU | ${combo.requestedAttendees} attendees`;
        const styleSvg = styleLines
          .map(
            (line, lineIndex) =>
              `<text x="${x + 20}" y="${y + imageHeight + 78 + lineIndex * 18}" font-family="ui-sans-serif, system-ui" font-size="14" fill="#0f172a">${escapeSvgText(line)}</text>`,
          )
          .join("");
        sections.push(
          `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2"/>`,
          imageHref
            ? `<image x="${x + 24}" y="${y + 20}" width="${imageWidth}" height="${imageHeight}" href="${imageHref}" preserveAspectRatio="xMidYMid meet"/>`
            : `<rect x="${x + 24}" y="${y + 20}" width="${imageWidth}" height="${imageHeight}" fill="#f8fafc" stroke="#cbd5e1"/>`,
          `<rect x="${x + 20}" y="${y + imageHeight + 42}" width="72" height="28" rx="14" fill="${statusFill}" stroke="${statusStroke}" stroke-width="1"/>`,
          `<text x="${x + 56}" y="${y + imageHeight + 61}" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="13" font-weight="800" fill="${statusText}">${combo.status}</text>`,
          `<text x="${x + 104}" y="${y + imageHeight + 61}" font-family="ui-sans-serif, system-ui" font-size="14" fill="#475569">${escapeSvgText(meta)}</text>`,
          `<text x="${x + cardWidth - 22}" y="${y + imageHeight + 61}" text-anchor="end" font-family="ui-sans-serif, system-ui" font-size="12" fill="#64748b">#${globalIndex + 1}</text>`,
          styleSvg,
        );
        globalIndex += 1;
      }

      cursorY += groupHeaderHeight + groupRows * cardHeight + Math.max(0, groupRows - 1) * gap + groupGap;
    }

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="100%" height="100%" fill="#f1f5f9"/>`,
      `<text x="${pad}" y="34" font-family="ui-sans-serif, system-ui" font-size="24" font-weight="800" fill="#0f172a">Preset Layout Audit All Combos Contact Sheet</text>`,
      `<text x="${pad}" y="58" font-family="ui-sans-serif, system-ui" font-size="14" fill="#475569">${report.summary.comboCount} preset/style combos | PASS ${report.summary.pass} | FAIL ${report.summary.fail} | generated ${escapeSvgText(report.generatedAt)}</text>`,
      `<text x="${pad}" y="78" font-family="ui-sans-serif, system-ui" font-size="14" fill="#475569">Selected room ${escapeSvgText(presetLayoutAuditRoomSelectionLabel(report.options))} | ${report.options.attendees} attendees | preset ${escapeSvgText(report.options.presetFilter ?? "all")} | style ${escapeSvgText(report.options.styleFilter ?? "all")}</text>`,
      sections.join(""),
      "</svg>",
    ].join("");

    await sharp(Buffer.from(svg)).png().toFile(PRESET_LAYOUT_AUDIT_ALL_COMBOS_CONTACT_SHEET_PATH);
    return existsSync(PRESET_LAYOUT_AUDIT_ALL_COMBOS_CONTACT_SHEET_PATH);
  } catch (error) {
    console.warn(
      `Preset layout audit all-combos contact sheet could not be generated: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

async function writePresetLayoutAuditFailuresContactSheet(
  report: PresetLayoutAuditReport,
): Promise<boolean> {
  const failedCombos = report.combos.filter((combo) => combo.status === "FAIL");
  if (failedCombos.length === 0) return false;

  try {
    const { default: sharp } = await import("sharp");
    const columns = 3;
    const cardWidth = 560;
    const cardHeight = 430;
    const imageWidth = 512;
    const imageHeight = 288;
    const gap = 24;
    const pad = 28;
    const titleHeight = 88;
    const rows = Math.ceil(failedCombos.length / columns);
    const width = pad * 2 + columns * cardWidth + (columns - 1) * gap;
    const height = titleHeight + pad + rows * cardHeight + (rows - 1) * gap + pad;

    const cards = failedCombos.map((combo, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = pad + col * (cardWidth + gap);
      const y = titleHeight + row * (cardHeight + gap);
      const pngPath = layoutPngPathForCombo(combo);
      const imageHref =
        pngPath && existsSync(pngPath)
          ? `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`
          : "";
      const heading = `${index + 1}. ${combo.presetName} / ${combo.requestedStyleLabel}`;
      const meta = `${combo.roomShell.widthLu} x ${combo.roomShell.depthLu} LU | ${combo.requestedAttendees} attendees`;
      const reasonLines = wrapSvgText(combo.reason, 64).slice(0, 3);
      const reasonSvg = reasonLines
        .map(
          (line, lineIndex) =>
            `<text x="${x + 20}" y="${y + imageHeight + 92 + lineIndex * 18}" font-family="ui-sans-serif, system-ui" font-size="14" fill="#991b1b">${escapeSvgText(line)}</text>`,
        )
        .join("");
      return [
        `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2"/>`,
        imageHref
          ? `<image x="${x + 24}" y="${y + 20}" width="${imageWidth}" height="${imageHeight}" href="${imageHref}" preserveAspectRatio="xMidYMid meet"/>`
          : `<rect x="${x + 24}" y="${y + 20}" width="${imageWidth}" height="${imageHeight}" fill="#f8fafc" stroke="#cbd5e1"/>`,
        `<text x="${x + 20}" y="${y + imageHeight + 52}" font-family="ui-sans-serif, system-ui" font-size="16" font-weight="700" fill="#0f172a">${escapeSvgText(heading)}</text>`,
        `<text x="${x + 20}" y="${y + imageHeight + 72}" font-family="ui-sans-serif, system-ui" font-size="13" fill="#475569">${escapeSvgText(meta)}</text>`,
        reasonSvg,
      ].join("");
    });

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="100%" height="100%" fill="#f1f5f9"/>`,
      `<text x="${pad}" y="34" font-family="ui-sans-serif, system-ui" font-size="24" font-weight="800" fill="#0f172a">Preset Layout Audit Failure Contact Sheet</text>`,
      `<text x="${pad}" y="58" font-family="ui-sans-serif, system-ui" font-size="14" fill="#475569">${failedCombos.length} failed preset/style combos | generated ${escapeSvgText(report.generatedAt)}</text>`,
      `<text x="${pad}" y="78" font-family="ui-sans-serif, system-ui" font-size="14" fill="#475569">Selected room ${escapeSvgText(presetLayoutAuditRoomSelectionLabel(report.options))} | ${report.options.attendees} attendees | preset ${escapeSvgText(report.options.presetFilter ?? "all")} | style ${escapeSvgText(report.options.styleFilter ?? "all")}</text>`,
      cards.join(""),
      "</svg>",
    ].join("");

    await sharp(Buffer.from(svg)).png().toFile(PRESET_LAYOUT_AUDIT_FAILURES_CONTACT_SHEET_PATH);
    return existsSync(PRESET_LAYOUT_AUDIT_FAILURES_CONTACT_SHEET_PATH);
  } catch (error) {
    console.warn(
      `Preset layout audit contact sheet could not be generated: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

async function runPresetLayoutAuditScenario(
  options: PresetLayoutAuditCliOptions,
): Promise<PresetLayoutAuditReport> {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  mkdirSync(PRESET_LAYOUT_AUDIT_ARTIFACT_ROOT, { recursive: true });
  const report = buildPresetLayoutAuditReport(options);
  writeJsonFile(PRESET_LAYOUT_AUDIT_JSON_PATH, report);
  writeFileSync(PRESET_LAYOUT_AUDIT_MD_PATH, buildPresetLayoutAuditMarkdown(report), "utf8");
  writeFileSync(
    PRESET_LAYOUT_AUDIT_FAILURES_REVIEW_PATH,
    buildPresetLayoutAuditFailuresReviewMarkdown(report),
    "utf8",
  );
  writeFileSync(
    PRESET_LAYOUT_AUDIT_ALL_COMBOS_REVIEW_PATH,
    buildPresetLayoutAuditAllCombosReviewMarkdown(report),
    "utf8",
  );
  const contactSheetWritten = await writePresetLayoutAuditFailuresContactSheet(report);
  const allCombosContactSheetWritten = await writePresetLayoutAuditAllCombosContactSheet(report);

  console.info(
    `Preset layout audit | combos=${report.summary.comboCount} | pass=${report.summary.pass} | fail=${report.summary.fail} | lockedPass=${report.summary.lockedRegressionPass} | lockedFail=${report.summary.lockedRegressionFail}`,
  );
  console.info(
    `Preset layout audit options | room=${presetLayoutAuditRoomSelectionLabel(options)} | attendees=${options.attendees} | preset=${options.presetFilter ?? "all"} | style=${options.styleFilter ?? "all"}`,
  );
  console.info(`Preset layout audit Markdown written to ${PRESET_LAYOUT_AUDIT_MD_PATH}`);
  console.info(`Preset layout audit JSON written to ${PRESET_LAYOUT_AUDIT_JSON_PATH}`);
  console.info(`Preset layout audit failures review written to ${PRESET_LAYOUT_AUDIT_FAILURES_REVIEW_PATH}`);
  console.info(`Preset layout audit all-combos review written to ${PRESET_LAYOUT_AUDIT_ALL_COMBOS_REVIEW_PATH}`);
  console.info(
    contactSheetWritten
      ? `Preset layout audit failures contact sheet written to ${PRESET_LAYOUT_AUDIT_FAILURES_CONTACT_SHEET_PATH}`
      : "Preset layout audit failures contact sheet was not generated.",
  );
  console.info(
    allCombosContactSheetWritten
      ? `Preset layout audit all-combos contact sheet written to ${PRESET_LAYOUT_AUDIT_ALL_COMBOS_CONTACT_SHEET_PATH}`
      : "Preset layout audit all-combos contact sheet was not generated.",
  );
  for (const combo of report.combos) {
    console.info(
      `${combo.status} | ${combo.presetName} | style=${combo.requestedStyle} | internal=${combo.resolvedInternalStyle} | layout=${combo.resolvedLayoutType} | reason=${combo.reason}`,
    );
  }

  if (report.summary.fail > 0 || report.summary.lockedRegressionFail > 0) {
    process.exitCode = 1;
  }
  return report;
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const args = process.argv.slice(2);
  const scenarioFilter = parseScenarioFilter(args);
  if (process.exitCode) return;

  if (scenarioFilter === "preset-layout-audit") {
    const auditOptions = parsePresetLayoutAuditCliOptions(args);
    if (process.exitCode) return;
    await runPresetLayoutAuditScenario(auditOptions);
    process.exit(process.exitCode ?? 0);
    return;
  }

  const scenarios = filterScenarios(buildDefaultPlannerSimulationScenarios(), scenarioFilter);
  if (scenarios.length === 0) {
    console.error(`No scenarios matched --scenario ${scenarioFilter}`);
    process.exitCode = 1;
    return;
  }

  const suite = runPlannerSimulationSuite(scenarios);
  for (const scenario of suite.scenarios) {
    for (const step of scenario.steps) {
      writeStepArtifacts(step);
      logStep(step);
    }
  }

  const steps = suite.scenarios.flatMap((scenario) => scenario.steps);
  const summaryTable = buildSummaryTable(steps);
  writeJsonFile(join(OUTPUT_ROOT, "summary.json"), suite);
  writeFileSync(SUMMARY_TABLE_PATH, summaryTable, "utf8");

  console.info("\nSummary table");
  console.info(summaryTable);
  console.info(
    `Summary | scenarioFilter=${scenarioFilter} | scenarios=${suite.summary.scenarioCount} | steps=${suite.summary.stepCount} | pass=${suite.summary.pass} | warn=${suite.summary.warn} | fail=${suite.summary.fail}`,
  );
  console.info(`Artifacts written to ${OUTPUT_ROOT}`);
  console.info(`Summary table written to ${SUMMARY_TABLE_PATH}`);

  if (suite.summary.fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
