import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// Regression for the baseline security-header pass: next.config.ts must apply the
// hardening headers to every route. Asserted at the source level so the test does
// not depend on importing the config (which references __dirname at module load).
test("next.config applies baseline security headers to all routes", () => {
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

  // Headers are wired through an async headers() mapping over all paths.
  assert.match(config, /async headers\(\)/);
  assert.match(config, /source:\s*["']\/:path\*["']/);

  const requiredHeaders: Array<[string, RegExp]> = [
    ["Strict-Transport-Security", /max-age=63072000; includeSubDomains; preload/],
    ["X-Frame-Options", /SAMEORIGIN/],
    ["X-Content-Type-Options", /nosniff/],
    ["Referrer-Policy", /strict-origin-when-cross-origin/],
    ["Permissions-Policy", /camera=\(\)/],
  ];
  for (const [key, valuePattern] of requiredHeaders) {
    assert.match(config, new RegExp(key), `missing ${key} header`);
    assert.match(config, valuePattern, `unexpected value for ${key}`);
  }
});
