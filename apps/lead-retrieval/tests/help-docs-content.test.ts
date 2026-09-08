import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpDocsShell } from "../components/help/help-docs-shell";
import { HelpHome } from "../components/help/help-home";
import {
  getAllHelpArticles,
  getHelpArticle,
  getHelpCategories,
  resolveHelpMarkdownHref
} from "../lib/help/help-content";

const helpDocsDirectory = path.join(process.cwd(), "docs", "help");

function listMarkdownFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    });
}

test("help docs categories are generated from configured product topics and repo markdown", () => {
  const categories = getHelpCategories();
  const capturingLeads = categories.find((category) => category.slug === "capturing-leads");
  const gettingStarted = categories.find((category) => category.slug === "getting-started");
  const adminPortal = categories.find((category) => category.slug === "admin-portal");
  const leadsBriefs = categories.find((category) => category.slug === "leads-briefs");
  const campaignsFollowUp = categories.find((category) => category.slug === "campaigns-follow-up");
  const integrationsSync = categories.find((category) => category.slug === "integrations-sync");

  assert.ok(capturingLeads, "expected Capturing Leads category");
  assert.equal(capturingLeads!.title, "Capturing Leads");
  assert.ok(capturingLeads!.articles.length >= 1);
  assert.ok(capturingLeads!.articles.some((article) => article.slug === "scan-a-badge"));

  assert.ok(gettingStarted, "expected empty Getting Started category");
  assert.equal(gettingStarted!.articles.length, 0);

  assert.ok(adminPortal, "expected Admin Portal category");
  assert.equal(adminPortal!.description, "Manage users, roles, invites, access, licenses, and account settings.");
  assert.equal(adminPortal!.articles.length, 2);
  assert.ok(adminPortal!.articles.some((article) => article.slug === "users-and-roles"));

  assert.ok(leadsBriefs, "expected Leads & Briefs category");
  assert.equal(
    leadsBriefs!.description,
    "Import leads, manage lead records, export data, and prepare sales teams with Pre-Sales Briefs."
  );
  assert.deepEqual(
    leadsBriefs!.articles.map((article) => article.slug).sort(),
    ["lead-import", "pre-sales-briefs"]
  );

  assert.ok(campaignsFollowUp, "expected Campaigns & Follow-Up category");
  assert.equal(campaignsFollowUp!.articles.length, 3);
  assert.ok(campaignsFollowUp!.articles.some((article) => article.slug === "campaign-builder"));
  assert.ok(campaignsFollowUp!.articles.some((article) => article.slug === "campaign-agents"));

  assert.ok(integrationsSync, "expected Integrations & Sync category");
  assert.equal(integrationsSync!.articles.length, 12);
  assert.equal(integrationsSync!.articles.some((article) => article.slug === "streampoint-integration"), false);
  assert.ok(integrationsSync!.articles.some((article) => article.slug === "sync-troubleshooting"));
});

test("help article loader extracts article metadata, toc, and related links", () => {
  const article = getHelpArticle("capturing-leads", "scan-a-badge");

  assert.ok(article, "expected scan-a-badge article");
  assert.equal(article!.title, "Scan a Badge");
  assert.ok(article!.description.includes("Badge scanning is the fastest way"));
  assert.ok(article!.toc.some((item) => item.id === "scan-the-badge"));
  assert.ok(article!.relatedArticles.some((related) => related.href === "/help/capturing-leads/after-scanning"));
  assert.equal(article!.body.includes("## Related Articles"), false);
});

test("help article summaries include searchable body content", () => {
  const article = getAllHelpArticles().find((item) => item.slug === "scan-a-badge");
  const adminArticle = getAllHelpArticles().find((item) => item.slug === "campaign-builder");

  assert.ok(article, "expected scan-a-badge summary");
  assert.match(article!.searchText, /badge scanning/);
  assert.match(article!.searchText, /camera permission/);

  assert.ok(adminArticle, "expected campaign-builder summary");
  assert.match(adminArticle!.searchText, /campaign generation/);
  assert.match(adminArticle!.searchText, /email delivery is configured/);
});

