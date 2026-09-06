import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Regression guard: framework config silently overriding route security headers.
 *
 * `next.config.ts` `headers()` entries are applied *after* a route handler's own
 * headers, so a global `Referrer-Policy` wins over one set with
 * `NextResponse.redirect(url, { headers })`. That is exactly what happened during
 * implementation: the launch endpoint set `no-referrer`, the observed response
 * carried `strict-origin-when-cross-origin`, and a one-time handoff token sat in
 * the redirect target's query string.
 *
 * The fix is a narrower config entry for the handoff surface. These tests pin it,
 * because the failure is silent -- the route code still *looks* correct.
 */

const CONFIG = readFileSync("next.config.ts", "utf8");

test("a global Referrer-Policy exists and would otherwise win", () => {
  assert.match(CONFIG, /source:\s*"\/:path\*"/);
  assert.match(CONFIG, /strict-origin-when-cross-origin/);
});

test("the handoff surface has its own stricter Referrer-Policy entry", () => {
  assert.match(CONFIG, /source:\s*"\/api\/launch\/:path\*"/);
  const launchBlock = CONFIG.slice(CONFIG.indexOf('"/api/launch/:path*"'));
  assert.match(launchBlock, /no-referrer/);
});

test("the stricter entry is declared after the global one", () => {
  // Later entries win, so ordering is load-bearing rather than cosmetic.
  assert.ok(
    CONFIG.indexOf('"/:path*"') < CONFIG.indexOf('"/api/launch/:path*"'),
    "the narrower handoff rule must come after the global rule",
  );
});

test("route-level headers alone are not relied upon for the referrer policy", () => {
  // Documented so a future refactor does not delete the config entry believing the
  // route header is sufficient.
  // The rationale is a wrapped comment, so normalise whitespace before matching.
  const flat = CONFIG.replace(/\s*\/\/\s*/g, " ").replace(/\s+/g, " ");
  assert.match(flat, /config headers are applied after route handlers/i);
});
