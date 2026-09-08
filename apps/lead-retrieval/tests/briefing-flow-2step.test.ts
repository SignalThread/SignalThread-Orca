import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  batchBriefingsPath,
  batchBriefingsContextPath,
  batchBriefingsKnowledgePath,
  batchBriefingsReviewBrowseApprovedPath,
  batchBriefingsReviewPath,
  BRIEFING_REVIEW_BROWSE_APPROVED_PARAM,
  EXHIBITOR_BRIEFINGS_BATCHES_PATH,
  EXHIBITOR_BRIEFINGS_PATH,
  EXHIBITOR_BRIEFINGS_SETUP_PATH,
} from "../lib/import-wizard/paths";
import { EVENT_GOAL_OPTIONS, parseBatchBriefingContext, hasBatchBriefingContext } from "../lib/import-wizard/batch-briefing-context";

const here = dirname(fileURLToPath(import.meta.url));
const legacyBriefingsBase = join(here, "..", "app", "(app)", "exhibitor", "import", "[batchId]", "briefings");
const newBriefingsBase = join(here, "..", "app", "(app)", "exhibitor", "briefings");
const componentsExhibitor = join(here, "..", "components", "exhibitor");

describe("AI Briefings — route structure", () => {
  it("default landing /exhibitor/briefings is unified hub (strategy + workspaces)", () => {
    const src = readFileSync(join(newBriefingsBase, "page.tsx"), "utf8");
    assert.ok(src.includes("BriefingSetupClient"), "strategy block");
    assert.ok(src.includes("BriefingsWorkspacesSection"), "workspaces on same page");
    assert.ok(src.includes("briefings-unified-hub"), "hub test id");
  });

  it("/exhibitor/briefings/batches redirects to unified hub", () => {
    const src = readFileSync(join(newBriefingsBase, "batches", "page.tsx"), "utf8");
    assert.ok(src.includes("redirect"), "redirect");
    assert.ok(src.includes("EXHIBITOR_BRIEFINGS_PATH"), "to root hub");
  });

  it("legacy /briefings/setup redirects to Briefings root (Setup)", () => {
    const src = readFileSync(join(newBriefingsBase, "setup", "page.tsx"), "utf8");
    assert.ok(src.includes("redirect"), "should redirect");
    assert.ok(src.includes("EXHIBITOR_BRIEFINGS_PATH"), "to root");
  });

  it("batch workspace readiness exists under /exhibitor/briefings/[batchId]", () => {
    assert.ok(existsSync(join(newBriefingsBase, "[batchId]", "page.tsx")));
  });

  it("batch workspace review exists", () => {
    assert.ok(existsSync(join(newBriefingsBase, "[batchId]", "review", "page.tsx")));
  });

  it("legacy import briefings redirect to new batch workspace", () => {
    const src = readFileSync(join(legacyBriefingsBase, "page.tsx"), "utf8");
    assert.ok(src.includes("redirect"), "should redirect");
    assert.ok(src.includes("batchBriefingsPath"), "to new workspace");
  });

  it("legacy /briefings/context redirects to Setup", () => {
    const src = readFileSync(join(legacyBriefingsBase, "context", "page.tsx"), "utf8");
    assert.ok(src.includes("redirect"), "should redirect");
    assert.ok(src.includes("EXHIBITOR_BRIEFINGS_SETUP_PATH"), "to setup");
  });

  it("legacy /briefings/knowledge redirects to Setup", () => {
    const src = readFileSync(join(legacyBriefingsBase, "knowledge", "page.tsx"), "utf8");
    assert.ok(src.includes("redirect"), "should redirect");
    assert.ok(src.includes("EXHIBITOR_BRIEFINGS_SETUP_PATH"), "to setup");
  });

  it("legacy /briefings/view redirects to review", () => {
    const src = readFileSync(join(legacyBriefingsBase, "view", "page.tsx"), "utf8");
    assert.ok(src.includes("redirect"), "should redirect");
    assert.ok(src.includes("batchBriefingsReviewPath"), "to review path");
  });
});

