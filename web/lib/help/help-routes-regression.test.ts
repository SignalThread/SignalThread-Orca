import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("article route statically generates public slugs and uses notFound for invalid or internal slugs", () => {
  const source = readFileSync("app/(shell)/help/article/[slug]/page.tsx", "utf8");
  assert.match(source, /generateStaticParams/);
  assert.match(source, /getAllPublicArticles/);
  assert.match(source, /if \(!article\) notFound\(\)/);
  assert.match(source, /generateMetadata/);
});

test("all Phase 1 Help route foundations exist under the authenticated shell", () => {
  for (const file of [
    "app/(shell)/help/page.tsx",
    "app/(shell)/help/category/[categorySlug]/page.tsx",
    "app/(shell)/help/article/[slug]/page.tsx",
    "app/(shell)/help/search/page.tsx",
  ]) assert.doesNotThrow(() => readFileSync(file, "utf8"), file);
});

