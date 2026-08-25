import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getArticleBySlug } from "./help-content.server";
import {
  buildContextualHelpHref,
  CONTEXTUAL_HELP_MAPPINGS,
  getContextualHelpMapping,
  getSafeHelpReturnTarget,
  resolveContextualHelp,
} from "./contextual-help";

test("route mapping covers required account-level surfaces", () => {
  const expected = new Map([
    ["/dashboard", "use-the-account-command-center"],
    ["/dashboard/action-center", "use-the-action-center"],
    ["/events", "use-the-account-command-center"],
    ["/reports", "understand-portfolio-reports-and-activity"],
    ["/settings", "use-workspace-settings"],
  ]);
  for (const [route, article] of expected) assert.equal(getContextualHelpMapping(route)?.articleSlug, article, route);
});

test("route mapping covers required event-level surfaces", () => {
  const expected = new Map([
    ["/events/e-1", "use-the-event-command-center"],
    ["/events/e-1/timeline", "use-the-roadmap"],
    ["/events/e-1/budget", "use-the-budget-dashboard"],
    ["/events/e-1/matrix", "use-the-run-of-show"],
    ["/events/e-1/matrix-2", "use-the-run-of-show"],
    ["/events/e-1/matrix/sessions/s-1", "use-the-session-workspace"],
    ["/events/e-1/directory", "use-the-directory"],
    ["/events/e-1/attendees", "manage-attendees"],
    ["/events/e-1/speakers", "manage-speakers"],
    ["/events/e-1/speakers/p-1", "manage-speakers"],
    ["/events/e-1/docs", "use-the-docs-hub"],
    ["/events/e-1/marketing", "use-marketing"],
    ["/events/e-1/fnb-catalog", "use-the-fnb-catalog"],
    ["/events/e-1/settings", "configure-event-settings"],
  ]);
  for (const [route, article] of expected) assert.equal(getContextualHelpMapping(route)?.articleSlug, article, route);
});

test("dynamic organizations, nested pages, query strings, and trailing slashes resolve centrally", () => {
  assert.equal(getContextualHelpMapping("/organizations/org-7/dashboard/")?.articleSlug, "use-the-account-command-center");
  assert.equal(getContextualHelpMapping("/organizations/org-7/events/e-2/speakers/p-9/preview?tab=documents")?.articleSlug, "manage-speakers");
  assert.equal(getContextualHelpMapping("/events/e-2/matrix/sessions/s-8/notes")?.articleSlug, "use-the-session-workspace");
  assert.equal(getContextualHelpMapping("/events/e-2/budget/approvals")?.articleSlug, "use-the-budget-dashboard");
  assert.equal(getContextualHelpMapping("/events/e-2/budget?view=grid&focus=private")?.articleSlug, "manage-the-full-budget-grid");
});

test("unmapped visible routes fall back safely and excluded routes expose no action", () => {
  const eventFallback = resolveContextualHelp("/events/e-1/reports?privateEventName=Secret");
  assert.equal(eventFallback?.kind, "category");
  assert.match(eventFallback?.href ?? "", /^\/help\/category\/event-planning\?from=/);
  assert.doesNotMatch(eventFallback?.href ?? "", /privateEventName|Secret/);

  assert.equal(resolveContextualHelp("/budgets")?.kind, "landing");
  assert.equal(resolveContextualHelp("/not-a-shipped-route"), null);
  assert.equal(resolveContextualHelp("/platform/accounts/org-1"), null);
  assert.equal(resolveContextualHelp("/admin/platform/users"), null);
});

test("every mapped target is public and internal administration is never exposed", () => {
  for (const mapping of CONTEXTUAL_HELP_MAPPINGS) {
    const article = getArticleBySlug(mapping.articleSlug);
    assert.ok(article, mapping.articleSlug);
    assert.notEqual(article.status, "internal");
    assert.notEqual(mapping.articleSlug, "use-platform-administration");
  }
});

test("return paths preserve routes while dropping private and unsupported query data", () => {
  const mapping = getContextualHelpMapping("/events/event-1/budget?view=grid");
  assert.ok(mapping);
  const raw = "/events/event-1/budget?view=grid&focus=private-record&eventName=Secret";
  const safe = "/events/event-1/budget?view=grid";
  assert.equal(getSafeHelpReturnTarget(raw), safe);
  assert.equal(buildContextualHelpHref(mapping, raw), `/help/article/manage-the-full-budget-grid?from=${encodeURIComponent(safe)}`);
  assert.equal(getSafeHelpReturnTarget("/events/event-1/speakers/person-1?token=secret"), "/events/event-1/speakers/person-1");
  assert.equal(getSafeHelpReturnTarget("https://example.com"), null);
  assert.equal(getSafeHelpReturnTarget("//example.com/path"), null);
  assert.equal(getSafeHelpReturnTarget("/speaker-portal/private-token"), null);
});

test("shared contextual action has an accessible label and is used by both shells", () => {
  const action = readFileSync("app/(shell)/_components/contextual-help-action.tsx", "utf8");
  const accountShell = readFileSync("app/(shell)/_components/shell-scaffold.tsx", "utf8");
  const eventShell = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
  assert.match(action, /aria-label=\{ariaLabel\}/);
  assert.match(action, /applyOrcaTerminologyToText\(resolution\.ariaLabel, terms\)/);
  assert.match(action, /CircleHelp/);
  assert.match(action, /resolveContextualHelp/);
  assert.match(accountShell, /<ContextualHelpAction/);
  assert.match(eventShell, /<ContextualHelpAction/);
  assert.doesNotMatch(eventShell, /help\/article/);
});