describe("AI Briefings — path helpers", () => {
  it("batchBriefingsPath returns batch workspace readiness URL", () => {
    assert.equal(batchBriefingsPath("abc-123"), "/exhibitor/briefings/abc-123");
  });

  it("batchBriefingsContextPath remains legacy URL (redirects)", () => {
    assert.equal(batchBriefingsContextPath("abc-123"), "/exhibitor/import/abc-123/briefings/context");
  });

  it("batchBriefingsReviewPath returns review URL", () => {
    assert.equal(batchBriefingsReviewPath("abc-123"), "/exhibitor/briefings/abc-123/review");
  });

  it("batchBriefingsReviewBrowseApprovedPath adds browseApproved=1 for the same run", () => {
    assert.equal(
      batchBriefingsReviewBrowseApprovedPath("run-batch-9"),
      `/exhibitor/briefings/run-batch-9/review?${BRIEFING_REVIEW_BROWSE_APPROVED_PARAM}=1`
    );
  });

  it("batchBriefingsKnowledgePath returns top-level Setup (ignores batch id)", () => {
    assert.equal(batchBriefingsKnowledgePath("abc-123"), EXHIBITOR_BRIEFINGS_SETUP_PATH);
  });

  it("EXHIBITOR_BRIEFINGS_SETUP_PATH equals default Briefings landing", () => {
    assert.equal(EXHIBITOR_BRIEFINGS_SETUP_PATH, EXHIBITOR_BRIEFINGS_PATH);
  });

  it("EXHIBITOR_BRIEFINGS_BATCHES_PATH remains legacy workspaces URL (redirects to hub)", () => {
    assert.equal(EXHIBITOR_BRIEFINGS_BATCHES_PATH, "/exhibitor/briefings/batches");
  });
});

describe("AI Briefings — readiness client", () => {
  const src = readFileSync(join(componentsExhibitor, "brief-readiness-client.tsx"), "utf8");

  it("uses batch workspace shell", () => {
    assert.ok(src.includes("BriefingBatchWorkspaceShell"), "workspace shell");
    assert.ok(src.includes("briefing-batch-workspace"), "test id");
  });

  it("links to Briefings hub and Review", () => {
    assert.ok(src.includes("EXHIBITOR_BRIEFINGS_SETUP_PATH"), "hub / strategy route");
    assert.ok(src.includes("AI Briefing Strategy"), "strategy label copy");
    assert.ok(src.includes("batchBriefingsReviewPath"), "review");
  });

  it("has batch notes (batch-scoped) with autosave status", () => {
    assert.ok(src.includes("readiness-batch-notes"), "batch notes section");
    assert.ok(src.includes("readiness-batch-notes-save-status"), "save status");
  });

  it("has individual lead context panel and leads table", () => {
    assert.ok(src.includes("readiness-context-panel"), "context slide-over");
    assert.ok(src.includes("save_manual_context"), "save individual context");
    assert.ok(src.includes("readiness-leads-table"), "leads table");
  });
});

describe("AI Briefings — Setup client", () => {
  const src = readFileSync(join(componentsExhibitor, "briefing-setup-client.tsx"), "utf8");

  it("uses event briefing-setup API for foundations", () => {
    assert.ok(src.includes("briefing-setup"), "setup API");
    assert.ok(src.includes("batch-context-product"), "product field");
    assert.ok(src.includes("batch-context-persona"), "persona");
    assert.ok(src.includes("batch-context-goal"), "goal");
    const iProd = src.indexOf('id="bk-product"');
    const iGoal = src.indexOf('id="bk-goal"');
    const iPersona = src.indexOf('id="bk-persona"');
    assert.ok(iProd >= 0 && iGoal > iProd, "product focus appears before event goal");
    assert.ok(iPersona > iGoal, "target audience follows product focus and event goal in source order");
    assert.ok(src.includes("batch-context-tone"), "tone of voice");
    assert.ok(src.includes("batch-context-tone-pills"), "tone pills");
    assert.ok(src.includes("AUTOSAVE_DEBOUNCE_MS"), "debounced autosave");
    assert.ok(!src.includes("batch-context-notes"), "batch notes not in Setup");
  });

  it("uses a single Setup page without nested Strategy vs Sources tabs", () => {
    assert.ok(!src.includes("briefing-knowledge-tab-strategy"), "no nested strategy tab");
    assert.ok(!src.includes("briefing-knowledge-tab-sources"), "no nested sources tab");
    assert.ok(src.includes("briefing-knowledge-sources"), "reference / sources section");
    assert.ok(src.includes("briefing-knowledge-ai-behavior"), "voice / AI behavior section");
  });

  it("uses one parent collapsible for briefing strategy (not per-field accordions)", () => {
    assert.ok(src.includes("briefing-strategy-main-accordion"), "single strategy accordion container");
    assert.ok(src.includes("briefing-strategy-status-summary"), "strategy status summary hook");
    assert.ok(src.includes("Strategy"), "single top-level strategy header");
    assert.ok(src.includes("Edit strategy"), "edit strategy affordance");
    assert.ok(src.includes("Advanced context optional"), "compact collapsed summary keeps advanced context secondary");
    assert.ok(!src.includes("briefing-strategy-accordion-"), "no per-section accordion test ids");
    assert.ok(!src.includes("Expand all"), "no expand-all for multi-accordions");
    assert.ok(!src.includes("Collapse all"), "no collapse-all for multi-accordions");
  });

  it("renders the setup fields as a responsive workspace grid", () => {
    assert.ok(src.includes("md:grid-cols-2"), "two-column tablet and desktop grid");
    assert.ok(src.includes("Product Focus"), "product focus card");
    assert.ok(src.includes("Event Goal"), "event goal card");
    assert.ok(src.includes("Target Audience"), "audience card");
    assert.ok(src.includes("Tone / Voice"), "tone card");
  });

  it("treats supporting context as a collapsed advanced section", () => {
    assert.ok(src.includes("Supporting Context (Advanced)"), "advanced supporting context label");
    assert.ok(src.includes("Optional"), "optional badge");
    assert.ok(src.includes("Manage sources"), "secondary inline sources controls");
  });

  it("loads knowledge with setup=1", () => {
    assert.ok(src.includes("briefing-knowledge?setup=1"), "setup-scoped knowledge list");
    assert.ok(src.includes("setup: true"), "POST uses setup flag");
  });

  it("links to workspaces anchor on the unified hub", () => {
    assert.ok(src.includes("#briefings-workspaces"), "scroll target");
    assert.ok(src.includes("EXHIBITOR_BRIEFINGS_PATH"), "hub path");
  });
});

