/** Local browser verification of production components/CSS with test-only data. No auth bypass or demo route. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.OVERVIEW_ARTIFACT_DIR || "/private/tmp/signalthread-overview-verification";
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { PlatformShell } from './app/_components/platform-shell';
    import { EventOverview } from './app/(event)/events/[eventId]/_components/event-overview';
    import { buildEventOverview } from './lib/event-overview/view-model';
    import { overviewFixture } from './lib/event-overview/test-fixtures';
    export function render(count, reported, longNames = false, when) {
      const input = overviewFixture(count, reported);
      if (when) input.now = new Date(when);
      if (longNames) { input.event.name = 'An unusually long event name ' + 'W'.repeat(90); input.organization.name = 'An unusually long organization name'; }
      const model = buildEventOverview(input);
      return renderToStaticMarkup(React.createElement(PlatformShell, {email:'sam.member@example.test', organization:{name:model.organization.name}}, React.createElement(EventOverview, {model})));
    }
  `, resolveDir: app, loader: "tsx" },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", tsconfig: path.join(app, "tsconfig.json"),
  external: ["react", "react-dom/server", "next/link", "next/image"], logLevel: "silent",
});
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(path.join(app, "package.json")), module, module.exports);
const { render } = module.exports;
const cssPath = path.join(app, "app/globals.css");
const css = (await postcss([tailwind({ base: app })]).process(await readFile(cssPath, "utf8"), { from: cssPath })).css
  + ':root{--font-geist-sans:Geist;--font-geist-mono:"Geist Mono"}';
await writeFile(path.join(output, "overview.css"), css);
const logo = await readFile(path.join(app, "public/brand/signalthread-logo.png"));
// Reuse the font files downloaded by next/font when a build is available.
let fontCss = "";
const media = path.join(app, ".next/static/media");
try {
  const styleDir = await readdir(path.join(app, ".next/static/css")).then(() => ".next/static/css").catch(() => ".next/static/chunks");
  const styles = await readdir(path.join(app, styleDir));
  for (const file of styles.filter((f) => f.endsWith(".css"))) {
    const content = await readFile(path.join(app, styleDir, file), "utf8");
    for (const face of content.matchAll(/@font-face\{[^}]*\}/g)) {
      if (!/Geist/.test(face[0])) continue;
      let rule = face[0];
      for (const url of rule.matchAll(/url\(([^)]+)\)/g)) {
        const name = path.basename(url[1].replaceAll('"', "").replaceAll("'", ""));
        const data = await readFile(path.join(media, name));
        rule = rule.replace(url[0], `url(data:font/woff2;base64,${data.toString("base64")})`);
      }
      fontCss += rule;
    }
  }
} catch { /* Layout assertions still run with the production fallback stack before a build. */ }
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.route("**/*", async (route) => {
  if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/png", body: logo });
  return route.abort();
});
const results = [];
try {
  for (const width of [320, 375, 768, 1024, 1280, 1536]) {
    await page.setViewportSize({ width, height: 1000 });
    for (let count = 0; count <= 5; count++) {
      for (const reported of [false, true]) {
        await page.setContent(`<!doctype html><html lang="en"><head><base href="https://platform.test"><style>${fontCss}${css}</style></head><body>${render(count, reported)}</body></html>`);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('[data-testid^="lifecycle-row-"]').count(), count);
        assert.equal(await page.locator('[data-testid^="go-deeper-row-"]').count(), count);
        const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(overflow.page <= overflow.viewport, `${width}px / ${count} products / reported=${reported}: page overflows ${JSON.stringify(overflow)}`);
        const clipped = await page.locator('[data-testid^="lifecycle-row-"] > div:nth-child(2)').evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length);
        assert.equal(clipped, 0, `Lifecycle bands overflow at ${width}px`);
        const links = await page.locator('a[href^="/api/launch/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
        assert.ok(links.every((href) => new URL(href, "https://platform.test").searchParams.get("event_id") === "3f1e2d4c-5b6a-4c7d-8e9f-0a1b2c3d4e5f"));
        if (count === 5 && [375, 1280].includes(width)) {
          await page.screenshot({ path: path.join(output, `overview-${width}-${reported ? "reported" : "unavailable"}.png`), fullPage: true });
          if (width === 375) await page.screenshot({ path: path.join(output, `overview-mobile-top-${reported ? "reported" : "unavailable"}.png`) });
        }
        if (width === 1280 && count === 5 && reported) {
          assert.equal(await page.locator('[data-testid="insights-grid"]').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length), 3);
          assert.equal(await page.locator('[data-testid="event-object"]').evaluate((e) => Math.round(e.getBoundingClientRect().width)), 300);
          const card = page.locator('[data-testid="insight-card"]').first();
          const before = await card.evaluate((e) => getComputedStyle(e).borderColor);
          await card.hover();
          await page.waitForTimeout(200);
          assert.notEqual(await card.evaluate((e) => getComputedStyle(e).borderColor), before, "Insight hover affordance");
          await page.mouse.move(0, 0);
        }
        results.push({ width, count, reported, overflow: false });
      }
    }
    await page.setContent(`<style>${css}</style>${render(5, true, true)}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Long content overflows at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  for (const when of ["2026-11-04T20:00:00Z", "2026-11-10T20:00:00Z"]) {
    await page.setContent(`<style>${css}</style>${render(5, true, false, when)}`);
    assert.ok(await page.locator('[data-testid="lifecycle-now"]').isVisible());
  }
  await page.setContent(`<base href="https://platform.test"><style>${css}</style>${render(5, true)}`);
  await page.route("**/api/launch/**", (route) => route.fulfill({ contentType: "text/plain", body: "Test navigation reached secure launcher" }));
  await page.locator('[data-testid="open-orca"]').click();
  await page.waitForURL("**/api/launch/orca?event_id=*");
  assert.equal(new URL(page.url()).searchParams.get("event_id"), "3f1e2d4c-5b6a-4c7d-8e9f-0a1b2c3d4e5f");
  await page.setContent(`<base href="https://platform.test"><style>${css}</style>${render(1, false)}`);
  await page.route("https://platform.test/events", (route) => route.fulfill({ contentType: "text/plain", body: "Test navigation reached event list" }));
  await page.getByRole("link", { name: "Events", exact: true }).last().click();
  await page.waitForURL("https://platform.test/events");
  await writeFile(path.join(output, "results.json"), JSON.stringify({ cases: results.length, results, fonts: Boolean(fontCss) }, null, 2));
  console.log(`PASS: ${results.length} viewport/product/data combinations, long content, lifecycle states, event links and hover. Artifacts: ${output}`);
} finally { await browser.close(); }