test("admin portal help articles are markdown-backed customer docs", () => {
  const usersAndRoles = getHelpArticle("admin-portal", "users-and-roles");
  const inviteTeamMembers = getHelpArticle("admin-portal", "invite-team-members");
  const leadImport = getHelpArticle("leads-briefs", "lead-import");
  const campaignAgents = getHelpArticle("campaigns-follow-up", "campaign-agents");
  const integrations = getHelpArticle("integrations-sync", "integrations");
  const preSalesBriefs = getHelpArticle("leads-briefs", "pre-sales-briefs");
  const configureIntegration = getHelpArticle("integrations-sync", "configure-an-integration");
  const fieldMapping = getHelpArticle("integrations-sync", "field-mapping");
  const syncTroubleshooting = getHelpArticle("integrations-sync", "sync-troubleshooting");
  const hubspot = getHelpArticle("integrations-sync", "hubspot-integration");
  const salesforce = getHelpArticle("integrations-sync", "salesforce-integration");
  const apollo = getHelpArticle("integrations-sync", "apollo-integration");
  const zoominfo = getHelpArticle("integrations-sync", "zoominfo-integration");
  const peopleDataLabs = getHelpArticle("integrations-sync", "people-data-labs-integration");
  const make = getHelpArticle("integrations-sync", "make-integration");
  const n8n = getHelpArticle("integrations-sync", "n8n-integration");
  const zapier = getHelpArticle("integrations-sync", "zapier-integration");
  const campaignBuilder = getHelpArticle("campaigns-follow-up", "campaign-builder");
  const troubleshooting = getHelpArticle("campaigns-follow-up", "troubleshooting-faq");

  assert.equal(usersAndRoles?.title, "Users and Roles");
  assert.match(usersAndRoles?.body ?? "", /Platform Admin/);
  assert.match(inviteTeamMembers?.body ?? "", /Pending Invite Status/);
  assert.match(leadImport?.body ?? "", /Duplicate handling can vary/);
  assert.match(campaignAgents?.body ?? "", /planned or workspace-dependent/);
  assert.match(campaignAgents?.title ?? "", /Campaign Agents/);
  assert.match(integrations?.body ?? "", /HubSpot and Salesforce/);
  assert.match(preSalesBriefs?.body ?? "", /does not replace human review/);
  assert.match(configureIntegration?.body ?? "", /Reconnect/);
  assert.match(fieldMapping?.body ?? "", /lead import and AI Briefings/);
  assert.match(syncTroubleshooting?.body ?? "", /First Checks/);
  assert.match(hubspot?.body ?? "", /HubSpot/);
  assert.match(salesforce?.body ?? "", /Salesforce/);
  assert.match(apollo?.body ?? "", /Apollo/);
  assert.match(zoominfo?.body ?? "", /ZoomInfo/);
  assert.match(peopleDataLabs?.body ?? "", /People Data Labs/);
  assert.match(make?.body ?? "", /Make/);
  assert.match(n8n?.body ?? "", /n8n/);
  assert.match(zapier?.body ?? "", /Zapier/);
  assert.equal(getHelpArticle("integrations-sync", "streampoint-integration"), null);
  assert.match(campaignBuilder?.body ?? "", /email delivery is configured/);
  assert.match(troubleshooting?.title ?? "", /Campaign Troubleshooting FAQ/);
  assert.match(troubleshooting?.body ?? "", /Campaign Sending Is Unavailable/);
});

test("help shell renders working search input instead of fake coming soon copy", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      HelpDocsShell,
      {
        categories: getHelpCategories(),
        activeCategorySlug: "capturing-leads",
        children: React.createElement("div", null, "Article content")
      }
    )
  );

  assert.match(markup, /aria-label="Search help docs"/);
  assert.match(markup, /placeholder="Search help docs"/);
  assert.doesNotMatch(markup, /Search docs coming soon/);
  assert.doesNotMatch(markup, /\sdisabled=""/);
});

test("help category badges match real markdown article counts", () => {
  const categories = getHelpCategories();
  const gettingStarted = categories.find((category) => category.slug === "getting-started");
  const markup = renderToStaticMarkup(
    React.createElement(
      HelpDocsShell,
      {
        categories,
        activeCategorySlug: "getting-started",
        children: React.createElement("div", null, "Category content")
      }
    )
  );

  assert.ok(gettingStarted, "expected Getting Started category");
  assert.equal(gettingStarted!.articles.length, 0);
  assert.match(markup, /Getting Started[\s\S]*?>0<\/span>/);
});

test("help markdown links resolve to app help routes", () => {
  assert.equal(
    resolveHelpMarkdownHref("../permissions/camera-microphone-permissions.md", "capturing-leads"),
    "/help/permissions/camera-microphone-permissions"
  );
  assert.equal(
    resolveHelpMarkdownHref("after-scanning.md", "capturing-leads"),
    "/help/capturing-leads/after-scanning"
  );
});

test("help markdown relative article links resolve to published help pages", () => {
  const publishedHrefs = new Set(getAllHelpArticles().map((article) => article.href));
  const offenders = listMarkdownFiles(helpDocsDirectory).flatMap((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const categorySlug = path.basename(path.dirname(filePath));
    return Array.from(content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g))
      .map((match) => match[1]?.trim() ?? "")
      .filter((href) => href.endsWith(".md") || href.includes(".md#"))
      .map((href) => {
        const resolvedHref = resolveHelpMarkdownHref(href, categorySlug).split("#")[0] ?? "";
        return publishedHrefs.has(resolvedHref)
          ? null
          : `${path.relative(process.cwd(), filePath)} links to missing article ${href}`;
      })
      .filter((offender): offender is string => offender !== null);
  });

  assert.deepEqual(offenders, []);
});

test("help home renders external mobile app card without a free external identifier", () => {
  const markup = renderToStaticMarkup(
    React.createElement(HelpHome, {
      categories: getHelpCategories(),
      articles: [],
      supportEmail: "support@signalthread.ai",
      mobileAppUrl: "https://apps.apple.com/app/signalthread-lead-retrieval/id6768739448",
      adminPortalUrl: "/admin"
    })
  );

  assert.match(markup, /href="https:\/\/apps\.apple\.com\/app\/signalthread-lead-retrieval\/id6768739448"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noreferrer"/);
});

test("help markdown does not reference unsupported visual upload workflows", () => {
  const bannedCopy = [
    /\bimages?\b/i,
    /\bphotos?\b/i,
    /\bscreenshots?\b/i,
    /badge image/i,
    /image upload/i,
    /upload an image/i,
    /capture image/i,
    /visual upload/i
  ];
  const offenders = listMarkdownFiles(helpDocsDirectory).flatMap((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    return bannedCopy
      .filter((pattern) => pattern.test(content))
      .map((pattern) => `${path.relative(process.cwd(), filePath)} matched ${pattern}`);
  });

  assert.deepEqual(offenders, []);
});