describe("AI Briefings — review client", () => {
  const src = readFileSync(join(componentsExhibitor, "review-brief-client.tsx"), "utf8");

  it("uses batch workspace shell", () => {
    assert.ok(src.includes("BriefingBatchWorkspaceShell"), "workspace shell");
  });

  it("has approve actions and brief sections", () => {
    assert.ok(src.includes("review-approve"), "approve");
    assert.ok(src.includes("ImportBriefingViewSections"), "sections");
  });

  it("links back to unified hub workspaces anchor", () => {
    assert.ok(src.includes("EXHIBITOR_BRIEFINGS_PATH"), "hub");
    assert.ok(src.includes("#briefings-workspaces"), "workspaces fragment");
    assert.ok(src.includes("EXHIBITOR_BRIEFINGS_SETUP_PATH"), "strategy / hub root");
  });

  it("fetches knowledge counts with setup=1", () => {
    assert.ok(src.includes("/api/exhibitor/briefing-knowledge?setup=1"), "counts");
  });
});

describe("AI Briefings — unified hub layout", () => {
  it("layout does not mount Strategy / Workspaces tabs", () => {
    const layoutSrc = readFileSync(join(newBriefingsBase, "layout.tsx"), "utf8");
    assert.ok(!layoutSrc.includes("BriefingsTopNav"), "no tab strip");
    assert.ok(!layoutSrc.includes("briefings-tab-"), "no tab hooks");
  });

  it("workspaces section exposes stable anchor + list test ids", () => {
    const src = readFileSync(join(componentsExhibitor, "briefings-workspaces-section.tsx"), "utf8");
    assert.ok(src.includes('id="briefings-workspaces"'), "anchor id");
    assert.ok(src.includes("exhibitor-briefings-index"), "list shell id");
  });
});

describe("Batch briefing context types", () => {
  it("EVENT_GOAL_OPTIONS has realistic options", () => {
    assert.ok(EVENT_GOAL_OPTIONS.length >= 5, "should have multiple goal options");
    const labels = EVENT_GOAL_OPTIONS.map((o) => o.label);
    assert.ok(labels.some((l) => l.includes("Pipeline")), "should have pipeline option");
  });

  it("parseBatchBriefingContext handles null/undefined", () => {
    assert.deepStrictEqual(parseBatchBriefingContext(null), {});
    assert.deepStrictEqual(parseBatchBriefingContext(undefined), {});
  });

  it("parseBatchBriefingContext extracts valid fields", () => {
    const ctx = parseBatchBriefingContext({ productFocus: "CRM", eventGoal: "generate_pipeline", extra: true });
    assert.equal(ctx.productFocus, "CRM");
    assert.equal(ctx.eventGoal, "generate_pipeline");
  });

  it("parseBatchBriefingContext reads guardrails", () => {
    const ctx = parseBatchBriefingContext({
      guardrails: { excludeUnverifiedSources: true, neutralToneBias: false },
    });
    assert.equal(ctx.guardrails?.excludeUnverifiedSources, true);
    assert.equal(ctx.guardrails?.neutralToneBias, false);
  });

  it("hasBatchBriefingContext detects non-empty context", () => {
    assert.equal(hasBatchBriefingContext({}), false);
    assert.equal(hasBatchBriefingContext({ productFocus: "" }), false);
    assert.equal(hasBatchBriefingContext({ productFocus: "CRM" }), true);
    assert.equal(hasBatchBriefingContext({ eventGoal: "lead_generation" }), true);
    assert.equal(hasBatchBriefingContext({ toneOfVoice: "Authoritative" }), true);
  });
});
