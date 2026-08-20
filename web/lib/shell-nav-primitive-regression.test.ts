import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Prompt 1 (Session Workspace Nav Alignment): the event-level nav item renderer
// and active-path helper were extracted into a shared primitive so the session
// workspace can later reuse the same visual language. This is a pure refactor —
// these source-regression assertions lock that the extraction happened and the
// event nav visual language is preserved exactly.

const primitiveSource = readFileSync(
  "app/(shell)/events/[eventId]/_components/shell-nav-primitives.tsx",
  "utf8",
);
const shellSource = readFileSync(
  "app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx",
  "utf8",
);

test("shared primitive exports isPathActive and SidebarNavItem", () => {
  assert.match(primitiveSource, /export function isPathActive\(pathname: string, href: string\): boolean/);
  assert.match(primitiveSource, /export function SidebarNavItem\(/);
});

test("isPathActive keeps exact + prefix (descendant) matching", () => {
  assert.match(
    primitiveSource,
    /return pathname === href \|\| pathname\.startsWith\(`\$\{href\}\/`\);/,
  );
});

test("SidebarNavItem preserves the event nav active/inactive visual tokens", () => {
  assert.match(primitiveSource, /active\s*\n?\s*\?\s*"border-\[#0B1638\] bg-\[#0B1638\] text-white shadow-sm"/);
  assert.match(primitiveSource, /"border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"/);
  // Fixed 40px height and rounded treatment retained.
  assert.match(primitiveSource, /hasDescription \? "min-h-10 py-1\.5" : "h-10"/);
  assert.match(primitiveSource, /rounded-xl border transition-colors/);
  // Badge active/inactive tokens retained.
  assert.match(primitiveSource, /active \? "bg-white\/15 text-white\/80" : "bg-slate-100 text-slate-400"/);
});

test("SidebarNavItem supports collapsed/expanded, disabled, href, and button modes", () => {
  // Collapsed hides text and centers the icon.
  assert.match(primitiveSource, /const showText = !collapsed;/);
  assert.match(primitiveSource, /collapsed \? "justify-center px-0" : "gap-2\.5 px-3\.5"/);
  // Disabled = muted, non-interactive.
  assert.match(primitiveSource, /"cursor-not-allowed border-transparent text-slate-400"/);
  assert.match(primitiveSource, /aria-disabled="true"/);
  // Link mode preferred, button mode available for future session-nav use.
  assert.match(primitiveSource, /if \(href\) \{[\s\S]*<Link/);
  assert.match(primitiveSource, /if \(onClick\) \{[\s\S]*<button/);
  // Active state is exposed accessibly.
  assert.match(primitiveSource, /aria-current=\{active \? "page" : undefined\}/);
});

test("event shell consumes the shared primitive and no longer defines isPathActive locally", () => {
  assert.match(shellSource, /import \{ SidebarNavItem, isPathActive \} from "\.\/shell-nav-primitives";/);
  assert.match(shellSource, /<SidebarNavItem\s/);
  // The local definition was removed (only the import + call sites remain).
  assert.doesNotMatch(shellSource, /function isPathActive\(pathname: string, href: string\): boolean/);
});

test("event shell nav behavior is preserved (active matching, directory, coming-soon)", () => {
  // Active-path matching still drives nav items.
  assert.match(shellSource, /isPathActive\(currentPathname, `\/events\/\$\{eventId\}\/timeline`\)/);
  assert.match(shellSource, /isPathActive\(pathname, `\/events\/\$\{eventId\}\/directory`\)/);
  // Event Directory grouped + coming-soon behavior stays inline in the shell.
  assert.match(shellSource, /badge: "Coming soon"/);
  assert.match(shellSource, /disabled: true/);
  assert.match(shellSource, /aria-label=\{isEventDirectoryOpen \? "Collapse Event Directory" : "Expand Event Directory"\}/);
  // The session command center route renders with the normal event-level nav.
  assert.doesNotMatch(shellSource, /if \(isSessionCommandCenterRoute\) \{/);
  assert.doesNotMatch(shellSource, /h-dvh overflow-hidden bg-\[#e8edf4\]/);
});
